// Bank vipiskasi — umumiy tiplar.
//
// Bu qatlam ATAYIN Prisma'ga bog'liq emas: parser sof funksiya bo'lsa,
// uni real fayllar bilan testda tekshirish mumkin va xuddi shu kod ham
// veb-yuklashda, ham bir martalik backfill skriptida ishlaydi.

/** Vipiska formati. Har bank o'z ko'rinishini beradi. */
export type StatementFormat = "litsevoy" | "svedeniya";

/** Xom jadval: sahifa nomi → qatorlar (xlsx `sheet_to_json` natijasi). */
export type SheetRow = Record<string, unknown>;
export type Workbook = Record<string, SheetRow[]>;

export interface ParsedTransaction {
  /** Operatsiya sanasi (kun aniqligida, Asia/Tashkent). */
  valueDate: Date;
  docNumber: string | null;
  opCode: string | null;
  /** 'income' — kredit (pul tushdi), 'expense' — debet (pul chiqdi). */
  direction: "income" | "expense";
  /** Musbat summa (yo'nalish `direction` da). */
  amount: number;
  counterpartyInn: string | null;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  purpose: string | null;
}

export interface ParsedStatement {
  format: StatementFormat;
  /** Hisob raqami — vipiska qaysi hisobga tegishli. */
  accountNumber: string | null;
  /** Hisob egasining STIR'i. */
  accountInn: string | null;
  /** Hisob egasining nomi (faylda qanday yozilgan bo'lsa). */
  holderName: string | null;
  periodFrom: Date | null;
  periodTo: Date | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: ParsedTransaction[];
}

/**
 * Yuklashdan OLDIN ko'rsatiladigan xulosa.
 *
 * ATAYIN shu yerda, `server/bankImport.ts` da emas: "use server" fayllardan
 * faqat async funksiya eksport qilinishi mumkin.
 */
export interface StatementPreview {
  format: string;
  accountNumber: string | null;
  accountLabel: string | null;
  accountId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  incomeCount: number;
  incomeSum: number;
  expenseCount: number;
  expenseSum: number;
  /** Bazada allaqachon bor (dublikat) tranzaksiyalar soni. */
  duplicateCount: number;
  /** Hisob bazada topilmadi — yuklab bo'lmaydi. */
  unknownAccount: boolean;
  sample: {
    valueDate: string;
    docNumber: string | null;
    direction: string;
    amount: number;
    counterpartyName: string | null;
    counterpartyInn: string | null;
    contractHint: string | null;
  }[];
}

/** Parser tanimagan fayl — jim yutilmaydi, aniq xato beriladi. */
export class BankStatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankStatementParseError";
  }
}
