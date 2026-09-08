/**
 * DAVR FORMATI QO'RIQCHISI (DB-siz).
 *
 * Prodda topilgan nosozlik: `MonthPicker` matnli davr ("2026 Sentyabr")
 * chiqarardi, `getReportProofsMeta` esa qat'iy tenglik bilan qidiradi. Oy
 * tanlangan zahoti barcha skrinshot belgilari yo'qolardi, o'sha holatda
 * topshirilgan dalil esa matnli davr bilan saqlanib, nazoratchining ISO
 * davrli ekranida BOSHQA HECH QACHON ko'rinmasdi. Xato chiqmasdi — natija
 * shunchaki bo'sh edi.
 *
 * Shu sabab kanonik kalit bitta: "YYYY-MM".
 */
import { describe, it, expect } from "vitest";
import {
  normalizePeriodKey,
  formatPeriodLabel,
  toYearMonthKey,
  periodsEqual,
  isFuturePeriod,
  isMonthPeriod,
} from "@/lib/periods";

describe("isMonthPeriod — yozish uchun qat'iy davr", () => {
  it.each(["0001-01", "2026-01", "2026-12", "9999-12"])("%s ni qabul qiladi", (value) => {
    expect(isMonthPeriod(value)).toBe(true);
  });

  it.each([
    "2026-00", "2026-13", "2026-99", "0000-01", "2026-1",
    "26-01", "10000-01", "2026-01-01", "2026-01\n", " 2026-01",
    "2026-01 ", "2026 Yanvar", "", null, undefined, 202601,
  ])("%s ni rad etadi", (value) => {
    expect(isMonthPeriod(value)).toBe(false);
  });
});

describe("normalizePeriodKey — kanonik davr kaliti", () => {
  it("matnli davrni ISO ga keltiradi", () => {
    expect(normalizePeriodKey("2026 Sentyabr")).toBe("2026-09");
    expect(normalizePeriodKey("2026 Avgust")).toBe("2026-08");
    expect(normalizePeriodKey("2026 Yanvar")).toBe("2026-01");
    expect(normalizePeriodKey("2026 Dekabr")).toBe("2026-12");
  });

  it("ISO davrni o'zgartirmaydi (idempotent)", () => {
    expect(normalizePeriodKey("2026-08")).toBe("2026-08");
    expect(normalizePeriodKey(normalizePeriodKey("2026 Avgust"))).toBe("2026-08");
  });

  it("registr va ortiqcha bo'shliqqa chidamli", () => {
    expect(normalizePeriodKey("  2026   sentyabr  ")).toBe("2026-09");
    expect(normalizePeriodKey("2026 SENTYABR")).toBe("2026-09");
  });

  it("o'qib bo'lmaydigan qiymatni ASL holida qaytaradi", () => {
    // Bo'sh satr qaytarsa, `where: { period: "" }` hamma narsani yashirardi.
    expect(normalizePeriodKey("2026 Yillik")).toBe("2026 Yillik");
    expect(normalizePeriodKey("bekor")).toBe("bekor");
    expect(normalizePeriodKey("")).toBe("");
  });

  it("PRODDAGI AYNAN HOLAT: matnli va ISO bir xil kalitga tushadi", () => {
    // 7 NEBO · bonak · "2026 Sentyabr" — nazoratchiga ko'rinmagan dalil.
    expect(normalizePeriodKey("2026 Sentyabr")).toBe(normalizePeriodKey("2026-09"));
  });
});

describe("formatPeriodLabel — ko'rsatish uchun", () => {
  it("ISO ni o'qiladigan yozuvga o'giradi", () => {
    expect(formatPeriodLabel("2026-08")).toBe("2026 Avgust");
    expect(formatPeriodLabel("2026-01")).toBe("2026 Yanvar");
  });

  it("matnli davrni ham normallashtirib ko'rsatadi", () => {
    expect(formatPeriodLabel("2026 sentyabr")).toBe("2026 Sentyabr");
  });

  it("noma'lum qiymatni asl holida ko'rsatadi", () => {
    expect(formatPeriodLabel("2026 Yillik")).toBe("2026 Yillik");
  });

  it("normalize → format aylanmasi qiymatni saqlaydi", () => {
    for (const p of ["2026-01", "2026-06", "2026-12"]) {
      expect(normalizePeriodKey(formatPeriodLabel(p))).toBe(p);
    }
  });
});

describe("MonthPicker chiqaradigan format", () => {
  // MonthPicker endi `${viewYear}-${MM}` chiqaradi. Shu shakl kanonik
  // bo'lishi SHART, aks holda nosozlik qaytadi.
  const emitted = (year: number, monthIdx: number) =>
    `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

  it("har oy uchun kanonik kalit chiqadi", () => {
    for (let i = 0; i < 12; i++) {
      const value = emitted(2026, i);
      expect(normalizePeriodKey(value)).toBe(value);
      expect(toYearMonthKey(value)).toBe(value);
    }
  });

  it("chiqarilgan qiymat saqlangan ISO davr bilan mos keladi", () => {
    expect(periodsEqual(emitted(2026, 7), "2026-08")).toBe(true);
    expect(periodsEqual(emitted(2026, 8), "2026 Sentyabr")).toBe(true);
  });
});

describe("isFuturePeriod — kelajakka hisobot topshirishni to'sish", () => {
  // Xodimlar kalendardan sentyabr/oktyabrni tanlab hisobotni oldindan
  // "topshirib" qo'yishgan edi. Hisobot davri — u NIMA HAQIDA ekani;
  // kelmagan oy haqida hisobot bo'lishi mumkin emas.
  const NOW = new Date(2026, 7, 12); // 2026-08-12 (lokal)

  it("kelajak oy — to'siladi", () => {
    expect(isFuturePeriod("2026-09", NOW)).toBe(true);
    expect(isFuturePeriod("2026-12", NOW)).toBe(true);
    expect(isFuturePeriod("2027-01", NOW)).toBe(true);
    expect(isFuturePeriod("2026 Sentyabr", NOW)).toBe(true);
  });

  it("JORIY oy — ruxsat", () => {
    // Oy ichida bajariladigan ishlar bor (raschot zarplata 25-31),
    // shuning uchun joriy oy ochiq bo'lishi SHART.
    expect(isFuturePeriod("2026-08", NOW)).toBe(false);
    expect(isFuturePeriod("2026 Avgust", NOW)).toBe(false);
  });

  it("O'TMISH oylar — ruxsat (kechikkan ishni topshirish qonuniy)", () => {
    expect(isFuturePeriod("2026-07", NOW)).toBe(false);
    expect(isFuturePeriod("2025-12", NOW)).toBe(false);
  });

  it("oy chegarasi: 31-avgust va 1-sentyabr", () => {
    expect(isFuturePeriod("2026-09", new Date(2026, 7, 31))).toBe(true);
    expect(isFuturePeriod("2026-09", new Date(2026, 8, 1))).toBe(false);
  });

  it("o'qib bo'lmaydigan davr bo'yicha hukm chiqarmaydi", () => {
    // Bu yerda `true` qaytarsa, noma'lum formatli eski yozuv jimgina
    // bloklanardi. Qaror boshqa qatlamning ishi.
    expect(isFuturePeriod("2026 Yillik", NOW)).toBe(false);
    expect(isFuturePeriod("", NOW)).toBe(false);
  });
});
