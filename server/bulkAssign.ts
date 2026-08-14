"use server";

// =====================================================
// OMMAVIY TOPSHIRIQ — bir vaqtda bir necha kishiga
// =====================================================
// Rahbar bir xil ishni o'nlab odamga bittalab yozib chiqardi: `createTask`
// bitta mas'ulga bitta vazifa yaratadi va xabarnoma ham yubormaydi. Natijada
// "hamma buxgalter shu oyni yopsin" degan topshiriq amalda hech qayerda
// qayd etilmasdi — Telegram guruhida aytilardi va yo'qolardi.
//
// ASOSIY QOIDA: oluvchilar ro'yxati SERVERDA qayta hisoblanadi. Mijoz faqat
// "kim kerak" degan TA'RIFNI yuboradi (portfel + rol, yoki qo'lda tanlangan
// id'lar), ro'yxatning o'zini emas. Aks holda begona xodimga topshiriq
// yuborish uchun bitta so'rovni o'zgartirish kifoya bo'lardi.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole, type CompanyRelation } from "@/lib/permissions";
import { companyScopeWhere } from "@/lib/access";
import { notifyUsers } from "@/lib/notify";
import { telegramQueueDispatcher } from "@/lib/notifyDispatch";
import { recordAuditLog } from "@/lib/auditTrail";
import { serialize } from "@/lib/serialize";
import { updateTag } from "next/cache";
import type { TaskPriority } from "@prisma/client";

/** Oluvchilarni tanlash usuli. */
export type BulkAudience =
  /** Portfelimdagi firmalarda shu mas'uliyatni egallaganlar. `all` — hammasi. */
  | { kind: "portfolio"; relation: CompanyRelation | "all" }
  /** Qo'lda belgilangan xodimlar (baribir portfel bilan cheklanadi). */
  | { kind: "manual"; userIds: string[] };

export interface BulkRecipient {
  id: string;
  fullName: string;
  role: string;
  /** Mening portfelimda shu odam nechta firmada ishtirok etadi. */
  companies: number;
}

const RELATION_FIELD: Record<CompanyRelation, "accountantId" | "supervisorId" | "chiefAccountantId" | "bankClientId"> = {
  accountant: "accountantId",
  supervisor: "supervisorId",
  chief_accountant: "chiefAccountantId",
  bank_manager: "bankClientId",
};

async function requireSenior() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const actor = { id: session.user.id as string, role: session.user.role as string };
  if (!isSeniorRole(actor.role)) {
    throw new Error("Ommaviy topshiriq faqat rahbar va nazoratchilar uchun.");
  }
  return actor;
}

/**
 * Ta'rifdan HAQIQIY oluvchilar ro'yxatini yig'adi.
 *
 * Chegara: faqat MENING portfelimdagi firmalarda ishtirok etganlar
 * (`companyScopeWhere`). Admin uchun portfel — barcha firmalar.
 * O'zini o'ziga topshiriq yuborish ro'yxatdan chiqariladi.
 */
async function resolveRecipients(
  actor: { id: string; role: string },
  audience: BulkAudience
): Promise<BulkRecipient[]> {
  const companies = await prisma.company.findMany({
    where: { isActive: true, ...companyScopeWhere(actor) },
    select: {
      accountantId: true,
      supervisorId: true,
      chiefAccountantId: true,
      bankClientId: true,
    },
  });

  const relations: CompanyRelation[] =
    audience.kind === "portfolio" && audience.relation !== "all"
      ? [audience.relation]
      : ["accountant", "supervisor", "chief_accountant", "bank_manager"];

  // Har bir odam portfelimda nechta firmada uchraydi — oynada ko'rsatiladi.
  const counts = new Map<string, number>();
  for (const c of companies) {
    const seen = new Set<string>(); // bir firmada ikki rolda bo'lsa ham bir marta
    for (const rel of relations) {
      const id = c[RELATION_FIELD[rel]];
      if (id && id !== actor.id) seen.add(id);
    }
    for (const id of seen) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  let ids = [...counts.keys()];
  if (audience.kind === "manual") {
    // Qo'lda tanlash ham portfel bilan CHEKLANADI — mijoz istalgan id yubora
    // olmasin. Admin uchun portfel = hamma firma, ya'ni cheklov sezilmaydi.
    const allowed = new Set(ids);
    ids = audience.userIds.filter((id) => allowed.has(id));
  }
  if (ids.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: "asc" },
  });

  return users.map((u) => ({ ...u, companies: counts.get(u.id) ?? 0 }));
}

