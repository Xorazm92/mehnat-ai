/**
 * Yo'qlik puli o'rinbosarga (sof, DB'siz).
 *
 * Asosiy invariant: pul YARATILMAYDI va YO'QOLMAYDI — yo'qlik uchun yechilgan
 * summa aynan o'rinbosarga o'tadi. Shuning uchun testlar summani jarimaning
 * o'ziga solishtiradi, "taxminan to'g'ri" ga emas.
 */
import { describe, it, expect } from "vitest";
import { computeCoverTransfers, VACATION_COVER_SHARE, type CoverInput } from "@/lib/shiftCover";

const COMPANIES = [
  { companyId: "c1", contractAmount: 5_000_000 },
  { companyId: "c2", contractAmount: 3_000_000 },
];

const cover = (over: Partial<CoverInput> = {}): CoverInput => ({
  date: new Date("2026-07-06T00:00:00Z"),
  absentUserId: "absent",
  coverUserId: "cover",
  companyId: null,
  kind: "absence",
  ...over,
});

describe("computeCoverTransfers", () => {
  it("moves exactly the penalty: one absent day at -1% of each contract", () => {
    const out = computeCoverTransfers([cover()], COMPANIES, 1);
    expect(out).toHaveLength(2);
    // 1% of 5,000,000 = 50,000 — the same figure payroll deducts from the absentee.
    expect(out.find((t) => t.companyId === "c1")!.amount).toBe(50_000);
    expect(out.find((t) => t.companyId === "c2")!.amount).toBe(30_000);
  });

  it("scopes to one firm when the cover names a company", () => {
    const out = computeCoverTransfers([cover({ companyId: "c2" })], COMPANIES, 1);
    expect(out).toHaveLength(1);
    expect(out[0].companyId).toBe("c2");
    expect(out[0].amount).toBe(30_000);
  });

  it("accumulates days into one row per (cover, company)", () => {
    const days = [
      cover({ date: new Date("2026-07-06T00:00:00Z"), companyId: "c1" }),
      cover({ date: new Date("2026-07-07T00:00:00Z"), companyId: "c1" }),
      cover({ date: new Date("2026-07-08T00:00:00Z"), companyId: "c1" }),
    ];
    const out = computeCoverTransfers(days, COMPANIES, 1);
    expect(out).toHaveLength(1);
    expect(out[0].days).toBe(3);
    expect(out[0].amount).toBe(150_000);
  });

  it("vacation transfers only half — the employee keeps 50%", () => {
    const out = computeCoverTransfers([cover({ companyId: "c1", kind: "vacation" })], COMPANIES, 1);
    expect(out[0].amount).toBe(50_000 * VACATION_COVER_SHARE);
  });

  it("uses the role's own rate — bank-klient/nazoratchi are -0.25%", () => {
    const out = computeCoverTransfers([cover({ companyId: "c1" })], COMPANIES, 0.25);
    expect(out[0].amount).toBe(12_500);
  });

  it("splits between two different substitutes", () => {
    const out = computeCoverTransfers(
      [
        cover({ companyId: "c1", coverUserId: "sub-a" }),
        cover({ date: new Date("2026-07-07T00:00:00Z"), companyId: "c1", coverUserId: "sub-b" }),
      ],
      COMPANIES,
      1
    );
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.coverUserId).sort()).toEqual(["sub-a", "sub-b"]);
    expect(out.every((t) => t.amount === 50_000)).toBe(true);
  });

  it("refuses to pay someone for covering themselves", () => {
    const out = computeCoverTransfers([cover({ coverUserId: "absent" })], COMPANIES, 1);
    expect(out).toEqual([]);
  });

  it("returns nothing when there is no rate or no company", () => {
    expect(computeCoverTransfers([cover()], COMPANIES, 0)).toEqual([]);
    expect(computeCoverTransfers([cover()], [], 1)).toEqual([]);
  });

  it("ignores a cover pointing at a company the employee does not serve", () => {
    const out = computeCoverTransfers([cover({ companyId: "unknown" })], COMPANIES, 1);
    expect(out).toEqual([]);
  });
});
