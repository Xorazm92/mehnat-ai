// lib/reportTemplateMap.ts
// Matritsa ustuni ↔ muddat shabloni XARITASI — sof ma'lumot, bog'liqliksiz.
//
// NEGA ALOHIDA FAYL: bu xarita `lib/obligationBridge.ts` ichida edi, u esa
// `@/lib/prisma` ni import qiladi. Xaritani KLIENT komponentidan (matritsa)
// ishlatishga urinilganda Prisma butun brauzer to'plamiga tortildi va prod
// build "Module not found: dns / fs / net / tls" bilan yiqildi.
//
// Bu yerda hech qanday server bog'liqligi BO'LMASLIGI kerak.

export const COL_KEY_TO_TEMPLATE_CODES: Record<string, string[]> = {
  // ── Oylik ichki reglament ────────────────────────────────
  pul_oqimlari: ["CASHFLOW"],
  debitor_kreditor: ["AR_AP"],
  tovar_ostatka: ["MATERIALS"],
  one_c: ["ONEC_BASE"],
  xatlar: ["LETTERS"],
  hisoblangan_oylik: ["PAYROLL_CALC"],
  chiqadigan_soliqlar: ["TAX_SCHEDULE"],
  foyda_va_zarar: ["PNL_REPORT"],
  didox: ["DIDOX_FLOW"],
  avtokameral: ["AVTOKAMERAL"],
  my_mehnat: ["MY_MEHNAT"],

  // ── Soliq deklaratsiyalari ───────────────────────────────
  inps: ["INPS_IJTIMOIY"],
  daromad_soliq: ["DAROMAD_AGENT"],
  // Har ustun O'Z shabloniga. Ilgari bitta ustun ikkalasini ko'targani uchun
  // maxraj "QQS to'lovchilar + aylanma rejimidagilar" bo'lib, foiz ikki xil
  // majburiyatni aralashtirardi.
  qqs: ["QQS_DECL"],
  aylanma: ["AYLANMA_SOLIQ"],
  foyda_soliq: ["FOYDA_YILLIK"],
  yer_soligi: ["YER_SOLIQ"],
  suv_soligi: ["SUV_SOLIQ"],
  mol_mulk_soligi: ["MOL_MULK_SOLIQ"],
  bonak: ["BONAK"],
  ekologiya: ["EKOLOGIYA"],

  // ── Moliyaviy hisobotlar ─────────────────────────────────
  moliyaviy_natija: ["MOLIYAVIY_YILLIK"],
  buxgalteriya_balansi: ["BUX_BALANS"],

  // ── IT Park ──────────────────────────────────────────────
  // Shablon kodi "OYLIK", lekin davriyligi CHORAKLIK (IT Park rezidenti ish
  // haqi hisobotini chorakda topshiradi) — shuning uchun choraklik ustunga
  // bog'lanadi. `itpark_oylik` katagi oylik kuzatuv bo'lib qoladi.
  itpark_chorak: ["ITPARK_OYLIK"],
};

/**
 * ATAYLAB matritsaga bog'lanmagan shablonlar — bu ro'yxat "unutilgan" bilan
 * "qasddan" ni ajratadi (test shu ro'yxatga tayanadi).
 */
export const UNMAPPED_TEMPLATE_CODES: Record<string, string> = {
  // "Oylik chiqdi + 6710 Kt" — matritsada katagi yo'q, manbasi oylik moduli
  // (`/payroll`). `hisoblangan_oylik` allaqachon PAYROLL_CALC'ni ko'taradi;
  // ikkalasini bitta katakka bog'lash qaysi majburiyat harakatlanishini
  // noaniq qilardi.
  PAYROLL_POSTED: "Oylik moduli (Payout) orqali yuritiladi",
};

/** Eski nom — chaqiruv joylari uchun (bitta kod qaytaradi). */
export const COL_KEY_TO_TEMPLATE_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(COL_KEY_TO_TEMPLATE_CODES).map(([k, v]) => [k, v[0]]),
);