// Kassa apparati ↔ bank sverkasi — umumiy tiplar.
//
// Bu qatlam ATAYIN Prisma'ga bog'liq emas: ajratish va yig'ish sof funksiya
// bo'lsa, uni real vipiska matnlari bilan testda tekshirish mumkin.

/** Xom jadval qatori (xlsx `sheet_to_json` natijasi). */
export type SheetRow = Record<string, unknown>;

/** Ekvayring kanali. `other` — tanilmagan, doiraga o'zi kirmaydi. */
export type PosChannel =
  | "uzcard"
  | "humo"
  | "humo_epos"
  | "multicard"
  | "payme"
  | "click"
  | "paynet"
  | "other";

/** Vipiska qatoridan ajratilgan sverka ma'lumoti. */
export interface SettlementInfo {
  channel: PosChannel;
  /** Barqaror terminal kodi ("UZCARD 775002", "HUMO 0111955M"). */
  terminalCode: string;
  /**
   * Savdo sanasi. `null` — tafsilotda sana yo'q; chaqiruvchi hujjat sanasini
   * qo'yadi va `dateSource: "document"` deb belgilaydi.
   */
  opDate: Date | null;
  /** Komissiya ushlanishidan oldingi yalpi summa (matnda bo'lsa). */
  grossAmount: number | null;
  /** Ushlab qolingan komissiya (matnda bo'lsa). */
  commissionAmount: number | null;
  /** Bekor qilingan (Отмена / сторно / reversal) operatsiya. */
  isReversal: boolean;
}

/** Kunlik fiskal hisobotning bitta qatori. */
export interface FiscalDailyRow {
  /** Fiskal modul raqami; faylda bo'lmasa chaqiruvchi beradi. */
  fmNumber: string | null;
  inn: string | null;
  date: Date;
  cashAmount: number;
  cardAmount: number;
  totalAmount: number;
  returnedAmount: number;
  receiptCount: number;
}

export interface ParsedFiscalReport {
  rows: FiscalDailyRow[];
  periodFrom: Date | null;
  periodTo: Date | null;
  /** Parser shubhali deb topgan holatlar — import to'xtamaydi, ekranda ko'rinadi. */
  warnings: string[];
}

/** Parser tanimagan fayl — jim yutilmaydi. */
export class FiscalReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FiscalReportParseError";
  }
}
