/**
 * DIGITAL TWIN — sof mantiq.
 *
 * Eng muhim xossa: SABAB BALLNI HOSIL QILADI. `reasons` ning yig'indisi
 * `value` ga teng bo'lmasa, ekranda ko'rsatilgan izoh raqamni tushuntirmaydi —
 * va Konstitutsiya 7-moddasi aynan shuni taqiqlaydi.
 *
 * Ikkinchisi: ma'lumot yo'q bo'lsa ball `null`, 100 EMAS.
 */
import { describe, it, expect } from "vitest";
import {
  riskScore, complianceScore, capacityLoad, explain, RISK_WEIGHTS,
  type RiskInput,
} from "./twin";

const risk = (over: Partial<RiskInput> = {}): RiskInput => ({
  overdue: 0, maxOverdueDays: 0, rejected: 0, total: 10, unanswered: 0, responsibleLoadPct: null,
  ...over,
});

const sum = (s: { reasons: { points: number }[] }) => Math.round(s.reasons.reduce((a, r) => a + r.points, 0) * 10) / 10;

describe("riskScore", () => {
  it("sabablar yig'indisi = ball", () => {
    const s = riskScore(risk({ overdue: 3, maxOverdueDays: 12, rejected: 2, unanswered: 2, responsibleLoadPct: 178 }));
    expect(sum(s)).toBe(s.value);
  });

  it("toza firma — 0 va sababi bor", () => {
    const s = riskScore(risk());
    expect(s.value).toBe(0);
    expect(s.level).toBe("low");
    expect(s.reasons[0].code).toBe("clean");
  });

  it("majburiyat yo'q — NOMA'LUM, 0 emas", () => {
    // 0 ko'rsatilsa bu firma "eng xavfsiz" bo'lib saralanadi va ko'rinmay
    // qoladi. Aynan shu ma'lumotsizlik e'tibor talab qiladi.
    const s = riskScore(risk({ total: 0 }));
    expect(s.value).toBeNull();
    expect(s.level).toBe("unknown");
  });

  it("chuqurlik sondan og'irroq", () => {
    const deep = riskScore(risk({ overdue: 1, maxOverdueDays: 30 }));
    const wide = riskScore(risk({ overdue: 10, maxOverdueDays: 1 }));
    expect(deep.value!).toBeGreaterThan(wide.value!);
  });

  it("chuqurlik to'yinadi — 30 kundan keyin o'smaydi", () => {
    const a = riskScore(risk({ maxOverdueDays: 30 }));
    const b = riskScore(risk({ maxOverdueDays: 300 }));
    expect(a.value).toBe(b.value);
    expect(a.value).toBe(RISK_WEIGHTS.depth);
  });

  it("normal yuklama xavf QO'SHMAYDI", () => {
    expect(riskScore(risk({ responsibleLoadPct: 95 })).value).toBe(0);
    expect(riskScore(risk({ responsibleLoadPct: 150 })).value).toBeGreaterThan(0);
  });

  it("hammasi eng yomon — 100 dan oshmaydi", () => {
    const s = riskScore(risk({ overdue: 10, maxOverdueDays: 90, rejected: 10, unanswered: 9, responsibleLoadPct: 400 }));
    expect(s.value).toBe(100);
    expect(s.level).toBe("high");
  });
});

describe("complianceScore", () => {
  it("hammasi o'z vaqtida — 100", () => {
    const s = complianceScore({ onTime: 8, closed: 8, overdueOpen: 0 });
    expect(s.value).toBe(100);
    expect(s.level).toBe("low");
  });

  it("ochiq qolgan kechikkanlar ham MAXRAJDA", () => {
    // Aks holda kechikkan ishni yopmaslik muvofiqlikni oshirardi.
    const s = complianceScore({ onTime: 5, closed: 5, overdueOpen: 5 });
    expect(s.value).toBe(50);
  });

  it("muddati kelmagan bo'lsa — NOMA'LUM", () => {
    expect(complianceScore({ onTime: 0, closed: 0, overdueOpen: 0 }).value).toBeNull();
  });
});

describe("capacityLoad", () => {
  const item = (m: number, w = 1) => ({ normativeMinutes: m, complexityWeight: w });

  it("murakkablik mehnatni ko'paytiradi", () => {
    const plain = capacityLoad({ items: [item(60)], availableMinutes: 600 });
    const hard = capacityLoad({ items: [item(60, 2.5)], availableMinutes: 600 });
    expect(plain.value).toBe(10);
    expect(hard.value).toBe(25);
  });

  it("sig'imdan oshsa — 100 dan yuqori va `high`", () => {
    const s = capacityLoad({ items: [item(600), item(600)], availableMinutes: 600 });
    expect(s.value).toBe(200);
    expect(s.level).toBe("high");
  });

  it("ish fondi noma'lum — ball ham noma'lum", () => {
    expect(capacityLoad({ items: [item(60)], availableMinutes: 0 }).value).toBeNull();
  });

  it("ish yo'q — 0, `null` emas", () => {
    // Farq muhim: "o'lchadik, bo'sh" ≠ "o'lchay olmadik".
    expect(capacityLoad({ items: [], availableMinutes: 600 }).value).toBe(0);
  });
});

describe("explain", () => {
  it("raqamni sababi bilan aytadi", () => {
    const s = riskScore(risk({ overdue: 2, maxOverdueDays: 5 }));
    const text = explain("Risk", s);
    expect(text).toContain(String(s.value));
    expect(text).toContain("2/10 muddati o'tgan");
  });

  it("noma'lum ballni 0 deb ko'rsatmaydi", () => {
    expect(explain("Risk", riskScore(risk({ total: 0 })))).toContain("noma'lum");
  });
});
