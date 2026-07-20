/**
 * PayrollAdjustment.amount tarixan aralash ishorada saqlangan (qo'lda kiritish
 * manfiy, oylik tasdig'i musbat). Pul o'quvchilari miqdor sifatida o'qishi
 * shart — bu test o'sha shartnomani qulflaydi (lib/adjustments.ts).
 */
import { describe, it, expect } from "vitest";
import { adjustmentMagnitude } from "@/lib/adjustments";

describe("adjustmentMagnitude", () => {
  it("returns the magnitude for both sign conventions", () => {
    expect(adjustmentMagnitude(2_500_000)).toBe(2_500_000); // approveEmployeeSalary (musbat)
    expect(adjustmentMagnitude(-2_500_000)).toBe(2_500_000); // PayrollTable qo'lda (manfiy)
  });

  it("treats Decimal-as-string and garbage as safe values", () => {
    expect(adjustmentMagnitude("-1500000.50")).toBe(1_500_000.5);
    expect(adjustmentMagnitude(null)).toBe(0);
    expect(adjustmentMagnitude(undefined)).toBe(0);
    expect(adjustmentMagnitude("abc")).toBe(0);
    expect(adjustmentMagnitude(NaN)).toBe(0);
  });

  it("keeps balance outflow additive regardless of stored sign", () => {
    // Bitta tasdiqlangan oylik (+3 mln) va bitta avans (−1 mln) = 4 mln chiqim.
    const rows = [{ amount: 3_000_000 }, { amount: -1_000_000 }];
    const outflow = rows.reduce((s, r) => s + adjustmentMagnitude(r.amount), 0);
    expect(outflow).toBe(4_000_000);
  });
});
