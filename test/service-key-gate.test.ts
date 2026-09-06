/**
 * service_key DARVOZASI — biznes qoidasining testi.
 *
 * Bu fayl "kod ishlayapti" ni emas, MIGRATSIYA QARORINI qotiradi:
 * qaysi firma tegiladi, qaysisi tegilmaydi va NEGA. Har bir holat bosh
 * buxgalter tasdiqlagan qoidaga bog'langan (docs/plan/matrixkey-mapping-audit.md).
 *
 * Sof funksiyalar — DB kerak emas.
 */
import { describe, it, expect } from "vitest";
import { templateApplies, type SubjectFacts } from "@/lib/engines/obligation/applicability";
import { companyAttributes } from "@/lib/domains/accounting/subjects";
import { needsServiceKeyRule, gateVerdict, gateScope } from "@/lib/domains/accounting/serviceKeyGate";

/** Prod ustunlaridan qurilgan firma — atributlar haqiqiy proyeksiyadan chiqadi. */
const firm = (o: {
  id?: string;
  taxRegime?: string;
  activeServices?: string[];
  statsType?: string | null;
}): SubjectFacts => ({
  id: o.id ?? "co",
  isActive: true,
  status: "active",
  startedAt: new Date("2026-01-01"),
  attributes: companyAttributes({
    id: o.id ?? "co",
    isActive: true,
    companyStatus: "active",
    contractDate: new Date("2026-01-01"),
    taxRegime: o.taxRegime ?? "vat",
    statsType: o.statsType ?? null,
    activeServices: o.activeServices ?? [],
    accountantId: null,
    supervisorId: null,
    chiefAccountantId: null,
  }),
});

const svc = (key: string) => [{ criteriaType: "service_key", criteriaValue: key }];

