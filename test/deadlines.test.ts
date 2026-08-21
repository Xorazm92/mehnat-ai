import { describe, it, expect } from "vitest";
import {
  periodWindowFor,
  rawDueDate,
  adjustForWorkday,
  makeWorkdayPredicate,
  computeDueAt,
  addDays,
  dateKey,
} from "@/lib/deadlines";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("periodWindowFor", () => {
  it("monthly window + key", () => {
    const w = periodWindowFor("monthly", utc(2026, 7, 15));
    expect(iso(w.periodStart)).toBe("2026-07-01");
    expect(iso(w.periodEnd)).toBe("2026-08-01");
    expect(w.periodKey).toBe("2026-M07");
  });

  it("monthly December → January rollover", () => {
    const w = periodWindowFor("monthly", utc(2026, 12, 31));
    expect(iso(w.periodEnd)).toBe("2027-01-01");
    expect(w.periodKey).toBe("2026-M12");
  });

  it("quarterly windows (Q1..Q4)", () => {
    expect(periodWindowFor("quarterly", utc(2026, 2, 10)).periodKey).toBe("2026-Q1");
    expect(iso(periodWindowFor("quarterly", utc(2026, 2, 10)).periodEnd)).toBe("2026-04-01");
    expect(periodWindowFor("quarterly", utc(2026, 8, 1)).periodKey).toBe("2026-Q3");
    const q4 = periodWindowFor("quarterly", utc(2026, 11, 20));
    expect(q4.periodKey).toBe("2026-Q4");
    expect(iso(q4.periodStart)).toBe("2026-10-01");
    expect(iso(q4.periodEnd)).toBe("2027-01-01"); // yil chegarasidan o'tadi
  });

  it("annual window + key", () => {
    const w = periodWindowFor("annual", utc(2026, 6, 30));
    expect(iso(w.periodStart)).toBe("2026-01-01");
    expect(iso(w.periodEnd)).toBe("2027-01-01");
    expect(w.periodKey).toBe("2026-Y");
  });
});

describe("rawDueDate", () => {
  it("fixed_day_of_month: monthly QQS due 20th of next month", () => {
    const w = periodWindowFor("monthly", utc(2026, 7, 1));
    const due = rawDueDate(
      { anchorType: "fixed_day_of_month", dueDay: 20, dueMonth: null, offsetDays: null },
      w,
    );
    expect(iso(due)).toBe("2026-08-20");
  });

  /**
   * 4-moliya: "1-mart/iyun/sentabr/dekabr holatiga, 18-sanadan kechiktirmay".
   * Muddat DAVR ICHIDA tugaydi — mavjud ikkala ankor ham buni ifodalay
   * olmasdi: fixed_day_of_month bir oy kech (18-aprel) berardi,
   * period_end_offset esa 30/31 kunlik oylar tufayli 17 va 18-kunga
   * sochilib ketardi.
   */
  it("period_end_month_day: 4-moliya har chorakda 18-kunga tushadi", () => {
    const expected = ["2026-03-18", "2026-06-18", "2026-09-18", "2026-12-18"];
    const refs = [utc(2026, 1, 5), utc(2026, 4, 5), utc(2026, 7, 5), utc(2026, 10, 5)];
    const got = refs.map((r) =>
      iso(
        rawDueDate(
          { anchorType: "period_end_month_day", dueDay: 18, dueMonth: null, offsetDays: null },
          periodWindowFor("quarterly", r),
        ),
      ),
    );
    expect(got).toEqual(expected);
  });

  it("period_end_month_day: yillik davrda dekabrga tushadi", () => {
    const w = periodWindowFor("annual", utc(2026, 5, 1));
    const due = rawDueDate(
      { anchorType: "period_end_month_day", dueDay: 18, dueMonth: null, offsetDays: null },
      w,
    );
    expect(iso(due)).toBe("2026-12-18");
  });

  it("fixed_day_of_month clamps to month length (day 31 → Feb)", () => {
    const w = periodWindowFor("monthly", utc(2026, 1, 15)); // periodEnd = 2026-02-01
    const due = rawDueDate(
      { anchorType: "fixed_day_of_month", dueDay: 31, dueMonth: null, offsetDays: null },
      w,
    );
    expect(iso(due)).toBe("2026-02-28"); // 2026 kabisa emas
  });

  it("fixed_day_of_month respects leap-year February", () => {
    const w = periodWindowFor("monthly", utc(2028, 1, 10)); // 2028 kabisa; periodEnd 2028-02-01
    const due = rawDueDate(
      { anchorType: "fixed_day_of_month", dueDay: 31, dueMonth: null, offsetDays: null },
      w,
    );
    expect(iso(due)).toBe("2028-02-29");
  });

  it("fixed_day_of_month with dueMonth: annual profit tax (year after period)", () => {
    const w = periodWindowFor("annual", utc(2026, 5, 1)); // periodEnd = 2027-01-01
    const due = rawDueDate(
      { anchorType: "fixed_day_of_month", dueDay: 15, dueMonth: 3, offsetDays: null },
      w,
    );
    expect(iso(due)).toBe("2027-03-15");
  });

  it("period_end_offset: 10 days after quarter end", () => {
    const w = periodWindowFor("quarterly", utc(2026, 8, 1)); // Q3, periodEnd 2026-10-01
    const due = rawDueDate(
      { anchorType: "period_end_offset", dueDay: null, dueMonth: null, offsetDays: 10 },
      w,
    );
    // oxirgi kun = 2026-09-30, +10 kun = 2026-10-10
    expect(iso(due)).toBe("2026-10-10");
  });
});

