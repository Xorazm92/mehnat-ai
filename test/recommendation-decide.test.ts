/**
 * TAVSIYA QARORI — qabul AMALNI BAJARADI, rad esa hech narsani (M5.3).
 *
 * Bu M5 ning eng xavfli qismi: "qabul" tugmasi ish oqimini chetlab o'tib
 * HAQIQIY yozuv qiladi. Shuning uchun to'rt chegara mahkamlanadi:
 *
 *   1. RAD ETISH HECH NARSA BAJARMAYDI. Aks holda direktor "yo'q" deb
 *      bosgan tugmasi ishni ko'chirib yuborardi.
 *   2. SABAB IKKALASIDA HAM MAJBURIY — radda u yagona saqlanadigan
 *      ma'lumot ("nega yaroqsiz").
 *   3. FAQAT `pending`. Ikki marta bosilgan tugma amalni ikki marta
 *      bajarmasligi kerak.
 *   4. TARTIB: avval amal, keyin status. Amal yiqilsa qator `pending`
 *      bo'lib qoladi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const {
  createRecommendationRecord,
  decideRecommendationRow,
  expireStaleRecommendations,
  getRecommendationAdoption,
} = await import("@/lib/domains/accounting/recommendations");
const { ESCALATION_CHANNEL, escalationDedupKey } = await import("@/lib/engines/automation/escalation");

const TAG = `vitest-rec-decide-${Date.now()}`;
const DAY = 86_400_000;
const NOW = new Date(Date.UTC(2093, 5, 15));
const ids = { admin: "", chief: "", acc: "", company: "", obligation: "", template: "" };

const admin = () => ({ id: ids.admin, role: "super_admin" });

beforeAll(async () => {
  const mk = (n: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${n}@v.local`, fullName: `${TAG} ${n}`, passwordHash: "x", role: role as never },
      select: { id: true },
    });
  const [a, c, u] = await Promise.all([
    mk("adm", "super_admin"),
    mk("chief", "chief_accountant"),
    mk("acc", "accountant"),
  ]);
  ids.admin = a.id;
  ids.chief = c.id;
  ids.acc = u.id;

  const company = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`, inn: String(Date.now()).slice(-9), taxRegime: "vat",
      isActive: true, companyStatus: "active",
      contractDate: new Date(Date.UTC(2093, 0, 1)),
      accountantId: ids.acc,
      // Eskalatsiya zanjirining L1 bosqichi — nazoratchi.
      supervisorId: ids.chief,
    },
    select: { id: true },
  });
  ids.company = company.id;

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, name: "QQS deklaratsiyasi", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2093, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;
});

/** Har testda majburiyat DASTLABKI holatga qaytadi — testlar bir-birini surmasin. */
beforeEach(async () => {
  await prisma.recommendation.deleteMany({ where: { companyId: ids.company } });
  await prisma.obligationAssignmentEvent.deleteMany({ where: { obligation: { companyId: ids.company } } });
  await prisma.notificationDelivery.deleteMany({ where: { channel: ESCALATION_CHANNEL } });
  await prisma.notification.deleteMany({ where: { userId: { in: [ids.admin, ids.chief, ids.acc] } } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });

  const o = await prisma.obligation.create({
    data: {
      companyId: ids.company, templateId: ids.template, templateVersion: 1,
      periodStart: new Date(Date.UTC(2093, 4, 1)),
      periodEnd: new Date(Date.UTC(2093, 5, 1)),
      periodKey: "2093-M05",
      dueAt: new Date(Date.UTC(2093, 4, 20)),
      status: "planned",
      responsibleUserId: ids.acc,
    },
    select: { id: true },
  });
  ids.obligation = o.id;
});

afterAll(async () => {
  await prisma.recommendation.deleteMany({ where: { companyId: ids.company } });
  await prisma.analyticsEvent.deleteMany({ where: { actorId: { in: [ids.admin, ids.chief, ids.acc] } } });
  await prisma.analyticsEvent.deleteMany({ where: { kind: "recommendation_expired", actorId: null } });
  await prisma.notificationDelivery.deleteMany({ where: { channel: ESCALATION_CHANNEL } });
  await prisma.notification.deleteMany({ where: { userId: { in: [ids.admin, ids.chief, ids.acc] } } });
  await prisma.task.deleteMany({ where: { companyId: ids.company } });
  await prisma.obligationAssignmentEvent.deleteMany({ where: { obligation: { companyId: ids.company } } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.admin, ids.chief, ids.acc] } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.chief, ids.acc] } } });
  await prisma.$disconnect();
});

