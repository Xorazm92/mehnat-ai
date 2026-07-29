// =====================================================
// ESKALATSIYA ZANJIRI — framework-free (Faza 2 / bot pult)
// =====================================================
// Muddat buzilganda kim xabar oladi va qanday tartibda:
//
//   L0  mas'ul xodim      (Company.accountantId / bankClientId / obligation'dagi snapshot)
//   L1  nazoratchi        (Company.supervisorId)
//   L2  bosh buxgalter    (Company.chiefAccountantId)
//
// Direktor darajasi ATAYIN YO'Q — zanjir chiefda tugaydi.
//
// Idempotentlik: NotificationDelivery @@unique([channel, dedupKey]). Har bosqich
// bir marta "band qilinadi" (claim), shuning uchun sweep necha marta yursa ham
// bir daraja bir marta xabar beradi. Yangi jadval kerak emas.
//
// MUHIM: bu qatlam Telegram'ni bilmaydi — yuborish `sendEscalation` orqali
// injeksiya qilinadi (lib → bot bog'liqligi bo'lmasligi uchun). In-app
// Notification esa har doim yoziladi: bot lichkaga yoza olmasligi mumkin
// (xodim /start bosmagan), in-app kanal — ishonchli zaxira.
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/logger";

type Db = Prisma.TransactionClient;

export type EscalationKind = "question" | "obligation";
export type EscalationLevel = 0 | 1 | 2;

/** Eskalatsiya bosqichi → NotificationDelivery.level rangi. */
const LEVEL_COLOR: Record<EscalationLevel, string> = {
  0: "yellow",
  1: "orange",
  2: "red",
};

const LEVEL_LABEL: Record<EscalationLevel, string> = {
  0: "Mas'ul xodim",
  1: "Nazoratchi",
  2: "Bosh buxgalter",
};

/** Nazoratchi bosgan "jarima" tugmasining og'irligi (foiz). */
export const ESCALATION_PENALTY_PERCENT = 5;

/** Kanal nomi — oddiy eslatmalar ledgeridan ("inapp"/"telegram") ajratilgan. */
export const ESCALATION_CHANNEL = "escalation";

export interface EscalationChain {
  L0: string | null;
  L1: string | null;
  L2: string | null;
}

/**
 * Kimlarga chiqadi. Takrorlar tashlab yuboriladi: agar nazoratchi ayni vaqtda
 * mas'ul xodim bo'lsa, unga ikki marta xabar bormaydi — daraja bo'sh qoladi va
 * eskalatsiya keyingisiga sakraydi.
 */
export async function resolveChain(
  db: Db,
  companyId: string,
  responsibleUserId: string | null,
): Promise<EscalationChain> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { accountantId: true, supervisorId: true, chiefAccountantId: true },
  });
  if (!company) return { L0: null, L1: null, L2: null };

  const L0 = responsibleUserId ?? company.accountantId;
  const seen = new Set<string>();
  const uniq = (id: string | null): string | null => {
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return id;
  };

  return {
    L0: uniq(L0),
    L1: uniq(company.supervisorId),
    L2: uniq(company.chiefAccountantId),
  };
}

export interface EscalationSubject {
  kind: EscalationKind;
  entityId: string;
  companyId: string;
  companyName: string;
  responsibleUserId: string | null;
  responsibleName: string | null;
  /** Bir qatorlik kontekst: majburiyat nomi/davri yoki savol yoshi. */
  detail: string;
  /** Ilovadagi havola (in-app Notification uchun). */
  link?: string | null;
}

export interface EscalationRecipient {
  level: EscalationLevel;
  userId: string;
  fullName: string;
  telegramUserId: bigint | null;
}

/**
 * Telegram yuboruvchi — bot qatlamidan injeksiya qilinadi. `false` qaytarsa
 * (masalan 403: xodim botga /start bosmagan) in-app xabar baribir qoladi.
 */
export type EscalationSender = (
  recipient: EscalationRecipient,
  subject: EscalationSubject,
) => Promise<boolean>;

export interface EscalateResult {
  /** false ⇒ bu daraja allaqachon xabardor qilingan (yoki qabul qiluvchi yo'q). */
  claimed: boolean;
  recipient: EscalationRecipient | null;
  telegramDelivered: boolean;
  skipped?: "already" | "no_recipient";
}

