/**
 * Dalil → uch holatli baho (sof, DB'siz).
 *
 * Bu funksiya pul beradi va pul yechadi, shuning uchun har bir shoxi qulflangan.
 * Eng muhimi — TASDIQLANGAN kechikish sababi jarimani bekor qilishi: ikki
 * bosqichli jarayon (belgilash + menejer tasdig'i) ASRO ning adolat kafolati.
 */
import { describe, it, expect } from "vitest";
import { verdictForObligation, combineVerdicts, ruleAcceptsVerdict, EXCUSED_DELAY_REASONS } from "@/lib/kpiEvidence";
import { computeRuleScore } from "@/lib/kpiScoring";

const DUE = new Date("2026-07-25T00:00:00Z");
const BEFORE = new Date("2026-07-24T10:00:00Z");
const AFTER = new Date("2026-07-27T10:00:00Z");
const NOW_PAST_DUE = new Date("2026-07-30T00:00:00Z");
const NOW_BEFORE_DUE = new Date("2026-07-20T00:00:00Z");

const ob = (over: Partial<Parameters<typeof verdictForObligation>[0]> = {}) => ({
  status: "planned",
  dueAt: DUE,
  completedAt: null,
  delayReason: null,
  delayApprovedById: null,
  ...over,
});

describe("verdictForObligation", () => {
  it("green when accepted on or before the due date", () => {
    expect(verdictForObligation(ob({ status: "accepted", completedAt: BEFORE }), NOW_PAST_DUE)).toBe("green");
    expect(verdictForObligation(ob({ status: "accepted", completedAt: DUE }), NOW_PAST_DUE)).toBe("green");
  });

  it("red when accepted late", () => {
    expect(verdictForObligation(ob({ status: "accepted", completedAt: AFTER }), NOW_PAST_DUE)).toBe("red");
  });

  it("red when rejected, and when the deadline simply passed undone", () => {
    expect(verdictForObligation(ob({ status: "rejected" }), NOW_PAST_DUE)).toBe("red");
    expect(verdictForObligation(ob({ status: "planned" }), NOW_PAST_DUE)).toBe("red");
    expect(verdictForObligation(ob({ status: "in_progress" }), NOW_PAST_DUE)).toBe("red");
  });

  it("no verdict while the deadline is still in the future", () => {
    // Oy tugamagan — hukm qilish erta, aks holda har oy boshida hamma qizil bo'lardi.
    expect(verdictForObligation(ob({ status: "planned" }), NOW_BEFORE_DUE)).toBeNull();
  });

  it("no verdict for cancelled work", () => {
    expect(verdictForObligation(ob({ status: "cancelled" }), NOW_PAST_DUE)).toBeNull();
  });

  describe("manager-approved delay excuses the penalty", () => {
    it.each([...EXCUSED_DELAY_REASONS])("excludes %s once approved", (reason) => {
      const late = ob({ status: "planned", delayReason: reason, delayApprovedById: "mgr-1" });
      expect(verdictForObligation(late, NOW_PAST_DUE)).toBeNull();
    });

    it("a MARKED but unapproved reason still counts against the employee", () => {
      // Ikki bosqich: faqat belgilash yetarli emas, aks holda har kim o'zini
      // sababli deb belgilab jarimadan qutulardi.
      const marked = ob({ status: "planned", delayReason: "client_delay", delayApprovedById: null });
      expect(verdictForObligation(marked, NOW_PAST_DUE)).toBe("red");
    });

    it("accountant_delay is never excused, even when approved", () => {
      const own = ob({ status: "planned", delayReason: "accountant_delay", delayApprovedById: "mgr-1" });
      expect(verdictForObligation(own, NOW_PAST_DUE)).toBe("red");
    });

    it("excuses a late ACCEPTED obligation too, not just an overdue one", () => {
      const lateButExcused = ob({
        status: "accepted",
        completedAt: AFTER,
        delayReason: "external_authority",
        delayApprovedById: "mgr-1",
      });
      expect(verdictForObligation(lateButExcused, NOW_PAST_DUE)).toBeNull();
    });
  });
});

