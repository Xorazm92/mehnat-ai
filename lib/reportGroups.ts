// lib/reportGroups.ts
// MonthlyReport ustunlarining KATEGORIYA metadatasi (guruh belgisi).
//
// Muhim: bu fayl hech qanday ustunni o'chirmaydi va o'zgartirmaydi — u faqat
// har bir mavjud ustunga "bu qanday majburiyat?" degan belgini qo'shadi.
// Hafta 7-8 dagi UnifiedObligation migratsiyasi shu belgidan `category`
// maydonini to'ldirish uchun foydalanadi (docs/OBLIGATION_UNIFICATION_PLAN.md).
//
// Kalit maydoni: snake_case `OperationFieldKey` — loyihadagi YAGONA kanonik
// ustun kalit fazosi. DB ustuni (camelCase) kerak bo'lsa FIELD_TO_DB_COLUMN
// orqali o'giriladi, bu yerda emas.
//
// Bu yerda label/tartib YO'Q — ular lib/reportColumns.ts (BASE_REPORT_COLUMNS)
// da, admin sozlamasi bilan override qilinadi. Ikki manbada takrorlash drift
// keltirib chiqaradi.

import type { OperationFieldKey } from "@/types";

export type ReportCategory = "OPERATSION" | "SOLIQ" | "STATISTIKA" | "MAXSUS";

/**
 * Har bir ustun kalitining kategoriyasi.
 *
 * `Record<OperationFieldKey, ...>` — to'liqlik TypeScript tomonidan
 * majburlanadi: types.ts ga yangi ustun kaliti qo'shilsa va bu yerga
 * yozilmasa, build XATO beradi. Shu sabab default/fallback qiymat kerak emas.
 */
export const COLUMN_CATEGORY: Record<OperationFieldKey, ReportCategory> = {
  // ═══ OPERATSION — kunlik/oylik amaliy ishlar ═══
  bank_klient: "OPERATSION",
  didox: "OPERATSION",
  xatlar: "OPERATSION",
  avtokameral: "OPERATSION",
  my_mehnat: "OPERATSION",
  one_c: "OPERATSION",
  pul_oqimlari: "OPERATSION",
  hisoblangan_oylik: "OPERATSION",
  debitor_kreditor: "OPERATSION",
  tovar_ostatka: "OPERATSION",

  // ═══ SOLIQ — soliq hisoboti va to'lovlari ═══
  chiqadigan_soliqlar: "SOLIQ",
  nds_bekor_qilish: "SOLIQ",
  qqs: "SOLIQ",
  qqs_tolov: "SOLIQ",
  aylanma: "SOLIQ",
  aylanma_tolov: "SOLIQ",
  // DEPRECATED — bo'lingunga qadar ishlatilgan birlashgan kalit.
  aylanma_qqs: "SOLIQ",
  aylanma_qqs_tolov: "SOLIQ",
  daromad_soliq: "SOLIQ",
  daromad_soliq_tolov: "SOLIQ",
  inps: "SOLIQ",
  inps_tolov: "SOLIQ",
  foyda_soliq: "SOLIQ",
  foyda_soliq_tolov: "SOLIQ",
  bonak: "SOLIQ",
  yer_soligi: "SOLIQ",
  mol_mulk_soligi: "SOLIQ",
  suv_soligi: "SOLIQ",
  aksiz_soligi: "SOLIQ",
  nedro_soligi: "SOLIQ",
  norezident_foyda: "SOLIQ",
  norezident_nds: "SOLIQ",

  // ═══ STATISTIKA — davlat statistika hisobotlari ═══
  statistika: "STATISTIKA",
  stat_12_invest: "STATISTIKA",
  stat_12_moliya: "STATISTIKA",
  stat_12_korxona: "STATISTIKA",
  stat_12_narx: "STATISTIKA",
  stat_4_invest: "STATISTIKA",
  stat_4_mehnat: "STATISTIKA",
  stat_4_korxona_miz: "STATISTIKA",
  stat_4_kb_qur_sav_xiz: "STATISTIKA",
  stat_4_kb_sanoat: "STATISTIKA",
  stat_1_invest: "STATISTIKA",
  stat_1_ih: "STATISTIKA",
  stat_1_energiya: "STATISTIKA",
  stat_1_korxona: "STATISTIKA",
  stat_1_korxona_tif: "STATISTIKA",
  stat_1_moliya: "STATISTIKA",
  stat_1_akt: "STATISTIKA",
  stat_1_tib: "STATISTIKA",
  stat_4_moliya: "STATISTIKA",

  // ═══ MAXSUS — moliyaviy hisobotlar + IT Park + kommunal ═══
  // DIQQAT: bu kategoriya hozir ikki xil narsani birlashtirgan (moliyaviy
  // hisobotlar va IT Park/kommunal). ObligationType enum yakunlanishida
  // MOLIYAVIY / MAXSUS ga ajratish taklif qilinadi — rejaga qarang.
  foyda_va_zarar: "MAXSUS",
  moliyaviy_natija: "MAXSUS",
  buxgalteriya_balansi: "MAXSUS",
  itpark_oylik: "MAXSUS",
  itpark_chorak: "MAXSUS",
  kom_suv: "MAXSUS",
  kom_gaz: "MAXSUS",
  kom_svet: "MAXSUS",
  ekologiya: "MAXSUS",
};

