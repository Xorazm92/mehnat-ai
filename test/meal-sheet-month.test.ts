/**
 * VARAQ NOMI ↔ KATAK SANASI.
 *
 * Real faylda ("FinCo Obed harajatlar _ Laylo") ikkita varaqda sana xato:
 * "Январь 2026" ustunlari 2026-DEKABR ni, "февраль 2026" esa 2025-FEVRAL ni
 * ko'rsatadi. Birinchisi prodga 39 ta yozuv (1 221 000) bo'lib KELAJAK
 * davriga tushib ketgan edi.
 *
 * Xato faylda, parserda emas — lekin uni jimgina o'tkazib yuborish mumkin
 * emas. Bu test qo'riqchini qotiradi.
 */
import { describe, it, expect } from "vitest";
import { sheetMonthOf, parseMealSheet } from "@/lib/mealExpenses";

/** 2026-12-05 va 2026-12-06 (Excel serial). */
const DEC_SERIALS = [46361, 46362];
/** 2026-01-05, 2026-01-06. */
const JAN_SERIALS = [46027, 46028];

const sheetWith = (serials: number[]) => [
  { c0: null, c1: serials[0], c2: serials[1] },
  { c0: "Taksi", c1: 45000, c2: 30000 },
];

describe("sheetMonthOf", () => {
  it("rus va o'zbek nomlarini o'qiydi", () => {
    expect(sheetMonthOf("Январь 2026")).toEqual({ year: 2026, month: 1 });
    expect(sheetMonthOf("август 2026")).toEqual({ year: 2026, month: 8 });
    expect(sheetMonthOf("Avgust | 2025")).toEqual({ year: 2025, month: 8 });
    expect(sheetMonthOf("декабр 2025 ")).toEqual({ year: 2025, month: 12 });
  });

  it("yili yo'q yoki tanilmagan nomda null", () => {
    expect(sheetMonthOf("Sheet1")).toBeNull();
    expect(sheetMonthOf("Umumiy 2026")).toBeNull();
  });
});

describe("parseMealSheet — oy nomuvofiqligi", () => {
  it("sana varaq nomiga mos kelmasa bayroq qo'yadi", () => {
    const res = parseMealSheet("Январь 2026", sheetWith(DEC_SERIALS));
    expect(res.expenses).toHaveLength(2);
    expect(res.declaredMonth).toEqual({ year: 2026, month: 1 });
    expect(res.monthMismatch).toBe(true);
  });

  it("mos kelsa bayroq qo'ymaydi", () => {
    const res = parseMealSheet("Январь 2026", sheetWith(JAN_SERIALS));
    expect(res.monthMismatch).toBe(false);
  });

  it("nomi tanilmagan varaqni ayblamaydi", () => {
    const res = parseMealSheet("Sheet1", sheetWith(DEC_SERIALS));
    expect(res.monthMismatch).toBe(false);
  });
});
