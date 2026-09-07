"use server";

// =====================================================
// TASK server actions — majburiyat ustidagi ad-hoc ish
// =====================================================
// Scoped: senior hammani; boshqalar o'ziga tayinlangan / yaratgan / o'z
// firmalari vazifalarini ko'radi. Har mutatsiya event + audit yozadi.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isSeniorRole } from "@/lib/platform/permissions";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { companyScopeWhere, assertCompanyPermission, type Actor } from "@/lib/platform/access";
import { canTransitionTask, taskTimingPatch } from "@/lib/engines/workflow/taskWorkflow";
import { updateTag } from "next/cache";
import type { Prisma, TaskStatus, TaskPriority } from "@prisma/client";

/**
 * Vazifa yopilganda uning MANBA majburiyatini `ready` ga ko'taradi.
 *
 * Ilgari bu `lib/obligationBridge.ts` da edi; ko'prik olib tashlangach (matritsa
 * yozuvi endi `lib/domains/accounting/matrixWrite.ts` orqali ketadi) shu bitta
 * holat bu yerda qoldi, chunki u katak emas — VAZIFA yon ta'siri va
 * majburiyatni ID bo'yicha biladi.
 *
 * Faqat oldinga: allaqachon `sent`/`accepted` bo'lgan majburiyat ortga
 * tortilmaydi, bekor qilingani esa tirilmaydi.
 */
async function markObligationReady(obligationId: string, actorId?: string | null): Promise<boolean> {
  const o = await prisma.obligation.findUnique({
    where: { id: obligationId },
    select: { id: true, status: true },
  });
  if (!o) return false;
  const blocked: string[] = ["ready", "sent", "accepted", "cancelled"];
  if (blocked.includes(o.status)) return false;

  await prisma.$transaction([
    prisma.obligation.update({ where: { id: o.id }, data: { status: "ready" } }),
    prisma.obligationStatusEvent.create({
      data: {
        obligationId: o.id,
        fromStatus: o.status,
        toStatus: "ready",
        byUserId: actorId ?? null,
        note: "Bog'langan vazifa yakunlandi",
      },
    }),
  ]);
  return true;
}

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id, role: session.user.role as string };
}

/** Aktor shu vazifada amal bajara oladimi (senior / assignee / creator / firma-scope). */
async function assertCanAct(actor: Actor, taskId: string): Promise<{ companyId: string | null; status: TaskStatus; assigneeUserId: string | null; obligationId: string | null }> {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: { companyId: true, status: true, assigneeUserId: true, createdBy: true, obligationId: true },
  });
  if (!t) throw new Error("Vazifa topilmadi");
  if (isAdminRole(actor.role) || t.assigneeUserId === actor.id || t.createdBy === actor.id) return t;
  if (t.companyId) {
    const inScope = await prisma.company.findFirst({ where: { id: t.companyId, ...companyScopeWhere(actor) }, select: { id: true } });
    if (inScope) return t;
  }
  throw new Error("Bu vazifaga ruxsatingiz yo'q");
}

export interface TaskFilter {
  status?: TaskStatus;
  mine?: boolean;
  companyId?: string;
  /**
   * Bajaruvchisi MUAYYAN xodim bo'lgan vazifalar — xodim kartasi uchun.
   * Yuqoridagi `scope` saqlanadi: bu faqat toraytiruvchi shart.
   */
  assigneeId?: string;
}

export async function getTasks(filter: TaskFilter = {}) {
  const actor = await requireActor();
  // Admin hammasini; qolganlar — o'ziga tayinlangan/yaratgan + portfeldagi
  // firmalarning vazifalari. Firmasiz vazifa faqat ishtirokchilarga ko'rinadi.
  const scope: Prisma.TaskWhereInput = isAdminRole(actor.role)
    ? {}
    : { OR: [{ assigneeUserId: actor.id }, { createdBy: actor.id }, { company: companyScopeWhere(actor) }] };

  const rows = await prisma.task.findMany({
    where: {
      ...scope,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.mine ? { assigneeUserId: actor.id } : {}),
      ...(filter.assigneeId ? { assigneeUserId: filter.assigneeId } : {}),
      ...(filter.companyId ? { companyId: filter.companyId } : {}),
    },
    include: {
      company: { select: { id: true, name: true } },
      // Bog'langan majburiyat — "Ishlar" ro'yxatida vazifa qaysi muddat ustida
      // ochilganini ko'rsatish uchun.
      obligation: {
        select: { id: true, status: true, periodKey: true, dueAt: true, template: { select: { name: true } } },
      },
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });
  return rows;
}

