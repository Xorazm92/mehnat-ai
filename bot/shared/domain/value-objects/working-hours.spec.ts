import { describe, it, expect } from "vitest";
import { WorkingHours } from "./working-hours";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 6, h, m, 0)); // Mon 2026-07-06

describe("WorkingHours (default 09-13, 14-18)", () => {
  const wh = WorkingHours.DEFAULT;

  it("counts minutes fully inside one window", () => {
    expect(wh.businessMinutesBetween(at(9, 30), at(10, 0))).toBe(30);
  });

  it("excludes the 13:00-14:00 break", () => {
    // 12:30 → 14:30 = 30 (12:30-13:00) + 30 (14:00-14:30)
    expect(wh.businessMinutesBetween(at(12, 30), at(14, 30))).toBe(60);
  });

  it("clamps to the working day when the span exceeds it", () => {
    // 08:00 → 19:00 = full day = 240 + 240
    expect(wh.businessMinutesBetween(at(8, 0), at(19, 0))).toBe(480);
  });

  it("returns 0 when entirely outside working hours", () => {
    expect(wh.businessMinutesBetween(at(18, 30), at(20, 0))).toBe(0);
    expect(wh.businessMinutesBetween(at(6, 0), at(8, 30))).toBe(0);
  });

  it("spans across days (overnight question answered next morning)", () => {
    const fri17 = new Date(Date.UTC(2026, 6, 6, 17, 0));
    const sat10 = new Date(Date.UTC(2026, 6, 7, 10, 0));
    // 17:00-18:00 = 60, next day 09:00-10:00 = 60
    expect(wh.businessMinutesBetween(fri17, sat10)).toBe(120);
  });

  it("returns 0 for a non-positive interval", () => {
    expect(wh.businessMinutesBetween(at(10, 0), at(10, 0))).toBe(0);
    expect(wh.businessMinutesBetween(at(11, 0), at(10, 0))).toBe(0);
  });

  it("knows whether an instant is within working hours", () => {
    expect(wh.isWithinWorkingHours(at(9, 0))).toBe(true);
    expect(wh.isWithinWorkingHours(at(13, 0))).toBe(false); // exclusive end
    expect(wh.isWithinWorkingHours(at(13, 30))).toBe(false); // break
    expect(wh.isWithinWorkingHours(at(14, 0))).toBe(true);
    expect(wh.isWithinWorkingHours(at(18, 0))).toBe(false);
  });

  it("adds working minutes within a window", () => {
    expect(wh.addWorkingMinutes(at(9, 0), 30).toISOString()).toBe(at(9, 30).toISOString());
  });

  it("adds working minutes across the lunch break", () => {
    // 12:50 + 20 working min = 10 min (12:50-13:00) + 10 min (from 14:00) = 14:10
    expect(wh.addWorkingMinutes(at(12, 50), 20).toISOString()).toBe(at(14, 10).toISOString());
  });

  it("rolls a late deadline to the next working morning", () => {
    // 17:55 + 10 working min = 5 min (17:55-18:00) + 5 min (next day 09:00) = 09:05
    const fri1755 = new Date(Date.UTC(2026, 6, 6, 17, 55));
    const sat0905 = new Date(Date.UTC(2026, 6, 7, 9, 5));
    expect(wh.addWorkingMinutes(fri1755, 10).toISOString()).toBe(sat0905.toISOString());
  });

  it("clamps a start before the day to the first window", () => {
    // 08:00 + 15 working min = 09:15 (timer starts at the window open)
    expect(wh.addWorkingMinutes(at(8, 0), 15).toISOString()).toBe(at(9, 15).toISOString());
  });

  it("returns the start for non-positive minutes", () => {
    expect(wh.addWorkingMinutes(at(10, 0), 0).toISOString()).toBe(at(10, 0).toISOString());
  });

  it("validates window definitions", () => {
    expect(() => WorkingHours.of([])).toThrow();
    expect(() =>
      WorkingHours.of([{ startMinute: 600, endMinute: 500 }]),
    ).toThrow();
    expect(() =>
      WorkingHours.of([
        { startMinute: 540, endMinute: 780 },
        { startMinute: 700, endMinute: 900 }, // overlaps
      ]),
    ).toThrow();
  });
});
