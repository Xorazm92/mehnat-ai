import { describe, it, expect } from "vitest";
import { toPerformanceMonth, toYearMonthKey } from "../lib/periods";
import { COL_KEY_TO_TEMPLATE_CODE } from "../lib/obligationBridge";
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

describe("Obligation Bridge Mappings", () => {
  it("maps matrix column keys to correct Obligation template codes", () => {
    expect(COL_KEY_TO_TEMPLATE_CODE["pul_oqimlari"]).toBe("CASHFLOW");
    expect(COL_KEY_TO_TEMPLATE_CODE["debitor_kreditor"]).toBe("AR_AP");
    expect(COL_KEY_TO_TEMPLATE_CODE["tovar_ostatka"]).toBe("MATERIALS");
    expect(COL_KEY_TO_TEMPLATE_CODE["one_c"]).toBe("ONEC_BASE");
    expect(COL_KEY_TO_TEMPLATE_CODE["xatlar"]).toBe("LETTERS");
    expect(COL_KEY_TO_TEMPLATE_CODE["hisoblangan_oylik"]).toBe("PAYROLL_CALC");
    expect(COL_KEY_TO_TEMPLATE_CODE["chiqadigan_soliqlar"]).toBe("TAX_SCHEDULE");
    expect(COL_KEY_TO_TEMPLATE_CODE["foyda_va_zarar"]).toBe("PNL_REPORT");
  });

  it("maps template codes back to KPI rules", () => {
    expect(TEMPLATE_CODE_TO_RULE_NAME["CASHFLOW"]).toBe("acc_cashflow");
    expect(TEMPLATE_CODE_TO_RULE_NAME["AR_AP"]).toBe("acc_debitor");
    expect(TEMPLATE_CODE_TO_RULE_NAME["MATERIALS"]).toBe("acc_materials");
    expect(TEMPLATE_CODE_TO_RULE_NAME["ONEC_BASE"]).toBe("acc_1c_base");
    expect(TEMPLATE_CODE_TO_RULE_NAME["LETTERS"]).toBe("acc_letters");
  });
});
