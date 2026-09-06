/**
 * SHABLON DAVRIYLIGI O'ZGARGANDA ESKI MAJBURIYATLAR YOPILADI.
 *
 * M2 auditida o'lchangan nuqson: generator mavjud majburiyatni FAQAT joriy
 * oyna kaliti bilan qidiradi (`@@unique([companyId, templateId, periodStart,
 * periodEnd])`). Template `quarterly` dan `monthly` ga o'tsa oyna butunlay
 * boshqa bo'ladi, ya'ni eski qoida bo'yicha yaratilgan qatorlar o'sha qidiruvga
 * umuman tushmaydi: na yangilanadi, na bekor qilinadi. Ular abadiy `planned`
 * bo'lib qoladi, `/deadlines` da ish bo'lib ko'rinadi va `obligationSweep` ular
 * uchun eskalatsiya bosqichlarini qayd eta boshlaydi.
 *
 * Lokal bazada (2026-09-06) shunday 1 004 qator turgan edi: `AYLANMA_SOLIQ` va
 * `AYLANMA_TOLOV` (choraklik→oylik, 2×233), `FOYDA_YILLIK` va `FOYDA_TOLOV`
 * (yillik→choraklik, 2×269).
 *
 * Ikki blok:
 *   A. `periodKeyMatchesPeriodicity` — sof shakl qoidasi (DB kerak emas).
 *   B. Generator o'sha qoidani QO'LLAYDIMI — haqiqiy bazaga qarshi.
 *
 * B bloki `generateObligations` orqali boradi, chunki `cancelStaleRuleObligations`
 * eksport qilinmagan (modul ichidagi yordamchi) — uni to'g'ridan-to'g'ri chaqirib
 * bo'lmaydi. Bu afzalroq ham: tekshiruv DB'dagi HAQIQIY natijani o'lchaydi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { Periodicity } from "@prisma/client";

const { prisma } = await import("@/lib/prisma");
const { periodKeyMatchesPeriodicity, periodWindowFor } = await import(
  "@/lib/engines/obligation/deadlines"
);
const { generateObligations } = await import("@/lib/engines/obligation/obligations");
const { toSubject } = await import("@/lib/domains/accounting/subjects");

// ─────────────────────────────────────────────────────────
// A. SOF SHAKL QOIDASI
// ─────────────────────────────────────────────────────────

describe("periodKeyMatchesPeriodicity — shakl qoidasi", () => {
  describe("monthly", () => {
    it.each(["2026-M01", "2026-M07", "2026-M12", "2095-M09"])("%s → true", (key) => {
      expect(periodKeyMatchesPeriodicity(key, "monthly")).toBe(true);
    });

    it.each([
      ["2026-M00", "oy 00 yo'q"],
      ["2026-M13", "oy 13 yo'q"],
      ["2026-M7", "oy ikki raqamli bo'lishi shart"],
      ["2026-Q3", "choraklik shakli"],
      ["2026-Y", "yillik shakli"],
      ["26-M07", "yil to'rt raqamli bo'lishi shart"],
      ["2026-M07x", "ortiqcha belgi"],
      ["", "bo'sh satr"],
    ])("%s → false (%s)", (key) => {
      expect(periodKeyMatchesPeriodicity(key, "monthly")).toBe(false);
    });
  });

  describe("quarterly", () => {
    it.each(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"])("%s → true", (key) => {
      expect(periodKeyMatchesPeriodicity(key, "quarterly")).toBe(true);
    });

    it.each([
      ["2026-Q0", "chorak 0 yo'q"],
      ["2026-Q5", "chorak 5 yo'q"],
      ["2026-Q", "raqamsiz"],
      ["2026-M07", "oylik shakli"],
      ["2026-Y", "yillik shakli"],
      ["", "bo'sh satr"],
    ])("%s → false (%s)", (key) => {
      expect(periodKeyMatchesPeriodicity(key, "quarterly")).toBe(false);
    });
  });

  describe("annual", () => {
    it.each(["2026-Y", "2095-Y"])("%s → true", (key) => {
      expect(periodKeyMatchesPeriodicity(key, "annual")).toBe(true);
    });

    it.each([
      ["2026-Y1", "ortiqcha raqam"],
      ["2026-M07", "oylik shakli"],
      ["2026-Q3", "choraklik shakli"],
      ["", "bo'sh satr"],
    ])("%s → false (%s)", (key) => {
      expect(periodKeyMatchesPeriodicity(key, "annual")).toBe(false);
    });
  });

  /**
   * NOMA'LUM DAVRIYLIK — BUGUNGI XATTI-HARAKATNI QAYD ETADI, TALAB EMAS.
   *
   * Funksiya `monthly`/`quarterly` ni aniq tekshiradi, QOLGAN HAMMASI esa
   * yillik shoxiga tushadi (`return /^\d{4}-Y$/...`). Ya'ni noma'lum qiymat
   * bilan chaqirilganda javob "har doim false" EMAS: "2026-Y" uchun `true`
   * qaytadi.
   *
   * Bugun bu xavfsiz, chunki `Periodicity` enumida atigi uchta qiymat bor va
   * ustun NOT NULL — noma'lum qiymat DB'dan kela olmaydi. Test shu bog'liqlikni
   * KO'RINADIGAN qiladi: enumga to'rtinchi qiymat qo'shilsa u jimgina "yillik"
   * deb hisoblanadi va aynan shu test qulaydi.
   */
  describe("noma'lum davriylik — yillik shoxiga tushadi (qayd etilgan holat)", () => {
    const unknown = null as unknown as Periodicity;

    it("yillik shakli noma'lum davriylikda ham true qaytaradi", () => {
      expect(periodKeyMatchesPeriodicity("2026-Y", unknown)).toBe(true);
    });

    it("oylik va choraklik shakllari esa false", () => {
      expect(periodKeyMatchesPeriodicity("2026-M07", unknown)).toBe(false);
      expect(periodKeyMatchesPeriodicity("2026-Q3", unknown)).toBe(false);
      expect(periodKeyMatchesPeriodicity("", unknown)).toBe(false);
    });
  });

  /**
   * IKKI FUNKSIYA YONMA-YON TURSIN.
   *
   * Shakl qoidasi `periodWindowFor` yozadigan kalitdan nusxa olingan. Agar
   * o'sha yerda format o'zgarsa (masalan "2026-M7"), qoida jimgina yolg'on
   * gapira boshlaydi va generator HAMMA majburiyatni "eski qoida" deb bekor
   * qilib yuboradi. Shuning uchun bog'liqlik test bilan mahkamlanadi.
   */
  describe("periodWindowFor yozgan kalit o'z davriyligiga har doim mos keladi", () => {
    const periodicities: Periodicity[] = ["monthly", "quarterly", "annual"];
    const refs = [
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 5, 15)),
      new Date(Date.UTC(2026, 8, 30)),
      new Date(Date.UTC(2026, 11, 31)),
    ];

    for (const p of periodicities) {
      for (const ref of refs) {
        it(`${p} · ${ref.toISOString().slice(0, 10)}`, () => {
          const { periodKey } = periodWindowFor(p, ref);
          expect(periodKeyMatchesPeriodicity(periodKey, p)).toBe(true);
        });
      }
    }
  });
});

