import { describe, it, expect } from "vitest";
import {
  ALLOWED_VIEWS,
  effectiveViewsForRole,
  canSeeViewWith,
  VIEWS_BY_RELATION,
  type AppView,
  type CompanyRelation,
} from "./platform/permissions";

/**
 * BIRIKTIRUV BERADIGAN EKRANLAR.
 *
 * Bazadagi haqiqiy holat: Ruslanning lavozimi `bank_manager` (65 firmada
 * bank-klient), lekin u 10 ta firmaning BUXGALTERI ham — o'sha firmalarda 140
 * ta majburiyat turibdi. Lavozimga qarab beriladigan eski darvoza unga na
 * "Hisobotlar" (matritsa), na "Ishlar" ekranini bermasdi: ya'ni tizim uning
 * ishini ko'rsatardi-yu, qilishga joy bermasdi.
 *
 * Teskarisi ham bor edi: Zamira va Humora — lavozimi `accountant`, lekin
 * 2 tadan firmada bank-klient slotida turishadi va bank kabinetiga kira
 * olmasdilar.
 */

const NEVER_BY_RELATION: AppView[] = [
  "staff",
  "payroll",
  "expenses",
  "kassa",
  "kassa_expense",
  "organizations",
  "audit_logs",
  "admin",
  "settings",
];

describe("effectiveViewsForRole — biriktiruv qo'shiladi", () => {
  it("Ruslan: bank-klient lavozimi + buxgalter biriktiruvi → ish ekranlari ochiladi", () => {
    const before = effectiveViewsForRole("bank_manager", null);
    expect(before).not.toContain("reports");
    expect(before).not.toContain("deadlines");

    const after = effectiveViewsForRole("bank_manager", null, ["accountant"]);
    expect(after).toContain("reports");
    expect(after).toContain("deadlines");
    expect(after).toContain("tasks");
    // Lavozim bergani yo'qolmaydi
    expect(after).toContain("cabinet_bank");
    expect(after).toContain("kassa_income");
  });

  it("Zamira/Humora: buxgalter lavozimi + bank biriktiruvi → bank ekranlari ochiladi", () => {
    const before = effectiveViewsForRole("accountant", null);
    expect(before).not.toContain("cabinet_bank");
    expect(before).not.toContain("kassa_income");

    const after = effectiveViewsForRole("accountant", null, ["bank_manager"]);
    expect(after).toContain("cabinet_bank");
    expect(after).toContain("kassa_income");
    expect(after).toContain("reports"); // lavozim bergani joyida
  });

  it("biriktiruv HECH QACHON boshqaruv ekranlarini ochmaydi", () => {
    const rels: CompanyRelation[] = ["accountant", "supervisor", "chief_accountant", "bank_manager"];
    const granted = new Set(rels.flatMap((r) => VIEWS_BY_RELATION[r]));
    for (const v of NEVER_BY_RELATION) {
      expect(granted, `${v} biriktiruv orqali berilmasligi kerak`).not.toContain(v);
    }

    // Buxgalter to'rtala biriktiruvni olsa ham yangi boshqaruv ekrani chiqmaydi.
    const after = effectiveViewsForRole("accountant", null, rels);
    for (const v of NEVER_BY_RELATION) {
      if (!ALLOWED_VIEWS.accountant.includes(v)) {
        expect(after, `${v}`).not.toContain(v);
      }
    }
  });

  it("biriktiruv ekranni HECH QACHON olib qo'ymaydi (faqat birlashma)", () => {
    for (const role of ["accountant", "bank_manager", "supervisor", "chief_accountant"] as const) {
      const base = effectiveViewsForRole(role, null);
      const withRel = effectiveViewsForRole(role, null, ["accountant", "bank_manager"]);
      for (const v of base) expect(withRel, `${role}: ${v}`).toContain(v);
    }
  });

  it("biriktiruvsiz xatti-harakat o'zgarmaydi", () => {
    for (const role of ["accountant", "bank_manager", "supervisor", "chief_accountant"] as const) {
      expect(effectiveViewsForRole(role, null, [])).toEqual(ALLOWED_VIEWS[role]);
      expect(effectiveViewsForRole(role, null, null)).toEqual(ALLOWED_VIEWS[role]);
    }
  });

  it("admin override + biriktiruv birga ishlaydi", () => {
    const overrides = { accountant: ["cabinet", "notifications"] as AppView[] };
    const out = effectiveViewsForRole("accountant", overrides, ["bank_manager"]);
    expect(out).toContain("cabinet");
    expect(out).toContain("cabinet_bank"); // biriktiruvdan
    // Override torroq qilgan narsa biriktiruv bermasa qaytmaydi
    expect(out).not.toContain("expenses");
  });

  it("super_admin har doim hamma narsani ko'radi", () => {
    const a = effectiveViewsForRole("super_admin", null);
    const b = effectiveViewsForRole("super_admin", { super_admin: ["cabinet"] as AppView[] }, []);
    expect(b).toEqual(a);
  });

  it("canSeeViewWith darvozasi ham biriktiruvni hisobga oladi", () => {
    expect(canSeeViewWith("bank_manager", "reports", null)).toBe(false);
    expect(canSeeViewWith("bank_manager", "reports", null, ["accountant"])).toBe(true);
    // Ochilgan ekran ham `companyScopeWhere` bilan cheklangan, shuning uchun
    // bu ruxsat begona firmani ko'rsatmaydi — lekin "Xodimlar" baribir yopiq.
    expect(canSeeViewWith("bank_manager", "staff", null, ["accountant"])).toBe(false);
  });
});