const mkRec = async (kind: string, payload: unknown, now?: Date) =>
  (
    await createRecommendationRecord(prisma, {
      actor: admin(), companyId: ids.company, kind: kind as never,
      rationale: `${TAG} sinov tavsiyasi`, claims: [], payload, source: "system", now,
    })
  ).id;

describe("qabul — amal bajariladi", () => {
  it("eskalatsiya: zanjir daftariga bosqich yoziladi va audit izi qoladi", async () => {
    const id = await mkRec("escalate_obligation", { obligationId: ids.obligation, level: 1 });

    const res = await decideRecommendationRow(
      prisma,
      { actor: admin(), id, decision: "accepted", note: "muddat yaqin, nazoratchi bilsin", now: NOW },
    );
    expect(res.status).toBe("accepted");
    expect(res.effect).toContain("Eskalatsiya");

    // `Obligation.status` O'ZGARMAYDI — `escalated` degan holat enumda yo'q
    // va zanjir majburiyatning bosqichini emas, XABARDORLIKNI ko'taradi.
    const o = await prisma.obligation.findUniqueOrThrow({
      where: { id: ids.obligation },
      select: { status: true },
    });
    expect(o.status).toBe("planned");

    const chain = await prisma.notificationDelivery.findUnique({
      where: {
        channel_dedupKey: {
          channel: ESCALATION_CHANNEL,
          dedupKey: escalationDedupKey("obligation", ids.obligation, 1),
        },
      },
      select: { recipientId: true },
    });
    expect(chain?.recipientId).toBe(ids.chief);

    const audit = await prisma.auditLog.findFirst({
      where: { tableName: "Recommendation", recordId: id, action: "update" },
      select: { userId: true, newData: true },
    });
    expect(audit?.userId).toBe(ids.admin);
    expect(audit?.newData).toMatchObject({ status: "accepted" });
  });

  it("qayta tayinlash: mas'ul o'zgaradi va SABAB hodisaga yoziladi", async () => {
    const id = await mkRec("reassign_responsible", {
      obligationId: ids.obligation,
      toUserId: ids.chief,
    });
    await decideRecommendationRow(prisma, {
      actor: admin(), id, decision: "accepted", note: "buxgalter ta'tilda", now: NOW,
    });

    const o = await prisma.obligation.findUniqueOrThrow({
      where: { id: ids.obligation },
      select: { responsibleUserId: true },
    });
    expect(o.responsibleUserId).toBe(ids.chief);

    const ev = await prisma.obligationAssignmentEvent.findFirst({
      where: { obligationId: ids.obligation },
      select: { reason: true, byUserId: true },
      orderBy: { at: "desc" },
    });
    expect(ev?.reason).toBe("buxgalter ta'tilda");
    expect(ev?.byUserId).toBe(ids.admin);
  });

  it("kechikishni rasmiylashtirish: sabab belgilanadi VA tasdiqlanadi", async () => {
    // Ikki bosqich birga: direktorning qabuli aynan o'sha manager tasdig'i.
    // `dueAt` KO'CHIRILMAYDI — muddat qonundan keladi.
    const before = await prisma.obligation.findUniqueOrThrow({
      where: { id: ids.obligation }, select: { dueAt: true },
    });
    const id = await mkRec("postpone_obligation", {
      obligationId: ids.obligation, delayReason: "client_delay",
    });
    await decideRecommendationRow(prisma, {
      actor: admin(), id, decision: "accepted", note: "mijoz hujjat bermadi", now: NOW,
    });

    const o = await prisma.obligation.findUniqueOrThrow({
      where: { id: ids.obligation },
      select: { delayReason: true, delayApprovedById: true, dueAt: true },
    });
    expect(o.delayReason).toBe("client_delay");
    expect(o.delayApprovedById).toBe(ids.admin);
    expect(o.dueAt.getTime()).toBe(before.dueAt.getTime());
  });
});

