/**
 * Reglament: guruhda vaqtida javob bermaslik "ХАР САФАР -0.5%".
 *
 * Qoida avval uch holatli `select` edi — oyiga bitta -0.5%, ya'ni to'rt marta
 * kechikkan xodim bir marta kechikkani bilan bir xil javob berardi. Bu test
 * shu regressiyani qaytib kelishidan saqlaydi.
 */
import { describe, it, expect } from "vitest";
import { computeRuleScore } from "@/lib/kpiScoring";
import { RULES } from "@/scripts/seed-kpi-rules-v2";

const ruleByName = (name: string) => {
  const r = RULES.find((x) => x.name === name);
  if (!r) throw new Error(`Qoida topilmadi: ${name}`);
  return r as never;
};

describe("guruhda javob berish — har safar jarima", () => {
  for (const name of ["acc_group_response", "bank_group_response"]) {
    it(`${name}: har bir kechikish alohida sanaladi`, () => {
      const rule = ruleByName(name);
      const one = computeRuleScore(rule, { counters: { ontime_month: 0, late_responses: 1 } });
      const four = computeRuleScore(rule, { counters: { ontime_month: 0, late_responses: 4 } });
      expect(one.percent).toBe(-0.5);
      expect(four.percent).toBe(-2);
    });

    it(`${name}: uzilishsiz oy to'liq +1% beradi`, () => {
      const rule = ruleByName(name);
      const s = computeRuleScore(rule, { counters: { ontime_month: 1, late_responses: 0 } });
      expect(s.percent).toBe(1);
    });
  }

  // Nazoratchi matnida "хар сафар" yo'q — u uch holatli bo'lib qoladi.
  it("nazoratchi qoidasi select bo'lib qoladi", () => {
    const r = RULES.find((x) => x.name === "sup_group_response");
    expect(r?.inputTypeV2).toBe("select");
  });
});
