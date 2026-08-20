import { describe, it, expect } from "vitest";
import { ALL_SERVICE_KEYS, BASE_REPORT_COLUMNS, serviceEnabled, serviceGroups } from "./reportColumns";

/**
 * 7-NINE dagi shikoyat: "QQS to'lov ishlamayapti" — katak "—" bo'lib
 * qulflangan edi. Sabab `activeServices` ro'yxatlarida `*_tolov` kalitlari
 * yo'qligi edi (uch joyda qo'lda yozilgan, uchalasi ham eskirgan).
 */
describe("xizmat kalitlari", () => {
  it("barcha to'lov kalitlari ro'yxatda bor", () => {
    const missing = BASE_REPORT_COLUMNS.filter((c) => c.payKey && !ALL_SERVICE_KEYS.includes(c.payKey!));
    expect(missing.map((c) => c.payKey)).toEqual([]);
  });

  it("guruhlangan ro'yxat ham to'liq", () => {
    const grouped = new Set(serviceGroups().flatMap((g) => g.keys));
    expect([...ALL_SERVICE_KEYS].filter((k) => !grouped.has(k))).toEqual([]);
  });

  it("bo'sh ro'yxat — hamma ustun yoqilgan", () => {
    expect(serviceEnabled([], "qqs_tolov", "qqs")).toBe(true);
    expect(serviceEnabled(null, "qqs_tolov", "qqs")).toBe(true);
  });

  it("to'lov yarmi hisobot yarmidan meros oladi", () => {
    // Eski firmalarda ro'yxat faqat hisobot kalitlaridan iborat.
    expect(serviceEnabled(["qqs"], "qqs_tolov", "qqs")).toBe(true);
  });

  it("ustun umuman yoqilmagan bo'lsa — yopiq", () => {
    expect(serviceEnabled(["inps"], "qqs_tolov", "qqs")).toBe(false);
    expect(serviceEnabled(["inps"], "qqs")).toBe(false);
  });
});
