/**
 * MATRITSA O'QISH YO'LI — sof mantiq, DB'siz.
 *
 * Eng muhim ikki xossa:
 *   1. Yozish/o'qish AYLANMA: `cellValueOf(meaningOf(v)) === v`. Bu buzilsa
 *      bayroq yoqilganda foydalanuvchi o'zi yozgan qiymatdan boshqasini ko'radi.
 *   2. Ustma-ust qo'yish QOPLANMAGAN ustunga TEGMAYDI. Bugun 42 ustundan 14
 *      tasi qoplangan — bu xossa buzilsa bayroqni yoqish 28 ustunni o'chiradi.
 */
import { describe, it, expect } from "vitest";
import { cellValueOf, monthsCovered, overlayObligations, type ObligationCell } from "./matrixRead";
import { meaningOf } from "./matrixWrite";
import { CELL_APPROVED, CELL_SUBMITTED, CELL_FAILED, CELL_KARTOTEKA } from "@/lib/reportPermissions";
import type { OperationEntry } from "@/types";

const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m, d));

const cell = (over: Partial<ObligationCell> = {}): ObligationCell => ({
  companyId: "c1",
  matrixKey: "aylanma_qqs",
  periodStart: utc(2026, 6),
  periodEnd: utc(2026, 7),
  status: "sent",
  delayReason: null,
  updatedAt: utc(2026, 6, 20),
  ...over,
});

describe("cellValueOf", () => {
  it("holat → qiymat", () => {
    expect(cellValueOf({ status: "accepted", delayReason: null })).toBe(CELL_APPROVED);
    expect(cellValueOf({ status: "sent", delayReason: null })).toBe(CELL_SUBMITTED);
    expect(cellValueOf({ status: "rejected", delayReason: null })).toBe(CELL_FAILED);
    expect(cellValueOf({ status: "in_progress", delayReason: "client_delay" })).toBe(CELL_KARTOTEKA);
  });

  it("matritsada so'zi yo'q holatlar — bo'sh katak", () => {
    // `ready` va sababsiz `in_progress`: ish boshlangan, lekin topshirilmagan.
    // Eski matritsada ham bu bo'sh katak edi.
    expect(cellValueOf({ status: "planned", delayReason: null })).toBeNull();
    expect(cellValueOf({ status: "in_progress", delayReason: null })).toBeNull();
    expect(cellValueOf({ status: "ready", delayReason: null })).toBeNull();
    expect(cellValueOf({ status: "cancelled", delayReason: null })).toBeNull();
  });

  it("yozish → o'qish AYLANMA", () => {
    for (const v of [CELL_APPROVED, CELL_SUBMITTED, CELL_FAILED, CELL_KARTOTEKA]) {
      const m = meaningOf(v);
      expect(cellValueOf({ status: m.status!, delayReason: m.markDelay ? "client_delay" : null })).toBe(v);
    }
  });
});

