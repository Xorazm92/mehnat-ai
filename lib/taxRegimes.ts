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

// Eski (deprecated) qiymatlar — bazada va eski yozuvlarda hali uchraydi.
// UI'da endi TANLAB BO'LMAYDI (TAX_CATEGORIES ularni ro'yxatga olmaydi),
// lekin normalizatsiya va ko'rsatish uchun har doim qo'llab-quvvatlanadi.
const LEGACY_REGIMES = ["turnover", "fixed", "yatt", "income"] as const;

// Joriy (tanlanadigan) qiymatlar — real O'zbekiston soliq taksonomiyasi:
//   1. vat               — Umumbelgilangan rejim, QQS to'lovchi (aylanma >1 mlrd yoki ixtiyoriy)
//   2. turnover_percent  — Aylanmadan soliq, foiz stavkasida (baza 4%)
//   2. turnover_fixed    — Aylanmadan soliq, qat'iy belgilangan summada (20-30 mln/yil)
//   4. yatt_fixed        — YaTT, qat'iy belgilangan daromad solig'i (aylanma <100 mln)
//   4. yatt_turnover     — YaTT, aylanmadan soliq (100 mln - 1 mlrd)
//   4. yatt_vat          — YaTT, umumbelgilangan/QQS (aylanma >1 mlrd)
//   5. nonresident       — Norezident / doimiy muassasa (xorijiy filial)
//
// Eslatma: (3) "Maxsus rejim / imtiyozli rezidentlar" (IT Park, Texnopark,
// MIZ) alohida kod EMAS — bu rejimlar odatda `vat` yoki boshqa rejim ustiga
// qo'shiladigan IMTIYOZ, shuning uchun `Company.itParkResident` bayrog'i
// bilan ifodalanadi (onboarding 1-qadam), soliq rejimi esa shu bayroq
// ustiga alohida tanlanadi.
export const TAX_REGIMES = [
  "vat",
  "simplified_vat",
  "turnover_percent",
  "turnover_fixed",
  "yatt_fixed",
  "yatt_turnover",
  "yatt_vat",
  "nonresident",
  ...LEGACY_REGIMES,
] as const;
export type TaxRegimeCode = (typeof TAX_REGIMES)[number];

/**
 * Ikki bosqichli tanlagich uchun kategoriyalar. Wizard shu ro'yxatni
 * chizadi: har bir kategoriya bitta karta, ba'zilarida ichki
 * sub-variantlar (radio) bor.
 */
export type TaxCategoryId = "vat" | "simplified_vat" | "turnover" | "yatt" | "nonresident";

export interface TaxSubOption {
  code: TaxRegimeCode;
  label: string;
  hint: string;
}

export interface TaxCategory {
  id: TaxCategoryId;
  label: string;
  hint: string;
  /** Kategoriyaning o'zi tanlanadigan yagona kod (sub-variantsiz holatda). */
  code?: TaxRegimeCode;
  subOptions?: TaxSubOption[];
}

export const TAX_CATEGORIES: TaxCategory[] = [
  {
    id: "vat",
    label: "Umumbelgilangan soliq rejimi",
    hint: "QQS to'lovchi (NDS 12%) — yillik aylanma >1 mlrd yoki ixtiyoriy QQS",
    code: "vat",
  },
  {
    id: "simplified_vat",
    label: "Soddalashtirilgan QQS to'lovchi",
    hint: "Oborotdan 6% QQS to'lanadi — foyda solig'i to'lanmaydi",
    code: "simplified_vat",
  },
  {
    id: "turnover",
    label: "Aylanmadan olinadigan soliq",
    hint: "Soddalashtirilgan rejim — ikki to'lov shaklidan biri tanlanadi",
    subOptions: [
      {
        code: "turnover_percent",
        label: "Foiz stavkasida",
        hint: "Baza stavka 4% — oylik aylanmadan hisoblanadi",
      },
      {
        code: "turnover_fixed",
        label: "Qat'iy belgilangan summada",
        hint: "Yiliga 20-30 mln so'm — aylanma hajmiga qarab",
      },
    ],
  },
  {
    id: "yatt",
    label: "YaTT (Yakka tartibdagi tadbirkor)",
    hint: "Aylanma hajmiga qarab uch xil ichki rejim",
    subOptions: [
      {
        code: "yatt_fixed",
        label: "Qat'iy belgilangan daromad solig'i",
        hint: "Yillik aylanma < 100 mln so'm",
      },
      {
        code: "yatt_turnover",
        label: "Aylanmadan soliq",
        hint: "Yillik aylanma 100 mln - 1 mlrd so'm",
      },
      {
        code: "yatt_vat",
        label: "Umumbelgilangan / QQS",
        hint: "Yillik aylanma > 1 mlrd so'm",
      },
    ],
  },
  {
    id: "nonresident",
    label: "Norezident / Doimiy muassasa",
    hint: "Xorijiy kompaniya filiali — alohida soliq tartibi",
    code: "nonresident",
  },
];