export function escalationDedupKey(
  kind: EscalationKind,
  entityId: string,
  level: EscalationLevel,
): string {
  return `${kind}:${entityId}:esc:L${level}`;
}

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
  if (typeof e === "object" && e !== null) {
    const err = e as { code?: string; message?: string };
    if (err.code === "P2002") return true;
    if (typeof err.message === "string" && err.message.includes("Unique constraint failed")) return true;
  }
  return false;
}

/**
 * Bir bosqichni eskalatsiya qiladi. Idempotent: dedupKey band bo'lsa hech narsa
 * qilmaydi. Yozish tartibi — avval CLAIM, keyin xabar: shu tufayli parallel
 * ikkita sweep bitta xabarni ikki marta yubormaydi.
 */
export async function escalate(
  db: Db,
  subject: EscalationSubject,
  level: EscalationLevel,
  deps: { sendEscalation?: EscalationSender; now?: Date } = {},
): Promise<EscalateResult> {
  const now = deps.now ?? new Date();
  const dedupKey = escalationDedupKey(subject.kind, subject.entityId, level);

  // ARZON TEKSHIRUV BIRINCHI. Soatlik sweep minglab ochiq majburiyat ustidan
  // yuradi va ularning aksariyati allaqachon eskalatsiya qilingan bo'ladi —
  // zanjirni va qabul qiluvchini oldin yuklasak, har biri uchun 5 ta so'rov
  // behuda ketardi. Bu yerda unikal indeks bo'yicha bitta so'rov yetadi.
  const claimed = await db.notificationDelivery.findUnique({
    where: { channel_dedupKey: { channel: ESCALATION_CHANNEL, dedupKey } },
    select: { id: true },
  });
  if (claimed) {
    return { claimed: false, recipient: null, telegramDelivered: false, skipped: "already" };
  }

  const chain = await resolveChain(db, subject.companyId, subject.responsibleUserId);
  const userId = level === 0 ? chain.L0 : level === 1 ? chain.L1 : chain.L2;
  if (!userId) {
    return { claimed: false, recipient: null, telegramDelivered: false, skipped: "no_recipient" };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, telegramUserId: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return { claimed: false, recipient: null, telegramDelivered: false, skipped: "no_recipient" };
  }

  const recipient: EscalationRecipient = {
    level,
    userId: user.id,
    fullName: user.fullName,
    telegramUserId: user.telegramUserId,
  };

  let deliveryId: string;
  try {
    const row = await db.notificationDelivery.create({
      data: {
        channel: ESCALATION_CHANNEL,
        level: LEVEL_COLOR[level],
        dedupKey,
        recipientId: user.id,
        targetChatId: user.telegramUserId,
        status: "pending",
      },
      select: { id: true },
    });
    deliveryId = row.id;
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { claimed: false, recipient, telegramDelivered: false, skipped: "already" };
    }
    throw e;
  }

  // In-app — ishonchli kanal, har doim yoziladi (Telegram yiqilsa ham qoladi).
  try {
    await db.notification.create({
      data: {
        userId: user.id,
        type: `escalation_${subject.kind}`,
        title: `${LEVEL_LABEL[level]}ga eskalatsiya — ${subject.companyName}`,
        message: subject.detail,
        link: subject.link ?? null,
      },
    });
  } catch (err) {
    logServerError("escalation.notification", err, { dedupKey });
  }

  let telegramDelivered = false;
  if (deps.sendEscalation && user.telegramUserId != null) {
    try {
      telegramDelivered = await deps.sendEscalation(recipient, subject);
    } catch (err) {
      logServerError("escalation.telegram", err, { dedupKey, userId: user.id });
    }
  }

  await db.notificationDelivery.update({
    where: { id: deliveryId },
    data: { status: telegramDelivered ? "sent" : "failed", sentAt: now },
  });

  return { claimed: true, recipient, telegramDelivered };
}

// ── Savol SLA eskalatsiyasi ─────────────────────────────────────────────────

/** L2 (bosh buxgalter) shuncha daqiqadan keyin xabardor qilinadi. */
export const QUESTION_L2_AFTER_MINUTES = 30;

/**
 * Skanerlash oynasi. Busiz sweep abadiy o'sib boruvchi "late" savollar to'plamini
 * har 5 daqiqada qayta o'qib chiqardi; bir haftadan eski savol uchun eskalatsiya
 * ham ma'nosiz.
 */
const QUESTION_SCAN_WINDOW_DAYS = 7;

