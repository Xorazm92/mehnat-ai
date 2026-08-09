// Sof (DB'siz) test: shartnoma qarzining YAGONA formulasi.
//
// Auditda bu formula uch joyda mustaqil yozilgani aniqlandi. Endi bitta
// joyda — va shu test uni qulflaydi.
import { describe, it, expect } from "vitest";
import { companyDebtOf, isSettledPayment, periodKeyOf } from "@/lib/debt";

describe("isSettledPayment", () => {
  it("faqat haqiqatan tushgan pul qarzni kamaytiradi", () => {
    expect(isSettledPayment("paid")).toBe(true);
    expect(isSettledPayment("partial")).toBe(true);
    // "pending" — bu REJA qatori, pul emas. Uni sanash qarzni yashirardi.
    expect(isSettledPayment("pending")).toBe(false);
    expect(isSettledPayment("overdue")).toBe(false);
    expect(isSettledPayment(null)).toBe(false);
  });
});

describe("companyDebtOf", () => {
  it("to'lovsiz firmada qarz = shartnoma summasi", () => {
    expect(companyDebtOf({ contractAmount: 5_000_000, payments: [] })).toBe(5_000_000);
  });

  it("qisman to'lov qarzni kamaytiradi", () => {
    expect(
      companyDebtOf({ contractAmount: 5_000_000, payments: [{ amount: 2_000_000, status: "partial" }] })
    ).toBe(3_000_000);
  });

  it("bir necha to'lov qo'shiladi (bank + plastik)", () => {
    // Real holat: iyulda 4 firma ham bankdan, ham plastikdan to'lagan.
    expect(
      companyDebtOf({
        contractAmount: 12_000_000,
        payments: [
          { amount: 5_000_000, status: "paid" },
          { amount: 5_000_000, status: "partial" },
        ],
      })
    ).toBe(2_000_000);
  });

  it("'pending' qator qarzni YASHIRMAYDI", () => {
    expect(
      companyDebtOf({ contractAmount: 5_000_000, payments: [{ amount: 5_000_000, status: "pending" }] })
    ).toBe(5_000_000);
  });

  it("ortiqcha to'lov manfiy qarz bermaydi", () => {
    expect(
      companyDebtOf({ contractAmount: 1_000_000, payments: [{ amount: 2_000_000, status: "paid" }] })
    ).toBe(0);
  });

  it("shartnoma summasi yo'q firmada qarz 0", () => {
    expect(companyDebtOf({ contractAmount: null, payments: [] })).toBe(0);
    expect(companyDebtOf({ contractAmount: 0, payments: [] })).toBe(0);
  });
});

describe("periodKeyOf", () => {
  it("oyni ikki raqamga to'ldiradi", () => {
    expect(periodKeyOf(new Date(2026, 0, 15))).toBe("2026-01");
    expect(periodKeyOf(new Date(2026, 11, 1))).toBe("2026-12");
  });
});