// ─────────────────────────────────────────────────────────────
// §1 Xizmat kaliti darvozasi
// ─────────────────────────────────────────────────────────────
describe("§1 service_key darvozasi", () => {
  it("xizmat bor → majburiyat yaratiladi", () => {
    expect(templateApplies(svc("tovar_ostatka"), firm({ activeServices: ["tovar_ostatka", "qqs"] }))).toBe(true);
  });

  it("xizmat yo'q → majburiyat YARATILMAYDI", () => {
    expect(templateApplies(svc("tovar_ostatka"), firm({ activeServices: ["qqs", "xatlar"] }))).toBe(false);
  });

  it("boshqa xizmat majburiyatlariga ta'sir qilmaydi", () => {
    // `tovar_ostatka` qoidasi qo'shilgani `qqs` shablonini o'zgartirmaydi.
    const f = firm({ activeServices: ["qqs"] });
    expect(templateApplies(svc("tovar_ostatka"), f)).toBe(false);
    expect(templateApplies(svc("qqs"), f)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// §2 Bo'sh activeServices — "bilmaymiz", "topshirmaydi" EMAS
// ─────────────────────────────────────────────────────────────
describe("§2 kalitsiz firma avtomatik 'mos emas' qilinmaydi", () => {
  it("engine uchun bo'sh ro'yxat mos emas — aynan shu sabab migratsiya ularni chetlab o'tadi", () => {
    expect(templateApplies(svc("tovar_ostatka"), firm({ activeServices: [] }))).toBe(false);
  });

  it("darvoza qarori: bo'sh ro'yxat 'missing_key' emas, 'unknown_no_keys'", () => {
    expect(gateVerdict("tovar_ostatka", { id: "a", activeServices: [] })).toBe("unknown_no_keys");
    expect(gateVerdict("tovar_ostatka", { id: "b", activeServices: ["qqs"] })).toBe("missing_key");
    expect(gateVerdict("tovar_ostatka", { id: "c", activeServices: ["tovar_ostatka"] })).toBe("has_key");
  });

  it("qamrov: kalitsiz firmalar alohida to'plamga chiqadi, tegiladiganlarga QO'SHILMAYDI", () => {
    const s = gateScope("tovar_ostatka", [
      { id: "bor", activeServices: ["tovar_ostatka"] },
      { id: "yoq", activeServices: ["qqs"] },
      { id: "bosh1", activeServices: [] },
      { id: "bosh2", activeServices: [] },
    ]);
    expect(s.hasKey.map((c) => c.id)).toEqual(["bor"]);
    expect(s.missingKey.map((c) => c.id)).toEqual(["yoq"]);
    expect(s.excluded.map((c) => c.id)).toEqual(["bosh1", "bosh2"]);
  });
});

// ─────────────────────────────────────────────────────────────
// §3 AND semantikasi — mavjud mezon YO'QOLMAYDI, TORAYADI
// ─────────────────────────────────────────────────────────────
describe("§3 tax_regime + service_key → AND", () => {
  const qqsRule = [
    { criteriaType: "tax_regime", criteriaValue: "vat" },
    { criteriaType: "service_key", criteriaValue: "qqs" },
  ];

  it("QQS to'lovchi + qqs kaliti → mos", () => {
    expect(templateApplies(qqsRule, firm({ taxRegime: "vat", activeServices: ["qqs"] }))).toBe(true);
  });

  it("QQS to'lovchi, lekin qqs kaliti YO'Q → mos emas (prodda 13 firma shu holatda)", () => {
    expect(templateApplies(qqsRule, firm({ taxRegime: "vat", activeServices: ["xatlar"] }))).toBe(false);
  });

  it("qqs kaliti bor, lekin rejim vat emas → mos emas (rejim darvozasi saqlanadi)", () => {
    expect(templateApplies(qqsRule, firm({ taxRegime: "turnover", activeServices: ["qqs"] }))).toBe(false);
  });
});

describe("§3b turnover + service_key → AND", () => {
  const aylanmaRule = [
    { criteriaType: "tax_regime", criteriaValue: "turnover" },
    { criteriaType: "service_key", criteriaValue: "aylanma" },
  ];

  it("aylanma rejimi + aylanma kaliti → mos", () => {
    expect(templateApplies(aylanmaRule, firm({ taxRegime: "turnover", activeServices: ["aylanma"] }))).toBe(true);
  });

  it("aylanma rejimi, kaliti yo'q → mos emas (prodda 22 firma shu holatda)", () => {
    expect(templateApplies(aylanmaRule, firm({ taxRegime: "turnover", activeServices: ["qqs"] }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// §4 Universal shablon — faqat haqiqatan mezonsiz bo'lsa
// ─────────────────────────────────────────────────────────────
describe("§4 universal shablon", () => {
  it("mezon umuman yo'q → universal", () => {
    expect(templateApplies([], firm({ activeServices: [] }))).toBe(true);
  });

  it("bitta mezon qo'shilishi bilan universal bo'lmay qoladi", () => {
    expect(templateApplies(svc("qqs"), firm({ activeServices: [] }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// §5 Audit aniqlagichi — matrixKey bor, service_key qoidasi yo'q
// ─────────────────────────────────────────────────────────────
describe("§5 migratsiya nomzodini aniqlash", () => {
  it("matrixKey bor + service_key qoidasi yo'q → nomzod", () => {
    expect(needsServiceKeyRule({ matrixKey: "tovar_ostatka", applicability: [] })).toBe(true);
  });

  it("boshqa mezoni bor, lekin service_key yo'q → baribir nomzod (AYLANMA_SOLIQ holati)", () => {
    expect(
      needsServiceKeyRule({
        matrixKey: "aylanma",
        applicability: [{ criteriaType: "tax_regime", criteriaValue: "turnover" }],
      }),
    ).toBe(true);
  });

  it("service_key qoidasi allaqachon bor → nomzod EMAS", () => {
    expect(
      needsServiceKeyRule({ matrixKey: "qqs", applicability: [{ criteriaType: "service_key", criteriaValue: "qqs" }] }),
    ).toBe(false);
  });

  it("matrixKey yo'q → nomzod emas (bog'lanadigan ustun yo'q)", () => {
    expect(needsServiceKeyRule({ matrixKey: null, applicability: [] })).toBe(false);
  });
});
