/**
 * Dalil → uch holatli baho (sof, DB'siz).
 *
 * Bu funksiya pul beradi va pul yechadi, shuning uchun har bir shoxi qulflangan.
 * Eng muhimi — TASDIQLANGAN kechikish sababi jarimani bekor qilishi: ikki
 * bosqichli jarayon (belgilash + menejer tasdig'i) ASRO ning adolat kafolati.
 */
import { describe, it, expect } from "vitest";
import { verdictForObligation, combineVerdicts, EXCUSED_DELAY_REASONS } from "@/lib/kpiEvidence";

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
