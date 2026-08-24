import { describe, it, expect } from "vitest";
import {
  isCompanyEligible,
  templateApplies,
  type CompanyFacts,
} from "@/lib/applicability";

const base: CompanyFacts = {
  id: "c1",
  isActive: true,
  companyStatus: "active",
  contractDate: new Date(Date.UTC(2026, 0, 1)),
  taxRegime: "vat",
  statsType: "kb1",
  activeServices: ["buxgalteriya", "payroll"],
  hasLandTax: false,
  hasWaterTax: false,
  hasPropertyTax: false,
  hasExciseTax: false,
};
const ref = new Date(Date.UTC(2026, 6, 1));

describe("isCompanyEligible", () => {
  it("faol + active status + shartnoma boshlangan → yaroqli", () => {
    expect(isCompanyEligible(base, ref)).toBe(true);
  });
  it("isActive=false → yaroqsiz", () => {
    expect(isCompanyEligible({ ...base, isActive: false }, ref)).toBe(false);
  });
  it("companyStatus != active → yaroqsiz", () => {
    expect(isCompanyEligible({ ...base, companyStatus: "suspended" }, ref)).toBe(false);
  });
  it("contractDate yo'q → yaroqsiz", () => {
    expect(isCompanyEligible({ ...base, contractDate: null }, ref)).toBe(false);
  });
  it("shartnoma kelajakda → yaroqsiz (xizmat boshlanmagan)", () => {
    expect(isCompanyEligible({ ...base, contractDate: new Date(Date.UTC(2026, 8, 1)) }, ref)).toBe(false);
  });
});

describe("templateApplies", () => {
  it("bo'sh applicability → universal (true)", () => {
    expect(templateApplies([], base)).toBe(true);
  });
  it("tax_regime mos", () => {
    expect(templateApplies([{ criteriaType: "tax_regime", criteriaValue: "vat" }], base)).toBe(true);
    expect(templateApplies([{ criteriaType: "tax_regime", criteriaValue: "turnover" }], base)).toBe(false);
  });
  it("type ichida OR (stats_type ro'yxati)", () => {
    const crit = [
      { criteriaType: "stats_type", criteriaValue: "micro" },
      { criteriaType: "stats_type", criteriaValue: "kb1" },
    ];
    expect(templateApplies(crit, base)).toBe(true);
  });
  it("typelar aro AND (tax_regime VA service_key)", () => {
    const crit = [
      { criteriaType: "tax_regime", criteriaValue: "vat" },
      { criteriaType: "service_key", criteriaValue: "didox" },
    ];
    expect(templateApplies(crit, base)).toBe(false); // didox activeServices'da yo'q
    expect(templateApplies(crit, { ...base, activeServices: [...base.activeServices, "didox"] })).toBe(true);
  });
  it("vat_payer=true faqat vat rejimiga", () => {
    expect(templateApplies([{ criteriaType: "vat_payer", criteriaValue: "true" }], base)).toBe(true);
    expect(
      templateApplies([{ criteriaType: "vat_payer", criteriaValue: "true" }], { ...base, taxRegime: "turnover" }),
    ).toBe(false);
  });
  it("noma'lum kriteriya → mos emas", () => {
    expect(templateApplies([{ criteriaType: "unknown_x", criteriaValue: "y" }], base)).toBe(false);
  });
});
