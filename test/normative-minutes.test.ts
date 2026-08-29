/**
 * NORMATIV MEHNAT — sig'im ballining yagona kirishi.
 *
 * Asosiy xossa: u `active` template'da HAM tahrirlanadi. Qolgan maydonlar
 * uchun qoida teskari (versiyalash), va bu ataylab qilingan istisno —
 * normativ majburiyatga ta'sir qilmaydi, faqat yuklama bahosiga. Qulflab
 * qo'yilsa bosh buxgalter uni hech qachon to'g'rilay olmasdi va sig'im
 * abadiy "taxminiy" bo'lib qolardi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { setTemplateNormativeMinutes } = await import("@/server/deadlineTemplates");
const { normativeEffort, DEFAULT_NORMATIVE_MINUTES } = await import("@/lib/domains/accounting/normativeEffort");

const TAG = `vitest-norm-${Date.now()}`;
const ids = { admin: "", plain: "", active: "" };

beforeAll(async () => {
  const mk = (n: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${n}@v.local`, fullName: n, passwordHash: "x", role: role as never },
      select: { id: true },
    });
  ids.admin = (await mk("adm", "admin")).id;
  ids.plain = (await mk("acc", "accountant")).id;

  // ATAYLAB `active` — qulf istisnosi shu yerda sinaladi.
  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, name: "Normativ test", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2015, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.active = t.id;
  SESSION.user.id = ids.admin;
  SESSION.user.role = "admin";
});

afterAll(async () => {
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.active } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.admin, ids.plain] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.plain] } } });
  await prisma.$disconnect();
});

describe("ruxsat", () => {
  it("admin bo'lmagan o'zgartira olmaydi", async () => {
    SESSION.user.id = ids.plain;
    SESSION.user.role = "accountant";
    await expect(setTemplateNormativeMinutes(ids.active, 60)).rejects.toThrow(/Forbidden/);
    SESSION.user.id = ids.admin;
    SESSION.user.role = "admin";
  });
});

describe("setTemplateNormativeMinutes", () => {
  it("FAOL template'da ham o'zgaradi — ataylab qilingan istisno", async () => {
    const r = await setTemplateNormativeMinutes(ids.active, 75);
    expect(r.normativeMinutes).toBe(75);
    const t = await prisma.deadlineTemplate.findUnique({
      where: { id: ids.active }, select: { normativeMinutes: true },
    });
    expect(t!.normativeMinutes).toBe(75);
  });

  it("o'zgarish audit iziga tushadi", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { userId: ids.admin, tableName: "DeadlineTemplate", recordId: ids.active },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
  });

  it("0 va manfiy — `belgilanmagan` bilan bir xil", async () => {
    for (const v of [0, -5]) {
      const r = await setTemplateNormativeMinutes(ids.active, v);
      expect(r.normativeMinutes).toBeNull();
    }
  });

  it("bir ish kunidan oshgani rad etiladi", async () => {
    // 25 soatlik "normativ" — kiritish xatosi, va u sig'im ballini
    // jimgina buzardi.
    await expect(setTemplateNormativeMinutes(ids.active, 1441)).rejects.toThrow(/ish kunidan oshmasligi/);
  });

  it("topilmagan shablon", async () => {
    await expect(setTemplateNormativeMinutes("yo-q-id", 30)).rejects.toThrow(/topilmadi/);
  });
});

describe("normativEffort — bo'sh qiymatning ma'nosi", () => {
  it("belgilangan qiymat standartni bosadi", () => {
    expect(normativeEffort({ normativeMinutes: 75, obligationType: "tax_declaration" })).toEqual({
      minutes: 75, estimated: false,
    });
  });

  it("bo'sh — turi bo'yicha standart va TAXMINIY deb belgilanadi", () => {
    expect(normativeEffort({ normativeMinutes: null, obligationType: "financial_statement" })).toEqual({
      minutes: DEFAULT_NORMATIVE_MINUTES.financial_statement, estimated: true,
    });
  });

  it("noma'lum tur ham nol bermaydi", () => {
    // Nol qaytsa "hech kim band emas" degan eng ishonchli yolg'on chiqardi.
    const e = normativeEffort({ normativeMinutes: null, obligationType: "bunday-tur-yoq" });
    expect(e.minutes).toBeGreaterThan(0);
    expect(e.estimated).toBe(true);
  });
});