/** Oynadagi "kimga ketadi" ro'yxati — yuborishdan OLDIN ko'rsatiladi. */
export async function previewBulkRecipients(audience: BulkAudience): Promise<BulkRecipient[]> {
  const actor = await requireSenior();
  return serialize(await resolveRecipients(actor, audience));
}

export interface BulkSendInput {
  audience: BulkAudience;
  /** `task` — kuzatiladigan topshiriq; `message` — faqat bildirishnoma. */
  mode: "task" | "message";
  title: string;
  description?: string;
  /** Faqat `task` uchun. */
  dueAt?: string;
  priority?: TaskPriority;
  /** Telegramga ham yuborilsinmi (oynada ataylab belgilanadi). */
  telegram?: boolean;
}

export interface BulkSendResult {
  recipients: number;
  tasksCreated: number;
  notified: number;
  telegramQueued: boolean;
}

export async function sendBulkAssignment(input: BulkSendInput): Promise<BulkSendResult> {
  const actor = await requireSenior();
  const title = input.title?.trim();
  if (!title) throw new Error("Sarlavha majburiy");

  const recipients = await resolveRecipients(actor, input.audience);
  if (recipients.length === 0) throw new Error("Oluvchi topilmadi — tanlovni tekshiring.");

  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Muddat noto'g'ri");

  let tasksCreated = 0;
  if (input.mode === "task") {
    // Har bir odamga ALOHIDA vazifa: holati ham, bajarilishi ham alohida
    // kuzatiladi. Bitta umumiy vazifa bo'lganda "kim bajardi" degan savolga
    // javob bo'lmasdi.
    const created = await prisma.task.createMany({
      data: recipients.map((r) => ({
        title,
        description: input.description?.trim() || null,
        priority: input.priority ?? "normal",
        assigneeUserId: r.id,
        createdBy: actor.id,
        dueAt,
      })),
    });
    tasksCreated = created.count;
  }

  /**
   * Xabar. `dedupKey` — bir necha marta bosilsa takrorlanmasin. Kalitga
   * daqiqa aniqligidagi vaqt kiradi: bir xil matnni ertaga qayta yuborish
   * mumkin bo'lsin, lekin ikki marta bosish bitta yuborish bo'lib qolsin.
   */
  const minute = new Date().toISOString().slice(0, 16);
  const notified = await notifyUsers(
    prisma,
    {
      userIds: recipients.map((r) => r.id),
      type: input.mode === "task" ? "task_assigned" : "announcement",
      title,
      message: input.description?.trim() || title,
      link: input.mode === "task" ? "/deadlines?tab=tasks" : "/notifications",
      channel: "bulk-assign",
      dedupKey: `${actor.id}:${input.mode}:${title}:${minute}`,
    },
    // Telegram FAQAT ataylab belgilanganda — ommaviy yuborish real
    // telefonlarga tegadi, shuning uchun sukut bo'yicha o'chiq.
    input.telegram ? { dispatchTelegram: telegramQueueDispatcher } : {}
  );

  await recordAuditLog({
    userId: actor.id,
    action: "create",
    tableName: "Task",
    newData: {
      bulk: true,
      mode: input.mode,
      title,
      recipients: recipients.length,
      telegram: !!input.telegram,
    },
  });

  updateTag("tasks");
  updateTag("notifications");

  return {
    recipients: recipients.length,
    tasksCreated,
    notified: notified.inapp,
    telegramQueued: notified.telegramQueued,
  };
}
