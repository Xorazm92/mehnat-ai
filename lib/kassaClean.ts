// =====================================================
// TOZALANGAN KASSA DAFTARINI O'QISH (`kassa/json_clean/`)
// =====================================================
//
// NEGA IKKINCHI O'QIGICH. `lib/transitImport.ts` Excel EKSPORTINI o'qiydi —
// varaq-varaq, ustun tartibi har xil, ba'zi katak buzuq. 2026-09-01 audit
// aynan o'sha manbada uchta zarar topdi: 60 996 ta yo'qolgan belgi (U+FFFD),
// 226 ta buzuq sana va varaq oxiridagi qo'lda yozilgan "Total". Shu sababdan
// avgust importi jimgina KAM ma'lumot yozgan:
//
//   daftar (audit)  120 kirim / 768 968 738,58 · 116 chiqim / 767 169 546,62
//   bazada          97 kirim  / 659 854 346,58 · 89 chiqim  / 598 212 634,62
//
// `kassa/json_clean/cash_transactions.json` — o'sha auditning chiqishi:
// yassi, tekshirilgan, har qatorda registr/sana/firma/summa bor. Bu modul
// faqat SHU shaklni biladi va hech qanday tuzatish qilmaydi — fayl allaqachon
// tuzatilgan. Vazifasi: o'qish, tekshirish va yig'indini qayta hisoblash.
//
// SOF (pure) — Prisma tortmaydi, shuning uchun test ham, skript ham ishlatadi.

/** `cash_transactions.json` dagi bitta xom qator. */
interface RawCleanRow {
  register?: unknown;
  date?: unknown;
  date_inferred?: unknown;
  company?: unknown;
  company_inn?: unknown;
  amount_in?: unknown;
  amount_out?: unknown;
  bank_fee?: unknown;
  purpose?: unknown;
  note?: unknown;
}

export interface CleanCashMovement {
  /** Fayldagi tartib raqami (0 dan). `dedupKey` shu raqamga tayanadi. */
  rowNo: number;
  /** Kassa nomi — daftar varag'i ("Abror", "Azizbek X", "Sevara opa"). */
  register: string;
  date: Date;
  /** Sana yuqoridagi qatordan meros olingan (auditda 30 ta shunday). */
  dateInferred: boolean;
  /** Pul kelgan o'z firma — kirimda to'ladi, chiqimda bo'sh. */
  company: string | null;
  companyInn: string | null;
  amountIn: number;
  amountOut: number;
  bankFee: number;
  /** Chiqim toifasi ("Oylik", "O'ziga oylik", "Ovqat", "Xarajat"). */
  purpose: string | null;
  note: string | null;
}

export class CleanCashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CleanCashError";
  }
}

function num(v: unknown, rowNo: number, field: string): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new CleanCashError(`${rowNo}-qator, "${field}": son kutilgandi, keldi ${JSON.stringify(v)}`);
  }
  if (v < 0) throw new CleanCashError(`${rowNo}-qator, "${field}": manfiy summa (${v})`);
  return v;
}

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Xom JSON → tekshirilgan harakatlar.
 *
 * Sana MAJBURIY: auditdan keyin faylda sanasiz qator qolmagan (30 tasi
 * yuqoridan meros olgan va `date_inferred` bilan belgilangan). Sanasiz qator
 * paydo bo'lsa — bu fayl boshqa quvurdan kelgan degani, jim davom etmaymiz.
 */
export function parseCleanCash(raw: unknown): CleanCashMovement[] {
  if (!Array.isArray(raw)) throw new CleanCashError("Fayl massiv emas");

  return raw.map((r, rowNo) => {
    const row = r as RawCleanRow;
    const register = text(row.register);
    if (!register) throw new CleanCashError(`${rowNo}-qator: "register" bo'sh`);

    const iso = text(row.date);
    if (!iso) throw new CleanCashError(`${rowNo}-qator (${register}): sana yo'q`);
    const date = new Date(`${iso}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new CleanCashError(`${rowNo}-qator (${register}): sana o'qilmadi — "${iso}"`);
    }

    const amountIn = num(row.amount_in, rowNo, "amount_in");
    const amountOut = num(row.amount_out, rowNo, "amount_out");
    const bankFee = num(row.bank_fee, rowNo, "bank_fee");
    if (amountIn === 0 && amountOut === 0 && bankFee === 0) {
      throw new CleanCashError(`${rowNo}-qator (${register}): bo'sh qator — na kirim, na chiqim`);
    }

    return {
      rowNo,
      register,
      date,
      dateInferred: row.date_inferred === true,
      company: text(row.company),
      companyInn: text(row.company_inn),
      amountIn,
      amountOut,
      bankFee,
      purpose: text(row.purpose),
      note: text(row.note),
    };
  });
}

