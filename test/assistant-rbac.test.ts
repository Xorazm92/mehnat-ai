/**
 * AI YORDAMCHI DARVOZASI (M5.2).
 *
 * M5.1 da har TOOL o'z portfel doirasini tekshiradi va bu saqlanadi. Lekin
 * yaxlit suhbat tool'dan kengroq: model savolni qayta shakllantiradi, bir
 * necha toolni ketma-ket chaqiradi va natijalarni umumlashtiradi. Buxgalter
 * uchun bu "boshqa firma haqida so'rab ko'rish" maydonini ochadi — doira uni
 * har safar to'sadi, lekin urinishning o'zi ham kerak emas.
 *
 * Shuning uchun assistant `isSeniorRole` ortida: super_admin, admin,
 * chief_accountant, supervisor. Buxgalter va bank menejeri uchun yopiq.
 *
 * KALIT ATAYLAB O'CHIRILADI — modulga qadar. Aks holda test haqiqiy Gemini
 * so'rovini yuborardi: sekin, pullik va tarmoqqa bog'liq.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

process.env.GEMINI_API_KEY = "";
process.env.GOOGLE_API_KEY = "";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { askFinanceAssistant } = await import("@/server/assistant");

const TAG = `vitest-airbac-${Date.now()}`;
const ids: Record<string, string> = {};

const actor = (id: string, role: string) => {
  SESSION.user.id = id;
  SESSION.user.role = role;
};

const ROLES = ["super_admin", "admin", "chief_accountant", "supervisor", "accountant", "bank_manager"] as const;

beforeAll(async () => {
  for (const role of ROLES) {
    const u = await prisma.user.create({
      data: { email: `${TAG}-${role}@v.local`, fullName: `${TAG} ${role}`, passwordHash: "x", role: role as never },
      select: { id: true },
    });
    ids[role] = u.id;
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await prisma.$disconnect();
});

describe("assistant — senior rollar uchun ochiq", () => {
  for (const role of ["super_admin", "admin", "chief_accountant", "supervisor"] as const) {
    it(`${role} — javob oladi`, async () => {
      actor(ids[role], role);
      const res = await askFinanceAssistant("QQS qanday hisoblanadi?");
      expect(res.ok).toBe(true);
      // Kalit yo'q ⇒ deterministik javob; raqam aytilmagani uchun da'vo ham yo'q.
      expect(res.fallback).toBe(true);
      expect(res.claims).toEqual([]);
      expect(res.text.length).toBeGreaterThan(0);
    });
  }
});

describe("assistant — quyi rollar uchun yopiq", () => {
  for (const role of ["accountant", "bank_manager"] as const) {
    it(`${role} — rad etiladi`, async () => {
      actor(ids[role], role);
      const res = await askFinanceAssistant("Artel qancha qarzi bor?");
      expect(res.ok).toBe(false);
      expect(res.text).toMatch(/rolingiz uchun ochiq emas/i);
      // Rad etilgan javobda raqam bo'lmasligi SHART — aks holda darvoza
      // matnda yopilib, ma'lumotda ochiq qolardi.
      expect(res.claims).toEqual([]);
    });
  }

  it("kirmagan foydalanuvchi — rad etiladi", async () => {
    actor("", "");
    const res = await askFinanceAssistant("salom");
    expect(res.ok).toBe(false);
    expect(res.claims).toEqual([]);
  });
});
