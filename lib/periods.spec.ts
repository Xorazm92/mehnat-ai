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
} from "@/lib/periods";

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
