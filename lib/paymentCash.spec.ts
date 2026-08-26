import { describe, it, expect } from "vitest";
import { cashFromPaymentRows } from "@/lib/paymentCash";

/**
 * Bu qoida auditda topilgan nomuvofiqlikning markazida turibdi: balans
 * offsetni chiqarardi, oylik kesim va grafik esa yo'q. Test shuning uchun
 * "offset chiqariladimi" savolini aniq belgilaydi — kelajakda kimdir
 * tezlik uchun `_sum(amount)` ga qaytarmoqchi bo'lsa, shu yerda to'xtaydi.
 */
describe("cashFromPaymentRows", () => {
  it("allocation yo'q qatorni to'liq naqd deb sanaydi", () => {
    expect(cashFromPaymentRows([{ amount: 1_000_000, allocations: [] }])).toBe(1_000_000);
  });

  it("offset ulushini chiqarib tashlaydi", () => {
    const rows = [
      {
        amount: 5_000_000,
        allocations: [
          { source: "bank", amount: 3_000_000 },
          { source: "offset", amount: 2_000_000 },
        ],
      },
    ];
    expect(cashFromPaymentRows(rows)).toBe(3_000_000);
  });

  it("butunlay offset bo'lgan to'lov naqd bermaydi", () => {
    const rows = [
      { amount: 4_000_000, allocations: [{ source: "offset", amount: 4_000_000 }] },
    ];
    expect(cashFromPaymentRows(rows)).toBe(0);
  });

  it("bir nechta qatorni qo'shadi va aralash holatni to'g'ri hisoblaydi", () => {
    const rows = [
      { amount: 1_000_000, allocations: [] },
      { amount: 2_000_000, allocations: [{ source: "naqd", amount: 2_000_000 }] },
      {
        amount: 3_000_000,
        allocations: [
          { source: "offset", amount: 1_000_000 },
          { source: "plastik", amount: 2_000_000 },
        ],
      },
    ];
    expect(cashFromPaymentRows(rows)).toBe(1_000_000 + 2_000_000 + 2_000_000);
  });

  it("Decimal/satr kabi son bo'lmagan qiymatlarni xavfsiz o'qiydi", () => {
    const rows = [
      { amount: "1500000", allocations: [] },
      { amount: null, allocations: [] },
      { amount: 0, allocations: [{ source: "bank", amount: "500000" }] },
    ];
    expect(cashFromPaymentRows(rows)).toBe(2_000_000);
  });

  it("bo'sh ro'yxat nol qaytaradi", () => {
    expect(cashFromPaymentRows([])).toBe(0);
  });
});
