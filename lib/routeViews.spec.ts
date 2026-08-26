import { describe, it, expect } from "vitest";
import { pathToView, pathToViews } from "@/lib/routeViews";

/**
 * PROXY VA SAHIFA BIR XIL JAVOB BERISHI KERAK.
 *
 * Jonli tekshiruvda topilgan holat: nazoratchining menyusida "Xarajatlar"
 * bandi turardi, uni bosganda esa har safar 403 chiqardi. Sabab —
 * `/kassa/chiqim` sahifasi IKKI ko'rinishdan birini qabul qiladi
 * (`kassa_expense` yoki `expenses`), proxy esa faqat birinchisini bilardi.
 *
 * Bu testlar aynan shu kelishuvni qulflaydi.
 */
describe("pathToViews", () => {
  it("/kassa/chiqim ikkala ko'rinishni ham qabul qiladi", () => {
    expect(pathToViews("/kassa/chiqim")).toEqual(["kassa_expense", "expenses"]);
    expect(pathToViews("/kassa/chiqim?tab=xarajat")).toEqual(["kassa_expense", "expenses"]);
  });

  it("boshqa manzillar bitta ko'rinish qaytaradi", () => {
    expect(pathToViews("/organizations")).toEqual(["organizations"]);
    expect(pathToViews("/kassa/kirim")).toEqual(["kassa_income"]);
    expect(pathToViews("/kassa/qarzdorlik")).toEqual(["kassa_debt"]);
    expect(pathToViews("/dashboard")).toEqual(["dashboard"]);
  });

  it("noma'lum manzil bo'sh ro'yxat qaytaradi — proxy to'smaydi", () => {
    expect(pathToViews("/qwerty-yoq-sahifa")).toEqual([]);
  });

  it("aniqroq prefiks umumiyroqdan oldin tekshiriladi", () => {
    // `/kassa/kirim` butun `kassa` ruxsatini talab qilib qolmasin.
    expect(pathToView("/kassa/kirim")).toBe("kassa_income");
    expect(pathToView("/kassa")).toBe("kassa");
    expect(pathToView("/cabinet/bank")).toBe("cabinet_bank");
    expect(pathToView("/cabinet")).toBe("cabinet");
  });
});