describe("combineVerdicts — bir qoidaga bir nechta majburiyat tushganda", () => {
  it("one late report poisons the whole rule", () => {
    // QQS, INPS, daromad-agent va soliq-jadvali — to'rttasi ham acc_taxes_report.
    // Bittasi kechiksa, reglament bo'yicha hisobot kechikkan hisoblanadi.
    expect(combineVerdicts(["green", "green", "red", "green"])).toBe("red");
  });

  it("green only when every obligation was on time", () => {
    expect(combineVerdicts(["green", "green", "green"])).toBe("green");
    expect(combineVerdicts(["green"])).toBe("green");
  });

  it("yellow sits between — worse than green, better than red", () => {
    expect(combineVerdicts(["green", "yellow"])).toBe("yellow");
    expect(combineVerdicts(["yellow", "red"])).toBe("red");
  });

  it("no evidence means no verdict, not a zero", () => {
    // Bo'sh ro'yxat "hammasi yaxshi" degani EMAS — baho umuman qo'yilmaydi.
    expect(combineVerdicts([])).toBeNull();
  });

  it("is order-independent", () => {
    // Avvalgi kod oxirgi ishlangan majburiyatni g'olib qilardi, ya'ni natija
    // sikl tartibiga bog'liq edi.
    expect(combineVerdicts(["red", "green"])).toBe(combineVerdicts(["green", "red"]));
  });
});

describe("ruleAcceptsVerdict — hukm tushmaydigan qoidaga yozilmaydi", () => {
  // `LETTERS` shabloni `acc_letters` ga xaritalangan, u esa COUNTER qoida:
  // kalitlari `received_letters` / `resolved_letters`, `selectedOption` ni
  // umuman o'qimaydi. Hukm shunga uzatilganda `computeRuleScore` jimgina 0
  // qaytarardi va qator bazaga `selectedOption='red'`, `calculatedScore=0`
  // bo'lib tushardi: nazoratchining ekranida qizil, oylikda esa nol. Prodda
  // shundayi 212 ta — 2026-07 ning har bir firmasi uchun bittadan.
  const counterRule = {
    options: [
      { key: "received_letters", coeff_per_unit: 0 },
      { key: "resolved_letters", coeff_per_unit: 0 },
    ],
  };
  const selectRule = {
    options: [
      { key: "green", coeff: 0.2 },
      { key: "yellow", coeff: 0 },
      { key: "red", coeff: -0.2 },
    ],
  };

  it("counter qoidasi uch holatli hukmni qabul qilmaydi", () => {
    expect(ruleAcceptsVerdict(counterRule, "red")).toBe(false);
    expect(ruleAcceptsVerdict(counterRule, "green")).toBe(false);
  });

  it("select qoidasi qabul qiladi", () => {
    expect(ruleAcceptsVerdict(selectRule, "red")).toBe(true);
    expect(ruleAcceptsVerdict(selectRule, "green")).toBe(true);
    expect(ruleAcceptsVerdict(selectRule, "yellow")).toBe(true);
  });

  it("chala sozlangan qoida ham chetda qoladi", () => {
    // Qizil varianti yo'q qoidaga qizil hukm yozilsa, ball 0 bo'lardi.
    expect(ruleAcceptsVerdict({ options: [{ key: "green", coeff: 1 }] }, "red")).toBe(false);
    expect(ruleAcceptsVerdict({ options: null }, "red")).toBe(false);
    expect(ruleAcceptsVerdict({ options: "buzuq" }, "green")).toBe(false);
  });

  it("hukm qabul qilinsa, ball haqiqatan hisoblanadi", () => {
    // Qo'riqchi kerakli qatorni to'sib qo'ymasligini ham qulflaymiz.
    expect(ruleAcceptsVerdict(selectRule, "red")).toBe(true);
    expect(computeRuleScore({ inputTypeV2: "select", options: selectRule.options }, { selectedOption: "red" }).percent).toBe(-0.2);
    expect(computeRuleScore({ inputTypeV2: "counter", options: counterRule.options }, { selectedOption: "red" }).percent).toBe(0);
  });
});
