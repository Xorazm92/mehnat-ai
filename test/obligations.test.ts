/**
 * OBLIGATION GENERATOR — idempotent generatsiya, applicability va disable override.
 * Live Postgres kerak. Test service_key applicability bilan FAQAT o'z test
 * kompaniyasiga izolyatsiya qilinadi (dev DB'dagi real kompaniyalarga tegmaydi).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { generateObligations } = await import("@/lib/obligations");

const TAG = `vitest-obl-${Date.now()}`;
const SVC = `${TAG}-svc`; // faqat test kompaniyasi ega bo'ladigan xizmat kaliti
const REF = new Date(Date.UTC(2097, 6, 15)); // 2097-07-15 → davr 2097-M07

const ids = { user: "", company: "", t1: "", t2: "" };

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${TAG}@vitest.local`, fullName: `${TAG} acc`, passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  ids.user = user.id;

  const company = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`,
      inn: "000000000",
      taxRegime: "vat",
      isActive: true,
      companyStatus: "active",
      contractDate: new Date(Date.UTC(2097, 0, 1)),
      accountantId: user.id,
      activeServices: [SVC],
    },
    select: { id: true },
  });
  ids.company = company.id;

  // t1: universal-ish, lekin service_key bilan test kompaniyasiga cheklangan.
  const t1 = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-QQS`,
      name: "Test QQS",
      obligationType: "tax_declaration",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 20,
      adjustmentPolicy: "none", // deterministik dueAt = 2097-08-20
      effectiveFrom: new Date(Date.UTC(2097, 0, 1)),
      version: 1,
      lifecycle: "active",
      active: true,
      applicability: { create: [{ criteriaType: "service_key", criteriaValue: SVC }] },
    },
    select: { id: true },
  });
  ids.t1 = t1.id;

  // t2: service_key mos, LEKIN tax_regime=turnover → vat kompaniyaga mos EMAS.
  const t2 = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-TURN`,
      name: "Test turnover-only",
      obligationType: "tax_declaration",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 15,
      adjustmentPolicy: "none",
      effectiveFrom: new Date(Date.UTC(2097, 0, 1)),
      version: 1,
      lifecycle: "active",
      active: true,
      applicability: {
        create: [
          { criteriaType: "service_key", criteriaValue: SVC },
          { criteriaType: "tax_regime", criteriaValue: "turnover" },
        ],
      },
    },
    select: { id: true },
  });
  ids.t2 = t2.id;
});

afterAll(async () => {
  await prisma.obligation.deleteMany({ where: { templateId: { in: [ids.t1, ids.t2] } } });
  await prisma.companyObligationOverride.deleteMany({ where: { companyId: ids.company } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: { in: [ids.t1, ids.t2] } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("generateObligations", () => {
  it("creates one obligation for the eligible+applicable company, with snapshot", async () => {
    const res = await generateObligations(prisma, { ref: REF, createdBy: ids.user });
    expect(res.created).toBeGreaterThanOrEqual(1);

    const obl = await prisma.obligation.findFirst({
      where: { companyId: ids.company, templateId: ids.t1, periodKey: "2097-M07" },
    });
    expect(obl).toBeTruthy();
    expect(obl!.status).toBe("planned");
    expect(obl!.templateVersion).toBe(1);
    expect(obl!.responsibleUserId).toBe(ids.user); // kompaniya buxgalteri snapshot
    expect(obl!.dueAt.toISOString().slice(0, 10)).toBe("2097-08-20"); // fixed 20, none policy
  });

  it("does NOT create for a non-applicable template (vat vs turnover)", async () => {
    const obl = await prisma.obligation.findFirst({ where: { companyId: ids.company, templateId: ids.t2 } });
    expect(obl).toBeNull();
  });

  it("is idempotent — a second run creates nothing new", async () => {
    const res = await generateObligations(prisma, { ref: REF, createdBy: ids.user });
    expect(res.created).toBe(0);
    expect(res.skippedExisting).toBeGreaterThanOrEqual(1);

    const count = await prisma.obligation.count({
      where: { companyId: ids.company, templateId: ids.t1, periodKey: "2097-M07" },
    });
    expect(count).toBe(1); // dublikat yo'q
  });

  it("disable override suppresses generation for a fresh period", async () => {
    await prisma.companyObligationOverride.create({
      data: { companyId: ids.company, templateId: ids.t1, action: "disable", reason: "test disable" },
    });
    const nextRef = new Date(Date.UTC(2097, 7, 15)); // 2097-08 → yangi davr
    await generateObligations(prisma, { ref: nextRef, createdBy: ids.user });

    const obl = await prisma.obligation.findFirst({
      where: { companyId: ids.company, templateId: ids.t1, periodKey: "2097-M08" },
    });
    expect(obl).toBeNull(); // disable bilan yaratilmadi
  });
});