// ─────────────────────────────────────────────────────────
// B. GENERATOR QOIDANI QO'LLAYDIMI
// ─────────────────────────────────────────────────────────

const TAG = `vitest-stale-${Date.now()}`;
const SVC = `${TAG}-svc`; // faqat sinov firmasi ega bo'ladigan xizmat kaliti
/** 2095-06-15 → oylik oyna 2095-06-01..2095-07-01, kalit "2095-M06". */
const REF = new Date(Date.UTC(2095, 5, 15));

/** `cancelStaleRuleObligations` yozadigan izoh — matn aynan shu bo'lishi kerak. */
const STALE_NOTE = "Shablon davriyligi o'zgardi — bu majburiyat eski qoida bo'yicha yaratilgan edi";

const ids = { user: "", company: "", template: "" };

/**
 * Generatsiyani FAQAT sinov firmasiga cheklaydi — `loadCompanySubjects` butun
 * bazani yuklaydi va umumiy test bazasida minglab qator yaratadi.
 */
const onlyTestCompany = async () => {
  const c = await prisma.company.findUniqueOrThrow({
    where: { id: ids.company },
    select: {
      id: true, isActive: true, companyStatus: true, contractDate: true,
      taxRegime: true, statsType: true, activeServices: true,
      accountantId: true, supervisorId: true, chiefAccountantId: true,
    },
  });
  return [toSubject(c)];
};

/** Sinov majburiyati — oyna kaliti (`@@unique`) har safar boshqacha bo'lsin. */
async function seed(periodKey: string, startYear: number, startMonth: number, endYear: number, endMonth: number) {
  await prisma.obligation.create({
    data: {
      companyId: ids.company,
      templateId: ids.template,
      templateVersion: 1,
      periodStart: new Date(Date.UTC(startYear, startMonth - 1, 1)),
      periodEnd: new Date(Date.UTC(endYear, endMonth - 1, 1)),
      periodKey,
      dueAt: new Date(Date.UTC(endYear, endMonth - 1, 20)),
      status: "planned",
    },
  });
}

/** Sinov shablonining majburiyatlari — kalit bo'yicha holat xaritasi. */
async function statusByKey(): Promise<Record<string, string>> {
  const rows = await prisma.obligation.findMany({
    where: { companyId: ids.company, templateId: ids.template },
    select: { periodKey: true, status: true },
  });
  return Object.fromEntries(rows.map((r) => [r.periodKey, r.status as string]));
}

