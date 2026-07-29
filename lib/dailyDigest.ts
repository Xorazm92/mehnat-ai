// =====================================================
// KUNLIK REJA (digest) — framework-free (Faza 3 / bot pult)
// =====================================================
// Har kuni ertalab xodim "bugun nima qilishim kerak" degan savolga ERP'ga
// kirmasdan javob oladi. Bu modul faqat MA'LUMOTNI yig'adi; matn va tugmalar
// bot qatlamida (bot/contexts/digest/) chiziladi — shu bo'linish tufayli
// keyinchalik xuddi shu ma'lumotni ilova ichidagi vidjet ham ishlatishi mumkin.
//
// Idempotentlik: NotificationDelivery @@unique([channel, dedupKey]),
// dedupKey = "digest:<userId>:<YYYY-MM-DD>" → worker qayta urinsa ham bir
// odamga kuniga bitta xabar boradi.
import { Prisma } from "@prisma/client";
import { companyScopeWhere, type Actor } from "@/lib/access";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/obligationWorkflow";
import { isSeniorRole } from "@/lib/permissions";
import { logServerError } from "@/lib/logger";

type Db = Prisma.TransactionClient;

/** Hali bajarilmagan majburiyatlar — yagona manba. */
const OPEN_STATUSES = OPEN_OBLIGATION_STATUSES;

/** Digest kanali (eskalatsiya va oddiy eslatmalardan alohida). */
export const DIGEST_CHANNEL = "digest";

/** Xabarda nechta majburiyat nomma-nom ko'rsatiladi. */
const DIGEST_ITEM_LIMIT = 5;

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const DAY = 86_400_000;

export interface DigestItem {
  obligationId: string;
  companyName: string;
  what: string;
  dueAt: Date;
  overdue: boolean;
}

export interface Digest {
  userId: string;
  fullName: string;
  role: string;
  telegramUserId: bigint | null;
  /** Nomma-nom ko'rsatiladigan eng shoshilinch majburiyatlar. */
  items: DigestItem[];
  /** `items` dan tashqarida qolgan majburiyatlar soni. */
  more: number;
  counts: {
    dueToday: number;
    overdue: number;
    openQuestions: number;
    /** Faqat senior: tasdiq kutayotgan KPI qatorlari. */
    pendingKpi: number;
    /** Faqat senior: joriy davr uchun to'lovi tushmagan mijozlar. */
    unpaidCompanies: number;
  };
  /** true ⇒ aytadigan gap yo'q; bunday digest yuborilmaydi. */
  empty: boolean;
}

export interface DigestUser {
  id: string;
  fullName: string;
  role: string;
  telegramUserId: bigint | null;
}

export function digestDedupKey(userId: string, now: Date): string {
  return `digest:${userId}:${now.toISOString().slice(0, 10)}`;
}

