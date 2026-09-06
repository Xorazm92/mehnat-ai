/**
 * `createRecommendation` TOOLI — modelning yagona YOZADIGAN tooli (M5.3).
 *
 * Uch da'vo:
 *
 *   1. Chaqiruv haqiqatan bazaga yozadi (`ToolResult.ok` yolg'on emas).
 *   2. Noto'g'ri payload `ok: false` bo'ladi va HECH NARSA yozilmaydi —
 *      model uchun bu "parametrni to'g'irlab qayta chaqir" degan javob,
 *      tizim nosozligi emas.
 *   3. Portfel doirasi buzilsa firma MAVJUDLIGI ham oshkor bo'lmaydi.
 *
 * TO'RTINCHI, ENG MUHIMI: DA'VOLARNI MODEL BERMAYDI. Tool `claims` ni
 * argument sifatida umuman QABUL QILMAYDI — u ularni o'zi o'lchaydi
 * (`computeLeadingIndicators`). Model da'vo yoza olsa, manba nomini ham,
 * raqamni ham o'ylab topa boshlardi (Modda 7 ning aynan buzilishi) —
 * M5.2 da `getLeadingIndicators` dan `claim` ni olib tashlash bilan bir xil
 * sabab.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { createRecommendation } = await import("@/lib/ai/tools");

const TAG = `vitest-rec-tool-${Date.now()}`;
const ids = { admin: "", acc: "", company: "", other: "", obligation: "", template: "" };

const actor = (id: string, role: string) => {
  SESSION.user.id = id;
  SESSION.user.role = role;
};

beforeAll(async () => {
  const mk = (n: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${n}@v.local`, fullName: `${TAG} ${n}`, passwordHash: "x", role: role as never },
      select: { id: true },
    });
  const [a, u] = await Promise.all([mk("adm", "super_admin"), mk("acc", "accountant")]);
  ids.admin = a.id;
  ids.acc = u.id;

  const mkCompany = (suffix: string, accountantId: string | null) =>
    prisma.company.create({
      data: {
        name: `${TAG} ${suffix}`,
        inn: String(Date.now() + suffix.length).slice(-9),
        taxRegime: "vat", isActive: true, companyStatus: "active",
        contractDate: new Date(Date.UTC(2093, 0, 1)),
        accountantId,
      },
      select: { id: true },
    });
  const [c1, c2] = await Promise.all([mkCompany("mine", ids.acc), mkCompany("other", null)]);
  ids.company = c1.id;
  ids.other = c2.id;

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, name: "Tool test", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2093, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;

  const o = await prisma.obligation.create({
    data: {
      companyId: ids.company, templateId: ids.template, templateVersion: 1,
      periodStart: new Date(Date.UTC(2093, 4, 1)), periodEnd: new Date(Date.UTC(2093, 5, 1)),
      periodKey: "2093-M05", dueAt: new Date(Date.UTC(2093, 4, 20)),
      status: "planned", responsibleUserId: ids.acc,
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

describe("tool chaqiruvi bazaga yozadi", () => {
  it("qator yaratiladi, da'volarni TOOL o'zi o'lchaydi", async () => {
    actor(ids.admin, "super_admin");
    const res = await createRecommendation(
      ids.company,
      "escalate_obligation",
      "Muddat 5 kun ichida, mas'ul yuklamada",
      { obligationId: ids.obligation, level: 1 },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.created).toBe(true);
    expect(res.data.kind).toBe("escalate_obligation");
    expect(res.data.label).toBe("Majburiyatni zanjirga qo'shish");

    const row = await prisma.recommendation.findUniqueOrThrow({
      where: { id: res.data.id },
      select: { companyId: true, kind: true, status: true, source: true, payload: true, claims: true },
    });
    expect(row.companyId).toBe(ids.company);
    expect(row.status).toBe("pending");
    expect(row.source).toBe("assistant");
    expect(row.payload).toMatchObject({ obligationId: ids.obligation, level: 1 });

    // Da'volar `ToolResult.claims` bilan AYNI — ikkalasi bitta o'lchovdan.
    expect(row.claims).toEqual(res.claims);
    // Har da'voning manbasi bor (Modda 7) va u modeldan kelmagan.
    for (const c of res.claims) {
      expect(c.sourceQuery.length).toBeGreaterThan(0);
      expect(c.asOf.length).toBeGreaterThan(0);
    }
  });
});

describe("tool xatolarni javobga aylantiradi", () => {
  it("payload sxemadan o'tmasa `ok: false` va bazaga YOZILMAYDI", async () => {
    actor(ids.admin, "super_admin");
    const before = await prisma.recommendation.count({ where: { companyId: ids.company } });

    const res = await createRecommendation(
      ids.company,
      "reassign_responsible",
      "mas'ulni almashtir",
      { obligationId: ids.obligation }, // `toUserId` yo'q
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/parametr noto'g'ri/);

    expect(await prisma.recommendation.count({ where: { companyId: ids.company } })).toBe(before);
  });

  it("noma'lum tur rad etiladi", async () => {
    actor(ids.admin, "super_admin");
    const res = await createRecommendation(ids.company, "delete_company", "hazil", {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Noma'lum tavsiya turi/);
  });

  it("portfeldan tashqaridagi firma — mavjudligi ham oshkor bo'lmaydi", async () => {
    actor(ids.acc, "accountant");
    const res = await createRecommendation(ids.other, "review_unmatched_bank", "sverka", {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/topilmadi yoki sizning portfelingizda emas/);

    expect(await prisma.recommendation.count({ where: { companyId: ids.other } })).toBe(0);
  });
});
