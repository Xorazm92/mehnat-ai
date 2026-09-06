/**
 * XIZMAT KALITLARI — NEGA OMMAVIY BIRIKTIRISH XAVFLI (P3).
 *
 * Topshiriq "258 firmaga xizmat biriktirish, kerak bo'lsa default
 * STANDART_BUXGALTER" edi. Bu testlar shu qadamning NARXINI o'lchaydi.
 *
 * Uch da'vo:
 *
 *   1. Firmalar bugun ham majburiyat OLADI. 40 shablondan 17 tasida
 *      applicability qoidasi yo'q va `templateApplies` bo'sh mezonda `true`
 *      qaytaradi — ular universal. Bazadagi 7 221 ta majburiyat shundan.
 *      Ya'ni "258 firmada hech narsa generatsiya qilinmaydi" — noto'g'ri.
 *   2. `service_key` darvozasi ISHLAYDI: kalit yo'q firmaga shablon
 *      tushmaydi. Bu — himoya, nuqson emas.
 *   3. Kalit qo'shilishi bilan QONUNIY soliq majburiyati paydo bo'ladi.
 *      Shuning uchun kalitni taxmin bilan yozish mavjud bo'lmagan soliq
 *      uchun muddat, eskilatsiya va KPI jarimasi yaratadi — buni faqat
 *      bosh buxgalter hal qiladi.
 *
 * SOF — baza kerak emas (`templateApplies` sof funksiya).
 */
import { describe, it, expect } from "vitest";
import { templateApplies, isSubjectEligible } from "@/lib/engines/obligation/applicability";
import { companyAttributes } from "@/lib/domains/accounting/subjects";

const REF = new Date(Date.UTC(2026, 8, 6));

/** Bazadagi tipik firma: turnover rejimi, hech qanday xizmat kaliti yo'q. */
function firm(activeServices: string[] = [], taxRegime = "turnover") {
  return {
    id: "c1",
    isActive: true,
    status: "active",
    startedAt: new Date(Date.UTC(2025, 0, 1)),
    attributes: companyAttributes({
      taxRegime,
      statsType: null,
      companyStatus: "active",
      activeServices,
    } as never),
  };
}

describe("universal shablonlar — hamma firmaga tushadi", () => {
  it("mezonsiz shablon kalitsiz firmaga ham tegishli", () => {
    // 17 ta shablon aynan shunday (LETTERS, PNL_REPORT, PAYROLL_CALC…).
    // Bazadagi 482 tadan majburiyat shulardan keladi.
    const f = firm([]);
    expect(isSubjectEligible(f, REF)).toBe(true);
    expect(templateApplies([], f)).toBe(true);
  });

  it("soliq rejimi bo'yicha darvoza kalitsiz ham ishlaydi", () => {
    // QQS_DECL `tax_regime=vat`, AYLANMA_SOLIQ `tax_regime=turnover`.
    const vat = [{ criteriaType: "tax_regime", criteriaValue: "vat" }];
    expect(templateApplies(vat, firm([], "vat"))).toBe(true);
    expect(templateApplies(vat, firm([], "turnover"))).toBe(false);
  });
});

describe("service_key darvozasi", () => {
  it("kalit yo'q firmaga shablon TUSHMAYDI — bu himoya", () => {
    const yerSoliq = [{ criteriaType: "service_key", criteriaValue: "yer_soligi" }];
    expect(templateApplies(yerSoliq, firm([]))).toBe(false);
  });

  it("kalit qo'shilishi bilan QONUNIY majburiyat paydo bo'ladi", () => {
    // Ommaviy biriktirishning narxi shu: firma yer solig'i to'lamasa ham
    // tizim unga muddat yaratadi, kechiktiradi va buxgalterga jarima yozadi.
    const yerSoliq = [{ criteriaType: "service_key", criteriaValue: "yer_soligi" }];
    expect(templateApplies(yerSoliq, firm(["yer_soligi"]))).toBe(true);

    // Uchta statistika + uchta soliq shabloni bir yo'la yoqilsa — bitta
    // firmada oltita soxta majburiyat.
    const gated = ["yer_soligi", "suv_soligi", "mol_mulk_soligi", "ekologiya"];
    const f = firm(gated);
    const applied = gated.filter((k) =>
      templateApplies([{ criteriaType: "service_key", criteriaValue: k }], f),
    );
    expect(applied).toEqual(gated);
  });

  it("bir shablonda bir necha kalit — OR mantiqi", () => {
    const crit = [
      { criteriaType: "service_key", criteriaValue: "stat_4_qx" },
      { criteriaType: "service_key", criteriaValue: "stat_4_fx" },
    ];
    expect(templateApplies(crit, firm(["stat_4_fx"]))).toBe(true);
    expect(templateApplies(crit, firm(["boshqa"]))).toBe(false);
  });
});
