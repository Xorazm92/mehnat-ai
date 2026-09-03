/**
 * KPI ball dvigatelining chegaralari — DB'siz, sof funksiyalar.
 *
 * Bu yerda "kod ishlayapti" emas, "raqam to'g'ri" tekshiriladi: har bir holat
 * uchun kutilgan qiymat qo'lda hisoblab yozilgan.
 */
import { describe, it, expect } from "vitest";
import {
  computeRuleScore,
  capKpiPercent,
  applyRuleOverride,
  kpiBall,
  kpiDaraja,
  type KpiRuleLike,
} from "@/lib/kpiScoring";

// Reglamentdagi haqiqiy qoidalar shakli (scripts/seed-kpi-rules-v2.ts).
const selectRule = (bonus: number, penalty: number): KpiRuleLike => ({
  inputTypeV2: "select",
  maxBonus: bonus,
  maxPenalty: penalty,
  options: [
    { key: "green", color: "green", coeff: bonus },
    { key: "yellow", color: "yellow", coeff: 0 },
    { key: "red", color: "red", coeff: penalty },
  ],
});

const attendanceRule: KpiRuleLike = {
  inputTypeV2: "counter",
  maxBonus: 1.0,
  maxPenalty: null,
  options: [
    { key: "early_days", color: "green", coeff_per_unit: 0.04, max_coeff: 1.0 },
    { key: "late_5min", color: "red", coeff_per_unit: -0.1, max_coeff: -0.5 },
  ],
};

const amountRule: KpiRuleLike = {
  inputTypeV2: "amount_penalty",
  maxBonus: 0,
  maxPenalty: null,
  options: [{ key: "red", color: "red", coeff: null }],
};

describe("computeRuleScore — select qoidalari", () => {
  it("yashil koeffitsiyentni beradi", () => {
    expect(computeRuleScore(selectRule(0.25, -0.25), { selectedOption: "green" }).percent).toBe(0.25);
  });

  it("sariq — neytral 0, qizil — manfiy", () => {
    expect(computeRuleScore(selectRule(0.2, -0.2), { selectedOption: "yellow" }).percent).toBe(0);
    expect(computeRuleScore(selectRule(0.2, -0.2), { selectedOption: "red" }).percent).toBe(-0.2);
  });

  it("tanlanmagan (yoki mavjud bo'lmagan) variant — 0 va rangsiz", () => {
    const r = computeRuleScore(selectRule(1, -1), { selectedOption: "yashil" });
    expect(r.percent).toBe(0);
    expect(r.color).toBeNull();
  });

  it("konvert koeffitsiyentdan kichik bo'lsa, konvert g'olib", () => {
    const rule: KpiRuleLike = { ...selectRule(1, -1), maxBonus: 0.25, maxPenalty: -0.25 };
    expect(computeRuleScore(rule, { selectedOption: "green" }).percent).toBe(0.25);
    expect(computeRuleScore(rule, { selectedOption: "red" }).percent).toBe(-0.25);
  });
});

describe("computeRuleScore — counter qoidalari", () => {
  it("har kun uchun koeffitsiyent qo'shiladi", () => {
    // 10 kun × 0.04 = 0.4
    expect(computeRuleScore(attendanceRule, { counters: { early_days: 10 } }).percent).toBe(0.4);
  });

  it("max_coeff musbat tomondan qirqadi", () => {
    // 30 × 0.04 = 1.2 → 1.0
    expect(computeRuleScore(attendanceRule, { counters: { early_days: 30 } }).percent).toBe(1);
  });

  it("max_coeff manfiy tomondan ham qirqadi (Face ID ishonchsizligi)", () => {
    // 20 × −0.1 = −2.0 → −0.5
    expect(computeRuleScore(attendanceRule, { counters: { late_5min: 20 } }).percent).toBe(-0.5);
  });

  it("bonus va jarima bir vaqtda — yig'indi", () => {
    // 20×0.04 = 0.8, 2×−0.1 = −0.2 → 0.6
    const r = computeRuleScore(attendanceRule, { counters: { early_days: 20, late_5min: 2 } });
    expect(r.percent).toBe(0.6);
    expect(r.color).toBe("green");
  });

  it("noma'lum counter kaliti hech narsa qo'shmaydi", () => {
    expect(computeRuleScore(attendanceRule, { counters: { kech_qolgan: 99 } }).percent).toBe(0);
  });

  it("hisob nol bo'lsa natija ham nol (neytral)", () => {
    const r = computeRuleScore(attendanceRule, { counters: { early_days: 0, late_5min: 0 } });
    expect(r.percent).toBe(0);
    expect(r.color).toBe("yellow");
  });
});