describe("qabul — ish elementlari", () => {
  it("bank sverkasi: VAZIFA ochiladi, qatorlar avtomatik taqqoslanmaydi", async () => {
    // Taqqoslash odamning qarori: uni AI tavsiyasi bilan avtomatlashtirish
    // pul harakatini noto'g'ri firmaga yozib qo'yishi mumkin edi.
    const id = await mkRec("review_unmatched_bank", {});
    const res = await decideRecommendationRow(prisma, {
      actor: admin(), id, decision: "accepted", note: "oyoxiri yopilmoqda", now: NOW,
    });
    expect(res.effect).toContain("vazifa");

    const task = await prisma.task.findFirst({
      where: { companyId: ids.company, taskType: "bank_reconciliation" },
      select: { assigneeUserId: true, createdBy: true, priority: true, dueAt: true },
    });
    // Mas'ul payloadda ko'rsatilmagan ⇒ firmaning buxgalteri.
    expect(task?.assigneeUserId).toBe(ids.acc);
    expect(task?.createdBy).toBe(ids.admin);
    expect(task?.priority).toBe("high");
    expect(task?.dueAt?.getTime()).toBe(NOW.getTime() + 3 * DAY);

    await prisma.task.deleteMany({ where: { companyId: ids.company } });
  });

  it("hujjat so'rash: xabar XODIMGA boradi (mijozga emas)", async () => {
    // ASRO boti mijozlar bilan yozishmaydi — mijoz bilan aloqa buxgalter
    // zimmasida qoladi, tizim esa talabni yozib qo'yadi.
    const id = await mkRec("request_documentation", { documentName: "Bank vipiskasi (avgust)" });
    await decideRecommendationRow(prisma, {
      actor: admin(), id, decision: "accepted", note: "qarzdorlikni tekshirish uchun", now: NOW,
    });

    const n = await prisma.notification.findFirst({
      where: { userId: ids.acc, type: "recommendation" },
      select: { title: true, message: true, priority: true },
    });
    expect(n?.title).toContain(TAG);
    expect(n?.message).toContain("Bank vipiskasi (avgust)");
    expect(n?.priority).toBe("high");
  });
});

describe("rad etish — hech narsa bajarilmaydi", () => {
  it("payload BAJARILMAYDI: mas'ul o'zgarmaydi, zanjirga yozilmaydi", async () => {
    const id = await mkRec("reassign_responsible", {
      obligationId: ids.obligation, toUserId: ids.chief,
    });
    const res = await decideRecommendationRow(prisma, {
      actor: admin(), id, decision: "dismissed", note: "buxgalter ta'tildan qaytdi", now: NOW,
    });
    expect(res.status).toBe("dismissed");
    expect(res.effect).toBeNull();

    const o = await prisma.obligation.findUniqueOrThrow({
      where: { id: ids.obligation },
      select: { responsibleUserId: true },
    });
    expect(o.responsibleUserId).toBe(ids.acc);
    expect(await prisma.obligationAssignmentEvent.count({ where: { obligationId: ids.obligation } })).toBe(0);

    // Sabab esa SAQLANADI — radda u yagona qoladigan ma'lumot.
    const row = await prisma.recommendation.findUniqueOrThrow({
      where: { id }, select: { decisionNote: true, decidedBy: true },
    });
    expect(row.decisionNote).toBe("buxgalter ta'tildan qaytdi");
    expect(row.decidedBy).toBe(ids.admin);
  });
});

