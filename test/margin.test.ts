import { describe, it, expect } from "vitest";
import { computeMargin } from "@/lib/margin";

describe("computeMargin", () => {
  it("revenue − labor = margin, pct", () => {
    const r = computeMargin({ revenue: 1000, laborCost: 400 });
    expect(r.margin).toBe(600);
    expect(r.marginPct).toBe(60);
  });
  it("includes extra cost + penalties", () => {
    const r = computeMargin({ revenue: 1000, laborCost: 400, extraCost: 100, penalties: 50 });
    expect(r.margin).toBe(450);
    expect(r.marginPct).toBe(45);
  });
  it("negative margin (loss-making client)", () => {
    const r = computeMargin({ revenue: 300, laborCost: 500 });
    expect(r.margin).toBe(-200);
  });
  it("zero revenue → marginPct null", () => {
    const r = computeMargin({ revenue: 0, laborCost: 100 });
    expect(r.margin).toBe(-100);
    expect(r.marginPct).toBeNull();
  });
});