describe("computeRuleScore — so'mli jarima", () => {
  it("summa foizga aylanmaydi, fixedPenalty bo'lib qaytadi", () => {
    const r = computeRuleScore(amountRule, { penaltyAmount: 250_000 });
    expect(r.percent).toBe(0);
    expect(r.fixedPenalty).toBe(250_000);
    expect(r.color).toBe("red");
  });

  it("manfiy summa qabul qilinmaydi (0 ga tushadi)", () => {
    expect(computeRuleScore(amountRule, { penaltyAmount: -5000 }).fixedPenalty).toBe(0);
  });
});

describe("capKpiPercent — bonus qirqiladi, jarima to'planadi", () => {
  it("buxgalter bonusi 5% da to'xtaydi", () => {
    expect(capKpiPercent([4, 4, 4], "accountant")).toBe(5);
  });

  it("bank-klientda 2.5%, nazoratchida 1%", () => {
    expect(capKpiPercent([2, 2], "bank_client")).toBe(2.5);
    expect(capKpiPercent([0.5, 0.5, 0.5], "supervisor")).toBe(1);
  });

  it("jarima chegaralanmaydi", () => {
    expect(capKpiPercent([-3, -4], "accountant")).toBe(-7);
  });

  it("bonus qirqilgach jarima ustiga qo'shiladi", () => {
    // bonus 4+4 = 8 → 5; jarima −2 → 3
    expect(capKpiPercent([4, 4, -2], "accountant")).toBe(3);
  });

  it("bo'sh ro'yxat — 0", () => {
    expect(capKpiPercent([], "accountant")).toBe(0);
  });

  it("bosh buxgalter konverti nol — bonus berilmaydi, jarima qoladi", () => {
    expect(capKpiPercent([3, 2], "chief_accountant")).toBe(0);
    expect(capKpiPercent([3, -1], "chief_accountant")).toBe(-1);
  });
});

describe("applyRuleOverride — firma bo'yicha sozlama", () => {
  it("override bo'lmasa qoida o'zgarmaydi", () => {
    const rule = selectRule(0.25, -0.25);
    expect(applyRuleOverride(rule, null)).toBe(rule);
  });

  it("isActive=false — qoida bu firmaga tegishli emas, ball 0", () => {
    const rule = applyRuleOverride(selectRule(1, -1), { isActive: false });
    expect(computeRuleScore(rule, { selectedOption: "green" }).percent).toBe(0);
    expect(computeRuleScore(rule, { selectedOption: "red" }).percent).toBe(0);
  });

  it("mukofot/jarima foizi almashtiriladi", () => {
    const rule = applyRuleOverride(selectRule(0.25, -0.25), {
      isActive: true,
      rewardPercent: 0.5,
      penaltyPercent: 0.75,
    });
    expect(computeRuleScore(rule, { selectedOption: "green" }).percent).toBe(0.5);
    expect(computeRuleScore(rule, { selectedOption: "red" }).percent).toBe(-0.75);
  });

  it("counter qoidasiga override qo'llanmaydi (bitta koeffitsiyent yo'q)", () => {
    const rule = applyRuleOverride(attendanceRule, { isActive: true, rewardPercent: 9 });
    expect(computeRuleScore(rule, { counters: { early_days: 10 } }).percent).toBe(0.4);
  });
});

describe("kpiBall / kpiDaraja — o'lchanmagan ≠ nol ≠ yuz", () => {
  it("baholanmagan xodim — null", () => {
    expect(kpiBall(0, 0)).toBeNull();
    expect(kpiDaraja(null)).toBeNull();
  });

  it("hammasi yashil — 100, hammasi qizil — 0", () => {
    expect(kpiBall(7, 0)).toBe(100);
    expect(kpiBall(0, 3)).toBe(0);
  });

  it("aralash — yaxlitlangan foiz", () => {
    expect(kpiBall(2, 1)).toBe(67);
  });

  it("daraja chegaralari — chegaraning O'ZI yuqori darajada", () => {
    expect(kpiDaraja(85)).toBe("excellent");
    expect(kpiDaraja(84)).toBe("good");
    expect(kpiDaraja(70)).toBe("good");
    expect(kpiDaraja(69)).toBe("fair");
    expect(kpiDaraja(60)).toBe("fair");
    expect(kpiDaraja(59)).toBe("poor");
    expect(kpiDaraja(0)).toBe("poor");
    expect(kpiDaraja(100)).toBe("excellent");
  });
});

describe("determinizm", () => {
  it("bir xil kirish — bir xil natija", () => {
    const input = { counters: { early_days: 17, late_5min: 3 } };
    const a = computeRuleScore(attendanceRule, input);
    const b = computeRuleScore(attendanceRule, input);
    expect(a).toEqual(b);
  });

  it("suzuvchi nuqta xatosi ko'rinmaydi (2 xonaga yaxlitlanadi)", () => {
    // 3 × 0.04 = 0.12000000000000001 xom hisobda
    expect(computeRuleScore(attendanceRule, { counters: { early_days: 3 } }).percent).toBe(0.12);
  });
});
