// Sof (DB'siz) test: firmaga biriktirish rollari va standart tarif preseti.
import { describe, it, expect } from "vitest";
import {
  ASSIGNMENT_ROLES,
  ASSIGNMENT_ROLE_TO_USER_ROLE,
  normalizeAssignmentRole,
  staffFitsAssignmentRole,
} from "@/lib/permissions";
import { STANDARD_TARIFF, resolveTariffPreset } from "@/lib/tariffPresets";

describe("normalizeAssignmentRole", () => {
  it("eski imlolarni kanonik qiymatga keltiradi", () => {
    // Aynan shu ikkilanish tufayli bitta firmada ikkita faol bosh buxgalter
    // qatori qolib ketardi (wizard 'chief', drawer 'chief_accountant').
    expect(normalizeAssignmentRole("chief")).toBe("chief_accountant");
    expect(normalizeAssignmentRole("chief_accountant")).toBe("chief_accountant");
    expect(normalizeAssignmentRole("supervisor")).toBe("controller");
    expect(normalizeAssignmentRole("controller")).toBe("controller");
    expect(normalizeAssignmentRole("bank_client")).toBe("bank_manager");
    expect(normalizeAssignmentRole("bank_manager")).toBe("bank_manager");
    expect(normalizeAssignmentRole("accountant")).toBe("accountant");
  });

  it("noma'lum rolni rad etadi", () => {
    expect(normalizeAssignmentRole("direktor")).toBeNull();
    expect(normalizeAssignmentRole("")).toBeNull();
  });

  it("har bir kanonik rol o'zini o'zgarmas qoldiradi", () => {
    for (const role of ASSIGNMENT_ROLES) {
      expect(normalizeAssignmentRole(role)).toBe(role);
    }
  });
});

describe("staffFitsAssignmentRole", () => {
  it("faqat mos roldagi xodimni o'tkazadi", () => {
    expect(staffFitsAssignmentRole("chief_accountant", "chief_accountant")).toBe(true);
    expect(staffFitsAssignmentRole("bank_manager", "bank_manager")).toBe(true);
    expect(staffFitsAssignmentRole("supervisor", "controller")).toBe(true);
    expect(staffFitsAssignmentRole("accountant", "accountant")).toBe(true);
  });

  it("bank menejerni bosh buxgalter qilib biriktirishga yo'l qo'ymaydi", () => {
    expect(staffFitsAssignmentRole("bank_manager", "chief_accountant")).toBe(false);
    expect(staffFitsAssignmentRole("accountant", "controller")).toBe(false);
    expect(staffFitsAssignmentRole("supervisor", "bank_manager")).toBe(false);
  });

  it("eski imlodagi rol nomi bilan ham ishlaydi", () => {
    expect(staffFitsAssignmentRole("chief_accountant", "chief")).toBe(true);
    expect(staffFitsAssignmentRole("supervisor", "supervisor")).toBe(true);
  });

  it("admin va superadmin har qanday bo'sh o'rinni to'ldira oladi", () => {
    expect(staffFitsAssignmentRole("admin", "chief_accountant")).toBe(true);
    expect(staffFitsAssignmentRole("super_admin", "bank_manager")).toBe(true);
  });

  it("noma'lum rolga hech kim to'g'ri kelmaydi", () => {
    expect(staffFitsAssignmentRole("accountant", "direktor")).toBe(false);
  });

  it("har bir biriktirish roli aynan bitta xodim roliga bog'langan", () => {
    for (const role of ASSIGNMENT_ROLES) {
      const userRole = ASSIGNMENT_ROLE_TO_USER_ROLE[role];
      expect(staffFitsAssignmentRole(userRole, role)).toBe(true);
    }
  });
});

describe("resolveTariffPreset", () => {
  it("kelishilgan standart taqsimot: 20 / 7 / 5 / 5", () => {
    expect(STANDARD_TARIFF).toEqual({
      accountant: 20,
      chief_accountant: 7,
      controller: 5,
      bank_manager: 5,
    });
  });

  it("sozlama yo'q bo'lsa standart qiymatga qaytadi", () => {
    expect(resolveTariffPreset(null)).toEqual(STANDARD_TARIFF);
    expect(resolveTariffPreset(undefined)).toEqual(STANDARD_TARIFF);
    expect(resolveTariffPreset("buzuq")).toEqual(STANDARD_TARIFF);
  });

  it("admin bergan qiymatni oladi", () => {
    const preset = resolveTariffPreset({
      accountant: 25,
      chief_accountant: 10,
      controller: 4,
      bank_manager: 3,
    });
    expect(preset).toEqual({
      accountant: 25,
      chief_accountant: 10,
      controller: 4,
      bank_manager: 3,
    });
  });

  it("chegaradan chiqqan qiymatni e'tiborsiz qoldiradi", () => {
    // Sozlamadagi xato firma ochishni to'xtatmasligi kerak.
    const preset = resolveTariffPreset({
      accountant: 250,
      chief_accountant: -5,
      controller: "salom",
      bank_manager: 8,
    });
    expect(preset.accountant).toBe(STANDARD_TARIFF.accountant);
    expect(preset.chief_accountant).toBe(STANDARD_TARIFF.chief_accountant);
    expect(preset.controller).toBe(STANDARD_TARIFF.controller);
    expect(preset.bank_manager).toBe(8);
  });

  it("begona kalitlarni qo'shmaydi", () => {
    const preset = resolveTariffPreset({ accountant: 30, direktor: 50 });
    expect(Object.keys(preset).sort()).toEqual([...ASSIGNMENT_ROLES].sort());
  });
});
