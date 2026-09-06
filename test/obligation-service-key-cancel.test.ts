/**
 * service_key QOIDASI QO'SHILGANDA GENERATOR NIMA QILADI — jonli Postgres.
 *
 * Auditning eng muhim savoli shu: qoida qo'shilgach 1 704 ta ochiq
 * majburiyat haqiqatan bekor bo'ladimi? Bu test javobni koddan isbotlaydi:
 *
 *   • `planned`   → bekor qilinadi + ObligationStatusEvent yoziladi
 *   • `sent`      → TEGILMAYDI (bajarilgan ish dalili)
 *   • kaliti bor firma → TEGILMAYDI
 *   • davriylik o'zgarsa → cancelStaleRuleObligations ishlaydi
 *
 * Izolyatsiya: test firmalari FAQAT test xizmat kalitlariga ega, shuning
 * uchun test shabloni real firmalarga tushmaydi.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { generateObligations } = await import("@/lib/engines/obligation/obligations");
const { loadCompanySubjects } = await import("@/lib/domains/accounting/subjects");

const TAG = `vitest-svckey-${Date.now()}`;
const SVC_A = `${TAG}-a`; // kaliti YO'Q bo'lgan firmalar shu bilan yuradi
const SVC_B = `${TAG}-b`; // shablon shu kalitni talab qiladi
const REF = new Date(Date.UTC(2098, 6, 15)); // 2098-07-15 → 2098-M07
const PERIOD = "2098-M07";

const ids = { user: "", a1: "", a2: "", b: "", tpl: "" };

const makeCompany = async (name: string, inn: string, services: string[], userId: string) =>
  (
    await prisma.company.create({
      data: {
        name: `${TAG} ${name}`,
        inn,
        taxRegime: "vat",
        isActive: true,
        companyStatus: "active",
        contractDate: new Date(Date.UTC(2098, 0, 1)),
        accountantId: userId,
        activeServices: services,
      },
      select: { id: true },
    })
  ).id;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${TAG}@vitest.local`, fullName: `${TAG} acc`, passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  ids.user = user.id;

  ids.a1 = await makeCompany("A1 (kaliti yo'q, planned)", `${TAG}-1`, [SVC_A], ids.user);
  ids.a2 = await makeCompany("A2 (kaliti yo'q, sent)", `${TAG}-2`, [SVC_A], ids.user);
  ids.b = await makeCompany("B (kaliti bor)", `${TAG}-3`, [SVC_B], ids.user);

  // Shablon UNIVERSAL boshlanadi — prodda 24 ta shablon aynan shu holatda.
  ids.tpl = (
    await prisma.deadlineTemplate.create({
      data: {
        code: `${TAG}-TPL`,
        name: "Test universal shablon",
        obligationType: "financial_statement",
        periodicity: "monthly",
        anchorType: "fixed_day_of_month",
        dueDay: 15,
        adjustmentPolicy: "none",
        effectiveFrom: new Date(Date.UTC(2098, 0, 1)),
        version: 1,
        lifecycle: "active",
        active: true,
        matrixKey: SVC_B,
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  const companyIds = [ids.a1, ids.a2, ids.b];
  await prisma.obligationStatusEvent.deleteMany({
    where: { obligation: { templateId: ids.tpl } },
  });
  await prisma.obligation.deleteMany({ where: { periodKey: { startsWith: "2098-" } } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.tpl } });
  await prisma.templateApplicability.deleteMany({ where: { templateId: ids.tpl } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.tpl } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

const oblOf = (companyId: string) =>
  prisma.obligation.findFirst({ where: { companyId, templateId: ids.tpl, periodKey: PERIOD } });

describe("service_key qoidasi qo'shilgunga qadar", () => {
  it("universal shablon UCHALA firmaga ham tushadi — auditdagi muammoning o'zi", async () => {
    await generateObligations(prisma, { ref: REF, createdBy: ids.user, loadSubjects: loadCompanySubjects });
    for (const cid of [ids.a1, ids.a2, ids.b]) {
      const o = await oblOf(cid);
      expect(o, `firma ${cid} uchun majburiyat yaratilishi kerak edi`).toBeTruthy();
      expect(o!.status).toBe("planned");
    }
  });
});

describe("service_key qoidasi qo'shilgandan keyin", () => {
  it("A2 ning majburiyati 'sent' ga o'tkaziladi (bajarilgan ish)", async () => {
    const o = await oblOf(ids.a2);
    await prisma.obligation.update({ where: { id: o!.id }, data: { status: "sent" } });
    expect((await oblOf(ids.a2))!.status).toBe("sent");
  });

  it("qoida qo'shiladi va generator qayta yuriladi", async () => {
    await prisma.templateApplicability.create({
      data: { templateId: ids.tpl, criteriaType: "service_key", criteriaValue: SVC_B },
    });
    const res = await generateObligations(prisma, { ref: REF, createdBy: ids.user, loadSubjects: loadCompanySubjects });
    // A1 va A2 endi mos emas; A1 planned → bekor, A2 sent → tegilmaydi.
    expect(res.skippedNotApplicable).toBeGreaterThanOrEqual(2);
    expect(res.cancelledNotApplicable).toBeGreaterThanOrEqual(1);
  });

  it("A1 (planned, kaliti yo'q) → cancelled", async () => {
    expect((await oblOf(ids.a1))!.status).toBe("cancelled");
  });

  it("bekor qilish ObligationStatusEvent bilan izlanadi — jim o'zgarish yo'q", async () => {
    const o = await oblOf(ids.a1);
    const ev = await prisma.obligationStatusEvent.findFirst({
      where: { obligationId: o!.id, toStatus: "cancelled" },
    });
    expect(ev).toBeTruthy();
    expect(ev!.fromStatus).toBe("planned");
    expect(ev!.note).toContain("mos kelmaydi");
  });

  it("A2 (sent, kaliti yo'q) → TEGILMAYDI, dalil saqlanadi", async () => {
    expect((await oblOf(ids.a2))!.status).toBe("sent");
  });

  it("B (kaliti bor) → TEGILMAYDI, boshqa xizmat majburiyatlari zarar ko'rmaydi", async () => {
    expect((await oblOf(ids.b))!.status).toBe("planned");
  });

  it("qayta yurgizish yangi bekor qilish yaratmaydi (idempotent)", async () => {
    const res = await generateObligations(prisma, { ref: REF, createdBy: ids.user, loadSubjects: loadCompanySubjects });
    expect(res.cancelledNotApplicable).toBe(0);
    expect(res.created).toBe(0);
  });
});

describe("davriylik o'zgarsa — cancelStaleRuleObligations", () => {
  it("oylikdan choraklikka o'tganda eski oylik qator bekor qilinadi", async () => {
    // B ning 2098-M07 qatori hali planned; shablon choraklikka o'tsa
    // "2098-M07" endi qoidaga mos kelmaydi.
    await prisma.deadlineTemplate.update({ where: { id: ids.tpl }, data: { periodicity: "quarterly" } });
    const res = await generateObligations(prisma, { ref: REF, createdBy: ids.user, loadSubjects: loadCompanySubjects });
    expect(res.cancelledStaleRule).toBeGreaterThanOrEqual(1);
    expect((await oblOf(ids.b))!.status).toBe("cancelled");
  });

  it("allaqachon bekor qilingan qator ikkinchi marta sanalmaydi", async () => {
    const res = await generateObligations(prisma, { ref: REF, createdBy: ids.user, loadSubjects: loadCompanySubjects });
    expect(res.cancelledStaleRule).toBe(0);
  });
});
