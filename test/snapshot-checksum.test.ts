/**
 * Snapshot checksum — sof (DB'siz) testlar: determinizm, tasdiqlash, buzilishni
 * aniqlash. Snapshot "immutable + checksum" juftligi: DB trigger o'zgartirishni
 * taqiqlaydi, checksum esa chetlab o'tilgan har qanday o'zgarishni fosh qiladi.
 */
import { describe, it, expect } from "vitest";
import { computeSnapshotChecksum, verifySnapshotChecksum, type SnapshotFinancials } from "@/lib/snapshot";

const base: SnapshotFinancials = {
  period: "2026-01",
  companyId: null,
  openingBalance: 10_000_000,
  closingBalance: 14_200_000,
  income: 5_000_000,
  outflow: 800_000,
  payrollTotal: 300_000,
  cashIn: 5_000_000,
  cashOut: 800_000,
  ledgerBalance: 14_200_000,
  profit: 4_200_000,
  loss: 0,
  employeeCount: 12,
  companyCount: 34,
};

describe("snapshot checksum", () => {
  it("is deterministic for identical figures", () => {
    expect(computeSnapshotChecksum(base)).toBe(computeSnapshotChecksum({ ...base }));
    expect(computeSnapshotChecksum(base)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies a stored checksum", () => {
    const sum = computeSnapshotChecksum(base);
    expect(verifySnapshotChecksum(base, sum)).toBe(true);
  });

  it("detects tampering with any financial field", () => {
    const sum = computeSnapshotChecksum(base);
    expect(verifySnapshotChecksum({ ...base, closingBalance: 14_200_001 }, sum)).toBe(false);
    expect(verifySnapshotChecksum({ ...base, income: 5_000_000.01 }, sum)).toBe(false);
    expect(verifySnapshotChecksum({ ...base, employeeCount: 13 }, sum)).toBe(false);
    expect(verifySnapshotChecksum({ ...base, period: "2026-02" }, sum)).toBe(false);
  });

  it("treats a missing checksum as unverified", () => {
    expect(verifySnapshotChecksum(base, null)).toBe(false);
    expect(verifySnapshotChecksum(base, undefined)).toBe(false);
    expect(verifySnapshotChecksum(base, "")).toBe(false);
  });

  it("normalises float noise to 2 decimals (no false alarms)", () => {
    const sum = computeSnapshotChecksum(base);
    expect(verifySnapshotChecksum({ ...base, income: 5_000_000.0000001 }, sum)).toBe(true);
  });
});