/**
 * Ekrandagi nom (yakka kod bo'yicha — badge, filtr, jadval ustuni uchun).
 *
 * "VAT" emas, "NDS": korxonada kundalik nutqda ham, hujjatlarda ham shu
 * atama ishlatiladi.
 */
export const TAX_REGIME_LABEL: Record<TaxRegimeCode, string> = {
  vat: "NDS",
  simplified_vat: "Soddalashtirilgan QQS",
  turnover_percent: "Aylanma (foiz)",
  turnover_fixed: "Aylanma (qat'iy)",
  yatt_fixed: "YaTT (qat'iy)",
  yatt_turnover: "YaTT (aylanma)",
  yatt_vat: "YaTT (QQS)",
  nonresident: "Norezident",
  // Eski qiymatlar — faqat ko'rsatish uchun.
  turnover: "Aylanmadan soliq",
  fixed: "Qat'iy soliq",
  yatt: "YaTT",
  income: "Daromad solig'i",
};

/** Tanlagichdagi bir qatorlik tushuntirish. */
export const TAX_REGIME_HINT: Record<TaxRegimeCode, string> = {
  vat: "QQS to'lovchi — QQS deklaratsiyasi oylik",
  simplified_vat: "Oborotdan 6% QQS — foyda solig'i yo'q, QQS deklaratsiyasi oylik",
  turnover_percent: "Aylanma soliq (foiz, baza 4%) — choraklik hisobot",
  turnover_fixed: "Aylanma soliq (qat'iy summa) — choraklik hisobot",
  yatt_fixed: "YaTT, qat'iy daromad solig'i (aylanma <100 mln)",
  yatt_turnover: "YaTT, aylanma soliq (100 mln - 1 mlrd)",
  yatt_vat: "YaTT, umumbelgilangan/QQS (aylanma >1 mlrd)",
  nonresident: "Xorijiy kompaniya filiali — alohida tartib",
  turnover: "Aylanma soliq — choraklik hisobot",
  fixed: "Qat'iy belgilangan soliq",
  yatt: "Yakka tartibdagi tadbirkor",
  income: "Daromad solig'i to'lovchi",
};

/** Matritsadagi qisqa belgi (jadval ustuni tor). */
export const TAX_REGIME_SHORT: Record<TaxRegimeCode, string> = {
  vat: "NDS",
  simplified_vat: "QQS 6%",
  turnover_percent: "AYLANMA %",
  turnover_fixed: "AYLANMA QAT'IY",
  yatt_fixed: "YATT QAT'IY",
  yatt_turnover: "YATT AYLANMA",
  yatt_vat: "YATT QQS",
  nonresident: "NOREZIDENT",
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
 * Bargdan toifa id'sini topadi (wizard'da ikki bosqichli tanlagichning
 * qaysi karta faol ekanligini shu bilan aniqlaydi). Eski (deprecated)
 * kodlar ham eng yaqin toifaga tushiriladi: `turnover`/`fixed` →
 * "turnover", `yatt`/`income` → "yatt".
 */
export function taxRegimeCategory(regime: TaxRegimeCode): TaxCategoryId {
  switch (regime) {
    case "vat":
      return "vat";
    case "simplified_vat":
      return "simplified_vat";
    case "turnover":
    case "turnover_percent":
    case "turnover_fixed":
    case "fixed":
      return "turnover";
    case "yatt":
    case "yatt_fixed":
    case "yatt_turnover":
    case "yatt_vat":
    case "income":
      return "yatt";
    case "nonresident":
      return "nonresident";
    default:
      return "vat";
  }
}

/**
 * Berilgan kod qaysi majburiyat-dvigatel kriteriyasiga to'g'ri kelishini
 * qaytaradi. Majburiyat dvigateli (`reportApplicability.ts`) hali faqat
 * `"vat"` / `"turnover"` bilan filtrlaydi — yangi tur-kodlar shu ikki
 * kategoriyadan biriga "keladi" deb belgilanadi, YaTT-QQS esa `vat`
 * majburiyatlarini, YaTT-aylanma esa `turnover` majburiyatlarini oladi.
 */
export function taxRegimeEngineBucket(regime: TaxRegimeCode): "vat" | "turnover" | "other" {
  if (regime === "vat" || regime === "yatt_vat" || regime === "simplified_vat") return "vat";
  if (
    regime === "turnover" ||
    regime === "turnover_percent" ||
    regime === "turnover_fixed" ||
    regime === "yatt_turnover"
  )
    return "turnover";
  return "other";
}

/**
 * Eski `TaxType` (3 qiymatli) ko'rinishi — badge va filtrlar hali shuni o'qiydi.
 *
 * DIQQAT: bu YO'QOTADIGAN o'girma. Shuning uchun uni BAZAGA yozish uchun
 * ishlatib bo'lmaydi — faqat ko'rsatish uchun.
 */
export function legacyTaxType(regime: TaxRegimeCode): string {
  const bucket = taxRegimeEngineBucket(regime);
  if (bucket === "vat") return "nds_profit";
  if (bucket === "turnover") return "turnover";
  return "fixed";
}

export const taxRegimeLabel = (code: string): string =>
  TAX_REGIME_LABEL[normalizeTaxRegime(code)];
