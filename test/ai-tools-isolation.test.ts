/**
 * AI PORTFEL DOIRASIDAN CHIQA OLMAYDI (M5.1).
 *
 * Assistant HAR foydalanuvchining tepa panelida turadi
 * (`components/DashboardTopBar.tsx`) va uning rol darvozasi yo'q. Avvalgi
 * tahrirda firma toollari `auth()` dan keyin `findUnique({ id: companyId })`
 * qilardi — ya'ni buxgalter AI orqali portfelidan TASHQARIDAGI firmaning
 * qarzini so'ray olardi. Bu ko'p-portfelli izolyatsiyaning buzilishi
 * (CLAUDE.md §10).
 *
 * Toollar bugun Gemini funksiya chaqiruvi orqali ishlaydi, ya'ni ARGUMENTNI
 * MODEL o'ylab topadi — foydalanuvchi emas. Shuning uchun doira modelga
 * emas, toolning O'ZIGA qo'yilgan.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const tools = await import("@/lib/ai/tools");

const TAG = `vitest-aiiso-${Date.now()}`;
const ids = { admin: "", acc: "", stranger: "", mine: "", theirs: "" };

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
        name: `${TAG} ${n}`,
        inn: String(Date.now()).slice(-9),
        taxRegime: "vat",
        isActive: true,
        companyStatus: "active",
        contractDate: new Date(Date.UTC(2093, 0, 1)),
        accountantId,
      },
      select: { id: true },
    });
  ids.mine = (await mkCo("mine", ids.acc)).id;
  ids.theirs = (await mkCo("theirs", ids.stranger)).id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: { in: [ids.mine, ids.theirs] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.acc, ids.stranger] } } });
  await prisma.$disconnect();
});

/** To'rtala firma tooli — bittasi ham chetda qolmasin. */
type ToolCall = (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;

const COMPANY_TOOLS: [string, ToolCall][] = [
  ["getCompanyBalance", (id) => tools.getCompanyBalance(id)],
  ["getCompanyOverdue", (id) => tools.getCompanyOverdue(id)],
  ["getRecentPayments", (id) => tools.getRecentPayments(id)],
  ["getObligationStatus", (id) => tools.getObligationStatus(id)],
];

describe("portfel doirasi — 4 ta firma tooli", () => {
  for (const [name, call] of COMPANY_TOOLS) {
    it(`${name}: begona firma uchun RAD etiladi`, async () => {
      actor(ids.acc, "accountant");
      const res = await call(ids.theirs);
      expect(res.ok).toBe(false);
      // Mavjudligining o'zi ham oshkor bo'lmaydi — "topilmadi" deb javob beradi.
      if (!res.ok) expect(res.error).toMatch(/topilmadi|portfel/i);
    });

    it(`${name}: O'Z firmasi uchun o'tadi`, async () => {
      actor(ids.acc, "accountant");
      const res = await call(ids.mine);
      expect(res.ok).toBe(true);
    });
  }

  it("admin uchun doira cheklanmaydi — hamma firma ko'rinadi", async () => {
    actor(ids.admin, "super_admin");
    for (const [, call] of COMPANY_TOOLS) {
      expect((await call(ids.theirs)).ok).toBe(true);
    }
  });

  it("kirmagan foydalanuvchi hech qaysi toolga yeta olmaydi", async () => {
    actor("", "");
    for (const [, call] of COMPANY_TOOLS) {
      expect((await call(ids.mine)).ok).toBe(false);
    }
  });

  it("getKpiTrend xodim doirasi bilan qo'riqlangan (staffScopeFilter)", async () => {
    actor(ids.acc, "accountant");
    // Buxgalter begona xodimning KPI tarixini o'qiy olmaydi.
    //
    // `staffScopeFilter` bu holatda xato TASHLAMAYDI — u buxgalter uchun
    // o'z id'sini qaytaradi. Tool o'sha farqni ko'rib rad etadi; jimgina
    // "o'zinikini" ko'rsatish AI ni boshqa odam haqida gapirtirardi.
    const foreign = await tools.getKpiTrend(ids.stranger, 3);
    expect(foreign.ok).toBe(false);
    // O'zinikini esa o'qiydi.
    const own = await tools.getKpiTrend(ids.acc, 3);
    expect(own.ok).toBe(true);
  });
});
