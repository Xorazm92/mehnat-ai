/**
 * Integration test for the full billing notification pipeline (Phase F).
 *
 * Drives runBillingReminders with a MOCK Telegram sender (no real messages) and
 * a fixed `now`, covering: yellow/orange/red routing, red in-app notifications
 * (accountant + director), partial payment, fully-paid exclusion, no-group skip,
 * multiple companies, and cron idempotency (re-run sends nothing new).
 *
 * Needs a live Postgres. Fixtures + all rows for the fake period are torn down.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runBillingReminders } from "@/bot/contexts/billing/application/run-reminders";

const TAG = `vitest-bp-${Date.now()}`;
const PERIOD = "2099-08";
const NOW = new Date(2099, 7, 15); // 15 Aug 2099 (day 15)
const CONTRACT = 3_000_000;

const chat = (n: number) => BigInt(-1009800000000 - (Date.now() % 100000) * 10 - n);
const co = { red: "", orange: "", yellow: "", partial: "", paid: "", noGroup: "" };
const chats = { red: chat(1), orange: chat(2), yellow: chat(3), partial: chat(4), paid: chat(5) };
const users = { accountant: "", director: "" };

const sent: { chatId: string; text: string }[] = [];
const sendTelegram = async (chatId: bigint, text: string) => {
  sent.push({ chatId: chatId.toString(), text });
};

async function makeCompany(tag: string, paymentDay: number, withAccountant = false) {
  const c = await prisma.company.create({
    data: {
      name: `${TAG} ${tag}`,
      inn: `91${(Date.now() % 100000000) + paymentDay}`,
      contractAmount: CONTRACT,
      paymentDay,
      isActive: true,
      ...(withAccountant ? { accountantId: users.accountant } : {}),
    },
    select: { id: true },
  });
  return c.id;
}

beforeAll(async () => {
  const accountant = await prisma.user.create({
    data: { email: `${TAG}-acc@vitest.local`, fullName: `${TAG} Acc`, passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  const director = await prisma.user.create({
    data: { email: `${TAG}-dir@vitest.local`, fullName: `${TAG} Dir`, passwordHash: "x", role: "admin" },
    select: { id: true },
  });
  users.accountant = accountant.id;
  users.director = director.id;

  co.red = await makeCompany("red", 5, true); // day15 - due5 = 10 → red
  co.orange = await makeCompany("orange", 11); // 4 → orange
  co.yellow = await makeCompany("yellow", 15); // 0 → yellow
  co.partial = await makeCompany("partial", 5); // 10 → red, partial paid
  co.paid = await makeCompany("paid", 5); // paid → excluded
  co.noGroup = await makeCompany("nogroup", 5); // red but no group → skipped

  await prisma.telegramGroup.createMany({
    data: [
      { chatId: chats.red, companyId: co.red, isActive: true },
      { chatId: chats.orange, companyId: co.orange, isActive: true },
      { chatId: chats.yellow, companyId: co.yellow, isActive: true },
      { chatId: chats.partial, companyId: co.partial, isActive: true },
      { chatId: chats.paid, companyId: co.paid, isActive: true },
    ],
  });
  await prisma.payment.createMany({
    data: [
      { companyId: co.paid, period: PERIOD, amount: CONTRACT, status: "paid" },
      { companyId: co.partial, period: PERIOD, amount: 1_000_000, status: "partial" },
    ],
  });
});

afterAll(async () => {
  const companyIds = Object.values(co);
  await prisma.notification.deleteMany({ where: { link: { contains: `period=${PERIOD}` } } });
  await prisma.paymentReminder.deleteMany({ where: { period: PERIOD } });
  await prisma.payment.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.telegramGroup.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [users.accountant, users.director] } } });
  await prisma.$disconnect();
});

const textTo = (chatId: bigint) => sent.find((s) => s.chatId === chatId.toString())?.text;

describe("runBillingReminders — full pipeline", () => {
  it("routes each escalation level to the group and excludes paid companies", async () => {
    const res = await runBillingReminders(prisma, PERIOD, { sendTelegram, now: NOW });
    expect(res.detected).toBeGreaterThanOrEqual(5);

    expect(textTo(chats.yellow)).toContain("🟡");
    expect(textTo(chats.orange)).toContain("⚠️ Ikkinchi ogohlantirish");
    expect(textTo(chats.red)).toContain("🚨 Oxirgi ogohlantirish");
    expect(textTo(chats.red)).toContain(`${TAG} red`);

    // partial: red with the remaining 2,000,000
    expect(textTo(chats.partial)).toContain("🚨");
    expect(textTo(chats.partial)).toContain("2 000 000 so'm");

    // fully paid → no message
    expect(textTo(chats.paid)).toBeUndefined();
  });

  it("skips a company with no Telegram group", async () => {
    const r = await prisma.paymentReminder.findFirst({
      where: { companyId: co.noGroup, period: PERIOD },
      select: { status: true },
    });
    expect(r?.status).toBe("skipped");
  });

  it("records each sent reminder once (no spam)", async () => {
    const r = await prisma.paymentReminder.findUnique({
      where: { companyId_period_level: { companyId: co.red, period: PERIOD, level: "red" } },
      select: { status: true },
    });
    expect(r?.status).toBe("sent");
  });

  it("creates red in-app notifications for the accountant and the director", async () => {
    const link = `/kassa?company=${co.red}&period=${PERIOD}`;
    const acc = await prisma.notification.count({ where: { userId: users.accountant, link } });
    const dir = await prisma.notification.count({ where: { userId: users.director, link } });
    expect(acc).toBe(1);
    expect(dir).toBe(1);
  });

  it("is idempotent: a re-run sends nothing new and does not duplicate notifications", async () => {
    sent.length = 0;
    const res = await runBillingReminders(prisma, PERIOD, { sendTelegram, now: NOW });

    // none of our companies get re-sent
    for (const c of Object.values(chats)) expect(textTo(c)).toBeUndefined();
    // red, orange, yellow, partial were sent (paid excluded, noGroup skipped).
    expect(res.skippedAlready).toBeGreaterThanOrEqual(4);

    const link = `/kassa?company=${co.red}&period=${PERIOD}`;
    expect(await prisma.notification.count({ where: { userId: users.accountant, link } })).toBe(1);
  });
});
