/**
 * NORMATIV TARIF JADVALI (P1).
 *
 * Jadval TAXMIN, lekin taxmin ham tekshiriladigan bo'lishi kerak. Bu testlar
 * ikki narsani ushlab turadi:
 *
 *   1. QAMROV. Bazadagi HAR BIR shablon jadvalda bor. Bu eng muhim da'vo:
 *      topshiriqdagi dastlabki ro'yxat `AYL_DECL`, `IJT_SUG_DECL`,
 *      `STAT_HISOBOT`, `1-TOMOR` kabi ASROda MAVJUD BO'LMAGAN kodlarni
 *      sanagan edi. 21 kalitdan atigi 5 tasi mos kelardi, qolgan 35 shablon
 *      esa jimgina standart 45 daqiqaga tushib, jadval "to'ldirilgan"
 *      bo'lib ko'rinardi. Yangi shablon qo'shilib, tarifi yozilmasa —
 *      shu test qulaydi.
 *   2. ORALIQ. Bitta normativ bitta ish kunidan (8 soat) oshmaydi, aks holda
 *      sig'im hisobi ma'nosiz bo'ladi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL) — faqat qamrov testi uchun.
 */
import { describe, it, expect, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const {
  NORMATIVE_PRESETS,
  NORMATIVE_RATES,
  DEFAULT_PRESET_MINUTES,
  MAX_NORMATIVE_MINUTES,
  presetFor,
} = await import("@/lib/domains/accounting/normativePresets");
const { normativeEffort } = await import("@/lib/domains/accounting/normativeEffort");

afterAll(async () => {
  await prisma.$disconnect();
});

describe("qamrov", () => {
  it("bazadagi HAR BIR shablon tarif jadvalida bor", async () => {
    const rows = await prisma.deadlineTemplate.findMany({ select: { code: true } });
    expect(rows.length).toBeGreaterThan(0);

    const missing = rows.map((r) => r.code).filter((code) => !(code in NORMATIVE_PRESETS));
    // Bo'sh massiv — qaysi kod yetishmayotgani xato matnida ko'rinadi.
    expect(missing).toEqual([]);
  });

  it("noma'lum kod standartga tushadi, yiqilmaydi", () => {
    expect(presetFor("HECH_QACHON_BO'LMAGAN_KOD")).toBe(DEFAULT_PRESET_MINUTES);
    expect(presetFor("")).toBe(DEFAULT_PRESET_MINUTES);
  });
});

describe("oraliq", () => {
  it("har bir qiymat 1 va 480 (bitta ish kuni) orasida", () => {
    const bad = Object.entries(NORMATIVE_PRESETS).filter(
      ([, m]) => !Number.isInteger(m) || m < 1 || m > MAX_NORMATIVE_MINUTES,
    );
    expect(bad).toEqual([]);
  });
});

describe("tarif mantiqi", () => {
  it("davr uzunlashgani sari normativ o'sadi", () => {
    // Oylik < choraklik < yillik. Teskarisi bo'lsa sig'im hisobi choraklik
    // ishni oylikdan yengil deb ko'rsatardi.
    expect(NORMATIVE_RATES.monthlyDeclaration).toBeLessThan(NORMATIVE_RATES.quarterlyReport);
    expect(NORMATIVE_RATES.quarterlyReport).toBeLessThan(NORMATIVE_RATES.annualReport);
    // To'lov har doim o'z hisobotidan yengil — deklaratsiya tayyor bo'ladi.
    expect(NORMATIVE_RATES.monthlyPayment).toBeLessThan(NORMATIVE_RATES.monthlyDeclaration);
    expect(NORMATIVE_RATES.quarterlyPayment).toBeLessThan(NORMATIVE_RATES.quarterlyReport);
  });

  it("jadval bir xil raqamdan iborat emas", () => {
    // Hamma 45 bo'lsa jadval hech nimani ifodalamasdi — standart bilan bir xil.
    const distinct = new Set(Object.values(NORMATIVE_PRESETS));
    expect(distinct.size).toBeGreaterThanOrEqual(5);
  });

  it("`estimated` bayrog'i bazadagi qiymat bilan o'chadi — ekishning narxi shu", () => {
    // Bugungi holat: ustun bo'sh ⇒ standart + "taxminiy" belgisi.
    expect(normativeEffort({ normativeMinutes: null, obligationType: "tax_declaration" }).estimated).toBe(true);
    // Skript --apply dan keyin: qiymat bor ⇒ taxmin TASDIQLANGAN norma
    // bo'lib ko'rinadi. Shuning uchun ekish qo'lda va ongli qaror.
    const seeded = normativeEffort({ normativeMinutes: presetFor("QQS_DECL"), obligationType: "tax_declaration" });
    expect(seeded.estimated).toBe(false);
    expect(seeded.minutes).toBe(NORMATIVE_RATES.monthlyDeclaration);
  });
});
