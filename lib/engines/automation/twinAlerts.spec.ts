/**
 * BALL OGOHLANTIRISHI — tanlov mantig'i.
 *
 * Eng muhim ikki xossa: chegaradan O'TGANLARgina tanlanadi, va o'lchanmagan
 * ball hech qachon xabar qilmaydi. Uchinchisi — takrorlanish kaliti: daraja
 * unda bo'lishi kerak, aks holda yomonlashish jimgina o'tib ketardi.
 */
import { describe, it, expect } from "vitest";
import { selectAlerts, alertDedupKey, ALERT_THRESHOLDS, type AlertSubject } from "./twinAlerts";

const subj = (over: Partial<AlertSubject> = {}): AlertSubject => ({
  id: "c1", name: "Firma", value: 50, level: "high", reasons: ["3 ta muddat o'tgan"],
  ...over,
});

describe("selectAlerts", () => {
  it("chegaradan yuqorisi tanlanadi", () => {
    const out = selectAlerts("risk", [subj({ value: ALERT_THRESHOLDS.risk + 0.1 })], "2026-08");
    expect(out).toHaveLength(1);
  });

  it("chegarada turgani tanlanmaydi", () => {
    expect(selectAlerts("risk", [subj({ value: ALERT_THRESHOLDS.risk })], "2026-08")).toHaveLength(0);
  });

  it("O'LCHANMAGAN ball xabar qilmaydi", () => {
    // Ma'lumot yo'qligi xavf emas — bu boshqa muammo va uni xabar hal qilmaydi.
    expect(selectAlerts("risk", [subj({ value: null, level: "unknown" })], "2026-08")).toHaveLength(0);
  });

  it("sig'imning chegarasi boshqa", () => {
    const s = [subj({ value: 120 })];
    expect(selectAlerts("risk", s, "2026-08")).toHaveLength(1);
    expect(selectAlerts("capacity", s, "2026-08")).toHaveLength(0);
    expect(selectAlerts("capacity", [subj({ value: 160 })], "2026-08")).toHaveLength(1);
  });

  it("eng yomoni birinchi", () => {
    const out = selectAlerts("risk", [subj({ id: "a", value: 40 }), subj({ id: "b", value: 90 })], "2026-08");
    expect(out.map((a) => a.subjectId)).toEqual(["b", "a"]);
  });

  it("matnda raqam ham, sababi ham bor", () => {
    const [a] = selectAlerts("risk", [subj({ value: 42, reasons: ["3 ta muddat o'tgan", "2 javobsiz savol"] })], "2026-08");
    expect(a.text).toContain("42%");
    expect(a.text).toContain("2 javobsiz savol");
  });
});

describe("alertDedupKey", () => {
  it("daraja o'zgarsa kalit HAM o'zgaradi — yomonlashish yangi xabar", () => {
    const a = alertDedupKey("risk", "c1", "medium", "2026-08");
    const b = alertDedupKey("risk", "c1", "high", "2026-08");
    expect(a).not.toBe(b);
  });

  it("davr o'zgarsa kalit o'zgaradi — har oy yangidan", () => {
    expect(alertDedupKey("risk", "c1", "high", "2026-08")).not.toBe(
      alertDedupKey("risk", "c1", "high", "2026-09"),
    );
  });

  it("bir xil holat — bir xil kalit, ya'ni takror yuborilmaydi", () => {
    expect(alertDedupKey("risk", "c1", "high", "2026-08")).toBe(alertDedupKey("risk", "c1", "high", "2026-08"));
  });

  it("tur kalitga kiradi — xavf va yuklama aralashmaydi", () => {
    expect(alertDedupKey("risk", "x", "high", "2026-08")).not.toBe(alertDedupKey("capacity", "x", "high", "2026-08"));
  });
});