describe("adjustForWorkday", () => {
  const plainWeekend = makeWorkdayPredicate([]); // faqat Sha/Yak dam

  it("none: sanani o'zgartirmaydi", () => {
    const sat = utc(2026, 7, 4); // Shanba
    expect(iso(adjustForWorkday(sat, "none", plainWeekend))).toBe("2026-07-04");
  });

  it("next_workday: Shanba → Dushanba", () => {
    const sat = utc(2026, 7, 4);
    expect(iso(adjustForWorkday(sat, "next_workday", plainWeekend))).toBe("2026-07-06");
  });

  it("previous_workday: Yakshanba → Juma", () => {
    const sun = utc(2026, 7, 5);
    expect(iso(adjustForWorkday(sun, "previous_workday", plainWeekend))).toBe("2026-07-03");
  });

  it("bayram kuni next_workday bilan o'tkazib yuboriladi", () => {
    const pred = makeWorkdayPredicate([
      { date: utc(2026, 9, 1), isWorkday: false, isHoliday: true }, // Mustaqillik kuni (Seshanba)
    ]);
    const due = utc(2026, 9, 1);
    expect(iso(adjustForWorkday(due, "next_workday", pred))).toBe("2026-09-02");
  });

  it("ishlaydigan Shanba override: kalendar workday desa, surilmaydi", () => {
    const pred = makeWorkdayPredicate([
      { date: utc(2026, 7, 4), isWorkday: true, isHoliday: false }, // maxsus ish Shanbasi
    ]);
    const sat = utc(2026, 7, 4);
    expect(iso(adjustForWorkday(sat, "next_workday", pred))).toBe("2026-07-04");
  });

  it("ketma-ket bayram + dam olishni sakrab o'tadi", () => {
    // Juma bayram, Sha/Yak dam → keyingi ish kuni Dushanba
    const pred = makeWorkdayPredicate([
      { date: utc(2026, 7, 3), isWorkday: false, isHoliday: true },
    ]);
    expect(iso(adjustForWorkday(utc(2026, 7, 3), "next_workday", pred))).toBe("2026-07-06");
  });
});

describe("computeDueAt (end-to-end)", () => {
  it("QQS: iyul oyi, 20-kun, dam olishga tushsa suriladi", () => {
    // 2026-08-20 Payshanba — ish kuni, surilmaydi
    const w = periodWindowFor("monthly", utc(2026, 7, 1));
    const due = computeDueAt(
      {
        anchorType: "fixed_day_of_month",
        dueDay: 20,
        dueMonth: null,
        offsetDays: null,
        adjustmentPolicy: "next_workday",
      },
      w,
      makeWorkdayPredicate([]),
    );
    expect(iso(due)).toBe("2026-08-20");
  });

  it("muddat Yakshanbaga tushsa next_workday Dushanbaga suradi", () => {
    // fevral davri; periodEnd 2026-03-01; 15-mart 2026 = Yakshanba
    const w = periodWindowFor("monthly", utc(2026, 2, 1));
    const due = computeDueAt(
      {
        anchorType: "fixed_day_of_month",
        dueDay: 15,
        dueMonth: null,
        offsetDays: null,
        adjustmentPolicy: "next_workday",
      },
      w,
      makeWorkdayPredicate([]),
    );
    // 2026-03-15 Yakshanba → 2026-03-16 Dushanba
    expect(iso(due)).toBe("2026-03-16");
  });
});

describe("helpers", () => {
  it("addDays yil chegarasidan o'tadi", () => {
    expect(iso(addDays(utc(2026, 12, 31), 1))).toBe("2027-01-01");
  });
  it("dateKey UTC YYYY-MM-DD", () => {
    expect(dateKey(new Date(Date.UTC(2026, 6, 4, 23, 59)))).toBe("2026-07-04");
  });
});
