/**
 * Oy kaliti normalizatsiyasi (DB'siz).
 *
 * Nima uchun bu muhim: `MonthlyPerformance.month` "2026-07-01" ko'rinishida,
 * `KpiEvent.periodMonth` esa "2026-07". @@unique([month, companyId, employeeId,
 * ruleId]) ularni TURLI oy deb bilgani uchun bitta qoida bo'yicha ikkita qator
 * yashab qolishi va jarima ikki marta maoshdan yechilishi mumkin edi (ADR-0004).
 */
import { describe, it, expect } from "vitest";
import { toYearMonthKey, toPerformanceMonth, periodsEqual } from "@/lib/periods";

describe("toYearMonthKey", () => {
  it("accepts both the bare and the day-suffixed ISO form", () => {
    expect(toYearMonthKey("2026-07")).toBe("2026-07");
    expect(toYearMonthKey("2026-07-01")).toBe("2026-07");
    expect(toYearMonthKey("2026-07-31")).toBe("2026-07");
  });

  it("still parses the Uzbek display form", () => {
    expect(toYearMonthKey("2026 Iyul")).toBe("2026-07");
    expect(toYearMonthKey("2026 Dekabr")).toBe("2026-12");
  });

  it("rejects junk", () => {
    expect(toYearMonthKey("")).toBe("");
    expect(toYearMonthKey("2026 Yillik")).toBe("");
    expect(toYearMonthKey("nonsense")).toBe("");
  });
});

describe("toPerformanceMonth", () => {
  it("collapses every accepted form onto one canonical key", () => {
    const canonical = "2026-07-01";
    for (const input of ["2026-07", "2026-07-01", "2026-07-15", "2026 Iyul"]) {
      expect(toPerformanceMonth(input), input).toBe(canonical);
    }
  });

  it("keeps January distinct — the trap an endsWith('-01') filter falls into", () => {
    // "2026-01" already ends with "-01" while still being the bare form.
    expect(toPerformanceMonth("2026-01")).toBe("2026-01-01");
    expect(toPerformanceMonth("2026-01-01")).toBe("2026-01-01");
  });

  it("returns empty for junk so callers can fail loudly", () => {
    expect(toPerformanceMonth("")).toBe("");
    expect(toPerformanceMonth("2026 Yillik")).toBe("");
  });
});

describe("periodsEqual", () => {
  it("treats the two stored month formats as the same month", () => {
    // This is the assertion that was false before the fix.
    expect(periodsEqual("2026-07", "2026-07-01")).toBe(true);
    expect(periodsEqual("2026-07-01", "2026 Iyul")).toBe(true);
  });

  it("still separates different months", () => {
    expect(periodsEqual("2026-07-01", "2026-08-01")).toBe(false);
    expect(periodsEqual("2026-01", "2026-10")).toBe(false);
  });
});