export interface CreateTaskInput {
  companyId?: string;
  title: string;
  description?: string;
  taskType?: string;
  priority?: TaskPriority;
  assigneeUserId?: string;
  dueAt?: string;
  /** Majburiyat ustidagi qadam bo'lsa — uning id'si. */
  obligationId?: string;
}

export async function createTask(input: CreateTaskInput) {
  const actor = await requireActor();
  if (!isSeniorRole(actor.role)) {
    throw new Error("Vazifa yaratish ruxsati yo'q. Bu amal faqat rahbar yoki nazoratchilar uchun.");
  }
  if (!input.title?.trim()) throw new Error("Sarlavha majburiy");

  // Majburiyatga biriktirilsa — firmasi va muddati MANBADAN olinadi. Aks holda
  // vazifa "15-avgust", majburiyat "10-avgust" deb turib, bitta ish ikki xil
  // muddat bilan hisoblanardi.
  let obligationId: string | null = null;
  let inheritedCompanyId: string | null = null;
  let inheritedDueAt: Date | null = null;
  if (input.obligationId) {
    const o = await prisma.obligation.findUnique({
      where: { id: input.obligationId },
      select: { id: true, companyId: true, dueAt: true },
    });
    if (!o) throw new Error("Majburiyat topilmadi");
    await assertCompanyPermission(prisma, actor, o.companyId, "task:create");
    obligationId = o.id;
    inheritedCompanyId = o.companyId;
    inheritedDueAt = o.dueAt;
  }

  const task = await prisma.task.create({
    data: {
      companyId: inheritedCompanyId ?? input.companyId ?? null,
      obligationId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      taskType: input.taskType?.trim() || null,
      priority: input.priority ?? "normal",
      assigneeUserId: input.assigneeUserId ?? null,
      createdBy: actor.id,
      dueAt: input.dueAt ? new Date(input.dueAt) : inheritedDueAt,
    },
    select: { id: true },
  });
  await recordAuditLog({ userId: actor.id, action: "create", tableName: "Task", recordId: task.id, newData: { title: input.title } });
  updateTag("tasks");
  return task;
}

export async function updateTaskStatus(id: string, toStatus: TaskStatus, note?: string) {
  const actor = await requireActor();
  const t = await assertCanAct(actor, id);
  if (!canTransitionTask(t.status, toStatus)) throw new Error(`Noqonuniy o'tish: ${t.status} → ${toStatus}`);

  const now = new Date();
  const patch: Prisma.TaskUpdateInput = { status: toStatus, ...taskTimingPatch(toStatus, now) };

  await prisma.$transaction([
    prisma.task.update({ where: { id }, data: patch }),
    prisma.taskEvent.create({ data: { taskId: id, type: "status", fromStatus: t.status, toStatus, byUserId: actor.id, note: note ?? null } }),
  ]);
  // Vazifa majburiyat ustidagi qadam bo'lsa, yopilishi MANBAGA ham tushadi:
  // ilgari xodim vazifani `done` qilib, majburiyatni "kechikkan" holda
  // qoldirardi va bir ishni ikkinchi joyda qaytadan belgilashi kerak edi.
  if (toStatus === "done" && t.obligationId) {
    await markObligationReady(t.obligationId, actor.id);
    updateTag("obligations");
  }

  await recordAuditLog({ userId: actor.id, action: "update", tableName: "Task", recordId: id, oldData: { status: t.status }, newData: { status: toStatus } });
  updateTag("tasks");
  return { ok: true };
}

export async function assignTask(id: string, toUserId: string | null) {
  const actor = await requireActor();
  const t = await assertCanAct(actor, id);
  const patch: Prisma.TaskUpdateInput = { assigneeUserId: toUserId };

  await prisma.$transaction([
    prisma.task.update({ where: { id }, data: patch }),
    prisma.taskEvent.create({ data: { taskId: id, type: "assign", fromUserId: t.assigneeUserId, toUserId, byUserId: actor.id } }),
  ]);
  await recordAuditLog({ userId: actor.id, action: "update", tableName: "Task", recordId: id, newData: { assigneeUserId: toUserId } });
  updateTag("tasks");
  return { ok: true };
}

/** Board formalari uchun: tayinlanadigan xodimlar + ko'rish doiradagi firmalar. */
export async function getTaskFormData() {
  const actor = await requireActor();
  const [users, companies] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.company.findMany({
      where: { isActive: true, ...companyScopeWhere(actor) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { users, companies };
}

export async function addTaskComment(id: string, note: string) {
  const actor = await requireActor();
  await assertCanAct(actor, id);
  if (!note?.trim()) throw new Error("Izoh bo'sh");
  await prisma.taskEvent.create({ data: { taskId: id, type: "comment", note: note.trim(), byUserId: actor.id } });
  updateTag("tasks");
  return { ok: true };
}
