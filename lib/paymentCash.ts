// lib/paymentCash.ts
// NAQD ULUSH — sof, bazasiz qoida.
//
// NEGA ALOHIDA FAYL. Bu qoida `lib/balance.ts` ichida edi, u esa prisma'ni
// import qiladi — ya'ni uni `lib/**/*.spec.ts` (loyihaning "sof, bazasiz
// yordamchilar" konvensiyasi) bilan sinab bo'lmasdi. Qoida esa aynan
// sinovga muhtoj: u pul raqamlarini belgilaydi va uni noto'g'ri qo'llash
// butun ekrandagi summalarni siljitadi.

/** Bitta to'lov qatorining minimal shakli — faqat shu qoida uchun kerak. */
export interface PaymentCashRow {
  amount: unknown;
  allocations: { source: string | null; amount: unknown }[];
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * TO'LOV QATORLARIDAN NAQD ULUSH.
 *
 * `Payment.amount` — mijoz nuqtai nazaridan yopilgan QARZ. Unga "offset"
 * (vzaimozachyot, ijara bilan hisob-kitob) ham kiradi — lekin kassaga
 * bunday to'lovdan PUL TUSHMAYDI.
 *
 * Bu qoida ilgari FAQAT `getAvailableBalance` da bor edi.
 * `getMonthBreakdown` va boshqaruv panelidagi pul oqimi grafigi esa oddiy
 * `_sum(amount)` qilardi, ya'ni offsetni ham naqd deb sanardi. Natijada
 * bitta ekranda ikkita "kirim" ta'rifi yonma-yon turardi va raqamlar
 * yarashmasdi — auditda bu to'rtta ekranda to'rt xil raqam bo'lib ko'rindi.
 *
 * Allocation'i yo'q qator to'liq naqd deb hisoblanadi: offset FAQAT
 * `applyAllocation` orqali (`source='offset'`) kiradi, ya'ni allocation
 * bo'lmagan qator ta'rifiga ko'ra offset bo'la olmaydi.
 */
export function cashFromPaymentRows(rows: PaymentCashRow[]): number {
  return rows.reduce((sum, p) => {
    if (p.allocations.length === 0) return sum + n(p.amount);
    const cash = p.allocations
      .filter((a) => a.source !== "offset")
      .reduce((s, a) => s + n(a.amount), 0);
    return sum + cash;
  }, 0);
}
