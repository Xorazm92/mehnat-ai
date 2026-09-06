/**
 * ISH KUNLARI KALENDARI (P2).
 *
 * ENG MUHIM DA'VO: hafta oxiri jadvalga YOZILMAYDI va bu to'g'ri.
 *
 * Topshiriqda "muddat yakshanbaga tushsa, o'sha kunda qoladi" deyilgan edi.
 * O'lchov buni RAD ETDI: `makeWorkdayPredicate` aniq yozuv topmasa standart
 * qoidaga tushadi (`dow !== 0 && dow !== 6`), ya'ni bo'sh jadval bilan ham
 * dam olish kunidan surish ishlaydi. Yetishmayotgani faqat BAYRAM — uni
 * standart qoida bila olmaydi.
 *
 * Shuning uchun bu testlar ikkalasini ham mahkamlaydi: bayram ekiladi,
 * hafta oxiri ekilmaydi (lekin baribir ish kuni hisoblanmaydi).
 *
 * SOF — baza kerak emas.
 */
import { describe, it, expect } from "vitest";
import { uzHolidays, UZ_FIXED_HOLIDAYS, hasMoveableHolidays } from "@/lib/domains/accounting/uzHolidays";
import { makeWorkdayPredicate, adjustForWorkday } from "@/lib/engines/obligation/deadlines";

/** Skript ekadigan qatorlarni ayni shaklda quradi. */
const seedRows = (year: number) =>
  uzHolidays(year).map((h) => ({
    date: new Date(`${h.date}T00:00:00.000Z`),
    isWorkday: false,
    isHoliday: true,
  }));

const D = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe("bayramlar ekiladi", () => {
  it("2026-01-01 — Yangi yil, bayram", () => {
    const rows = uzHolidays(2026);
    const newYear = rows.find((h) => h.date === "2026-01-01");
    expect(newYear?.name).toBe("Yangi yil");
    // Predikat uni ish kuni deb hisoblamaydi.
    expect(makeWorkdayPredicate(seedRows(2026))(D("2026-01-01"))).toBe(false);
  });

  it("qat'iy bayramlar har yilda takrorlanadi, hayit esa faqat ma'lum yilda", () => {
    expect(uzHolidays(2026).length).toBe(UZ_FIXED_HOLIDAYS.length + 2);
    expect(uzHolidays(2027).length).toBe(UZ_FIXED_HOLIDAYS.length + 2);
    // 2028 uchun hayit sanasi yozilmagan — taxmin qilinmaydi.
    expect(hasMoveableHolidays(2028)).toBe(false);
    expect(uzHolidays(2028).length).toBe(UZ_FIXED_HOLIDAYS.length);
  });

  it("hayit sanalari TAXMINIY deb belgilangan", () => {
    const approx = uzHolidays(2026).filter((h) => h.approximate);
    expect(approx.map((h) => h.name)).toEqual(["Ramazon hayit", "Qurbon hayit"]);
  });
});

describe("hafta oxiri — ekilmaydi, lekin baribir ish kuni emas", () => {
  it("2026-01-04 (yakshanba) jadvalda YO'Q, ammo ish kuni hisoblanmaydi", () => {
    const rows = seedRows(2026);
    expect(rows.some((r) => r.date.getTime() === D("2026-01-04").getTime())).toBe(false);
    expect(makeWorkdayPredicate(rows)(D("2026-01-04"))).toBe(false);
  });

  it("2026-01-05 (dushanba) — ish kuni", () => {
    expect(makeWorkdayPredicate(seedRows(2026))(D("2026-01-05"))).toBe(true);
  });
});

describe("surish", () => {
  it("Yangi yilga tushgan muddat keyingi ish kuniga suriladi", () => {
    // 2026-01-01 payshanba (bayram) → 2 yanvar juma ish kuni.
    const isWorkday = makeWorkdayPredicate(seedRows(2026));
    expect(adjustForWorkday(D("2026-01-01"), "next_workday", isWorkday).toISOString().slice(0, 10)).toBe(
      "2026-01-02",
    );
  });

  it("bayramsiz kalendarda ham hafta oxiri suriladi — standart qoida", () => {
    // Bo'sh jadval: 2026-01-04 yakshanba → 5 yanvar dushanba.
    const isWorkday = makeWorkdayPredicate([]);
    expect(adjustForWorkday(D("2026-01-04"), "next_workday", isWorkday).toISOString().slice(0, 10)).toBe(
      "2026-01-05",
    );
  });
});