const MINUTE = 60_000;

export interface QuestionEscalationResult {
  scanned: number;
  l1: number;
  l2: number;
}

/**
 * Javobsiz qolgan savollarni zanjir bo'ylab ko'taradi:
 *  - L1 (nazoratchi) — savol `late` bo'lishi bilanoq;
 *  - L2 (bosh buxgalter) — muddatdan {QUESTION_L2_AFTER_MINUTES} daqiqa o'tgach.
 *
 * `(status, deadlineAt)` indeksi bo'yicha yuradi; javob berilgan savol darhol
 * `answered` ga o'tgani uchun skandan chiqib ketadi.
 */
export async function sweepQuestionEscalations(
  db: Db,
  deps: { sendEscalation?: EscalationSender; now?: Date } = {},
): Promise<QuestionEscalationResult> {
  const now = deps.now ?? new Date();
  const from = new Date(now.getTime() - QUESTION_SCAN_WINDOW_DAYS * 24 * 60 * MINUTE);

  const late = await db.question.findMany({
    where: {
      status: "late",
      answeredAt: null,
      deadlineAt: { gte: from, lt: now },
      companyId: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      deadlineAt: true,
      responsibleRole: true,
      responsibleUserId: true,
    },
    orderBy: { deadlineAt: "asc" },
  });

  const res: QuestionEscalationResult = { scanned: late.length, l1: 0, l2: 0 };
  if (late.length === 0) return res;

  // Question'da `company` relatsiyasi yo'q (faqat companyId ustuni), shuning
  // uchun kompaniyalarni bitta so'rovda olamiz — savol boshiga bitta so'rov
  // qilsak, sweep N+1 ga aylanardi.
  const companyIds = [...new Set(late.map((q) => q.companyId).filter((id): id is string => !!id))];
  const companies = new Map(
    (
      await db.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true, accountantId: true, bankClientId: true, supervisorId: true },
      })
    ).map((c) => [c.id, c]),
  );

  // Ismlar ham bitta so'rovda — xabar "Malika Karimova javob bermadi" deyishi
  // kerak, aks holda nazoratchi kimni nazarda tutayotganini bilmaydi.
  const responsibleIds = new Set<string>();
  for (const q of late) {
    const company = q.companyId ? companies.get(q.companyId) : undefined;
    const id = q.responsibleUserId ?? (company ? responsibleForRole(company, q.responsibleRole) : null);
    if (id) responsibleIds.add(id);
  }
  const names = new Map<string, string>();
  if (responsibleIds.size) {
    const users = await db.user.findMany({
      where: { id: { in: [...responsibleIds] } },
      select: { id: true, fullName: true },
    });
    for (const u of users) names.set(u.id, u.fullName);
  }

  for (const q of late) {
    const company = q.companyId ? companies.get(q.companyId) : undefined;
    if (!q.companyId || !company) continue;
    const responsibleUserId =
      q.responsibleUserId ?? responsibleForRole(company, q.responsibleRole);

    const minutesLate = Math.floor((now.getTime() - q.deadlineAt.getTime()) / MINUTE);
    const subject: EscalationSubject = {
      kind: "question",
      entityId: q.id,
      companyId: q.companyId,
      companyName: company.name,
      responsibleUserId,
      responsibleName: responsibleUserId ? (names.get(responsibleUserId) ?? null) : null,
      detail: `Mijoz savoliga ${minutesLate} daqiqadan beri javob yo'q.`,
      link: `/questions?id=${q.id}`,
    };

    const l1 = await escalate(db, subject, 1, { sendEscalation: deps.sendEscalation, now });
    if (l1.claimed) res.l1++;

    if (minutesLate >= QUESTION_L2_AFTER_MINUTES) {
      const l2 = await escalate(db, subject, 2, { sendEscalation: deps.sendEscalation, now });
      if (l2.claimed) res.l2++;
    }
  }

  return res;
}

/** Savoldagi rol → kompaniyadagi mas'ul xodim (resolve-responsible bilan bir xil). */
function responsibleForRole(
  company: { accountantId: string | null; bankClientId: string | null; supervisorId: string | null },
  role: string,
): string | null {
  switch (role) {
    case "accountant":
      return company.accountantId;
    case "bank_client":
      return company.bankClientId;
    case "controller":
    case "supervisor":
      return company.supervisorId;
    default:
      return null;
  }
}
