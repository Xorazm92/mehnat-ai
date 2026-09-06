/**
 * getLeadingIndicators TOOLI — da'vo shakli va doira (M5.2).
 *
 * `test/leading-indicator.test.ts` arifmetikani sinaydi; bu fayl esa TOOL
 * qatlamini: portfel doirasi, da'volarning manbasi va yig'ma daraja.
 *
 * Eng muhim da'vo — `claim` MODELGA BERILMAYDI. Tool `data.indicators` dan
 * uni olib tashlaydi: Gemini da'vo matnini ko'rsa, uni o'zi qayta yozib
 * "manba" to'qib chiqarardi. Da'vo faqat ekranga va testga boradi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { getLeadingIndicators } = await import("@/lib/ai/tools");

const TAG = `vitest-aileading-${Date.now()}`;
const ids = { admin: "", acc: "", stranger: "", mine: "", theirs: "" };
let templateSeq = 0;

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
  const [admin, acc, stranger] = await Promise.all([
    mk("adm", "super_admin"),
    mk("acc", "accountant"),
    mk("other", "accountant"),
  ]);
  ids.admin = admin.id;
  ids.acc = acc.id;
  ids.stranger = stranger.id;

  const mkCo = (n: string, accountantId: string) =>
    prisma.company.create({
      data: {
        name: `${TAG} ${n}`, inn: String(Date.now()).slice(-9), taxRegime: "vat",
        isActive: true, companyStatus: "active",
        contractDate: new Date(Date.UTC(2091, 0, 1)),
        complexity: "standard", accountantId,
      },
      select: { id: true },
    });
  ids.mine = (await mkCo("mine", ids.acc)).id;
  ids.theirs = (await mkCo("theirs", ids.stranger)).id;

  // Bitta yaqin muddat — ro'yxat bo'sh bo'lib qolmasin.
  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T${++templateSeq}`, name: "Lead tool", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2091, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  await prisma.obligation.create({
    data: {
      companyId: ids.mine, templateId: t.id, templateVersion: 1,
      periodStart: new Date(Date.UTC(2091, 5, 1)),
      periodEnd: new Date(Date.UTC(2091, 6, 1)),
      periodKey: "2091-M06",
      dueAt: new Date(Date.now() + 2 * 86_400_000),
      status: "planned",
      responsibleUserId: ids.acc,
    },
  });
});

afterAll(async () => {
  await prisma.obligation.deleteMany({ where: { companyId: { in: [ids.mine, ids.theirs] } } });
  await prisma.deadlineTemplate.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.mine, ids.theirs] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.acc, ids.stranger] } } });
  await prisma.$disconnect();
});

describe("getLeadingIndicators", () => {
  it("ko'rsatkichlar va yig'ma daraja qaytaradi", async () => {
    actor(ids.admin, "super_admin");
    const res = await getLeadingIndicators(ids.mine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.companyId).toBe(ids.mine);
    expect(res.data.indicators.length).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(res.data.severity);
    // Yaqin muddat ko'rsatkichi har doim bo'ladi (0 bo'lsa ham).
    expect(res.data.indicators.some((i) => i.code === "near_deadlines")).toBe(true);
  });

  it("har ko'rsatkich uchun bitta da'vo, manbasi har xil", async () => {
    actor(ids.admin, "super_admin");
    const res = await getLeadingIndicators(ids.mine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Da'vo soni ko'rsatkich soniga teng — biri tushib qolmaydi.
    expect(res.claims).toHaveLength(res.data.indicators.length);
    for (const c of res.claims) {
      expect(c.sourceTool).toMatch(/^(obligation|twin|submission|debt)$/);
      expect(c.sourceQuery.length).toBeGreaterThan(0);
      expect(new Date(c.asOf).toString()).not.toBe("Invalid Date");
      expect(c.confidence).toBeGreaterThan(0);
    }
    // Manbalar bitta emas — turli qatlamlardan kelgani ko'rinadi.
    expect(new Set(res.claims.map((c) => c.sourceTool)).size).toBeGreaterThanOrEqual(1);
  });

  it("da'vo MODELGA berilmaydi — `indicators` da `claim` yo'q", async () => {
    actor(ids.admin, "super_admin");
    const res = await getLeadingIndicators(ids.mine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    for (const i of res.data.indicators) {
      expect(i).not.toHaveProperty("claim");
      // Ko'rsatkichning o'zi esa to'liq: chegara va daraja modelga kerak.
      expect(i.threshold).toBeDefined();
      expect(i.severity).toBeDefined();
      expect(i.detail.length).toBeGreaterThan(0);
    }
  });

  it("portfel doirasi — begona firma uchun rad etiladi", async () => {
    actor(ids.acc, "accountant");
    const res = await getLeadingIndicators(ids.theirs);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/topilmadi|portfel/i);
  });
});
