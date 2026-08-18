// =====================================================
// DIREKTORNING KUNLIK HISOBOTI (09:00)
// =====================================================
//
// Mavjud `lib/dailyDigest.ts` (08:50) XODIMGA mo'ljallangan: "bugun sen nima
// qilishing kerak". Direktorga esa boshqa savol kerak: "kecha nima bo'ldi va
// bugun nimaga e'tibor berishim kerak". Shuning uchun alohida kanal, alohida
// vaqt (09:00) va alohida dedup kaliti.
//
// "Direktor" alohida rol EMAS — loyihada `role in ["super_admin","admin"]`
// konvensiyasi ishlatiladi (bot/contexts/billing/application/notify-red.ts).
//
// Bu modul framework-free: faqat MA'LUMOTNI yig'adi. Telegram matni bot
// qatlamida (bot/contexts/digest/) chiziladi, xuddi digest kabi.

import { Prisma } from "@prisma/client";
import { getAvailableBalance, getDayMovement } from "@/lib/balance";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/obligationWorkflow";
import { logServerError } from "@/lib/logger";
import { formatNum } from "@/lib/format";
import { computeContractDebt, listDebtors, periodKeyOf, type DebtTotals, type DebtorRow } from "@/lib/debt";

type Db = Prisma.TransactionClient;

/** Digest'dan alohida kanal — ikkalasi bir kunda mustaqil ketadi. */
export const DIRECTOR_CHANNEL = "director";

export const directorReportDedupKey = (userId: string, now: Date): string => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `director:${userId}:${y}-${m}-${d}`;
};

export interface DirectorReport {
  /** Hisobot qaysi kun uchun (kecha). */
  forDate: Date;
  yesterday: { income: number; outflow: number };
  balance: { income: number; outflow: number; balance: number };
  /**
   * Jamg'arilgan qarzdorlik (lib/debt.ts).
   *
   * `overdueTotal` — to'lov oynasi YOPILGAN qarz (aralashuv kerak).
   * `dueNowTotal` — SHU OY yig'ilishi kerak (ish ro'yxati; buzilish emas).
   * `total` esa joriy oy ishini ham qo'shadi va o'zi bilan hech narsa demaydi.
   */
  debt: Omit<DebtTotals, "byCompany">;
  /** Muddati o'tgan qarzi eng katta firmalar — xabarda nomma-nom ko'rinadi. */
  topDebtors: DebtorRow[];
  obligations: { overdue: number; dueToday: number };
  pending: { expenses: number; proofs: number };
  /**
   * Bank vipiskasidan hal qilinmagan qatorlar — IKKI XIL ISH, shuning uchun
   * alohida sanaladi:
   *   income  — mijoz topilmagan kirim; bank-klient qo'lda bog'laydi;
   *   expense — toifalanmagan chiqim; kassaga faqat admin yozadi.
   * Ilgari ikkalasi bitta raqamga qo'shilgani uchun direktor 350 ta ish
   * borday ko'rardi, holbuki kirim navbatida atigi 49 tasi bor edi.
   */
  unmatchedBank: { income: number; expense: number };
  /**
   * 1C «Задолженность покупателей» ning oxirgi kesimi.
   *
   * `asroComparable` — ASRO ning O'SHA KESIM DAVRIGA hisoblangan va FAQAT
   * hisob qo'yilgan (muddati o'tgan + shu oy to'lanadigan) qarzi. Joriy oy
   * ishi qo'shilmaydi: 1C uni hali ko'rmaydi, ya'ni qo'shilsa farq har doim
   * bir oylik aylanma summasicha yolg'on kattayardi.
   */
  debt1C: { asOf: Date; total: number; contracts: number; asroComparable: number } | null;
  /** Joriy oyning tushum rejasi va bajarilishi. */
  plan: { period: string; plan: number; fact: number; percent: number } | null;
}

export interface DirectorRecipient {
  id: string;
  fullName: string;
  role: string;
  telegramUserId: bigint | null;
}

