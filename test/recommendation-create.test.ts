/**
 * TAVSIYA YARATISH — dublikat qo'riqchisi, doira va payload sxemasi (M5.3).
 *
 * Uch da'vo shu yerda mahkamlanadi:
 *
 *   1. Bir (firma, tur) juftligi uchun bir vaqtda BITTA pending. Modelning
 *      eng keng tarqalgan xatti-harakati — bir savolni qayta so'zlab yana
 *      chaqirish; qo'riqchisiz direktor ekrani bir xil qatorning nusxalari
 *      bilan to'lardi va 5-va'da o'lchovining MAXRAJI sun'iy o'sardi.
 *   2. Payload `kind` sxemasi bo'yicha YARATISHDA tekshiriladi, qabulda
 *      emas. Aks holda yaroqsiz tavsiya navbatda "bajarib bo'lmaydigan"
 *      bo'lib qolardi.
 *   3. Doira: portfeldan tashqaridagi firmaga tavsiya yaratib bo'lmaydi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { createRecommendationRecord } = await import("@/lib/domains/accounting/recommendations");
const { claim } = await import("@/lib/ai/claim");

const TAG = `vitest-rec-create-${Date.now()}`;
const ids = { admin: "", acc: "", company: "", other: "", obligation: "", template: "" };

const admin = () => ({ id: ids.admin, role: "super_admin" });
const accountant = () => ({ id: ids.acc, role: "accountant" });

beforeAll(async () => {
  const mk = (n: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${n}@v.local`, fullName: `${TAG} ${n}`, passwordHash: "x", role: role as never },
      select: { id: true },
    });
  const [a, b] = await Promise.all([mk("adm", "super_admin"), mk("acc", "accountant")]);
  ids.admin = a.id;
  ids.acc = b.id;

  const mkCompany = (suffix: string, accountantId: string | null) =>
    prisma.company.create({
      data: {
        name: `${TAG} ${suffix}`,
        inn: String(Date.now() + suffix.length).slice(-9),
        taxRegime: "vat",
        isActive: true,
        companyStatus: "active",
        contractDate: new Date(Date.UTC(2093, 0, 1)),
        accountantId,
      },
      select: { id: true },
    });
  // `company` — buxgalterning portfelida; `other` — hech kimniki emas.
  const [c1, c2] = await Promise.all([mkCompany("mine", ids.acc), mkCompany("other", null)]);
  ids.company = c1.id;
  ids.other = c2.id;

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, name: "Tavsiya test", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2093, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;

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
  await prisma.recommendation.deleteMany({ where: { companyId: { in: [ids.company, ids.other] } } });
  await prisma.analyticsEvent.deleteMany({ where: { actorId: { in: [ids.admin, ids.acc] } } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.admin, ids.acc] } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.company, ids.other] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.acc] } } });
  await prisma.$disconnect();
});

const escalatePayload = () => ({ obligationId: ids.obligation });

describe("dublikat qo'riqchisi", () => {
  it("bir xil (firma, tur) uchun ikkinchi pending YARATILMAYDI", async () => {
    const first = await createRecommendationRecord(prisma, {
      actor: admin(), companyId: ids.company, kind: "escalate_obligation",
      rationale: "birinchi", claims: [], payload: escalatePayload(), source: "assistant",
    });
    expect(first.created).toBe(true);

    const second = await createRecommendationRecord(prisma, {
      actor: admin(), companyId: ids.company, kind: "escalate_obligation",
      rationale: "ikkinchi — boshqacha so'zlangan o'sha savol", claims: [],
      payload: escalatePayload(), source: "assistant",
    });
    // XATO EMAS: "allaqachon navbatda" normal holat, model buni foydalanuvchiga
    // shunday aytishi kerak.
    expect(second.created).toBe(false);
    expect(second.reason).toBe("duplicate");
    expect(second.id).toBe(first.id);

    const count = await prisma.recommendation.count({
      where: { companyId: ids.company, kind: "escalate_obligation", status: "pending" },
    });
    expect(count).toBe(1);
  });

  it("BOSHQA tur — dublikat emas, yaratiladi", async () => {
    const res = await createRecommendationRecord(prisma, {
      actor: admin(), companyId: ids.company, kind: "review_unmatched_bank",
      rationale: "sverkada taqqoslanmagan qatorlar bor", claims: [], payload: {}, source: "assistant",
    });
    expect(res.created).toBe(true);
  });
});

describe("doira va payload", () => {
  it("portfeldan tashqaridagi firmaga tavsiya yaratib bo'lmaydi", async () => {
    await expect(
      createRecommendationRecord(prisma, {
        actor: accountant(), companyId: ids.other, kind: "review_unmatched_bank",
        rationale: "begona firma", claims: [], payload: {}, source: "assistant",
      }),
    ).rejects.toThrow(/portfelingizda emas/);
  });

  it("payload `kind` sxemasidan o'tmasa YARATILMAYDI", async () => {
    // `reassign_responsible` `toUserId` talab qiladi — u yo'q.
    await expect(
      createRecommendationRecord(prisma, {
        actor: admin(), companyId: ids.company, kind: "reassign_responsible",
        rationale: "mas'ulni almashtir", claims: [], payload: { obligationId: ids.obligation },
        source: "assistant",
      }),
    ).rejects.toThrow(/parametr noto'g'ri/);

    const leaked = await prisma.recommendation.count({
      where: { companyId: ids.company, kind: "reassign_responsible" },
    });
    expect(leaked).toBe(0);
  });
});

describe("standart qiymatlar", () => {
  it("da'volar BO'SH bo'lsa ham ruxsat, status `pending`", async () => {
    // Har tavsiya ostida raqam bo'lavermaydi ("hujjat so'rash" raqamsiz ham
    // to'g'ri tavsiya) — bo'sh `claims` xato emas.
    const res = await createRecommendationRecord(prisma, {
      actor: admin(), companyId: ids.company, kind: "request_documentation",
      rationale: "shartnoma nusxasi yetishmayapti", claims: [],
      payload: { documentName: "Shartnoma nusxasi" }, source: "assistant",
    });
    expect(res.created).toBe(true);

    const row = await prisma.recommendation.findUniqueOrThrow({
      where: { id: res.id },
      select: { status: true, claims: true, source: true, decidedBy: true, decidedAt: true },
    });
    expect(row.status).toBe("pending");
    expect(row.claims).toEqual([]);
    expect(row.source).toBe("assistant");
    expect(row.decidedBy).toBeNull();
    expect(row.decidedAt).toBeNull();
  });

  it("da'volar berilsa o'sha holicha saqlanadi — manba yo'qolmaydi", async () => {
    const c = claim({
      value: 3, unit: "dona", label: "Yaqin muddatlar",
      sourceTool: "obligation", sourceQuery: "Obligation(...)",
      asOf: new Date(Date.UTC(2093, 4, 1)),
    });
    const res = await createRecommendationRecord(prisma, {
      actor: admin(), companyId: ids.company, kind: "postpone_obligation",
      rationale: "mijoz hujjat bermadi", claims: [c],
      payload: { obligationId: ids.obligation, delayReason: "client_delay" }, source: "system",
    });
    const row = await prisma.recommendation.findUniqueOrThrow({
      where: { id: res.id },
      select: { claims: true, source: true },
    });
    expect(row.claims).toEqual([c]);
    expect(row.source).toBe("system");
  });
});
