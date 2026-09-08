import { describe, it, expect } from "vitest";
import { clampPage, hasMorePages, lastPage } from "./pagination";

describe("lastPage", () => {
  it("to'liq bo'lmagan oxirgi sahifani ham sanaydi", () => {
    expect(lastPage(51, 25)).toBe(3);
    expect(lastPage(50, 25)).toBe(2);
  });

  /** Bo'sh ro'yxat ham BITTA sahifa — "0-sahifa" degan holat yo'q. */
  it("ma'lumot yo'q bo'lsa 1 qaytaradi", () => {
    expect(lastPage(0, 25)).toBe(1);
  });

  it("pageSize noto'g'ri bo'lsa xato beradi", () => {
    expect(() => lastPage(10, 0)).toThrow();
  });
});

describe("clampPage", () => {
  /**
   * ASOSIY HOLAT: foydalanuvchi 5-sahifada turganda schyotlar bekor qilinadi
   * yoki boshqa davr tanlanadi va 5-sahifa qolmaydi. Siqilmasa ekran bo'sh
   * jadval ko'rsatardi — bu "ma'lumot yo'qolgan" bo'lib o'qilardi.
   */
  it("mavjud bo'lmagan sahifani oxirgisiga tushiradi", () => {
    expect(clampPage(5, 30, 25)).toBe(2);
  });

  it("oraliqdagi sahifani o'zgartirmaydi", () => {
    expect(clampPage(2, 100, 25)).toBe(2);
  });

  it("nol, manfiy va son bo'lmagan qiymat 1 ga tushadi", () => {
    expect(clampPage(0, 100, 25)).toBe(1);
    expect(clampPage(-3, 100, 25)).toBe(1);
    expect(clampPage(Number.NaN, 100, 25)).toBe(1);
  });

  it("kasr sahifa butunga kesiladi", () => {
    expect(clampPage(2.9, 100, 25)).toBe(2);
  });
});

describe("hasMorePages", () => {
  it("oxirgi sahifada false", () => {
    expect(hasMorePages(2, 25, 50)).toBe(false);
    expect(hasMorePages(1, 25, 50)).toBe(true);
  });

  it("bo'sh ro'yxatda false", () => {
    expect(hasMorePages(1, 25, 0)).toBe(false);
  });
});
