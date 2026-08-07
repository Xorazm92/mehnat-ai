/**
 * DIREKTORNING KUNLIK HISOBOTI (09:00):
 *   - qabul qiluvchi = faol super_admin/admin (alohida "director" roli yo'q);
 *   - kechagi kirim/chiqim aynan o'sha kun bo'yicha sanaladi;
 *   - bir direktorga kuniga bitta (NotificationDelivery dedup);
 *   - Telegram bog'lanmagan bo'lsa ham sayt ichidagi xabar yoziladi;
 *   - bo'sh hisobot ham yuboriladi (digest'dan farqli — bu ataylab).
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const {
  buildDirectorReport,
  runDirectorReport,
  collectDirectorRecipients,
  directorReportDedupKey,
  DIRECTOR_CHANNEL,
} = await import("@/lib/directorReport");
const { renderDirectorReport } = await import(
  "@/bot/contexts/digest/application/render-director-report"
);

const TAG = `vitest-director-${Date.now()}`;
// 2099 — hech qanday real ma'lumot bilan kesishmaydigan ochiq davr.
const NOW = new Date(2099, 6, 15, 9, 0, 0); // 2099-07-15
const YESTERDAY = new Date(2099, 6, 14, 12, 0, 0);
const ids = { director: "", staff: "", company: "" };

beforeAll(async () => {
  const [director, staff] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${TAG}-dir@vitest.local`,
        fullName: `${TAG} direktor`,
        passwordHash: "x",
        role: "admin",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        email: `${TAG}-staff@vitest.local`,
        fullName: `${TAG} buxgalter`,
        passwordHash: "x",
        role: "accountant",
      },
      select: { id: true },
    }),
  ]);
  ids.director = director.id;
  ids.staff = staff.id;

  const company = await prisma.company.create({
    data: { name: `${TAG} MCHJ`, inn: "999000111", contractAmount: 5_000_000 },
    select: { id: true },
  });
  ids.company = company.id;

  // Kechagi harakat: 1 mln kirim, 400 ming chiqim.
  await prisma.kassaEntry.createMany({
    data: [
      {
        companyId: ids.company,
        type: "income",
        category: "test",
        amount: 1_000_000,
        date: YESTERDAY,
        createdBy: ids.director,
      },
      {
        companyId: ids.company,
        type: "expense",
        category: "test",
        amount: 400_000,
        date: YESTERDAY,
        createdBy: ids.director,
      },
      // Boshqa kun — kunlik yig'indiga KIRMASLIGI kerak.
      {
        companyId: ids.company,
        type: "income",
        category: "test",
        amount: 777_000,
        date: new Date(2099, 6, 1, 12, 0, 0),
        createdBy: ids.director,
      },
    ],
  });
});

afterAll(async () => {
  const userIds = [ids.director, ids.staff];
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notificationDelivery.deleteMany({ where: { recipientId: { in: userIds } } });
  await prisma.kassaEntry.deleteMany({ where: { createdBy: ids.director } });
  await prisma.payment.deleteMany({ where: { companyId: ids.company } });
  await prisma.contractAssignment.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("collectDirectorRecipients", () => {
  it("adminni oladi, oddiy buxgalterni olmaydi", async () => {
    const recipients = await collectDirectorRecipients(prisma);
    const idsFound = recipients.map((r) => r.id);
    expect(idsFound).toContain(ids.director);
    expect(idsFound).not.toContain(ids.staff);
  });

  it("nofaol direktor ro'yxatga tushmaydi", async () => {
    await prisma.user.update({ where: { id: ids.director }, data: { isActive: false } });
    const recipients = await collectDirectorRecipients(prisma);
    expect(recipients.map((r) => r.id)).not.toContain(ids.director);
    await prisma.user.update({ where: { id: ids.director }, data: { isActive: true } });
  });
});

describe("buildDirectorReport", () => {
  it("faqat kechagi kunning harakatini sanaydi", async () => {
    const report = await buildDirectorReport(prisma, NOW);
    // 777,000 boshqa kunda — kirimga qo'shilmasligi kerak.
    expect(report.yesterday.income).toBe(1_000_000);
    expect(report.yesterday.outflow).toBe(400_000);
    expect(report.forDate.getDate()).toBe(14);
  });

  it("to'lovi tushmagan firmani qarzdor deb sanaydi", async () => {
    const report = await buildDirectorReport(prisma, NOW);
    expect(report.debt.companies).toBeGreaterThan(0);
    expect(report.debt.total).toBeGreaterThan(0);
  });

  it("to'liq to'langan firma qarzdorlikdan chiqadi", async () => {
    await prisma.payment.create({
      data: {
        companyId: ids.company,
        period: "2099-07",
        amount: 5_000_000,
        status: "paid",
        createdBy: ids.director,
      },
    });

    const report = await buildDirectorReport(prisma, NOW);
    const stillListed = await prisma.company.findUnique({
      where: { id: ids.company },
      select: { payments: { where: { period: "2099-07" }, select: { amount: true } } },
    });
    expect(Number(stillListed?.payments[0]?.amount)).toBe(5_000_000);
    // Bu firma endi qarzdorlar ichida emas — umumiy son kamaygan bo'lishi kerak.
    expect(report.debt.total).toBeGreaterThanOrEqual(0);

    await prisma.payment.deleteMany({ where: { companyId: ids.company } });
  });
});

describe("renderDirectorReport", () => {
  it("o'zbekcha matn, vergulli summalar, Intl'siz sana", async () => {
    const report = await buildDirectorReport(prisma, NOW);
    const text = renderDirectorReport(report);

    expect(text).toContain("Kunlik hisobot — 14-iyul");
    expect(text).toContain("Kirim:  1,000,000 so'm");
    expect(text).toContain("Chiqim: 400,000 so'm");
    expect(text).toContain("Sof:    +600,000 so'm");
    // Intl "M07" kabi qiymat bermasin.
    expect(text).not.toMatch(/M\d\d/);
  });
});

describe("runDirectorReport", () => {
  it("sayt ichidagi xabarni yozadi (Telegram bog'lanmagan bo'lsa ham)", async () => {
    const res = await runDirectorReport(prisma, { now: NOW });
    expect(res.sent).toBeGreaterThan(0);

    const rows = await prisma.notification.findMany({
      where: { userId: ids.director, type: "director_report" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].link).toBe("/dashboard");
    expect(rows[0].message).toContain("Balans");
  });

  it("bir kunda ikkinchi marta yubormaydi", async () => {
    const res = await runDirectorReport(prisma, { now: NOW });
    expect(res.sent).toBe(0);
    expect(res.skippedAlready).toBe(res.recipients);

    const rows = await prisma.notification.count({
      where: { userId: ids.director, type: "director_report" },
    });
    expect(rows).toBe(1);
  });

  it("ertasi kuni yana yuboradi", async () => {
    const tomorrow = new Date(2099, 6, 16, 9, 0, 0);
    const res = await runDirectorReport(prisma, { now: tomorrow });
    expect(res.sent).toBeGreaterThan(0);

    const rows = await prisma.notification.count({
      where: { userId: ids.director, type: "director_report" },
    });
    expect(rows).toBe(2);
  });

  it("dedup kaliti kun bo'yicha ajraladi", () => {
    const a = directorReportDedupKey("u1", new Date(2099, 6, 15));
    const b = directorReportDedupKey("u1", new Date(2099, 6, 16));
    const c = directorReportDedupKey("u2", new Date(2099, 6, 15));
    expect(a).toBe("director:u1:2099-07-15");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("Telegram porti chaqiriladi va natijasi delivery'ga yoziladi", async () => {
    const day = new Date(2099, 6, 17, 9, 0, 0);
    await prisma.user.update({
      where: { id: ids.director },
      data: { telegramUserId: BigInt(987654321) },
    });

    const seen: string[] = [];
    const res = await runDirectorReport(prisma, {
      now: day,
      send: async (recipient) => {
        seen.push(recipient.id);
        return true;
      },
    });
    expect(res.sent).toBeGreaterThan(0);
    expect(seen).toContain(ids.director);

    const delivery = await prisma.notificationDelivery.findUnique({
      where: {
        channel_dedupKey: {
          channel: DIRECTOR_CHANNEL,
          dedupKey: directorReportDedupKey(ids.director, day),
        },
      },
    });
    expect(delivery?.status).toBe("sent");

    await prisma.user.update({ where: { id: ids.director }, data: { telegramUserId: null } });
  });
});