/** Direktorlar: faol super_admin va admin. */
export async function collectDirectorRecipients(db: Db): Promise<DirectorRecipient[]> {
  return db.user.findMany({
    where: { isActive: true, role: { in: ["super_admin", "admin"] } },
    select: { id: true, fullName: true, role: true, telegramUserId: true },
    orderBy: { fullName: "asc" },
  });
}

/**
 * Hisobotning barcha raqamlari. Yangi so'rov o'ylab topilmaydi — mavjud
 * manbalar ishlatiladi (lib/balance.ts, obligation status ro'yxati va h.k.),
 * shunda dashboard bilan hisobot bir xil raqam ko'rsatadi.
 */
export async function buildDirectorReport(db: Db, now = new Date()): Promise<DirectorReport> {
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const period = periodKeyOf(now);

  const [yesterday, balance, debts, topDebtors, overdue, dueToday, pendingExpenses, pendingProofs] =
    await Promise.all([
      getDayMovement(yesterdayDate, db),
      getAvailableBalance(),
      computeContractDebt(db, period),
      // Nomma-nom ro'yxat: "kim" degan savolga javob raqamdan muhimroq.
      // `collect` — muddati o'tgan VA shu oy yig'ilishi kerak bo'lganlar:
      // direktorga ikkalasi ham kerak, biri aralashuv, biri inkasso rejasi.
      listDebtors(db, { period, scope: "collect", limit: 5 }),
      db.obligation.count({
        where: { status: { in: OPEN_OBLIGATION_STATUSES }, dueAt: { lt: todayStart } },
      }),
      db.obligation.count({
        where: {
          status: { in: OPEN_OBLIGATION_STATUSES },
          dueAt: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      db.expense.count({ where: { status: "pending", deletedAt: null } }),
      countPendingProofs(db),
    ]);

  // `byCompany` xaritasi xabarga kerak emas (va Telegram qatlamiga Map
  // uzatish serializatsiyada muammo beradi) — faqat yig'ma sonlar ketadi.
  const { byCompany: _byCompany, ...debtTotals } = debts;

  return {
    forDate: yesterdayDate,
    yesterday,
    balance: { income: balance.income, outflow: balance.outflow, balance: balance.balance },
    debt: debtTotals,
    topDebtors,
    obligations: { overdue, dueToday },
    pending: { expenses: pendingExpenses, proofs: pendingProofs },
    unmatchedBank: await countUnmatchedBank(db),
    debt1C: await debt1CWithComparable(db),
    plan: await revenuePlan(db, period),
  };
}

/**
 * 1C kesimi + ASRO ning O'SHA DAVRGA hisoblangan raqami.
 *
 * Ikkalasi bir xil davrga keltirilmasa, farq har doim bir oylik shartnoma
 * summasicha "yolg'on" chiqadi va sverka ma'nosini yo'qotadi.
 */
async function debt1CWithComparable(db: Db) {
  const snapshot = await latestDebtSnapshot(db);
  if (!snapshot) return null;
  try {
    const aligned = await computeContractDebt(db, periodKeyOf(snapshot.asOf));
    // Solishtiruvga FAQAT HISOB QO'YILGAN qarz kiradi: muddati o'tgan +
    // shu oy to'lanadigan. Joriy oy ishi (`total` ichida) hali hisob
    // qo'yilmagan — 1C uni ko'rmaydi, ya'ni uni qo'shsak farq har doim bir
    // oylik aylanma summasicha yolg'on kattayardi.
    return { ...snapshot, asroComparable: aligned.overdueTotal + aligned.dueNowTotal };
  } catch (err) {
    logServerError("directorReport.debt1CAligned", err);
    // Solishtiruv chiqmasa hisobot baribir ketsin — 1C raqami o'zi ham foydali.
    return { ...snapshot, asroComparable: 0 };
  }
}

/** Ko'rib chiqish kutayotgan hisobot dalillari. Model bo'lmasa 0. */
async function countPendingProofs(db: Db): Promise<number> {
  const model = (db as Record<string, unknown>).reportProof as
    | { count(args: unknown): Promise<number> }
    | undefined;
  if (!model) return 0;
  try {
    return await model.count({ where: { status: "pending" } });
  } catch (err) {
    logServerError("directorReport.proofs", err);
    return 0;
  }
}

/**
 * Hal qilinmagan bank qatorlari, yo'nalish bo'yicha ajratilgan.
 * Model hali migratsiya qilinmagan bo'lsa nol qaytaradi — hisobot shu
 * sababdan yiqilmasligi kerak (prodda aynan shunday holat bo'ldi).
 */
async function countUnmatchedBank(db: Db): Promise<{ income: number; expense: number }> {
  const model = (db as Record<string, unknown>).bankTransaction as
    | { count(args: unknown): Promise<number> }
    | undefined;
  if (!model) return { income: 0, expense: 0 };
  try {
    const [income, expense] = await Promise.all([
      model.count({ where: { status: "unmatched", direction: "income" } }),
      model.count({ where: { status: "unmatched", direction: "expense" } }),
    ]);
    return { income, expense };
  } catch (err) {
    logServerError("directorReport.bankTx", err);
    return { income: 0, expense: 0 };
  }
}

/**
 * 1C dan olingan oxirgi qarzdorlik kesimi.
 * Jadval hali migratsiya qilinmagan bo'lsa null — hisobot yiqilmasligi kerak.
 */
async function latestDebtSnapshot(
  db: Db
): Promise<{ asOf: Date; total: number; contracts: number } | null> {
  const model = (db as Record<string, unknown>).debtSnapshot as
    | {
        findFirst(args: unknown): Promise<{ asOf: Date } | null>;
        aggregate(args: unknown): Promise<{ _sum: { debt: unknown }; _count: { _all: number } }>;
      }
    | undefined;
  if (!model) return null;
  try {
    const latest = await model.findFirst({ orderBy: { asOf: "desc" }, select: { asOf: true } });
    if (!latest) return null;
    const agg = await model.aggregate({
      where: { asOf: latest.asOf },
      _sum: { debt: true },
      _count: { _all: true },
    });
    return { asOf: latest.asOf, total: Number(agg._sum.debt ?? 0), contracts: agg._count._all };
  } catch (err) {
    logServerError("directorReport.debt1C", err);
    return null;
  }
}

/**
 * Joriy oy tushum rejasi. Jadval bo'lmasa yoki reja qo'yilmagan bo'lsa null.
 */
async function revenuePlan(
  db: Db,
  period: string
): Promise<{ period: string; plan: number; fact: number; percent: number } | null> {
  const model = (db as Record<string, unknown>).monthlyTarget as
    | { findFirst(args: unknown): Promise<{ plan: unknown; fact: unknown } | null> }
    | undefined;
  if (!model) return null;
  try {
    const row = await model.findFirst({
      where: { period, metric: { contains: "tushum", mode: "insensitive" } },
      select: { plan: true, fact: true },
    });
    const plan = Number(row?.plan ?? 0);
    const fact = Number(row?.fact ?? 0);
    if (!row || plan <= 0) return null;
    return { period, plan, fact, percent: Math.round((fact / plan) * 100) };
  } catch (err) {
    logServerError("directorReport.plan", err);
    return null;
  }
}

/** Hisobotda aytadigan gap bormi. */
export function isReportEmpty(r: DirectorReport): boolean {
  return (
    r.yesterday.income === 0 &&
    r.yesterday.outflow === 0 &&
    r.debt.companies === 0 &&
    r.obligations.overdue === 0 &&
    r.obligations.dueToday === 0 &&
    r.pending.expenses === 0 &&
    r.pending.proofs === 0 &&
    r.unmatchedBank.income === 0 &&
    r.unmatchedBank.expense === 0
  );
}

/** Telegram'ga uzatuvchi — bot qatlami in'ektsiya qiladi. */
export type DirectorSender = (
  recipient: DirectorRecipient,
  report: DirectorReport
) => Promise<boolean>;

export interface DirectorRunResult {
  recipients: number;
  sent: number;
  skippedAlready: number;
  failed: number;
}

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
  const err = e as { code?: string; message?: string } | null;
  return (
    !!err &&
    (err.code === "P2002" ||
      (typeof err.message === "string" && err.message.includes("Unique constraint failed")))
  );
}

/**
 * Ertalabki fan-out. Digest'dan farqli o'laroq BO'SH hisobot ham yuboriladi:
 * direktor uchun "kecha hech narsa bo'lmadi" ham ma'lumot — tinchlik belgisi
 * emas, tekshirish sababi (masalan vipiska yuklanmay qolgan bo'lishi mumkin).
 */
export async function runDirectorReport(
  db: Db,
  deps: { send?: DirectorSender; now?: Date } = {}
): Promise<DirectorRunResult> {
  const now = deps.now ?? new Date();
  const recipients = await collectDirectorRecipients(db);
  const res: DirectorRunResult = {
    recipients: recipients.length,
    sent: 0,
    skippedAlready: 0,
    failed: 0,
  };
  if (recipients.length === 0) return res;

  let report: DirectorReport;
  try {
    // Hisobot hamma uchun bir xil — bir marta hisoblanadi.
    report = await buildDirectorReport(db, now);
  } catch (err) {
    logServerError("directorReport.build", err);
    res.failed = recipients.length;
    return res;
  }

  for (const user of recipients) {
    const dedupKey = directorReportDedupKey(user.id, now);

    const claimed = await db.notificationDelivery.findUnique({
      where: { channel_dedupKey: { channel: DIRECTOR_CHANNEL, dedupKey } },
      select: { id: true },
    });
    if (claimed) {
      res.skippedAlready++;
      continue;
    }

    let deliveryId: string;
    try {
      const row = await db.notificationDelivery.create({
        data: {
          channel: DIRECTOR_CHANNEL,
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

    // Sayt ichidagi xabar — Telegram bog'lanmagan bo'lsa ham qoladi.
    try {
      await db.notification.create({
        data: {
          userId: user.id,
          type: "director_report",
          title: "Kunlik hisobot",
          message: summarizeForInApp(report),
          link: "/dashboard",
        },
      });
    } catch (err) {
      logServerError("directorReport.notification", err, { userId: user.id });
    }

    let delivered = false;
    if (deps.send && user.telegramUserId != null) {
      try {
        delivered = await deps.send(user, report);
      } catch (err) {
        logServerError("directorReport.telegram", err, { userId: user.id });
      }
    }

    await db.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: delivered ? "sent" : "failed", sentAt: now },
    });

    res.sent++;
  }

  return res;
}

/** Sayt ichidagi qisqa matn (Telegram varianti bot qatlamida chiziladi). */
function summarizeForInApp(r: DirectorReport): string {
  const parts = [
    `Kecha: kirim ${formatNum(r.yesterday.income)} / chiqim ${formatNum(r.yesterday.outflow)} so'm`,
    `Balans: ${formatNum(r.balance.balance)} so'm`,
  ];
  // Sayt ichidagi matnda ham MUDDATI O'TGAN qarz asosiy — joriy oy qoldig'i
  // oy boshida hammada bo'ladi va hech narsa demaydi.
  if (r.debt.overdueCompanies > 0) {
    parts.push(
      `Muddati o'tgan qarz: ${r.debt.overdueCompanies} ta firma, ${formatNum(r.debt.overdueTotal)} so'm`
    );
  }
  if (r.obligations.overdue > 0) parts.push(`Muddati o'tgan: ${r.obligations.overdue} ta`);
  if (r.pending.expenses > 0) parts.push(`Tasdiq kutmoqda: ${r.pending.expenses} ta xarajat`);
  if (r.unmatchedBank.income > 0) {
    parts.push(`Moslashtirilmagan kirim: ${r.unmatchedBank.income} ta`);
  }
  if (r.unmatchedBank.expense > 0) {
    parts.push(`Toifalanmagan chiqim: ${r.unmatchedBank.expense} ta`);
  }
  if (r.debt1C) {
    parts.push(`1C bo'yicha qarz: ${formatNum(r.debt1C.total)} so'm`);
  }
  if (r.plan) {
    parts.push(`${r.plan.period} rejasi: ${r.plan.percent}% bajarildi`);
  }
  return parts.join(". ") + ".";
}
