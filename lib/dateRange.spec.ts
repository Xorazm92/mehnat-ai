import { describe, it, expect } from "vitest";
import { resolveRange, periodsInRange, parseDayInput } from "./dateRange";

// Barcha testlarda "bugun" = 2026-08-19 (chorshanba) — foydalanuvchi aynan
// shu holatni so'ragan: "1–19 avgust" va "1 yanvar–19 avgust".
const NOW = new Date(2026, 7, 19, 14, 30);

describe("resolveRange", () => {
  it("month_to_date 1-avgustdan 20-avgust boshigacha (19-avgust to'liq kiradi)", () => {
    const r = resolveRange("month_to_date", undefined, NOW);
    expect(r.from).toEqual(new Date(2026, 7, 1));
    expect(r.to).toEqual(new Date(2026, 7, 20));
  });

  it("19-avgust kunduzi tushgan pul month_to_date ichida qoladi", () => {
    const r = resolveRange("month_to_date", undefined, NOW);
    const payment = new Date(2026, 7, 19, 16, 45);
    expect(payment >= r.from && payment < r.to).toBe(true);
  });

  it("year_to_date 1-yanvardan 20-avgust boshigacha", () => {
    const r = resolveRange("year_to_date", undefined, NOW);
    expect(r.from).toEqual(new Date(2026, 0, 1));
    expect(r.to).toEqual(new Date(2026, 7, 20));
  });

  it("this_month oy oxirigacha cho'ziladi — month_to_date dan farqi shu", () => {
    expect(resolveRange("this_month", undefined, NOW).to).toEqual(new Date(2026, 8, 1));
  });

  it("yesterday bitta kun: 18-avgust", () => {
    const r = resolveRange("yesterday", undefined, NOW);
    expect(r.from).toEqual(new Date(2026, 7, 18));
    expect(r.to).toEqual(new Date(2026, 7, 19));
  });

  it("this_week dushanbadan boshlanadi", () => {
    // 2026-08-19 chorshanba ⇒ dushanba 2026-08-17.
    expect(resolveRange("this_week", undefined, NOW).from).toEqual(new Date(2026, 7, 17));
  });

  it("custom da oxirgi kun oraliqqa KIRADI", () => {
    const r = resolveRange("custom", { from: "2026-08-01", to: "2026-08-19" }, NOW);
    expect(r.from).toEqual(new Date(2026, 7, 1));
    expect(r.to).toEqual(new Date(2026, 7, 20));
  });

  it("teskari kiritilgan custom oraliq jim bo'sh natija bermaydi", () => {
    const r = resolveRange("custom", { from: "2026-08-19", to: "2026-08-01" }, NOW);
    expect(r.from).toEqual(new Date(2026, 7, 1));
    expect(r.to).toEqual(new Date(2026, 7, 20));
  });

  it("bo'sh custom joriy oyga tushadi", () => {
    expect(resolveRange("custom", {}, NOW).from).toEqual(new Date(2026, 7, 1));
  });
});

describe("periodsInRange", () => {
  it("yil boshidan avgustgacha 8 ta oy", () => {
    const p = periodsInRange(resolveRange("year_to_date", undefined, NOW));
    expect(p).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04",
      "2026-05", "2026-06", "2026-07", "2026-08",
    ]);
  });

  it("oy chegarasida ortiqcha oy qo'shilmaydi", () => {
    // [1-avgust, 1-sentabr) — sentabr KIRITILMAYDI.
    const p = periodsInRange(resolveRange("this_month", undefined, NOW));
    expect(p).toEqual(["2026-08"]);
  });
});

describe("parseDayInput", () => {
  it("mahalliy kun boshini beradi, UTC siljishisiz", () => {
    expect(parseDayInput("2026-08-19")).toEqual(new Date(2026, 7, 19));
  });
  it("noto'g'ri format null", () => {
    expect(parseDayInput("19.08.2026")).toBeNull();
  });
});
