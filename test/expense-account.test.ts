/**
 * CHIQIM TOIFASI → JURNAL HISOBI.
 *
 * Eng muhim holat — TARTIB: "Otabek akaga oylik" ikkala qoidaga ham tushadi
 * va agar oylik tekshiruvi oldin kelsa, ta'sischiga taqsimot mehnat haqi
 * xarajatiga aylanib ketadi.
 */
import { describe, it, expect } from "vitest";
import { expenseAccountFor, isOwnerDistribution } from "@/lib/expenseAccount";

describe("expenseAccountFor", () => {
  it("oylik toifalarini mehnat haqi hisobiga yo'naltiradi", () => {
    expect(expenseAccountFor("Oylik")).toBe("SALARY_EXPENSE");
    expect(expenseAccountFor("O'ziga oylik")).toBe("SALARY_EXPENSE");
    expect(expenseAccountFor("Ish haqi")).toBe("SALARY_EXPENSE");
  });

  it("ta'sischiga taqsimotni xarajatdan ajratadi", () => {
    expect(expenseAccountFor("Otabek akaga")).toBe("OWNER_DISTRIBUTION");
    expect(expenseAccountFor("Ta'sischiga taqsimot")).toBe("OWNER_DISTRIBUTION");
    expect(expenseAccountFor("Dividend")).toBe("OWNER_DISTRIBUTION");
  });

  it("ikkala qoidaga tushgan matnni ta'sischi deb oladi", () => {
    expect(expenseAccountFor("Otabek akaga oylik")).toBe("OWNER_DISTRIBUTION");
  });

  it("qolgan hammasi operatsion xarajat", () => {
    expect(expenseAccountFor("Ovqat")).toBe("OPERATING_EXPENSE");
    expect(expenseAccountFor("ijara")).toBe("OPERATING_EXPENSE");
    expect(expenseAccountFor("bank_komissiya")).toBe("OPERATING_EXPENSE");
    expect(expenseAccountFor("")).toBe("OPERATING_EXPENSE");
  });

  it("isOwnerDistribution mustaqil ishlaydi", () => {
    expect(isOwnerDistribution("Otabek akaga")).toBe(true);
    expect(isOwnerDistribution("Ovqat")).toBe(false);
  });
});
