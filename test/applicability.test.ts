// Engine qatlami — DOMEN-NEYTRAL. Bu yerda soliq rejimi ham, statistika turi
// ham yo'q: engine faqat `attributes` lug'atini taqqoslaydi. Buxgalteriya
// ustunlari qanday atributga aylanishi domen testida:
// lib/domains/accounting/subjects.spec.ts
import { describe, it, expect } from "vitest";
import {
  isSubjectEligible,
  templateApplies,
  isDisabledByOverride,
  type SubjectFacts,
} from "@/lib/engines/obligation/applicability";

const base: SubjectFacts = {
  id: "s1",
  isActive: true,
  status: "active",
  startedAt: new Date(Date.UTC(2026, 0, 1)),
  attributes: {
    regime: "alpha",
    tier: "t1",
    services: ["core", "extra"],
  },
};
const ref = new Date(Date.UTC(2026, 6, 1));

describe("isSubjectEligible", () => {
  it("faol + active status + xizmat boshlangan → yaroqli", () => {
    expect(isSubjectEligible(base, ref)).toBe(true);
  });
  it("isActive=false → yaroqsiz", () => {
    expect(isSubjectEligible({ ...base, isActive: false }, ref)).toBe(false);
  });
  it("status != active → yaroqsiz", () => {
    expect(isSubjectEligible({ ...base, status: "suspended" }, ref)).toBe(false);
  });
  it("status=null → active deb qaraladi", () => {
    expect(isSubjectEligible({ ...base, status: null }, ref)).toBe(true);
  });
  it("startedAt yo'q → yaroqsiz", () => {
    expect(isSubjectEligible({ ...base, startedAt: null }, ref)).toBe(false);
  });
  it("xizmat kelajakda boshlanadi → yaroqsiz", () => {
    expect(isSubjectEligible({ ...base, startedAt: new Date(Date.UTC(2026, 8, 1)) }, ref)).toBe(false);
  });
});

describe("templateApplies", () => {
  it("bo'sh applicability → universal (true)", () => {
    expect(templateApplies([], base)).toBe(true);
  });
  it("skalyar atribut aniq mos kelishi kerak", () => {
    expect(templateApplies([{ criteriaType: "regime", criteriaValue: "alpha" }], base)).toBe(true);
    expect(templateApplies([{ criteriaType: "regime", criteriaValue: "beta" }], base)).toBe(false);
  });
  it("type ichida OR", () => {
    const crit = [
      { criteriaType: "tier", criteriaValue: "t0" },
      { criteriaType: "tier", criteriaValue: "t1" },
    ];
    expect(templateApplies(crit, base)).toBe(true);
  });
  it("typelar aro AND", () => {
    const crit = [
      { criteriaType: "regime", criteriaValue: "alpha" },
      { criteriaType: "services", criteriaValue: "premium" },
    ];
    expect(templateApplies(crit, base)).toBe(false); // premium ro'yxatda yo'q
    expect(
      templateApplies(crit, { ...base, attributes: { ...base.attributes, services: ["core", "premium"] } }),
    ).toBe(true);
  });
  it("ro'yxat atributi includes bo'yicha", () => {
    expect(templateApplies([{ criteriaType: "services", criteriaValue: "core" }], base)).toBe(true);
    expect(templateApplies([{ criteriaType: "services", criteriaValue: "yo'q" }], base)).toBe(false);
  });
  it("noma'lum kriteriya → mos emas (oq ro'yxat semantikasi)", () => {
    expect(templateApplies([{ criteriaType: "unknown_x", criteriaValue: "y" }], base)).toBe(false);
  });
  it("e'lon qilinmagan atribut → mos emas, bo'sh qiymatga ham", () => {
    expect(templateApplies([{ criteriaType: "missing", criteriaValue: "" }], base)).toBe(false);
  });
});

describe("isDisabledByOverride", () => {
  it("action=disable → true", () => {
    expect(isDisabledByOverride({ action: "disable", customDueDay: null, customOffsetDays: null, responsibleUserId: null })).toBe(true);
  });
  it("reassign/custom_due/undefined → false", () => {
    expect(isDisabledByOverride({ action: "reassign", customDueDay: null, customOffsetDays: null, responsibleUserId: "u2" })).toBe(false);
    expect(isDisabledByOverride(undefined)).toBe(false);
    expect(isDisabledByOverride(null)).toBe(false);
  });
});