/** UI da ko'rsatiladigan kategoriya nomlari. */
export const CATEGORY_LABEL_UZ: Record<ReportCategory, string> = {
  OPERATSION: "Operatsion",
  SOLIQ: "Soliq",
  STATISTIKA: "Statistika",
  MAXSUS: "Maxsus",
};

/** Kategoriyalarni ko'rsatish tartibi. */
export const CATEGORY_ORDER: readonly ReportCategory[] = [
  "OPERATSION",
  "SOLIQ",
  "STATISTIKA",
  "MAXSUS",
] as const;

/**
 * Ustun kalitining kategoriyasi. Kalit `OperationFieldKey` bo'lgani uchun
 * natija har doim mavjud — fallback yo'q.
 */
export function getColumnCategory(key: OperationFieldKey): ReportCategory {
  return COLUMN_CATEGORY[key];
}

/**
 * Noma'lum (tashqi/eski) satr kalit uchun xavfsiz variant: mos kelmasa
 * `null` qaytaradi — jim turib noto'g'ri kategoriya bermaydi.
 */
export function tryGetColumnCategory(key: string): ReportCategory | null {
  return (COLUMN_CATEGORY as Record<string, ReportCategory | undefined>)[key] ?? null;
}

/** Berilgan kategoriyaga tegishli barcha ustun kalitlari. */
export function columnsInCategory(category: ReportCategory): OperationFieldKey[] {
  return (Object.keys(COLUMN_CATEGORY) as OperationFieldKey[]).filter(
    (key) => COLUMN_CATEGORY[key] === category
  );
}

/**
 * Ustunlar ro'yxatini kategoriya bo'yicha guruhlaydi (CATEGORY_ORDER tartibida).
 * Kirish elementining kalit maydonini `keyOf` bilan beriladi, shuning uchun
 * ReportColumn, OperationTemplate va boshqa shakllar bilan ishlaydi.
 */
export function groupByCategory<T>(
  items: readonly T[],
  keyOf: (item: T) => string
): { category: ReportCategory; label: string; items: T[] }[] {
  const buckets = new Map<ReportCategory, T[]>();
  for (const item of items) {
    const category = tryGetColumnCategory(keyOf(item));
    if (!category) continue;
    const bucket = buckets.get(category);
    if (bucket) bucket.push(item);
    else buckets.set(category, [item]);
  }
  return CATEGORY_ORDER.filter((c) => buckets.has(c)).map((category) => ({
    category,
    label: CATEGORY_LABEL_UZ[category],
    items: buckets.get(category)!,
  }));
}

/**
 * Hafta 7-8 UnifiedObligation migratsiyasi uchun oldindan belgilangan moslik.
 * Hozir hech qayerda ishlatilmaydi — migratsiya skripti shundan foydalanadi,
 * shunda kategoriya qarori ikki joyda takrorlanmaydi.
 */
export const CATEGORY_TO_OBLIGATION_TYPE: Record<ReportCategory, string> = {
  OPERATSION: "OPERATIONAL",
  SOLIQ: "TAX",
  STATISTIKA: "STATISTICS",
  MAXSUS: "SPECIAL",
};
