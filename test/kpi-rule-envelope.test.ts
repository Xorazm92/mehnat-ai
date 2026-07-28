/**
 * Reglament envelopini qo'riqlaydi (DB'siz).
 *
 * Reglament har rol uchun aniq bir raqam beradi: buxgalter 20% + KPI 5%,
 * bank-klient 5% + 2.5%, nazoratchi 5% + 1%. Qoida katalogidagi maxBonus'lar
 * yig'indisi shu shiftga TENG bo'lishi kerak:
 *   - kam bo'lsa — xodim reglament va'da qilgan bonusni to'liq ololmaydi;
 *   - ko'p bo'lsa — capKpiPercent jimgina kesadi va qoida og'irliklari yolg'on
 *     bo'lib qoladi (nazoratchi 0.2% deb ko'radi, aslida 0.13% tegadi).
 * Har ikkisi ham pul xatosi, shuning uchun bu test regressiya qo'riqchisi.
 */
import { describe, it, expect } from "vitest";
import { RULES } from "@/scripts/seed-kpi-rules-v2";
import { KPI_SALARY_CONFIG, type KpiSalaryRole } from "@/lib/kpiScoring";

const ROLES: KpiSalaryRole[] = ["accountant", "bank_client", "supervisor"];

const sumMaxBonus = (role: string) =>
  RULES.filter((r) => r.role === role).reduce((acc, r) => acc + (r.maxBonus ?? 0), 0);

describe("KPI rule catalogue envelopes", () => {
  it.each(ROLES)("%s: Σ maxBonus === kpiMaxPercent", (role) => {
    const expected = KPI_SALARY_CONFIG[role].kpiMaxPercent;
    expect(Number(sumMaxBonus(role).toFixed(2))).toBe(expected);
  });

  it("chief_accountant earns no KPI from these rules", () => {
    // calculateCompanySalaries filters every accountant/bank/supervisor rule out
    // for chiefs. A non-zero cap here would be a lie; a MISSING key would make
    // capKpiPercent fall back to Infinity and uncap the bonus entirely.
    expect(KPI_SALARY_CONFIG.chief_accountant.kpiMaxPercent).toBe(0);
    expect(RULES.some((r) => r.role === ("chief_accountant" as string))).toBe(false);
  });

  it("every rule's penalty option never exceeds its declared maxPenalty", () => {
    for (const rule of RULES) {
      if (rule.maxPenalty === null || rule.maxPenalty === undefined) continue;
      for (const opt of rule.options ?? []) {
        const coeff = opt.coeff ?? opt.coeff_per_unit;
        if (typeof coeff !== "number" || coeff >= 0) continue;
        expect(
          coeff,
          `${rule.name} option "${opt.key}" (${coeff}) undercuts maxPenalty ${rule.maxPenalty}`
        ).toBeGreaterThanOrEqual(rule.maxPenalty);
      }
    }
  });

  it("the 6710 / letters checks carry no money (evidence only)", () => {
    // Oylikning o'z vaqtidaligi acc_payroll_report'da baholanadi; bu yerda ham
    // foiz bo'lsa, bitta kechikish ikki marta jarima bo'lardi.
    for (const name of ["acc_payroll_posted", "acc_letters"]) {
      const rule = RULES.find((r) => r.name === name);
      expect(rule, `${name} qoidasi topilmadi`).toBeDefined();
      expect(rule!.maxBonus).toBe(0);
      expect(rule!.maxPenalty ?? 0).toBe(0);
    }
  });
});