describe("monthsCovered", () => {
  it("oylik — bitta oy", () => {
    expect(monthsCovered(utc(2026, 6), utc(2026, 7))).toEqual(["2026-07"]);
  });

  it("choraklik — uch oy", () => {
    expect(monthsCovered(utc(2026, 6), utc(2026, 9))).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("yillik — o'n ikki oy, ya'ni yilning HAR oyida ko'rinadi", () => {
    const m = monthsCovered(utc(2026, 0), utc(2027, 0));
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2026-01");
    expect(m[11]).toBe("2026-12");
  });

  it("chegara YARIM OCHIQ — periodEnd oyi kirmaydi", () => {
    expect(monthsCovered(utc(2026, 6), utc(2026, 7))).not.toContain("2026-08");
  });

  it("yildan oshgan nuqsonli oraliq 12 oyda kesiladi", () => {
    expect(monthsCovered(utc(2020, 0), utc(2030, 0))).toHaveLength(12);
  });
});

describe("overlayObligations", () => {
  const base: OperationEntry[] = [
    {
      id: "r1", companyId: "c1", period: "2026-07",
      aylanma_qqs: CELL_APPROVED, didox: CELL_SUBMITTED, comment: "izoh",
    } as unknown as OperationEntry,
  ];

  it("QOPLANMAGAN ustun tegilmaydi — bayroq yoqilganda ma'lumot yo'qolmaydi", () => {
    const out = overlayObligations(base, [cell({ status: "rejected" })]);
    expect(out[0].didox).toBe(CELL_SUBMITTED);
    expect(out[0].comment).toBe("izoh");
  });

  it("majburiyati YO'Q davr tegilmaydi — `effectiveFrom` dan oldingi tarix saqlanadi", () => {
    // Template `effectiveFrom` idan oldingi oylarda majburiyat umuman
    // yaratilmaydi. Ustun qoplangan bo'lsa ham, o'sha oyning katagi eski
    // qiymatida qolishi shart — aks holda bayroqni yoqish tarixni o'chiradi.
    const old = [
      { id: "r0", companyId: "c1", period: "2026-03", aylanma_qqs: CELL_APPROVED } as unknown as OperationEntry,
    ];
    const out = overlayObligations(old, [cell({ status: "planned" })]);
    expect(out.find((e) => e.period === "2026-03")!.aylanma_qqs).toBe(CELL_APPROVED);
  });

  it("qoplangan ustunda majburiyat HAQIQAT", () => {
    const out = overlayObligations(base, [cell({ status: "rejected" })]);
    expect(out[0].aylanma_qqs).toBe(CELL_FAILED);
  });

  it("bo'sh holat qoplangan ustunni tozalaydi", () => {
    const out = overlayObligations(base, [cell({ status: "planned" })]);
    expect(out[0].aylanma_qqs).toBeUndefined();
  });

  it("asos O'ZGARMAYDI", () => {
    overlayObligations(base, [cell({ status: "rejected" })]);
    expect(base[0].aylanma_qqs).toBe(CELL_APPROVED);
  });

  it("hisobot qatori yo'q bo'lsa satr YARATILADI", () => {
    const out = overlayObligations([], [cell({ status: "accepted" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ companyId: "c1", period: "2026-07", aylanma_qqs: CELL_APPROVED });
  });

  it("davr `2026 Iyul` shaklida bo'lsa ham o'sha satrga tushadi", () => {
    const uz = [{ id: "r1", companyId: "c1", period: "2026 Iyul" } as unknown as OperationEntry];
    const out = overlayObligations(uz, [cell({ status: "accepted" })]);
    expect(out).toHaveLength(1);
    expect(out[0].aylanma_qqs).toBe(CELL_APPROVED);
  });

  it("yillik majburiyat yilning HAR oyida ko'rinadi", () => {
    const out = overlayObligations([], [
      cell({ matrixKey: "foyda_soliq", periodStart: utc(2026, 0), periodEnd: utc(2027, 0), status: "accepted" }),
    ]);
    expect(out).toHaveLength(12);
    expect(out.every((e) => (e as unknown as Record<string, unknown>).foyda_soliq === CELL_APPROVED)).toBe(true);
  });

  it("ziddiyat: keyin yangilangani yutadi", () => {
    const out = overlayObligations([], [
      cell({ status: "sent", updatedAt: utc(2026, 6, 10) }),
      cell({ status: "accepted", updatedAt: utc(2026, 6, 20) }),
    ]);
    expect(out[0].aylanma_qqs).toBe(CELL_APPROVED);
  });

  it("ziddiyat: bo'sh qiymat to'ldirilganini O'CHIRMAYDI", () => {
    const out = overlayObligations([], [
      cell({ status: "accepted", updatedAt: utc(2026, 6, 10) }),
      cell({ status: "planned", updatedAt: utc(2026, 6, 20) }),
    ]);
    expect(out[0].aylanma_qqs).toBe(CELL_APPROVED);
  });
});
