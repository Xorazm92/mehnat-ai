// Buxgalteriya domeni — kompaniya ustunlari qanday applicability atributiga
// aylanadi. Engine bu bilimni yo'qotdi (Konstitutsiya 4b), shuning uchun uning
// qamrovi shu yerga ko'chdi: A3 refaktoringida bitta semantika ham yo'qolmasin.
import { describe, it, expect } from "vitest";
import { templateApplies } from "@/lib/engines/obligation/applicability";
import { companyAttributes, toSubject } from "@/lib/domains/accounting/subjects";

const company = {
  id: "c1",
  isActive: true,
  companyStatus: "active",
  contractDate: new Date(Date.UTC(2026, 0, 1)),
  taxRegime: "vat",
  statsType: "kb1",
  activeServices: ["buxgalteriya", "payroll"],
  accountantId: "u-acc",
  supervisorId: "u-sup",
  chiefAccountantId: "u-chief",
};

describe("companyAttributes", () => {
  it("soliq rejimini ochadi", () => {
    expect(companyAttributes(company).tax_regime).toBe("vat");
  });

  it("vat_payer'ni rejimdan hosil qiladi", () => {
    expect(companyAttributes(company).vat_payer).toBe("true");
    expect(companyAttributes({ ...company, taxRegime: "turnover" }).vat_payer).toBe("false");
  });

  it("statsType null bo'lsa kalitni UMUMAN qo'shmaydi", () => {
    // Muhim: e'lon qilinmagan atribut engine'da "mos emas" degani. Bo'sh satr
    // qo'yilsa, criteriaValue="" bo'lgan qoida noto'g'ri mos kelib qolardi.
    expect(companyAttributes({ ...company, statsType: null })).not.toHaveProperty("stats_type");
    expect(companyAttributes(company).stats_type).toBe("kb1");
  });

  it("companyStatus null → active", () => {
    expect(companyAttributes({ ...company, companyStatus: null }).company_status).toBe("active");
  });

  it("xizmatlarni ro'yxat sifatida beradi", () => {
    expect(companyAttributes(company).service_key).toEqual(["buxgalteriya", "payroll"]);
  });

  it("has_employees payroll xizmatidan taxmin qilinadi", () => {
    expect(companyAttributes(company).has_employees).toBe("true");
    expect(companyAttributes({ ...company, activeServices: ["buxgalteriya"] }).has_employees).toBe("false");
  });
});

describe("toSubject", () => {
  it("mas'ul = buxgalter, zaxira = nazoratchi (bo'lmasa bosh buxgalter)", () => {
    expect(toSubject(company).responsibleUserId).toBe("u-acc");
    expect(toSubject(company).backupUserId).toBe("u-sup");
    expect(toSubject({ ...company, supervisorId: null }).backupUserId).toBe("u-chief");
    expect(toSubject({ ...company, supervisorId: null, chiefAccountantId: null }).backupUserId).toBeNull();
  });

  it("status/startedAt engine nomlariga o'giriladi", () => {
    const s = toSubject(company);
    expect(s.status).toBe("active");
    expect(s.startedAt).toEqual(company.contractDate);
  });
});

// A3 dan OLDINGI test/applicability.test.ts qamrovini saqlash: o'sha holatlar
// endi domen proyeksiyasi + generic engine orqali o'tadi.
describe("A3 gacha bo'lgan semantika saqlanadi", () => {
  const s = toSubject(company);

  it("tax_regime mos / mos emas", () => {
    expect(templateApplies([{ criteriaType: "tax_regime", criteriaValue: "vat" }], s)).toBe(true);
    expect(templateApplies([{ criteriaType: "tax_regime", criteriaValue: "turnover" }], s)).toBe(false);
  });

  it("stats_type ichida OR", () => {
    expect(
      templateApplies(
        [
          { criteriaType: "stats_type", criteriaValue: "micro" },
          { criteriaType: "stats_type", criteriaValue: "kb1" },
        ],
        s,
      ),
    ).toBe(true);
  });

  it("tax_regime VA service_key (typelar aro AND)", () => {
    const crit = [
      { criteriaType: "tax_regime", criteriaValue: "vat" },
      { criteriaType: "service_key", criteriaValue: "didox" },
    ];
    expect(templateApplies(crit, s)).toBe(false);
    expect(templateApplies(crit, toSubject({ ...company, activeServices: [...company.activeServices, "didox"] }))).toBe(
      true,
    );
  });

  it("vat_payer=true faqat vat rejimiga", () => {
    const crit = [{ criteriaType: "vat_payer", criteriaValue: "true" }];
    expect(templateApplies(crit, s)).toBe(true);
    expect(templateApplies(crit, toSubject({ ...company, taxRegime: "turnover" }))).toBe(false);
  });
});
