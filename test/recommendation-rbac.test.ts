/**
 * TAVSIYALAR — IKKI DARAJALI DARVOZA (M5.3).
 *
 * KO'RISH va QAROR ataylab AJRATILGAN:
 *
 *   ko'rish  — `isSeniorRole` (bosh buxgalter va nazoratchi ham ko'radi)
 *   qaror    — `canDirectorCockpit` (faqat super_admin | admin)
 *
 * NEGA BOSH BUXGALTER QABUL QILA OLMAYDI (bu qaror, taxmin emas). Qabul
 * qilingan tavsiya ish oqimini CHETLAB O'TIB haqiqiy yozuv qiladi:
 * majburiyat boshqa odamga o'tadi, kechikish sababi tasdiqlanib qator KPI
 * dan chiqadi, eskalatsiya zanjiri ko'tariladi. M4 da xuddi shu turdagi bir
 * bosishli harakatlar uchun chegara allaqachon direktorda
 * (`server/directorCockpit.ts`), va bu yerda IKKINCHI, boshqacha chegara
 * yaratilsa ulardan biri albatta eskirardi.
 *
 * Ko'rish esa kengroq qoldirildi: navbatni yashirish bosh buxgalterni "nima
 * kutmoqda" dan ayirardi, holbuki ish oxir-oqibat uning bo'limida bajariladi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const {
  listPendingRecommendations,
  decideRecommendation,
  getCockpitRecommendations,
} = await import("@/server/recommendations");
const { createRecommendationRecord } = await import("@/lib/domains/accounting/recommendations");

const TAG = `vitest-rec-rbac-${Date.now()}`;
const ids = { admin: "", chief: "", acc: "", bank: "", company: "", rec: "" };

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
  const [a, c, u, b] = await Promise.all([
    mk("adm", "super_admin"),
    mk("chief", "chief_accountant"),
    mk("acc", "accountant"),
    mk("bank", "bank_manager"),
  ]);
  ids.admin = a.id;
  ids.chief = c.id;
  ids.acc = u.id;
  ids.bank = b.id;

  const company = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`, inn: String(Date.now()).slice(-9), taxRegime: "vat",
      isActive: true, companyStatus: "active", contractDate: new Date(Date.UTC(2093, 0, 1)),
      accountantId: ids.acc,
      // Bosh buxgalterning PORTFELI — u navbatni shu biriktiruv orqali ko'radi.
      chiefAccountantId: ids.chief,
    },
    select: { id: true },
  });
  ids.company = company.id;

  ids.rec = (
    await createRecommendationRecord(prisma, {
      actor: { id: ids.admin, role: "super_admin" },
      companyId: ids.company,
      kind: "review_unmatched_bank",
      rationale: `${TAG} sverkani tekshiring`,
      claims: [],
      payload: {},
      source: "system",
    })
  ).id;
});

afterAll(async () => {
  await prisma.recommendation.deleteMany({ where: { companyId: ids.company } });
  await prisma.task.deleteMany({ where: { companyId: ids.company } });
  await prisma.analyticsEvent.deleteMany({
    where: { actorId: { in: [ids.admin, ids.chief, ids.acc, ids.bank] } },
  });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.admin, ids.chief, ids.acc, ids.bank] } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.chief, ids.acc, ids.bank] } } });
  await prisma.$disconnect();
});

describe("direktor — ko'radi va hal qiladi", () => {
  it("super_admin navbatni ko'radi", async () => {
    actor(ids.admin, "super_admin");
    const rows = await listPendingRecommendations();
    expect(rows.map((r) => r.id)).toContain(ids.rec);
  });

  it("super_admin o'lchovni ham ko'radi (kokpit bloki)", async () => {
    actor(ids.admin, "super_admin");
    const res = await getCockpitRecommendations();
    expect(res.pending.map((r) => r.id)).toContain(ids.rec);
    expect(res.adoption).not.toBeNull();
  });
});

describe("bosh buxgalter — ko'radi, hal QILMAYDI", () => {
  it("navbatni o'z portfeli bo'yicha ko'radi", async () => {
    actor(ids.chief, "chief_accountant");
    const rows = await listPendingRecommendations();
    expect(rows.map((r) => r.id)).toContain(ids.rec);
  });

  it("qaror qabul qila olmaydi va tavsiya `pending` bo'lib qoladi", async () => {
    actor(ids.chief, "chief_accountant");
    await expect(
      decideRecommendation({ id: ids.rec, decision: "accepted", note: "men hal qilaman" }),
    ).rejects.toThrow(/Ruxsat yo'q/);

    const row = await prisma.recommendation.findUniqueOrThrow({
      where: { id: ids.rec }, select: { status: true },
    });
    expect(row.status).toBe("pending");
    // Amal ham bajarilmagan: sverka vazifasi ochilmagan.
    expect(await prisma.task.count({ where: { companyId: ids.company } })).toBe(0);
  });

  it("o'lchov unga ko'rsatilmaydi — `adoption` null, lekin ekran buzilmaydi", async () => {
    actor(ids.chief, "chief_accountant");
    const res = await getCockpitRecommendations();
    expect(res.adoption).toBeNull();
    expect(res.pending.length).toBeGreaterThan(0);
  });
});

describe("kichik rollar — navbat ham, qaror ham yo'q", () => {
  it("buxgalter ro'yxatni ololmaydi", async () => {
    actor(ids.acc, "accountant");
    await expect(listPendingRecommendations()).rejects.toThrow(/Ruxsat yo'q/);
  });

  it("buxgalter qaror qabul qila olmaydi", async () => {
    actor(ids.acc, "accountant");
    await expect(
      decideRecommendation({ id: ids.rec, decision: "dismissed", note: "kerak emas" }),
    ).rejects.toThrow(/Ruxsat yo'q/);
  });

  it("bank menejeri ham rad etiladi", async () => {
    actor(ids.bank, "bank_manager");
    await expect(listPendingRecommendations()).rejects.toThrow(/Ruxsat yo'q/);
    await expect(
      decideRecommendation({ id: ids.rec, decision: "accepted", note: "sverka meniki" }),
    ).rejects.toThrow(/Ruxsat yo'q/);
  });

  it("kokpit bloki kichik rolga BO'SH qaytadi — xato emas", async () => {
    // `getCockpitFinance` bilan bir xil qoida: ruxsati yo'q rol buzilgan
    // ekran emas, bo'sh blok ko'radi (admin `roleViews` orqali `cockpit` ni
    // buxgalterga berishi mumkin).
    actor(ids.acc, "accountant");
    const res = await getCockpitRecommendations();
    expect(res.pending).toEqual([]);
    expect(res.adoption).toBeNull();
  });

  it("kirmagan foydalanuvchi rad etiladi", async () => {
    actor("", "");
    await expect(listPendingRecommendations()).rejects.toThrow(/Unauthorized/);
  });
});
