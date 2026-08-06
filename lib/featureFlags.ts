// =====================================================
// MIGRATION FEATURE FLAGS
// =====================================================
// B blok matritsani `MonthlyReport` dan `Obligation` proyeksiyasiga ko'chiradi.
// Bunday almashtirish DEPLOY bilan emas, BAYROQ bilan qaytarilishi kerak —
// aks holda qaytarish yo'li "shoshilinch relizni orqaga qaytarish" bo'ladi.
//
// Nega `server/system-settings.ts` emas: undagi `getSystemSettings()`
// `requireAdmin()` chaqiradi. O'qish yo'lida sessiya bo'lmaydi (RSC keshi,
// BullMQ worker'i, skript), shuning uchun u yerda bayroq o'qib bo'lmaydi.
// Bu modul auth talab qilmaydi va `Db` qabul qiladi — worker ham, tranzaksiya
// ham chaqira oladi.
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export const SETTING_KEY = "features";

/**
 * Standart qiymatlar — bazada qator bo'lmasa SHU holat amal qiladi.
 * Ya'ni bayroq jadvali bo'sh bo'lsa tizim BUGUNGIDEK ishlaydi.
 */
export const MIGRATION_FLAGS = {
  /** Matritsa katagi `Obligation` ga ham yozadi (soyada). */
  matrix_dual_write: false,
  /** Ikkala yozuv BIR tranzaksiyada; xato bo'lsa foydalanuvchi bosishi quladi. */
  matrix_strict_write: false,
  /** `OperationEntry` `Obligation` dan quriladi. */
  matrix_read_projection: false,
  /** Legacy jadvalga yozish davom etadimi. */
  monthly_report_write: true,
  /** Import shlyuzi UI'si ko'rinadimi. */
  import_gateway: false,
} as const;

export type FlagName = keyof typeof MIGRATION_FLAGS;
export type Flags = Record<FlagName, boolean>;

/** Noma'lum kalitlarni tashlab, faqat e'lon qilinganlarini birlashtiradi. */
export function mergeFlags(raw: unknown): Flags {
  const out = { ...MIGRATION_FLAGS } as Flags;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k in out && typeof v === "boolean") out[k as FlagName] = v;
  }
  return out;
}

/**
 * Bayroqlarni o'qiydi. DB yiqilsa — STANDART qiymatlar, ya'ni bugungi xulq.
 *
 * Fail-safe yo'nalishi ataylab: bayroqlar o'qilmasa migratsiya YOQILMAYDI.
 * Teskarisi — DB nosozligi tufayli yarim ko'chirilgan holatga tushish — ancha
 * yomon.
 */
export async function getMigrationFlags(db: Db): Promise<Flags> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    return mergeFlags(row?.value);
  } catch {
    return { ...MIGRATION_FLAGS };
  }
}
