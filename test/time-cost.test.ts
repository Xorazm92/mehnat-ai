import { describe, it, expect } from "vitest";
import { resolveRate, computeCost, type RatePeriod } from "@/lib/timeCost";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("resolveRate", () => {
  const rates: RatePeriod[] = [
    { hourlyRate: 100, effectiveFrom: d("2026-01-01"), effectiveTo: d("2026-06-30") },
    { hourlyRate: 120, effectiveFrom: d("2026-07-01"), effectiveTo: null },
  ];
  it("picks the rate in effect on the date", () => {
    expect(resolveRate(rates, d("2026-03-15"))).toBe(100);
    expect(resolveRate(rates, d("2026-08-01"))).toBe(120);
  });
  it("returns null before any rate starts", () => {
    expect(resolveRate(rates, d("2025-12-31"))).toBeNull();
  });
  it("picks the latest effectiveFrom when periods overlap", () => {
    const overlap: RatePeriod[] = [
      { hourlyRate: 100, effectiveFrom: d("2026-01-01"), effectiveTo: null },
      { hourlyRate: 150, effectiveFrom: d("2026-05-01"), effectiveTo: null },
    ];
    expect(resolveRate(overlap, d("2026-06-01"))).toBe(150);
  });
});

describe("computeCost", () => {
  it("(minutes/60) × rate", () => {
    expect(computeCost(90, 100)).toBe(150);
    expect(computeCost(60, 120)).toBe(120);
  });
  it("null rate or non-positive minutes → 0", () => {
    expect(computeCost(60, null)).toBe(0);
    expect(computeCost(0, 100)).toBe(0);
    expect(computeCost(-30, 100)).toBe(0);
  });
});
