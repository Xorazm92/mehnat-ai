// =====================================================
// ACCOUNTING PERIOD LOCK — yopilgan davr himoyasi
// =====================================================
// Holat mashinasi (server/monthClosing.ts boshqaradi):
//   OPEN            — yozish ochiq
//   READY_TO_CLOSE  — checklist yashil; YOZISH hali ochiq, lekin yangi yozuv
//                     davrni avtomatik OPEN ga qaytaradi (checklist eskirdi)
//   CLOSING         — yopilish jarayonida: yozish BLOK (race yopiq)
//   LOCKED          — yopilgan: yozish BLOK
//   REOPENED        — qayta ochilgan: yozish ochiq
//   FAILED          — yopish urinishi yiqilgan: yozish ochiq (tuzatish uchun)
// Global qulf: companyId = null. Faqat super_admin boshqaradi.
import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export const PERIOD_STATUS = {
  OPEN: "OPEN",
  READY_TO_CLOSE: "READY_TO_CLOSE",
  CLOSING: "CLOSING",
  LOCKED: "LOCKED",
  REOPENED: "REOPENED",
  FAILED: "FAILED",
} as const;

export type PeriodStatus = (typeof PERIOD_STATUS)[keyof typeof PERIOD_STATUS];

/** Yozish mumkin bo'lgan holatlar (closeMonth claim shulardan boshlanadi). */
export const WRITABLE_STATUSES: PeriodStatus[] = ["OPEN", "READY_TO_CLOSE", "REOPENED", "FAILED"];

/** Yozish taqiqlangan holatlar. */
export const BLOCKED_STATUSES: PeriodStatus[] = ["LOCKED", "CLOSING"];

export interface PeriodKey {
  year: number;
  month: number; // 1-12
}

/** "YYYY-MM", "YYYY-MM-DD" yoki Date dan (yil, oy) ni ajratadi. */
export function periodKeyOf(input: string | Date): PeriodKey {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error("Davr sanasi noto'g'ri");
    return { year: input.getFullYear(), month: input.getMonth() + 1 };
  }
  const m = /^(\d{4})-(\d{2})/.exec(input);
  if (!m) throw new Error("Davr formati noto'g'ri (YYYY-MM kutiladi)");
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error("Davr oyi 01-12 oralig'ida bo'lishi kerak");
  return { year, month };
}

export const periodLabel = (k: PeriodKey) => `${k.year}-${String(k.month).padStart(2, "0")}`;

/**
 * Davr yozishga ochiqligini tekshiradi. LOCKED/CLOSING — xato.
 * READY_TO_CLOSE — yozuvga ruxsat, lekin holat avtomatik OPEN ga qaytadi
 * (yangi hujjat checklist natijasini eskirtiradi — "statuslar avtomatik").
 */
export async function assertPeriodOpen(db: Db, input: string | Date, label = "moliyaviy yozuv"): Promise<void> {
  const key = periodKeyOf(input);
  const period = await db.accountingPeriod.findFirst({
    where: { companyId: null, year: key.year, month: key.month },
    select: { id: true, status: true },
  });
  if (!period) return; // davr qatori yo'q = OPEN

  if (period.status === PERIOD_STATUS.LOCKED) {
    throw new Error(
      `${periodLabel(key)} davri yopilgan (LOCKED) — ${label} o'zgartirilmaydi. ` +
        `Zarur bo'lsa Superadmin davrni qayta ochishi (reopen) kerak.`
    );
  }
  if (period.status === PERIOD_STATUS.CLOSING) {
    throw new Error(
      `${periodLabel(key)} davri hozir yopilmoqda (CLOSING) — ${label} kutib tursin.`
    );
  }
  if (period.status === PERIOD_STATUS.READY_TO_CLOSE) {
    // Yangi moliyaviy yozuv checklist natijasini eskirtiradi.
    await db.accountingPeriod.update({
      where: { id: period.id },
      data: { status: PERIOD_STATUS.OPEN, statusNote: "yangi yozuv kirdi — checklist qayta tekshirilsin" },
    });
  }
}