describe("qaror qoidalari", () => {
  it("sababsiz qabul ham, rad ham rad etiladi", async () => {
    const id = await mkRec("review_unmatched_bank", {});
    await expect(
      decideRecommendationRow(prisma, { actor: admin(), id, decision: "accepted", note: "   ", now: NOW }),
    ).rejects.toThrow(/Sabab majburiy/);
    await expect(
      decideRecommendationRow(prisma, { actor: admin(), id, decision: "dismissed", note: "", now: NOW }),
    ).rejects.toThrow(/Sabab majburiy/);

    const row = await prisma.recommendation.findUniqueOrThrow({ where: { id }, select: { status: true } });
    expect(row.status).toBe("pending");
  });

  it("faqat `pending` hal qilinadi — ikkinchi bosish amalni takrorlamaydi", async () => {
    const id = await mkRec("reassign_responsible", {
      obligationId: ids.obligation, toUserId: ids.chief,
    });
    await decideRecommendationRow(prisma, {
      actor: admin(), id, decision: "accepted", note: "birinchi qaror", now: NOW,
    });
    await expect(
      decideRecommendationRow(prisma, {
        actor: admin(), id, decision: "dismissed", note: "fikrim o'zgardi", now: NOW,
      }),
    ).rejects.toThrow(/allaqachon hal qilingan/);

    // Amal bir marta bajarilgan: bitta biriktirish hodisasi.
    expect(await prisma.obligationAssignmentEvent.count({ where: { obligationId: ids.obligation } })).toBe(1);
  });

  it("payload BOSHQA firmaning majburiyatini ko'rsatsa — rad", async () => {
    // Doira buzilishi "topilmadi" emas: jimgina o'tkazib yuborilsa begona
    // firmada amal bajarilardi.
    const foreign = await prisma.company.create({
      data: {
        name: `${TAG} begona`, inn: String(Date.now() + 7).slice(-9), taxRegime: "vat",
        isActive: true, companyStatus: "active", contractDate: new Date(Date.UTC(2093, 0, 1)),
      },
      select: { id: true },
    });
    const foreignObl = await prisma.obligation.create({
      data: {
        companyId: foreign.id, templateId: ids.template, templateVersion: 1,
        periodStart: new Date(Date.UTC(2093, 4, 1)), periodEnd: new Date(Date.UTC(2093, 5, 1)),
        periodKey: "2093-M05", dueAt: new Date(Date.UTC(2093, 4, 20)), status: "planned",
      },
      select: { id: true },
    });

    const id = await mkRec("escalate_obligation", { obligationId: foreignObl.id });
    await expect(
      decideRecommendationRow(prisma, { actor: admin(), id, decision: "accepted", note: "sinov", now: NOW }),
    ).rejects.toThrow(/boshqa firmaning/);

    // TARTIB ISBOTI: amal yiqildi ⇒ status HAMON `pending`.
    const row = await prisma.recommendation.findUniqueOrThrow({ where: { id }, select: { status: true } });
    expect(row.status).toBe("pending");

    await prisma.obligation.deleteMany({ where: { id: foreignObl.id } });
    await prisma.recommendation.deleteMany({ where: { companyId: foreign.id } });
    await prisma.company.deleteMany({ where: { id: foreign.id } });
  });
});

describe("muddat va o'lchov", () => {
  it("7 kundan eski javobsiz tavsiya `expired` bo'ladi, yangisi TEGILMAYDI", async () => {
    const old = await mkRec("escalate_obligation", { obligationId: ids.obligation }, new Date(NOW.getTime() - 8 * DAY));
    const fresh = await mkRec("review_unmatched_bank", {}, new Date(NOW.getTime() - 6 * DAY));

    const res = await expireStaleRecommendations(prisma, { now: NOW });
    expect(res.expired).toBeGreaterThanOrEqual(1);

    const oldRow = await prisma.recommendation.findUniqueOrThrow({
      where: { id: old }, select: { status: true, decidedAt: true, decidedBy: true },
    });
    expect(oldRow.status).toBe("expired");
    // `decidedAt` to'ldiriladi — o'lchov uch holatni BIR vaqt o'qida sanaydi.
    expect(oldRow.decidedAt).not.toBeNull();
    // Lekin `decidedBy` — YO'Q: bu cron qarori, odamniki emas.
    expect(oldRow.decidedBy).toBeNull();

    const freshRow = await prisma.recommendation.findUniqueOrThrow({
      where: { id: fresh }, select: { status: true },
    });
    expect(freshRow.status).toBe("pending");

    // 5-VA'DA O'LCHOVI: eskirgan qator MAXRAJGA tushadi, ya'ni javobsizlik
    // ulushni pasaytiradi (ilgari u umuman hisobga olinmasdi).
    const adoption = await getRecommendationAdoption(prisma, { now: NOW, days: 7 });
    expect(adoption.expired).toBeGreaterThanOrEqual(1);
    expect(adoption.total).toBe(adoption.accepted + adoption.dismissed + adoption.expired);
  });
});