/** "YYYY-MM" — Payment.period bilan bir xil format. */
function currentPeriod(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Foydalanuvchi ko'rish doirasidagi korxona id'lari. Admin uchun `null`
 * qaytaradi — bu "hammasi" degani va so'rovga `companyId: { in: [...] }`
 * filtri qo'yilmaydi (yuzlab id'ni ro'yxatga tizishdan qochamiz).
 */
export async function scopeCompanyIds(db: Db, actor: Actor): Promise<string[] | null> {
  const where = companyScopeWhere(actor);
  if (Object.keys(where).length === 0) return null; // super_admin / admin
  const rows = await db.company.findMany({ where, select: { id: true } });
  return rows.map((c) => c.id);
}

/**
 * Bir xodimning bugungi rejasi. Har chaqiruv ~4-5 so'rov qiladi, shuning uchun
 * uni kunlik fan-out ichida ishlatish arzon (50 xodim → ~250 so'rov, kuniga bir).
 */
export async function buildDigest(db: Db, user: DigestUser, now = new Date()): Promise<Digest> {
  const actor: Actor = { id: user.id, role: user.role };
  const today = startOfUtcDay(now);
  const tomorrow = new Date(today.getTime() + DAY);

  // 1) O'z majburiyatlarim — bugun tugaydigan va muddati o'tganlar.
  const mine = await db.obligation.findMany({
    where: {
      responsibleUserId: user.id,
      status: { in: OPEN_STATUSES },
      dueAt: { lt: tomorrow },
    },
    select: {
      id: true,
      dueAt: true,
      company: { select: { name: true } },
      template: { select: { name: true } },
    },
    orderBy: { dueAt: "asc" },
  });

  const items: DigestItem[] = mine.slice(0, DIGEST_ITEM_LIMIT).map((o) => ({
    obligationId: o.id,
    companyName: o.company.name,
    what: o.template?.name ?? "Majburiyat",
    dueAt: o.dueAt,
    overdue: o.dueAt < today,
  }));
  const dueToday = mine.filter((o) => o.dueAt >= today).length;
  const overdue = mine.length - dueToday;

  // 2) Doiramdagi javobsiz savollar.
  const companyIds = await scopeCompanyIds(db, actor);
  const scopeFilter = companyIds === null ? {} : { companyId: { in: companyIds } };
  const openQuestions =
    companyIds !== null && companyIds.length === 0
      ? 0
      : await db.question.count({ where: { status: "pending", ...scopeFilter } });

  // 3) Senior qo'shimchalari: tasdiq kutayotgan KPI va to'lovsiz mijozlar.
  let pendingKpi = 0;
  let unpaidCompanies = 0;
  if (isSeniorRole(user.role) && !(companyIds !== null && companyIds.length === 0)) {
    pendingKpi = await db.monthlyPerformance.count({
      where: { status: "submitted", ...scopeFilter },
    });
    // Eslatma: bu SANOQ, qarzdorlikning vakolatli bahosi emas — u
    // bot/contexts/billing (assessDebt) zimmasida va eskalatsiya jadvalini
    // hisobga oladi. Bu yerda ertalabki "e'tibor bering" ko'rsatkichi.
    unpaidCompanies = await db.company.count({
      where: {
        ...(companyIds === null ? {} : { id: { in: companyIds } }),
        isActive: true,
        contractAmount: { not: null },
        payments: { none: { period: currentPeriod(now), status: { in: ["paid", "partial"] } } },
      },
    });
  }

  const counts = { dueToday, overdue, openQuestions, pendingKpi, unpaidCompanies };
  return {
    userId: user.id,
    fullName: user.fullName,
    role: user.role,
    telegramUserId: user.telegramUserId,
    items,
    more: Math.max(0, mine.length - items.length),
    counts,
    empty: Object.values(counts).every((n) => n === 0),
  };
}

/**
 * Digest yuboriladigan xodimlar: faol va Telegram akkaunti bog'langanlar.
 * Bog'lanmaganlar bu yerda umuman ko'rinmaydi — botga /start bosmagan odamga
 * xabar yuborib bo'lmaydi va har kuni 403 olishning ma'nosi yo'q.
 */
export async function collectDigestRecipients(db: Db): Promise<DigestUser[]> {
  return db.user.findMany({
    where: { isActive: true, telegramUserId: { not: null } },
    select: { id: true, fullName: true, role: true, telegramUserId: true },
    orderBy: { fullName: "asc" },
  });
}

/** Digest yuboruvchi — bot qatlamidan injeksiya qilinadi. */
export type DigestSender = (digest: Digest) => Promise<boolean>;

export interface DigestRunResult {
  recipients: number;
  sent: number;
  /** Aytadigan gapi bo'lmagani uchun o'tkazib yuborilganlar. */
  skippedEmpty: number;
  /** Bugun allaqachon yuborilganlar. */
  skippedAlready: number;
  failed: number;
}

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
  const err = e as { code?: string; message?: string } | null;
  return (
    !!err &&
    (err.code === "P2002" || (typeof err.message === "string" && err.message.includes("Unique constraint failed")))
  );
}

/**
 * Ertalabki fan-out. Bo'sh digest ATAYIN yuborilmaydi: har kuni "bugun ish
 * yo'q" degan xabar bir haftada e'tiborsiz qoldiriladigan shovqinga aylanadi,
 * va shu bilan haqiqiy xabarlar ham o'qilmay qoladi.
 */
export async function runDailyDigest(
  db: Db,
  deps: { send?: DigestSender; now?: Date } = {},
): Promise<DigestRunResult> {
  const now = deps.now ?? new Date();
  const recipients = await collectDigestRecipients(db);
  const res: DigestRunResult = {
    recipients: recipients.length,
    sent: 0,
    skippedEmpty: 0,
    skippedAlready: 0,
    failed: 0,
  };

  for (const user of recipients) {
    let digest: Digest;
    try {
      digest = await buildDigest(db, user, now);
    } catch (err) {
      logServerError("dailyDigest.build", err, { userId: user.id });
      res.failed++;
      continue;
    }
    if (digest.empty) {
      res.skippedEmpty++;
      continue;
    }

    // Avval BAND QILAMIZ, keyin yuboramiz — worker qayta urinsa ikkinchi
    // xabar ketmasin.
    const dedupKey = digestDedupKey(user.id, now);
    let deliveryId: string;
    try {
      const row = await db.notificationDelivery.create({
        data: {
          channel: DIGEST_CHANNEL,
          level: "yellow",
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
        res.skippedAlready++;
        continue;
      }
      throw e;
    }

    let ok = false;
    try {
      ok = deps.send ? await deps.send(digest) : false;
    } catch (err) {
      logServerError("dailyDigest.send", err, { userId: user.id });
    }
    if (ok) res.sent++;
    else res.failed++;

    await db.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: ok ? "sent" : "failed", sentAt: now },
    });
  }

  return res;
}