async function staleEvents() {
  return prisma.obligationStatusEvent.findMany({
    where: { obligation: { companyId: ids.company, templateId: ids.template } },
    select: { fromStatus: true, toStatus: true, byUserId: true, note: true },
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${TAG}@v.local`, fullName: `${TAG} acc`, passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  ids.user = user.id;

  const company = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`,
      inn: String(Date.now()).slice(-9),
      taxRegime: "vat",
      isActive: true,
      companyStatus: "active",
      contractDate: new Date(Date.UTC(2095, 0, 1)),
      accountantId: user.id,
      activeServices: [SVC],
    },
    select: { id: true },
  });
  ids.company = company.id;

  // OYLIK shablon. Sinovning butun mazmuni shunda: quyida yaratiladigan
  // yillik/choraklik qatorlar shu shablonning BUGUNGI qoidasiga mos emas.
  const template = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-MONTHLY`,
      name: "Test oylik shablon",
      obligationType: "tax_declaration",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 20,
      adjustmentPolicy: "none",
      effectiveFrom: new Date(Date.UTC(2095, 0, 1)),
      version: 1,
      lifecycle: "active",
      active: true,
      applicability: { create: [{ criteriaType: "service_key", criteriaValue: SVC }] },
    },
    select: { id: true },
  });
  ids.template = template.id;
});

// Har holat o'z fikstura'si bilan boshlansin: generator har yurishda joriy
// oyna uchun yangi qator ham yaratadi, u keyingi holatga aralashmasin.
// `ObligationStatusEvent` majburiyat bilan birga kaskadda o'chadi.
beforeEach(async () => {
  await prisma.obligation.deleteMany({ where: { companyId: ids.company } });
});

afterAll(async () => {
  await prisma.obligation.deleteMany({ where: { companyId: ids.company } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.templateApplicability.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("generateObligations — eski davriylik qoldiqlarini yopadi", () => {
  it("yopadigan narsa yo'q — hech nima bekor qilinmaydi", async () => {
    await generateObligations(prisma, { ref: REF, loadSubjects: onlyTestCompany });

    const byKey = await statusByKey();
    expect(Object.values(byKey)).not.toContain("cancelled");
    expect(await staleEvents()).toHaveLength(0);
  });

  it("hammasi joriy qoidaga mos (oylik) — hech nima bekor qilinmaydi", async () => {
    await seed("2095-M08", 2095, 8, 2095, 9);
    await seed("2095-M09", 2095, 9, 2095, 10);
    await seed("2095-M10", 2095, 10, 2095, 11);

    await generateObligations(prisma, { ref: REF, loadSubjects: onlyTestCompany });

    const byKey = await statusByKey();
    expect(byKey["2095-M08"]).toBe("planned");
    expect(byKey["2095-M09"]).toBe("planned");
    expect(byKey["2095-M10"]).toBe("planned");
    expect(await staleEvents()).toHaveLength(0);
  });

  it("hammasi eski qoidadan (yillik + choraklik) — uchalasi ham bekor qilinadi", async () => {
    await seed("2095-Y", 2095, 1, 2096, 1);
    await seed("2096-Y", 2096, 1, 2097, 1);
    await seed("2095-Q4", 2095, 10, 2096, 1);

    await generateObligations(prisma, { ref: REF, loadSubjects: onlyTestCompany });

    const byKey = await statusByKey();
    expect(byKey["2095-Y"]).toBe("cancelled");
    expect(byKey["2096-Y"]).toBe("cancelled");
    expect(byKey["2095-Q4"]).toBe("cancelled");

    const events = await staleEvents();
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.fromStatus).toBe("planned");
      expect(e.toStatus).toBe("cancelled");
      // Avtomatik qaror — ortida odam yo'q.
      expect(e.byUserId).toBeNull();
      expect(e.note).toBe(STALE_NOTE);
    }
  });

  it("aralash — faqat eski qoidadagilari bekor qilinadi", async () => {
    await seed("2095-M08", 2095, 8, 2095, 9); // joriy qoidaga mos — tegilmaydi
    await seed("2095-Y", 2095, 1, 2096, 1);
    await seed("2095-Q4", 2095, 10, 2096, 1);

    await generateObligations(prisma, { ref: REF, loadSubjects: onlyTestCompany });

    const byKey = await statusByKey();
    expect(byKey["2095-M08"]).toBe("planned");
    expect(byKey["2095-Y"]).toBe("cancelled");
    expect(byKey["2095-Q4"]).toBe("cancelled");

    const events = await staleEvents();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.note === STALE_NOTE)).toBe(true);
  });
});
