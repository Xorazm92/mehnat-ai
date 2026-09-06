/**
 * AI DA'VO SHARTNOMASI (M5.1).
 *
 * PRODUCT.md 4-va'dasi: "AI aytgan har bir raqam UI'dagi raqamga TENG".
 * Bu va'dani matn ustida tekshirib bo'lmaydi — satr ichidagi "18 500 000"
 * qayerdan kelganini na ekran, na test bila oladi. Shuning uchun raqam
 * matndan ajratilgan: `AssistantResult.claims[]`.
 *
 * Bu testlar shartnomaning SHAKLINI qulflaydi: majburiy maydonlar, vakolat
 * oralig'i va bo'sh ro'yxatning ma'nosi.
 *
 * SOF — DB kerak emas.
 */
import { describe, it, expect } from "vitest";
import { claim, aiClaimSchema, AI_CONFIDENCE, type AiClaim } from "@/lib/ai/claim";

const base = {
  value: 18_500_000,
  unit: "so'm",
  label: "Artel Logistics — qoldiq",
  sourceTool: "getCompanyBalance",
  sourceQuery: "lib/debt.ts#listDebtors(companyId=x, scope=all)",
};

describe("AiClaim — to'liq maydonlar", () => {
  it("qurilgan da'voda hamma majburiy maydon bor", () => {
    const c = claim({ ...base, asOf: new Date(Date.UTC(2026, 8, 6)) });
    expect(c.value).toBe(18_500_000);
    expect(c.unit).toBe("so'm");
    expect(c.label).toContain("Artel");
    expect(c.sourceTool).toBe("getCompanyBalance");
    // Manba SO'ROVI ham majburiy — nosozlik izlashda birinchi savol.
    expect(c.sourceQuery).toContain("lib/debt.ts");
    expect(c.asOf).toBe("2026-09-06T00:00:00.000Z");
    expect(c.confidence).toBe(AI_CONFIDENCE.system);
  });

  it("`confidence` standarti — tizimning o'z hisobi (0.7), 1.0 EMAS", () => {
    // 1.0 tashqi vakolat (soliq kvitansiyasi) uchun ajratilgan. ASROning o'z
    // hisobini vakolatli deb belgilash shkalani ma'nosiz qilardi.
    expect(claim(base).confidence).toBe(0.7);
    expect(AI_CONFIDENCE.authority).toBe(1);
    expect(AI_CONFIDENCE.operator).toBe(0.4);
  });

  it("`confidence` 0..1 oralig'idan chiqsa rad etiladi", () => {
    expect(() => claim({ ...base, confidence: 1.5 })).toThrow();
    expect(() => claim({ ...base, confidence: -0.1 })).toThrow();
  });

  it("majburiy maydon bo'sh bo'lsa rad etiladi", () => {
    expect(() => claim({ ...base, unit: "" })).toThrow();
    expect(() => claim({ ...base, label: "" })).toThrow();
    expect(() => claim({ ...base, sourceTool: "" })).toThrow();
    expect(() => claim({ ...base, sourceQuery: "" })).toThrow();
    // NaN/Infinity raqam emas — ekranda "NaN so'm" chiqarardi.
    expect(() => claim({ ...base, value: Number.NaN })).toThrow();
  });

  it("shart (`conditions`) ixtiyoriy, lekin berilsa saqlanadi", () => {
    const c = claim({ ...base, conditions: ["offset chiqarib tashlangan"] });
    expect(c.conditions).toEqual(["offset chiqarib tashlangan"]);
    expect(claim(base).conditions).toBeUndefined();
  });

  it("sxema tashqaridan kelgan obyektni ham tekshiradi", () => {
    const ok: AiClaim = aiClaimSchema.parse({ ...base, asOf: new Date().toISOString(), confidence: 0.7 });
    expect(ok.value).toBe(base.value);
    expect(() => aiClaimSchema.parse({ ...base })).toThrow(); // asOf/confidence yo'q
  });
});