export interface CleanCashTotals {
  rows: number;
  inCount: number;
  outCount: number;
  feeCount: number;
  totalIn: number;
  totalOut: number;
  totalFee: number;
  /** Kirim − chiqim − komissiya. Auditda 1 561 605,96 (faqat Alisherda). */
  balance: number;
  registers: string[];
}

export function cleanCashTotals(rows: CleanCashMovement[]): CleanCashTotals {
  const sum = (pick: (m: CleanCashMovement) => number) => rows.reduce((s, m) => s + pick(m), 0);
  const totalIn = sum((m) => m.amountIn);
  const totalOut = sum((m) => m.amountOut);
  const totalFee = sum((m) => m.bankFee);
  return {
    rows: rows.length,
    inCount: rows.filter((m) => m.amountIn > 0).length,
    outCount: rows.filter((m) => m.amountOut > 0).length,
    feeCount: rows.filter((m) => m.bankFee > 0).length,
    totalIn,
    totalOut,
    totalFee,
    balance: totalIn - totalOut - totalFee,
    registers: [...new Set(rows.map((m) => m.register))],
  };
}

/** Har bir kassaning o'z balansi — auditda 31 tadan 30 tasi nolda yopilgan. */
export function balanceByRegister(rows: CleanCashMovement[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of rows) {
    out.set(m.register, (out.get(m.register) ?? 0) + m.amountIn - m.amountOut - m.bankFee);
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// REGISTR → KANAL
// ─────────────────────────────────────────────────────────
//
// Daftar varag'i qisqartma bilan atalgan ("Guzaloy"), kanal esa to'liq F.I.O
// bilan ("RADJABOVA GO‘ZAL"). Uchtasida imlo mos kelmaydi — ular ATAYIN
// qo'lda yozilgan (`lib/transitImport.ts` dagi bilan bir xil ro'yxat):
// mavhum moslashtirish pulni BOSHQA odamning kartasiga yozib qo'yardi.

export const REGISTER_ALIASES: Record<string, string> = {
  guzaloy: "RADJABOVA GO‘ZAL",
  ruslan: "ATAXONOV RUSLONBEK G‘AYRAT O‘G‘LI",
  bekzod: "SHAVKATOV BEGZOD",
};

const norm = (s: string) => s.toLowerCase().replace(/[‘’'`]/g, "").replace(/\s+/g, " ").trim();

/**
 * Registr nomiga mos kanallar. Bittadan ko'p qaytsa — chaqiruvchi TANLAMAYDI,
 * qo'lda hal qilinadi (bir odamga ikki kanal ochilib qolgan bo'lishi mumkin).
 */
export function resolveRegister<T extends { label: string }>(register: string, channels: T[]): T[] {
  const key = norm(register);

  const alias = REGISTER_ALIASES[key];
  if (alias) {
    const hit = channels.filter((c) => norm(c.label) === norm(alias));
    if (hit.length) return hit;
  }

  const exact = channels.filter((c) => norm(c.label) === key);
  if (exact.length) return exact;

  // Varaq nomi — to'liq ismning biron bo'lagi bilan boshlanadi.
  const byPart = channels.filter((c) =>
    norm(c.label).split(" ").some((p) => p.startsWith(key) || key.startsWith(p))
  );
  if (byPart.length === 1) return byPart;

  // "Azizbek I" / "Azizbek X" — oxirgi harf FAMILIYA bosh harfi.
  const parts = key.split(" ");
  if (parts.length === 2 && parts[1].length === 1) {
    const [given, initial] = parts;
    const byInitial = channels.filter((c) => {
      const t = norm(c.label).split(" ");
      return (t[0] ?? "").startsWith(initial) && t.slice(1).some((x) => x.startsWith(given));
    });
    if (byInitial.length === 1) return byInitial;
  }

  return byPart;
}
