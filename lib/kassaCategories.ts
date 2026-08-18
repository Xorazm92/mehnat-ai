// Kassa kirim/chiqim toifalari.
//
// Bungacha ular kodda qattiq yozilgan edi (`lib/bank/classifyExpense.ts`),
// ya'ni yangi toifa qo'shish uchun dastur o'zgartirilishi kerak edi. Endi
// ro'yxat sozlamada — korxona o'z lug'atini yuritadi.
//
// Manba: "Kassa.json" DICTIONARY varag'i (korxonada amalda ishlatilayotgan).

export const KASSA_CATEGORIES_KEY = "kassaCategories";

export interface KassaCategories {
  income: string[];
  expense: string[];
}

export const DEFAULT_KASSA_CATEGORIES: KassaCategories = {
  income: [
    "Firma to'lovi", "Vostanavleniya", "Tezkor audit", "Firma ochish",
    "Firma yopish", "Pereregistratsiya", "Yurxizmat", "1C sopr", "Boshlang'ich qoldiq",
  ],
  // "Oylik" ATAYIN YO'Q. Oylik `Payout` jadvalidan chiqadi va balans uni
  // o'sha yerdan sanaydi (`lib/balance.ts`) — kassa chiqimi sifatida ham
  // yozilsa bitta to'lov ikki marta hisobga kirardi. Bank importi buni
  // allaqachon bloklaydi (`lib/bank/classifyExpense.ts` NON_POSTABLE_CATEGORIES),
  // qo'lda kiritish yo'lida esa himoya yo'q edi — endi `server/kassa.ts`
  // `createKassaEntry` da qo'riqchi bor.
  expense: [
    "Arenda", "Internet", "Telefon", "Dividend", "Qarz", "Ovqatga",
    "Moliyaviy yordam", "Suvga", "Kommunal (svet)", "Texnika", "1C server",
    "Soliqlar", "Bank usluga", "Boshqa xarajatlar", "Ma'muriy xarajatlar",
    "Marketing", "Finschool", "Vostanavleniy xodimi",
  ],
};

/** Sozlamadan kelgan (ishonchsiz) qiymatni tozalaydi. */
export function resolveKassaCategories(raw: unknown): KassaCategories {
  if (!raw || typeof raw !== "object") return DEFAULT_KASSA_CATEGORIES;
  const src = raw as Record<string, unknown>;
  const list = (v: unknown, fallback: string[]) =>
    Array.isArray(v) && v.every((x) => typeof x === "string") && v.length > 0
      ? (v as string[])
      : fallback;
  return {
    income: list(src.income, DEFAULT_KASSA_CATEGORIES.income),
    expense: list(src.expense, DEFAULT_KASSA_CATEGORIES.expense),
  };
}
