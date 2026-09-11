// CHIQIM KASSA — ekran bo'ylab baham ko'riladigan tiplar.
//
// NEGA ALOHIDA FAYL. `Channel` uchta modulda kerak (`ChiqimKassaClient`,
// `ExpenseManualForm`, `ExpenseCardsSection`). Ularning birida qayta
// yozilsa, serverdagi shakl o'zgarganda faqat bittasi yangilanardi.

export interface Channel {
  id: string;
  type: string;
  label: string;
  cardMask: string | null;
  employeeId: string | null;
  employeeName: string | null;
  isActive: boolean;
  totalIn: number;
  totalOut: number;
  balance: number;
  entryCount: number;
  lastMovementAt: string | null;
}

/** Kanal jurnalining bitta qatori. */
export interface LedgerRow {
  id: string;
  direction: string;
  amount: string | number;
  date: string;
  category: string | null;
  description: string | null;
}

/** Kartaga hali bog'lanmagan bank o'tkazmasi. */
export interface UnlinkedTransfer {
  id: string;
  valueDate: string;
  amount: string | number;
  accountLabel: string;
  cardMask: string | null;
  holderName: string | null;
}
