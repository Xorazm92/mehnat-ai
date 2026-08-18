// lib/taxRegimes.ts
// SOLIQ REJIMI — kod, yorliq va normalizatsiyaning YAGONA manbai.
//
// NEGA ALOHIDA MODUL: rejim uchta joyda uchta xil ko'rinishda yashardi —
// Prisma `TaxRegime` enumi (5 qiymat), mijozdagi `TaxType` enumi (3 qiymat)
// va `lib/matrixFilters.ts` dagi yorliqlar. Wizard `taxType` ni tahrirlardi,
// server esa `taxRegime` ni yozardi va IKKALASI ham bitta payload'da kelardi.
// Natijada foydalanuvchi rejimni o'zgartirib saqlasa, server payload'dagi
// ESKI `taxRegime` ni ustun deb bilib, o'zgarishni jimgina tashlab yuborardi
// ("o'zgartiraman, saqlayman, o'zgarmaydi").
//
// Bu modul sof: DOM ham, Prisma ham bilmaydi — mijoz ham, server ham
// ishlatadi.

export const TAX_REGIMES = ["vat", "turnover", "fixed", "yatt", "income"] as const;
export type TaxRegimeCode = (typeof TAX_REGIMES)[number];

/**
 * Ekrandagi nom.
 *
 * "VAT" emas, "NDS": korxonada kundalik nutqda ham, hujjatlarda ham shu
 * atama ishlatiladi.
 */
export const TAX_REGIME_LABEL: Record<TaxRegimeCode, string> = {
  vat: "NDS",
  turnover: "Aylanmadan soliq",
  fixed: "Qat'iy soliq",
  yatt: "YaTT",
  income: "Daromad solig'i",
};

/** Tanlagichdagi bir qatorlik tushuntirish. */
export const TAX_REGIME_HINT: Record<TaxRegimeCode, string> = {
  vat: "QQS to'lovchi — QQS deklaratsiyasi oylik",
  turnover: "Aylanma soliq — choraklik hisobot",
  fixed: "Qat'iy belgilangan soliq",
  yatt: "Yakka tartibdagi tadbirkor",
  income: "Daromad solig'i to'lovchi",
};

/** Matritsadagi qisqa belgi (jadval ustuni tor). */
export const TAX_REGIME_SHORT: Record<TaxRegimeCode, string> = {
  vat: "NDS",
  turnover: "AYLANMA",
  fixed: "QAT'IY",
  yatt: "YATT",
  income: "DAROMAD",
};

const CODES = new Set<string>(TAX_REGIMES);

/**
 * Har qanday xom qiymatni rejim kodiga keltiradi.
 *
 * Eski mijoz kaliti `nds_profit` ham qabul qilinadi — u `TaxType` enumidan
 * qolgan va hali ayrim ekranlarda yuriydi.
 */
export function normalizeTaxRegime(value: unknown): TaxRegimeCode {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "nds_profit" || v === "nds" || v === "vat") return "vat";
  return CODES.has(v) ? (v as TaxRegimeCode) : "vat";
}

/**
 * Eski `TaxType` (3 qiymatli) ko'rinishi — badge va filtrlar hali shuni o'qiydi.
 *
 * DIQQAT: bu YO'QOTADIGAN o'girma (`yatt`/`income` → `fixed`). Shuning uchun
 * uni BAZAGA yozish uchun ishlatib bo'lmaydi — faqat ko'rsatish uchun.
 */
export function legacyTaxType(regime: TaxRegimeCode): string {
  if (regime === "vat") return "nds_profit";
  if (regime === "turnover") return "turnover";
  return "fixed";
}

export const taxRegimeLabel = (code: string): string =>
  TAX_REGIME_LABEL[normalizeTaxRegime(code)];
