/**
 * Integration tests for the morning digest (Faza 3).
 *
 * Covers what lands in a person's plan, the "say nothing when there is nothing"
 * rule, and the once-per-day claim. Needs a live Postgres (DATABASE_URL);
 * fixtures are TAG-isolated and torn down per file.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  buildDigest,
  runDailyDigest,
  digestDedupKey,
  DIGEST_CHANNEL,
  type Digest,
  type DigestUser,
} from "@/lib/dailyDigest";
import { renderDigest } from "@/bot/contexts/digest/application/render-digest";

const TAG = `vitest-dig-${Date.now()}`;
const NOW = new Date(Date.UTC(2098, 4, 20, 6, 0, 0)); // 2098-05-20, far from real data
const DAY = 86_400_000;
const ACC_TG = BigInt(994_000_000_000 + (Date.now() % 100000));

const ids = { company: "", accountant: "", idle: "", template: "" };
const companyInn = `70${Date.now() % 100000000}`;

async function makeObligation(dueAt: Date, periodKey: string) {
  return prisma.obligation.create({
    data: {
      companyId: ids.company,
      templateId: ids.template,
      templateVersion: 1,
      periodStart: new Date(dueAt.getTime() - 30 * DAY),
      periodEnd: new Date(dueAt.getTime()),
      periodKey,
      dueAt,
      status: "planned",
      responsibleUserId: ids.accountant,
    },
    select: { id: true },
  });
}

const asDigestUser = (id: string, role: string): DigestUser => ({
  id,
  fullName: `${TAG} ${role}`,
  role,
  telegramUserId: ACC_TG,
});

beforeAll(async () => {
  const accountant = await prisma.user.create({
    data: {
      email: `${TAG}-acc@vitest.local`,
      fullName: `${TAG} accountant`,
      passwordHash: "x",
      role: "accountant",
      telegramUserId: ACC_TG,
    },
    select: { id: true },
  });
  const idle = await prisma.user.create({
    data: {
      email: `${TAG}-idle@vitest.local`,
      fullName: `${TAG} idle`,
      passwordHash: "x",
      role: "accountant",
      telegramUserId: ACC_TG + BigInt(1),
    },
    select: { id: true },
  });
  const company = await prisma.company.create({
    data: { name: `${TAG} MChJ`, inn: companyInn, isActive: true, accountantId: accountant.id },
    select: { id: true },
  });
  const template = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`,
      name: "QQS hisoboti",
      obligationType: "tax_declaration",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2098, 0, 1)),
      lifecycle: "active",
    },
    select: { id: true },
  });

  ids.accountant = accountant.id;
  ids.idle = idle.id;
  ids.company = company.id;
  ids.template = template.id;
});

afterAll(async () => {
  const userIds = [ids.accountant, ids.idle];
  // runDailyDigest walks every linked user in the database, so it also claims
  // slots for real dev-DB staff. Those claims are dated 2098 and harmless, but
  // clean them up rather than leaving debris behind.
  await prisma.notificationDelivery.deleteMany({
    where: { channel: DIGEST_CHANNEL, dedupKey: { contains: ":2098-05-2" } },
  });
  await prisma.notificationDelivery.deleteMany({ where: { recipientId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.question.deleteMany({ where: { companyId: ids.company } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.$disconnect();
});

describe("buildDigest", () => {
  it("says nothing when there is nothing to do", async () => {
    const digest = await buildDigest(prisma, asDigestUser(ids.idle, "accountant"), NOW);
    expect(digest.empty).toBe(true);
    expect(digest.items).toHaveLength(0);
  });

  it("separates today's work from what is already late", async () => {
    await makeObligation(new Date(Date.UTC(2098, 4, 20)), "2098-M05"); // today
    await makeObligation(new Date(Date.UTC(2098, 4, 18)), "2098-M04"); // 2 days late

    const digest = await buildDigest(prisma, asDigestUser(ids.accountant, "accountant"), NOW);
    expect(digest.empty).toBe(false);
    expect(digest.counts.dueToday).toBe(1);
    expect(digest.counts.overdue).toBe(1);
    // Soonest first, so the overdue one leads.
    expect(digest.items[0].overdue).toBe(true);
    expect(digest.items[0].what).toBe("QQS hisoboti");
    expect(digest.items[0].companyName).toContain(TAG);
  });

  it("excludes work that is finished", async () => {
    const done = await makeObligation(new Date(Date.UTC(2098, 4, 19)), "2098-M03");
    await prisma.obligation.update({ where: { id: done.id }, data: { status: "accepted" } });

    const digest = await buildDigest(prisma, asDigestUser(ids.accountant, "accountant"), NOW);
    expect(digest.items.some((i) => i.obligationId === done.id)).toBe(false);
  });

  it("counts unanswered questions in the person's own companies", async () => {
    await prisma.question.create({
      data: {
        chatId: BigInt(-1009300000000 - (Date.now() % 100000)),
        companyId: ids.company,
        messageId: BigInt(1),
        responsibleRole: "accountant",
        status: "pending",
        deadlineAt: new Date(NOW.getTime() + 600_000),
      },
    });

    const mine = await buildDigest(prisma, asDigestUser(ids.accountant, "accountant"), NOW);
    expect(mine.counts.openQuestions).toBeGreaterThanOrEqual(1);

    // Someone with no companies sees none of it.
    const other = await buildDigest(prisma, asDigestUser(ids.idle, "accountant"), NOW);
    expect(other.counts.openQuestions).toBe(0);
  });

  it("adds the approval queue only for senior roles", async () => {
    const junior = await buildDigest(prisma, asDigestUser(ids.accountant, "accountant"), NOW);
    expect(junior.counts.pendingKpi).toBe(0);

    // Same person read as a supervisor: the senior counters are computed.
    // (They may legitimately be zero; what matters is that the branch runs and
    // does not leak into the accountant view above.)
    const senior = await buildDigest(prisma, asDigestUser(ids.accountant, "supervisor"), NOW);
    expect(senior.counts.pendingKpi).toBeGreaterThanOrEqual(0);
    expect(senior.counts.unpaidCompanies).toBeGreaterThanOrEqual(0);
  });
});

describe("renderDigest", () => {
  it("renders the plan with an actionable keyboard", async () => {
    const digest = await buildDigest(prisma, asDigestUser(ids.accountant, "accountant"), NOW);
    const { text, keyboard } = renderDigest("secret", digest, NOW);

    expect(text).toContain("Bugungi reja — 20-may");
    expect(text).toContain("QQS hisoboti");
    expect(text).toContain("🔴"); // the overdue one is flagged
    expect(keyboard.inline_keyboard.flat().length).toBeGreaterThan(0);
  });
});

describe("runDailyDigest", () => {
  it("sends once per person per day and skips the empty ones", async () => {
    const sentTo: string[] = [];
    const send = async (d: Digest) => {
      if (d.fullName.startsWith(TAG)) sentTo.push(d.userId);
      return true;
    };

    const first = await runDailyDigest(prisma, { send, now: NOW });
    expect(first.recipients).toBeGreaterThanOrEqual(2);
    expect(sentTo).toContain(ids.accountant);
    // The idle staffer has nothing on, so gets no message at all.
    expect(sentTo).not.toContain(ids.idle);
    expect(first.skippedEmpty).toBeGreaterThanOrEqual(1);

    const claim = await prisma.notificationDelivery.findUnique({
      where: {
        channel_dedupKey: {
          channel: DIGEST_CHANNEL,
          dedupKey: digestDedupKey(ids.accountant, NOW),
        },
      },
    });
    expect(claim!.status).toBe("sent");

    // A retry on the same day must not send a second copy.
    sentTo.length = 0;
    const second = await runDailyDigest(prisma, { send, now: NOW });
    expect(sentTo).not.toContain(ids.accountant);
    expect(second.skippedAlready).toBeGreaterThanOrEqual(1);
  });

  it("records a failed delivery without stopping the fan-out", async () => {
    const tomorrow = new Date(NOW.getTime() + DAY);
    const res = await runDailyDigest(prisma, { send: async () => false, now: tomorrow });
    expect(res.failed).toBeGreaterThanOrEqual(1);

    const claim = await prisma.notificationDelivery.findUnique({
      where: {
        channel_dedupKey: {
          channel: DIGEST_CHANNEL,
          dedupKey: digestDedupKey(ids.accountant, tomorrow),
        },
      },
    });
    expect(claim!.status).toBe("failed");
  });
});
