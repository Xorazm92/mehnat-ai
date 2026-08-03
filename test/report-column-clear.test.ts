/**
 * USTUNNI TOZALASH (amallar matritsasi)
 *
 * Tozalash matritsa kalitini oladi ("pul_oqimlari"), DB ustuni esa boshqacha
 * yoziladi ("pulOqimlari"). Kalit mapping'siz ishlatilsa, nomi tasodifan bir
 * xil bo'lgan ustunlar (didox, xatlar, inps…) tozalanadi, qolganlari esa
 * Prisma xatosi bilan yiqiladi — foydalanuvchi uchun "tozalash ba'zan
 * ishlaydi, ba'zan yo'q" ko'rinishidagi eng chalg'ituvchi nosozlik.
 *
 * Shuning uchun test AYNAN nomi farq qiladigan ustunni tekshiradi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { clearColumnForPeriod } = await import("@/server/operations");

const TAG = `vitest-clear-${Date.now()}`;
const PERIOD = "1998-07"; // real ma'lumot bilan to'qnashmaydigan davr
const ids = { company: "", user: "" };

beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `${TAG} firma`, inn: "9", taxRegime: "vat" },
    select: { id: true },
  });
  ids.company = company.id;
  const user = await prisma.user.create({
    data: {
      email: `${TAG}@v.local`,
      fullName: "Clear Tester",
      passwordHash: "x",
      role: "super_admin",
      isActive: true,
    },
    select: { id: true },
  });
  ids.user = user.id;
  SESSION.user.id = user.id;
});

afterAll(async () => {
  await prisma.monthlyReport.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("clearColumnForPeriod", () => {
  it("nomi DB ustunidan FARQ qiladigan ustunni tozalaydi", async () => {
    // pul_oqimlari → pulOqimlari. Aynan shu holat buzilgan edi.
    await prisma.monthlyReport.upsert({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      create: { companyId: ids.company, period: PERIOD, pulOqimlari: "topshirildi", didox: "+" },
      update: { pulOqimlari: "topshirildi", didox: "+" },
    });

    await clearColumnForPeriod(PERIOD, "pul_oqimlari");

    const after = await prisma.monthlyReport.findUnique({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      select: { pulOqimlari: true, didox: true },
    });
    expect(after?.pulOqimlari).toBeNull();
    // Qo'shni ustun tegilmaydi — tozalash faqat so'ralganini o'chiradi.
    expect(after?.didox).toBe("+");
  });

  it("nomi bir xil ustunni ham tozalaydi", async () => {
    await prisma.monthlyReport.update({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      data: { didox: "+" },
    });

    await clearColumnForPeriod(PERIOD, "didox");

    const after = await prisma.monthlyReport.findUnique({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      select: { didox: true },
    });
    expect(after?.didox).toBeNull();
  });

  it("noma'lum kalitni rad etadi", async () => {
    // `data` ga kelgan nom to'g'ridan-to'g'ri ustunga aylanadi, shuning uchun
    // tekshiruvsiz qoldirish ixtiyoriy maydonni nolga tenglash imkonini berardi.
    await expect(clearColumnForPeriod(PERIOD, "passwordHash")).rejects.toThrow();
    await expect(clearColumnForPeriod(PERIOD, "yoq_bunday_ustun")).rejects.toThrow();
  });

  it("buxgalter ustunni tozalay olmaydi", async () => {
    SESSION.user.role = "accountant";
    await expect(clearColumnForPeriod(PERIOD, "didox")).rejects.toThrow(/Forbidden/);
    SESSION.user.role = "super_admin";
  });
});
