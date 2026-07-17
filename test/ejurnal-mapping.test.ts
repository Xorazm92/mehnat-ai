/**
 * Pure unit tests for the e-jurnal normalization/mapping (no API, no DB).
 * Everything that depends on the real e-jurnal response shape is isolated here.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeEjurnalRows,
  mapStatus,
  timeOnly,
  digitsOnly,
  buildEjurnalPayload,
  matchUserId,
} from "@/lib/ejurnal";

describe("normalizeEjurnalRows", () => {
  it("handles array, {data}, {results} and field aliases", () => {
    expect(normalizeEjurnalRows([{ full_name: "Aziz", check_in: "08:20" }])[0].fullName).toBe("Aziz");
    expect(normalizeEjurnalRows({ data: [{ name: "Bek" }] })[0].fullName).toBe("Bek");
    expect(normalizeEjurnalRows({ results: [{ fullName: "Dil", checkIn: "09:10" }] })[0].checkIn).toBe("09:10");
    expect(normalizeEjurnalRows(null)).toEqual([]);
  });
});

describe("mapStatus", () => {
  it("maps uz/ru/en variants to ASRO statuses", () => {
    expect(mapStatus("kechikdi")).toBe("late");
    expect(mapStatus("sababli")).toBe("excused");
    expect(mapStatus("kelmadi")).toBe("absent");
    expect(mapStatus("keldi")).toBe("present");
    expect(mapStatus("unknown-junk")).toBe("present");
  });
});

describe("timeOnly / digitsOnly", () => {
  it("extracts HH:mm from ISO/time strings", () => {
    expect(timeOnly("2026-07-17T08:05:00Z")).toBe("08:05");
    expect(timeOnly("9:07")).toBe("09:07");
    expect(timeOnly(undefined)).toBeUndefined();
  });
  it("keeps only digits of a phone", () => {
    expect(digitsOnly("+998 (90) 123-45-67")).toBe("998901234567");
  });
});

describe("buildEjurnalPayload", () => {
  it("computes lateness and source from the check-in", () => {
    const p = buildEjurnalPayload({ fullName: "X", status: "keldi", checkIn: "09:20" }, "2026-07-17");
    expect(p.status).toBe("late");
    expect(p.lateMinutes).toBe(20);
    expect(p.source).toBe("ejurnal");
    expect(p.checkIn).toBeInstanceOf(Date);
  });

  it("trusts the check-in over a stale 'late' status", () => {
    const p = buildEjurnalPayload({ fullName: "X", status: "kechikdi", checkIn: "08:40" }, "2026-07-17");
    expect(p.status).toBe("present");
    expect(p.lateMinutes).toBe(0);
  });

  it("keeps absent/excused when there is no check-in", () => {
    expect(buildEjurnalPayload({ fullName: "X", status: "kelmadi" }, "2026-07-17").status).toBe("absent");
    expect(buildEjurnalPayload({ fullName: "X", status: "sababli" }, "2026-07-17").lateMinutes).toBe(0);
  });
});

describe("matchUserId", () => {
  const byPhone = new Map([["998901112233", "u1"]]);
  const byName = new Map([["aziz aliyev", "u2"]]);

  it("matches by phone first, then full name", () => {
    expect(matchUserId({ fullName: "?", phone: "+998 90 111 22 33", status: "" }, byPhone, byName)).toBe("u1");
    expect(matchUserId({ fullName: "Aziz Aliyev", status: "" }, byPhone, byName)).toBe("u2");
    expect(matchUserId({ fullName: "Noma'lum", status: "" }, byPhone, byName)).toBeUndefined();
  });
});
