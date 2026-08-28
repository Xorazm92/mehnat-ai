/**
 * Oylik bazasi — sof testlar (baza ham, auth ham yo'q).
 *
 * Bu yerda tekshiriladigan xato REAL edi: mijoz bir tiyin to'lamagan oyda ham
 * buxgalterga to'liq gonorar yozilardi, chunki ulush doim shartnoma summasidan
 * hisoblanardi.
 */
import { describe, it, expect } from "vitest";
import { resolveSalaryBasis } from "@/lib/payrollBasis";
import { calculateCompanySalaries } from "@/lib/kpiLogic";
import type { Company } from "@/types";

const company = {
  id: "co-1",
  name: "Test Firma",
  contractAmount: 10_000_000,
  accountantId: "emp-1",
  accountantPerc: 20,
} as Company;

const accountantPay = (opts: Parameters<typeof calculateCompanySalaries>[4]) => {
  const r = calculateCompanySalaries(company, undefined, [], [], opts).find(
    (x) => x.role === "accountant"
  );
  if (!r) throw new Error("accountant natijasi yo'q");
  return r;
};

describe("resolveSalaryBasis", () => {
  it("'accrual' shartnoma summasini o'zgarishsiz qaytaradi", () => {
    expect(resolveSalaryBasis({ basis: "accrual", contract: 10_000_000, collected: 0 })).toEqual({
      basisAmount: 10_000_000,
      collectionRatio: 1,
      note: null,
    });
  });

  it("'cash' to'lanmagan oyda nol baza beradi", () => {
    const b = resolveSalaryBasis({ basis: "cash", contract: 10_000_000, collected: 0 });
    expect(b.basisAmount).toBe(0);
    expect(b.collectionRatio).toBe(0);
  });

  it("'cash' qisman to'lovda nisbatni beradi", () => {
    const b = resolveSalaryBasis({ basis: "cash", contract: 10_000_000, collected: 4_000_000 });
    expect(b.basisAmount).toBe(4_000_000);
    expect(b.collectionRatio).toBeCloseTo(0.4);
  });

  it("avans (ortiqcha to'lov) bazani shartnomadan oshirmaydi", () => {
    // Kelasi oy uchun oldindan to'langan pul joriy oy gonorarini shishirmasin.
    const b = resolveSalaryBasis({ basis: "cash", contract: 10_000_000, collected: 25_000_000 });
    expect(b.basisAmount).toBe(10_000_000);
    expect(b.collectionRatio).toBe(1);
  });
});

describe("calculateCompanySalaries — baza rejimi", () => {
  it("standart (rejimsiz) chaqiruv eski xatti-harakatni saqlaydi", () => {
    expect(accountantPay(undefined).baseAmount).toBe(2_000_000);
  });

  it("'accrual' to'lov bo'lmasa ham to'liq ulush yozadi", () => {
    expect(accountantPay({ basis: "accrual", collected: 0 }).baseAmount).toBe(2_000_000);
  });

  it("'cash' to'lanmagan oyda ulush yozmaydi", () => {
    expect(accountantPay({ basis: "cash", collected: 0 }).baseAmount).toBe(0);
  });

  it("'cash' qisman to'lovda ulushni shu nisbatda kamaytiradi", () => {
    expect(accountantPay({ basis: "cash", collected: 5_000_000 }).baseAmount).toBe(1_000_000);
  });

  it("qat'iy summali ulush ham tushumga ergashadi", () => {
    // Aks holda bitta firmada foizli xodim to'lovga bog'liq, qat'iy summali
    // xodim bog'liq bo'lmay qolardi.
    const fixed = { ...company, accountantPerc: undefined, accountantSum: 1_000_000 } as Company;
    const r = calculateCompanySalaries(fixed, undefined, [], [], {
      basis: "cash",
      collected: 2_500_000,
    }).find((x) => x.role === "accountant");
    expect(r?.baseAmount).toBe(250_000);
  });
});

describe("calculateCompanySalaries — biriktiruvdan ulush", () => {
  // Prodda 941 ta faol biriktiruv bor va ulardan 5 tasi 'chief'/'controller'
  // rolida — bu rollar `Company.*Perc` ustunlariga sig'maydi, ya'ni ilgari
  // oylikda UMUMAN ko'rinmasdi.
  it("biriktiruv berilsa ustunlar o'rniga shundan o'qiydi", () => {
    const r = calculateCompanySalaries(company, undefined, [], [], {
      assignments: [
        { userId: "u1", userName: "Bosh", role: "chief", salaryType: "percent", salaryValue: 7 },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0].staffId).toBe("u1");
    // Ustunda accountantPerc 20% turibdi, lekin biriktiruv 7% deydi.
    expect(r[0].baseAmount).toBe(700_000);
  });

  it("qat'iy summali biriktiruvni foiz deb hisoblamaydi", () => {
    const r = calculateCompanySalaries(company, undefined, [], [], {
      assignments: [
        { userId: "u2", role: "controller", salaryType: "fixed", salaryValue: 300_000 },
      ],
    });
    expect(r[0].baseAmount).toBe(300_000);
  });

  it("bir firmada to'rtdan ortiq rolni ham hisoblaydi", () => {
    const r = calculateCompanySalaries(company, undefined, [], [], {
      assignments: [
        { userId: "u1", role: "accountant", salaryType: "percent", salaryValue: 20 },
        { userId: "u2", role: "bank_manager", salaryType: "percent", salaryValue: 5 },
        { userId: "u3", role: "chief_accountant", salaryType: "percent", salaryValue: 7 },
        { userId: "u4", role: "controller", salaryType: "percent", salaryValue: 5 },
        { userId: "u5", role: "sales_manager", salaryType: "percent", salaryValue: 7 },
      ],
    });
    expect(r).toHaveLength(5);
    expect(r.find((x) => x.staffId === "u5")?.baseAmount).toBe(700_000);
  });

  it("biriktiruv berilmasa eski (ustunli) yo'l saqlanadi", () => {
    const r = calculateCompanySalaries(company, undefined, [], [], {});
    expect(r.find((x) => x.role === "accountant")?.baseAmount).toBe(2_000_000);
  });

  it("biriktiruv tushum rejimiga ham bo'ysunadi", () => {
    const r = calculateCompanySalaries(company, undefined, [], [], {
      basis: "cash",
      collected: 5_000_000,
      assignments: [
        { userId: "u1", role: "accountant", salaryType: "percent", salaryValue: 20 },
      ],
    });
    expect(r[0].baseAmount).toBe(1_000_000);
  });
});
