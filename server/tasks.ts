"use server";

// =====================================================
// TASK server actions (Faza C1 / work management + SLA)
// =====================================================
// Scoped: senior hammani; boshqalar o'ziga tayinlangan / yaratgan / o'z
// firmalari vazifalarini ko'radi. Har mutatsiya event + audit yozadi.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { companyScopeWhere, type Actor } from "@/lib/access";
import { canTransitionTask, taskTimingPatch, computeSlaDue } from "@/lib/taskWorkflow";
import { revalidateTag } from "next/cache";
import type { Prisma, TaskStatus, TaskPriority } from "@prisma/client";

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id, role: session.user.role as string };
}

/** Aktor shu vazifada amal bajara oladimi (senior / assignee / creator / firma-scope). */
async function assertCanAct(actor: Actor, taskId: string): Promise<{ companyId: string | null; status: TaskStatus; assigneeUserId: string | null; firstResponseAt: Date | null }> {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: { companyId: true, status: true, assigneeUserId: true, createdBy: true, firstResponseAt: true },
  });
  if (!t) throw new Error("Vazifa topilmadi");
  if (isSeniorRole(actor.role) || t.assigneeUserId === actor.id || t.createdBy === actor.id) return t;
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
}

export async function getTasks(filter: TaskFilter = {}) {
  const actor = await requireActor();
  const scope: Prisma.TaskWhereInput = isSeniorRole(actor.role)
    ? {}
    : { OR: [{ assigneeUserId: actor.id }, { createdBy: actor.id }, { company: companyScopeWhere(actor) }] };

  const now = Date.now();
  const rows = await prisma.task.findMany({
    where: {
      ...scope,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.mine ? { assigneeUserId: actor.id } : {}),
      ...(filter.companyId ? { companyId: filter.companyId } : {}),
    },
    include: { company: { select: { id: true, name: true } }, slaPolicy: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });
  return rows.map((t) => ({
    ...t,
    responseBreached: !!t.responseDueAt && !t.firstResponseAt && t.responseDueAt.getTime() < now && ["open", "in_progress", "blocked"].includes(t.status),
    resolutionBreached: !!t.resolutionDueAt && t.resolutionDueAt.getTime() < now && ["open", "in_progress", "blocked"].includes(t.status),
  }));
}

export interface CreateTaskInput {
  companyId?: string;
  title: string;
  description?: string;
  taskType?: string;
  priority?: TaskPriority;
  assigneeUserId?: string;
  dueAt?: string;
  slaPolicyId?: string;
}

export async function createTask(input: CreateTaskInput) {
  const actor = await requireActor();
  if (!isSeniorRole(actor.role)) {
    throw new Error("Vazifa yaratish ruxsati yo'q. Bu amal faqat rahbar yoki nazoratchilar uchun.");
  }
  if (!input.title?.trim()) throw new Error("Sarlavha majburiy");

  // SLA siyosati — berilgan yoki taskType bo'yicha avto-moslash (aniq > default).
  let policyId = input.slaPolicyId ?? null;
  let policy: { responseMinutes: number | null; resolutionMinutes: number | null } | null = null;
  if (policyId) {
    policy = await prisma.slaPolicy.findUnique({ where: { id: policyId }, select: { responseMinutes: true, resolutionMinutes: true } });
  } else {
    const matched = await prisma.slaPolicy.findFirst({
      where: { active: true, OR: [{ taskType: input.taskType ?? null }, { taskType: null }] },
      orderBy: { taskType: "desc" }, // aniq taskType null'dan oldin
      select: { id: true, responseMinutes: true, resolutionMinutes: true },
    });
    if (matched) {
      policyId = matched.id;
      policy = { responseMinutes: matched.responseMinutes, resolutionMinutes: matched.resolutionMinutes };
    }
  }
  const now = new Date();
  const { responseDueAt, resolutionDueAt } = computeSlaDue(policy, now);

  const task = await prisma.task.create({
    data: {
      companyId: input.companyId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      taskType: input.taskType?.trim() || null,
      priority: input.priority ?? "normal",
      assigneeUserId: input.assigneeUserId ?? null,
      createdBy: actor.id,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      slaPolicyId: policyId,
      responseDueAt,
      resolutionDueAt,
    },
    select: { id: true },
  });
  await recordAuditLog({ userId: actor.id, action: "create", tableName: "Task", recordId: task.id, newData: { title: input.title } });
  revalidateTag("tasks", "max");
  return task;
}

export async function updateTaskStatus(id: string, toStatus: TaskStatus, note?: string) {
  const actor = await requireActor();
  const t = await assertCanAct(actor, id);
  if (!canTransitionTask(t.status, toStatus)) throw new Error(`Noqonuniy o'tish: ${t.status} → ${toStatus}`);

  const now = new Date();
  const patch: Prisma.TaskUpdateInput = { status: toStatus, ...taskTimingPatch(toStatus, now) };
  // Birinchi javob — open'dan chiqishda (agar hali yo'q bo'lsa).
  if (t.firstResponseAt == null && toStatus === "in_progress") patch.firstResponseAt = now;

  await prisma.$transaction([
    prisma.task.update({ where: { id }, data: patch }),
    prisma.taskEvent.create({ data: { taskId: id, type: "status", fromStatus: t.status, toStatus, byUserId: actor.id, note: note ?? null } }),
  ]);
  await recordAuditLog({ userId: actor.id, action: "update", tableName: "Task", recordId: id, oldData: { status: t.status }, newData: { status: toStatus } });
  revalidateTag("tasks", "max");
  return { ok: true };
}

export async function assignTask(id: string, toUserId: string | null) {
  const actor = await requireActor();
  const t = await assertCanAct(actor, id);
  const now = new Date();
  const patch: Prisma.TaskUpdateInput = { assigneeUserId: toUserId };
  if (t.firstResponseAt == null && toUserId) patch.firstResponseAt = now;

  await prisma.$transaction([
    prisma.task.update({ where: { id }, data: patch }),
    prisma.taskEvent.create({ data: { taskId: id, type: "assign", fromUserId: t.assigneeUserId, toUserId, byUserId: actor.id } }),
  ]);
  await recordAuditLog({ userId: actor.id, action: "update", tableName: "Task", recordId: id, newData: { assigneeUserId: toUserId } });
  revalidateTag("tasks", "max");
  return { ok: true };
}

/** Board formalari uchun: tayinlanadigan xodimlar + ko'rish doiradagi firmalar. */
export async function getTaskFormData() {
  const actor = await requireActor();
  const [users, companies] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.company.findMany({
      where: isSeniorRole(actor.role) ? { isActive: true } : { isActive: true, ...companyScopeWhere(actor) },
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
  revalidateTag("tasks", "max");
  return { ok: true };
}
