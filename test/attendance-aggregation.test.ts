/**
 * Pure unit tests for the attendance → KPI derivation (no DB).
 *
 * This is the calculation that replaces the supervisor's hand-counted
 * early/late/absent counters with values derived from the e-jurnal-fed
 * Attendance table. Using local Date constructors keeps it timezone-independent.
 */
import { describe, it, expect } from "vitest";
import {
  classifyArrival,
  aggregateMonthlyAttendance,
  type DailyAttendance,
} from "@/lib/attendance";

// Local-time constructor so getHours()/getMinutes() are stable across timezones.
const at = (h: number, m: number) => new Date(2026, 6, 17, h, m, 0);

describe("classifyArrival", () => {
  it("marks arrival at/before 08:30 as early", () => {
    expect(classifyArrival(at(8, 15))).toEqual({ status: "present", lateMinutes: 0, isEarly: true });
    expect(classifyArrival(at(8, 30)).isEarly).toBe(true);
  });

  it("treats 08:31–09:00 as on-time but not early", () => {
    expect(classifyArrival(at(8, 45))).toEqual({ status: "present", lateMinutes: 0, isEarly: false });
    expect(classifyArrival(at(9, 0))).toEqual({ status: "present", lateMinutes: 0, isEarly: false });
  });

  it("counts minutes past 09:00 as late", () => {
    expect(classifyArrival(at(9, 15))).toEqual({ status: "late", lateMinutes: 15, isEarly: false });
    expect(classifyArrival(at(10, 0)).lateMinutes).toBe(60);
  });
});

describe("aggregateMonthlyAttendance", () => {
  it("derives KPI counters from check-in times", () => {
    const rows: DailyAttendance[] = [
      { status: "present", checkIn: at(8, 20) }, // early
      { status: "present", checkIn: at(8, 25) }, // early
      { status: "present", checkIn: at(8, 50) }, // on-time
      { status: "late", checkIn: at(9, 10) }, // 10 late
      { status: "late", checkIn: at(9, 30) }, // 30 late
      { status: "absent", checkIn: null },
      { status: "excused", checkIn: null },
    ];
    const s = aggregateMonthlyAttendance(rows);
    expect(s.earlyDays).toBe(2);
    expect(s.lateDays).toBe(2);
    expect(s.lateMinutes).toBe(40);
    expect(s.absentDays).toBe(1);
    expect(s.excusedDays).toBe(1);
    expect(s.presentDays).toBe(3); // 2 early + 1 on-time
    expect(s.workedDays).toBe(5);
  });

  it("trusts the check-in over a stale status", () => {
    // status says 'late' but the scanner shows an on-time arrival → present, no penalty
    const s = aggregateMonthlyAttendance([{ status: "late", checkIn: at(8, 55) }]);
    expect(s.lateDays).toBe(0);
    expect(s.presentDays).toBe(1);
    expect(s.lateMinutes).toBe(0);
  });

  it("falls back to stored status/lateMinutes when there is no check-in time", () => {
    const s = aggregateMonthlyAttendance([
      { status: "late", checkIn: null, lateMinutes: 25 },
      { status: "present", checkIn: null },
    ]);
    expect(s.lateDays).toBe(1);
    expect(s.lateMinutes).toBe(25);
    expect(s.presentDays).toBe(1);
  });
});

describe("reglament: uzluksiz oy va uzrli kechikish", () => {
  const early = (): DailyAttendance => ({ status: "present", checkIn: at(8, 20) });

  it("flags a month where every worked day was early", () => {
    const s = aggregateMonthlyAttendance([early(), early(), early()]);
    expect(s.allEarly).toBe(true);
  });

  it("clears the flag when one day was merely on time", () => {
    const s = aggregateMonthlyAttendance([early(), { status: "present", checkIn: at(8, 45) }]);
    expect(s.earlyDays).toBe(1); // kunbay hisob saqlanadi — bonus butunlay kuymaydi
    expect(s.allEarly).toBe(false);
  });

  it("clears the flag when an unexcused absence breaks the month", () => {
    const s = aggregateMonthlyAttendance([early(), { status: "absent", checkIn: null }]);
    expect(s.allEarly).toBe(false);
  });

  // Reglament: "Ишга УЗРЛИ САБАБСИЗ 09.00 дан кейин келиш ... -0.1%".
  it("keeps an excused late arrival out of the penalty", () => {
    const s = aggregateMonthlyAttendance([
      { status: "late", checkIn: at(9, 40), lateExcused: true },
      { status: "late", checkIn: at(9, 10) },
    ]);
    expect(s.lateMinutes).toBe(10); // faqat uzrsizi
    expect(s.lateDays).toBe(1);
    expect(s.excusedLateDays).toBe(1);
    expect(s.workedDays).toBe(2); // kun baribir ishlangan
  });
});
