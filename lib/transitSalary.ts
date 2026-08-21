// =====================================================
// KARTA CHIQIMINI TASNIFLASH — oylikmi, taqsimotmi, xarajatmi
// =====================================================
//
// Excel tranzit daftarida kartadan qilingan har chiqimning "maqsad" ustuni
// bor va u erkin matn. Prodda uchta maqsad butun summaning 92% ini tashkil
// qiladi:
//
//   "O'ziga oylik"  400 mln — 23 xil odam O'Z kartasidan O'ZIGA. Oluvchi
//                             ANIQ: kartaning egasi (`channel.employeeId`).
//   "Oylik"         170 mln — BOSHQA odamga. Oluvchi izohda bo'lishi mumkin
//                             ("Oylik — Zamira opaga avans"), 61 tadan 39
//                             tasida bor, qolganida YO'Q.
//   "Otabek akaga"  275 mln — ta'sischiga taqsimot (dividend/olib qo'yish),
//                             oylik EMAS.
//
// ENG MUHIM QOIDA — OLUVCHI NOMA'LUM BO'LSA TAXMIN QILINMAYDI. Oylikni
// noto'g'ri odamga yozish uni ikki tomondan buzadi: birovga bermagan pulini
// bergan qilib ko'rsatadi, haqiqiy oluvchining hisobini esa bo'sh qoldiradi.
// Bunday qator `manual` bo'lib qaytadi va odam qo'li bilan hal qilinadi.

/** Kartaning o'z egasiga to'lovi. */
const SELF_SALARY = ["o'ziga oylik", "oziga oylik", "o‘ziga oylik"];

/** Boshqa xodimga oylik/avans. */
const OTHER_SALARY = ["oylik", "avans"];

/** Ta'sischiga taqsimot — oylik emas. */
const FOUNDER_DRAW = ["otabek akaga"];

export type TransitSalaryKind =
  /** Kartaning egasiga oylik — `employeeId` aniq. */
  | "self_salary"
  /** Ta'sischiga taqsimot — xodim kerak emas. */
  | "founder_draw"
  /** Boshqaga oylik, oluvchi izohdan topilishi kerak. */
  | "other_salary"
  /** Oylik ham, taqsimot ham emas — oddiy xarajat. */
  | "expense";

export interface TransitSalaryVerdict {
  kind: TransitSalaryKind;
  /** `other_salary` uchun izohdan ajratilgan oluvchi nomi (bo'lmasa null). */
  payeeHint: string | null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[‘’'`]/g, "'").replace(/\s+/g, " ").trim();

/**
 * Izohdan oluvchi nomini ajratadi.
 *
 * Import "maqsad — izoh" shaklida yozadi (`import-transit.ts`), ya'ni tire
 * ajratuvchi. Tiredan keyingi qism oluvchining nomi bo'ladi:
 * "Oylik — Zamira opaga avans" → "Zamira opaga avans".
 *
 * Tire bo'lmasa null: bu yerda taxmin qilinmaydi.
 */
export function extractPayeeHint(description: string | null | undefined): string | null {
  const d = (description ?? "").trim();
  const i = d.indexOf("—");
  if (i < 0) return null;
  const tail = d.slice(i + 1).trim();
  return tail.length > 1 ? tail : null;
}

/**
 * Karta chiqimi nima ekanini aytadi.
 *
 * @param category  Excel "maqsad" ustuni (`TransitEntry.category`)
 * @param description  To'liq izoh ("maqsad — comment")
 */
export function classifyTransitOutflow(
  category: string | null | undefined,
  description?: string | null
): TransitSalaryVerdict {
  const c = norm(category);

  if (FOUNDER_DRAW.some((k) => c.includes(k))) {
    return { kind: "founder_draw", payeeHint: null };
  }

  // O'ZIGA tekshiruvi OLDIN turadi: "o'ziga oylik" ichida "oylik" so'zi bor,
  // teskari tartibda u har doim `other_salary` bo'lib ketardi va 400 mln
  // noma'lum oluvchiga tushib qolardi.
  if (SELF_SALARY.some((k) => c.includes(k))) {
    return { kind: "self_salary", payeeHint: null };
  }

  if (OTHER_SALARY.some((k) => c === k || c.startsWith(k + " "))) {
    return { kind: "other_salary", payeeHint: extractPayeeHint(description) };
  }

  return { kind: "expense", payeeHint: null };
}
