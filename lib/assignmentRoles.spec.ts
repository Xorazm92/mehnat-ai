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
  const ALL_ROLES = [
    "super_admin",
    "admin",
    "chief_accountant",
    "supervisor",
    "accountant",
    "bank_manager",
  ];

  it("mos roldagi xodimni o'tkazadi", () => {
    expect(staffFitsAssignmentRole("chief_accountant", "chief_accountant")).toBe(true);
    expect(staffFitsAssignmentRole("bank_manager", "bank_manager")).toBe(true);
    expect(staffFitsAssignmentRole("supervisor", "controller")).toBe(true);
    expect(staffFitsAssignmentRole("accountant", "accountant")).toBe(true);
  });

  // LAVOZIM ≠ FIRMADAGI ISH. Bazadagi haqiqiy holat: nazoratchi Go'zaloy 10 ta
  // firmada buxgalter, bank-klient Ruslan ham 10 tasida buxgalter, buxgalter
  // Zamira esa 16 ta firmada nazoratchi. Ilgari bu qulf yangi firma ochishda
  // ro'yxatni bo'shatib qo'yar va o'sha firmalarni saqlashga yo'l bermasdi.
  it("BUXGALTER o'rniga har qanday lavozimdagi xodim tushadi", () => {
    for (const role of ALL_ROLES) {
      expect(staffFitsAssignmentRole(role, "accountant")).toBe(true);
    }
  });

  it("qolgan uchta o'rin ham lavozim bo'yicha qulflanmaydi", () => {
    expect(staffFitsAssignmentRole("bank_manager", "chief_accountant")).toBe(true);
    expect(staffFitsAssignmentRole("accountant", "controller")).toBe(true);
    expect(staffFitsAssignmentRole("supervisor", "bank_manager")).toBe(true);
  });

  it("eski imlodagi rol nomi bilan ham ishlaydi", () => {
    expect(staffFitsAssignmentRole("chief_accountant", "chief")).toBe(true);
    expect(staffFitsAssignmentRole("supervisor", "supervisor")).toBe(true);
    expect(staffFitsAssignmentRole("accountant", "bank_client")).toBe(true);
  });

  it("admin va superadmin har qanday bo'sh o'rinni to'ldira oladi", () => {
    expect(staffFitsAssignmentRole("admin", "chief_accountant")).toBe(true);
    expect(staffFitsAssignmentRole("super_admin", "bank_manager")).toBe(true);
  });

  it("noma'lum biriktirish roli baribir rad etiladi", () => {
    expect(staffFitsAssignmentRole("accountant", "direktor")).toBe(false);
    expect(staffFitsAssignmentRole("admin", "")).toBe(false);
  });

  it("har bir biriktirish roli o'zining odatdagi lavozimini o'tkazadi", () => {
    for (const role of ASSIGNMENT_ROLES) {
      const userRole = ASSIGNMENT_ROLE_TO_USER_ROLE[role];
      // `sales_manager` da "odatdagi lavozim" ATAYLAB yo'q — uni istalgan
      // lavozimdagi xodim egallaydi (lib/permissions.ts izohi).
      if (!userRole) continue;
      expect(staffFitsAssignmentRole(userRole, role)).toBe(true);
    }
  });
});

describe("resolveTariffPreset", () => {
  it("kelishilgan standart taqsimot: 20 / 7 / 5 / 5, savdo nol", () => {
    // Savdo o'rni keyin qo'shildi va standart taqsimotga KIRMAYDI — jami
    // 37% o'zgarishsiz qoladi (lib/tariffPresets.ts izohi).
    expect(STANDARD_TARIFF).toEqual({
      accountant: 20,
      chief_accountant: 7,
      controller: 5,
      bank_manager: 5,
      sales_manager: 0,
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
      sales_manager: 0,
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
