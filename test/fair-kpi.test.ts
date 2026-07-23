import { describe, it, expect } from "vitest";
import { complexityWeight, slaScore, qualityScore, volumeScore, disciplineScore, computeComposite } from "@/lib/fairKpi";

describe("complexityWeight", () => {
  it("weights by tier", () => {
    expect(complexityWeight("simple")).toBe(1);
    expect(complexityWeight("standard")).toBe(1.5);
    expect(complexityWeight("complex")).toBe(2.5);
    expect(complexityWeight("enterprise")).toBe(4);
    expect(complexityWeight(null)).toBe(1.5);
  });
});

describe("component scores", () => {
  it("slaScore — on-time ratio, neutral when none eligible", () => {
    expect(slaScore(3, 4)).toBe(75);
    expect(slaScore(0, 0)).toBe(100);
  });
  it("qualityScore — 1 − defect ratio", () => {
    expect(qualityScore(1, 5)).toBe(80);
    expect(qualityScore(0, 0)).toBe(100);
  });
  it("volumeScore — vs target, capped at 100", () => {
    expect(volumeScore(10, 20)).toBe(50);
    expect(volumeScore(30, 20)).toBe(100);
  });
  it("disciplineScore — present + half late", () => {
    expect(disciplineScore({ present: 8, late: 2, absent: 0 })).toBe(90);
    expect(disciplineScore({ present: 0, late: 0, absent: 0 })).toBe(100);
    expect(disciplineScore({ present: 5, late: 0, absent: 5 })).toBe(50);
  });
});

describe("computeComposite", () => {
  it("all 100 → 100", () => {
    expect(computeComposite({ sla: 100, quality: 100, client: 100, volume: 100, discipline: 100 })).toBe(100);
  });
  it("weighted sum (35/25/15/15/10)", () => {
    // 80*.35 + 60*.25 + 100*.15 + 50*.15 + 90*.10 = 28+15+15+7.5+9 = 74.5
    expect(computeComposite({ sla: 80, quality: 60, client: 100, volume: 50, discipline: 90 })).toBe(74.5);
  });
});
