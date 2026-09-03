/**
 * DEADLINE SWEEP — dedup-safe reminders + first-overdue marking.
 * Live Postgres kerak. O'z obligation'lariga izolyatsiya; dedupKey prefiksi
 * bilan tozalanadi.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { sweepDeadlines } = await import("@/lib/engines/automation/obligationSweep");

const TAG = `vitest-sweep-${Date.now()}`;
const NOW = new Date(Date.UTC(2097, 6, 15, 12, 0, 0)); // 2097-07-15
const GROUP_CHAT = BigInt(-Date.now()); // unique negative (telegram group id shakli)
/** Mas'ul xodimning shaxsiy chat id'si — eslatma shu yerga borishi kerak. */
const ACC_TG = BigInt(993_000_000_000 + (Date.now() % 100000));
const ids = { user: "", company: "", template: "", oblSoon: "", oblOverdue: "" };

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: `${TAG}@vitest.local`,
      fullName: `${TAG} acc`,
      passwordHash: "x",
      role: "accountant",
      telegramUserId: ACC_TG,
    },
    select: { id: true },
  });
  ids.user = user.id;
  const company = await prisma.company.create({
    data: { name: `${TAG} MChJ`, inn: "000000000", taxRegime: "vat" },
    select: { id: true },
  });
  ids.company = company.id;
  await prisma.telegramGroup.create({ data: { chatId: GROUP_CHAT, companyId: ids.company } });
  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`,
      name: "Sweep test",
      obligationType: "tax_declaration",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2097, 0, 1)),
      lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;

  const soon = await prisma.obligation.create({
    data: {
      companyId: ids.company,
      templateId: ids.template,
      templateVersion: 1,
      periodStart: new Date(Date.UTC(2097, 6, 1)),
      periodEnd: new Date(Date.UTC(2097, 7, 1)),
      periodKey: "2097-M07",
      dueAt: new Date(Date.UTC(2097, 6, 17)), // NOW + 2 kun
      status: "planned",
      responsibleUserId: ids.user,
    },
    select: { id: true },
  });
  ids.oblSoon = soon.id;

  const overdue = await prisma.obligation.create({
    data: {
      companyId: ids.company,
      templateId: ids.template,
      templateVersion: 1,
      periodStart: new Date(Date.UTC(2097, 5, 1)),
      periodEnd: new Date(Date.UTC(2097, 6, 1)),
      periodKey: "2097-M06",
      dueAt: new Date(Date.UTC(2097, 6, 14)), // NOW - 1 kun
      status: "planned",
      responsibleUserId: ids.user,
    },
    select: { id: true },
  });
  ids.oblOverdue = overdue.id;
});

afterAll(async () => {
  await prisma.notificationDelivery.deleteMany({
    where: { OR: [{ dedupKey: { startsWith: `obligation:${ids.oblSoon}` } }, { dedupKey: { startsWith: `obligation:${ids.oblOverdue}` } }] },
  });
  await prisma.notificationDelivery.deleteMany({ where: { recipientId: ids.user } });
  await prisma.notification.deleteMany({ where: { userId: ids.user } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.telegramGroup.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("sweepDeadlines", () => {
  it("creates D-5 and D-3 reminders for an obligation due in 2 days", async () => {
    await sweepDeadlines(prisma, { now: NOW });
    const keys = await prisma.notificationDelivery.findMany({
      where: { dedupKey: { startsWith: `obligation:${ids.oblSoon}:reminder:` } },
      select: { dedupKey: true },
    });
    const set = keys.map((k) => k.dedupKey);
    expect(set).toContain(`obligation:${ids.oblSoon}:reminder:D-5`);
    expect(set).toContain(`obligation:${ids.oblSoon}:reminder:D-3`);
    expect(set).not.toContain(`obligation:${ids.oblSoon}:reminder:D-1`); // 2 kun qoldi
  });

  it("marks first-overdue for a past-due obligation", async () => {
    const o = await prisma.obligation.findUnique({ where: { id: ids.oblOverdue }, select: { firstOverdueAt: true } });
    expect(o!.firstOverdueAt).not.toBeNull();
  });

  it("is idempotent — a second sweep dedups, no new delivery rows", async () => {
    const before = await prisma.notificationDelivery.count({
      where: { dedupKey: { startsWith: `obligation:${ids.oblSoon}` } },
    });
    const res = await sweepDeadlines(prisma, { now: NOW });
    expect(res.remindersDeduped).toBeGreaterThanOrEqual(2);
    const after = await prisma.notificationDelivery.count({
      where: { dedupKey: { startsWith: `obligation:${ids.oblSoon}` } },
    });
    expect(after).toBe(before); // dublikat yo'q
  });
});

describe("sweepDeadlines — endi xabar YUBORMAYDI, daftar yuritadi", () => {
  // Bungacha sweep har majburiyat uchun in-app xabar + Telegram DM yozardi va
  // xabar soni ochiq qatorlar soniga proporsional edi (6 255 majburiyat →
  // bitta yurishda 44 846 ta bildirishnoma, 100% o'qilmagan). Endi u faqat
  // bosqichlarni qayd etadi; ko'rinadigan xabarni kunlik yig'ma chiqaradi.
  it("majburiyat bo'yicha bironta ham Notification yozmaydi", async () => {
    await prisma.notification.deleteMany({ where: { userId: ids.user } });
    await sweepDeadlines(prisma, { now: NOW });
    const rows = await prisma.notification.count({ where: { userId: ids.user } });
    expect(rows).toBe(0);
  });

  it("bosqich daftari `claimed` bo'ladi — soxta `sent` emas", async () => {
    const rows = await prisma.notificationDelivery.findMany({
      where: { channel: "inapp", dedupKey: { startsWith: `obligation:${ids.oblSoon}:reminder:` } },
      select: { status: true, sentAt: true },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // Bu qatorlar ortida hech qanday jo'natish yo'q, shuning uchun ular
    // "yuborildi" deb ko'rinmasligi kerak.
    expect(rows.every((r) => r.status === "claimed")).toBe(true);
    expect(rows.every((r) => r.sentAt === null)).toBe(true);
  });

  it("zanjir bosqichini QAYD etadi, lekin xabar yubormaydi", async () => {
    const SUP_TG = ACC_TG + BigInt(1);
    const supervisor = await prisma.user.create({
      data: {
        email: `${TAG}-sup@vitest.local`,
        fullName: `${TAG} sup`,
        passwordHash: "x",
        role: "supervisor",
        telegramUserId: SUP_TG,
      },
      select: { id: true },
    });
    await prisma.company.update({
      where: { id: ids.company },
      data: { supervisorId: supervisor.id },
    });

    // Only OUR obligations matter — the dev database holds plenty of others.
    const mine = new Set([ids.oblSoon, ids.oblOverdue]);
    const alerts: Array<{ level: number; userId: string }> = [];
    const spy = async (r: { level: number; userId: string }, s: { entityId: string }) => {
      if (mine.has(s.entityId)) alerts.push({ level: r.level, userId: r.userId });
      return "sent" as const;
    };

    await sweepDeadlines(prisma, { now: NOW, sendEscalation: spy });

    // Zanjir qayd etildi…
    const claim = await prisma.notificationDelivery.findFirst({
      where: { channel: "escalation", dedupKey: `obligation:${ids.oblOverdue}:esc:L1` },
    });
    expect(claim).not.toBeNull();
    expect(claim!.recipientId).toBe(supervisor.id);
    // …lekin bu "yuborildi" degani EMAS: majburiyat eskalatsiyasi endi
    // `deliverNow: false` bilan ishlaydi.
    expect(claim!.status).toBe("claimed");
    expect(alerts).toHaveLength(0);
    const supNotifications = await prisma.notification.count({ where: { userId: supervisor.id } });
    expect(supNotifications).toBe(0);

    // Takroriy yurish yangi qator yaratmaydi.
    const before = await prisma.notificationDelivery.count({
      where: { channel: "escalation", dedupKey: { startsWith: `obligation:${ids.oblOverdue}:esc:` } },
    });
    await sweepDeadlines(prisma, { now: NOW, sendEscalation: spy });
    const after = await prisma.notificationDelivery.count({
      where: { channel: "escalation", dedupKey: { startsWith: `obligation:${ids.oblOverdue}:esc:` } },
    });
    expect(after).toBe(before);

    await prisma.notificationDelivery.deleteMany({ where: { recipientId: supervisor.id } });
    await prisma.notification.deleteMany({ where: { userId: supervisor.id } });
    await prisma.company.update({ where: { id: ids.company }, data: { supervisorId: null } });
    await prisma.user.deleteMany({ where: { id: supervisor.id } });
  });
});
