/**
 * MATRITSA KATAGI → MAJBURIYAT (regressiya qo'riqchisi).
 *
 * Birlashtirishda aynan shu tarmoq tushib qolgan edi: katakni ✓ qilish
 * majburiyatni harakatga keltirmasdi. Bu test shuni qaytib kelishiga yo'l
 * qo'ymaydi — u yozuv YO'LINI tekshiradi, ko'rinishni emas.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" as string } };
vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { upsertMonthlyReport } = await import("@/server/operations");

const TAG = `vitest-msync-${Date.now()}`;
const PERIOD = "2024-05"; // O'TGAN davr: kelajak davrga yozish taqiqlangan
const ids = { user: "", company: "", template: "", obligation: "" };

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `${TAG}@v.local`, fullName: TAG, passwordHash: "x", role: "super_admin" },
    select: { id: true },
  });
  ids.user = u.id;
  SESSION.user.id = u.id;

  const c = await prisma.company.create({
    data: {
      name: `${TAG} co`, inn: "000000009", taxRegime: "vat", isActive: true,
      companyStatus: "active", contractDate: new Date(Date.UTC(2023, 0, 1)),
    },
    select: { id: true },
  });
  ids.company = c.id;

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, matrixKey: "didox", name: "Didox sinov",
      obligationType: "internal", periodicity: "monthly",
      anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2023, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;

  const o = await prisma.obligation.create({
    data: {
      companyId: ids.company, templateId: ids.template, templateVersion: 1,
      periodKey: "2024-M05",
      periodStart: new Date(Date.UTC(2024, 4, 1)),
      // [1-may, 1-iyun) — engine oynasi shunday yopiladi
      periodEnd: new Date(Date.UTC(2024, 5, 1)),
      dueAt: new Date(Date.UTC(2024, 5, 20)),
      status: "planned",
    },
    select: { id: true },
  });
  ids.obligation = o.id;
});

afterAll(async () => {
  await prisma.obligationStatusEvent.deleteMany({ where: { obligationId: ids.obligation } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.monthlyReport.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("matritsa katagi majburiyatni suradi", () => {
  it("katak ✓ bo'lsa majburiyat `planned` da QOLMAYDI", async () => {
    const res = await upsertMonthlyReport({ companyId: ids.company, period: PERIOD, didox: "+" });
    if (!res.ok) throw new Error(`yozuv rad etildi: ${res.error}`);

    const o = await prisma.obligation.findUniqueOrThrow({
      where: { id: ids.obligation }, select: { status: true },
    });
    expect(o.status).not.toBe("planned");
  });

  it("katak bo'shatilsa majburiyat `planned` ga qaytadi", async () => {
    await upsertMonthlyReport({ companyId: ids.company, period: PERIOD, didox: "" });
    const o = await prisma.obligation.findUniqueOrThrow({
      where: { id: ids.obligation }, select: { status: true },
    });
    expect(o.status).toBe("planned");
  });
});
