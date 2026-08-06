import { describe, it, expect } from "vitest";
import { toPerformanceMonth, toYearMonthKey } from "../lib/periods";
import { TEMPLATE_CODE_TO_RULE_NAME } from "../lib/kpiEvidence";

describe("KPI Period Normalization", () => {
  it("normalizes ISO month format to canonical YYYY-MM-01 format", () => {
    expect(toPerformanceMonth("2026-07")).toBe("2026-07-01");
    expect(toPerformanceMonth("2026-07-15")).toBe("2026-07-01");
    expect(toPerformanceMonth("2026-07-01")).toBe("2026-07-01");
  });

  it("normalizes month Uzbek text to canonical YYYY-MM-01 format", () => {
    expect(toPerformanceMonth("2026 Iyul")).toBe("2026-07-01");
    expect(toYearMonthKey("2026 Iyul")).toBe("2026-07");
  });
});

// Matritsa ustuni → template moslamasi endi bu yerda EMAS. U konstanta ustidan
// tekshirilardi va shu sabab buzuq yozuvlarni joyida ushlab turardi; hozir u
// `test/matrix-template-coverage.test.ts` da, bazaga qarshi.
describe("KPI rule mapping", () => {
  it("maps template codes back to KPI rules", () => {
    expect(TEMPLATE_CODE_TO_RULE_NAME["CASHFLOW"]).toBe("acc_cashflow");
    expect(TEMPLATE_CODE_TO_RULE_NAME["AR_AP"]).toBe("acc_debitor");
    expect(TEMPLATE_CODE_TO_RULE_NAME["MATERIALS"]).toBe("acc_materials");
    expect(TEMPLATE_CODE_TO_RULE_NAME["ONEC_BASE"]).toBe("acc_1c_base");
    expect(TEMPLATE_CODE_TO_RULE_NAME["LETTERS"]).toBe("acc_letters");
  });
});
