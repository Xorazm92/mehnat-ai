/**
 * Integration tests for the bot's Interaction layer (button-driven pult).
 *
 * Covers the three paths that replace typing a command: one-tap contact
 * linking, smart bind when the bot joins a group, and callback routing with its
 * authorization. Needs a live Postgres (DATABASE_URL); fixtures are TAG-isolated
 * and torn down per file.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { linkTelegramByPhone } from "@/bot/contexts/identity/application/link-by-phone";
import {
  handleBotAddedToGroup,
  listUnboundCompanies,
} from "@/bot/contexts/identity/application/bind-suggest";
import { routeCallback } from "@/bot/contexts/interaction/interface/callback-router";
import {
  encodeCallback,
  packChatId,
  packUuid,
} from "@/bot/contexts/interaction/domain/callback-token";
import { ACTION } from "@/bot/contexts/interaction/domain/actions";
import type { RawTelegramUpdate } from "@/bot/contexts/monitoring/domain/inbound-message";

const TAG = `vitest-ix-${Date.now()}`;
const SECRET = "vitest-callback-secret";

const ADMIN_TG = BigInt(991_000_000_001);
const STAFF_TG = BigInt(991_000_000_002);
const OUTSIDER_TG = BigInt(991_000_000_003);
const TWIN_A_TG = BigInt(991_000_000_004);

const GROUP_CHAT = BigInt(-1009100000000 - (Date.now() % 100000));

/** The phone the staffer will share, stored on their card in a messier format. */
const STAFF_PHONE_STORED = "+998 90 111 22 33";
const STAFF_PHONE_SHARED = "998901112233";
const TWIN_PHONE = "+998901119999";

const ids = { company: "", admin: "", staff: "", twinA: "", twinB: "" };
const companyInn = `88${Date.now() % 100000000}`;

function upd(partial: Partial<RawTelegramUpdate>): RawTelegramUpdate {
  return { update_id: Date.now() % 1_000_000, ...partial };
}

const from = (id: bigint) => ({ id: Number(id), username: "u" });

beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `${TAG} company`, inn: companyInn, isActive: true },
    select: { id: true },
  });
  const admin = await prisma.user.create({
    data: {
      email: `${TAG}-admin@vitest.local`,
      fullName: `${TAG} Admin`,
      passwordHash: "x",
      role: "admin",
      telegramUserId: ADMIN_TG,
    },
    select: { id: true },
  });
  const staff = await prisma.user.create({
    data: {
      email: `${TAG}-staff@vitest.local`,
      fullName: `${TAG} Staff`,
      passwordHash: "x",
      role: "accountant",
      phone: STAFF_PHONE_STORED,
      phoneNormalized: "901112233",
    },
    select: { id: true },
  });
  // Two active employees sharing one number — linking must refuse, not guess.
  const twinA = await prisma.user.create({
    data: {
      email: `${TAG}-twin-a@vitest.local`,
      fullName: `${TAG} Twin A`,
      passwordHash: "x",
      role: "accountant",
      phone: TWIN_PHONE,
      phoneNormalized: "901119999",
    },
    select: { id: true },
  });
  const twinB = await prisma.user.create({
    data: {
      email: `${TAG}-twin-b@vitest.local`,
      fullName: `${TAG} Twin B`,
      passwordHash: "x",
      role: "accountant",
      phone: TWIN_PHONE,
      phoneNormalized: "901119999",
    },
    select: { id: true },
  });

  ids.company = company.id;
  ids.admin = admin.id;
  ids.staff = staff.id;
  ids.twinA = twinA.id;
  ids.twinB = twinB.id;
});

afterAll(async () => {
  const userIds = [ids.admin, ids.staff, ids.twinA, ids.twinB];
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { recordId: { in: [...userIds, GROUP_CHAT.toString()] } },
        { userId: { in: userIds } },
      ],
    },
  });
  await prisma.telegramGroup.deleteMany({ where: { chatId: GROUP_CHAT } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.$disconnect();
});

describe("linkTelegramByPhone", () => {
  it("links a staffer whose stored number is formatted differently", async () => {
    const res = await linkTelegramByPhone(prisma, {
      telegramUserId: STAFF_TG,
      telegramUsername: "staffer",
      phone: STAFF_PHONE_SHARED,
      isOwnContact: true,
    });
    expect(res.ok).toBe(true);
    expect(res.userId).toBe(ids.staff);

    const linked = await prisma.user.findUnique({
      where: { id: ids.staff },
      select: { telegramUserId: true },
    });
    expect(linked!.telegramUserId).toBe(STAFF_TG);
  });

  it("is idempotent when the same person shares their number again", async () => {
    const res = await linkTelegramByPhone(prisma, {
      telegramUserId: STAFF_TG,
      phone: `+${STAFF_PHONE_SHARED}`,
      isOwnContact: true,
    });
    expect(res.ok).toBe(true);
    expect(res.userId).toBe(ids.staff);
  });

  it("refuses a forwarded third-party contact", async () => {
    const res = await linkTelegramByPhone(prisma, {
      telegramUserId: OUTSIDER_TG,
      phone: STAFF_PHONE_SHARED,
      isOwnContact: false,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_own_contact");
  });

  it("refuses to take over a record already linked to someone else", async () => {
    const res = await linkTelegramByPhone(prisma, {
      telegramUserId: OUTSIDER_TG,
      phone: STAFF_PHONE_SHARED,
      isOwnContact: true,
    });
    expect(res.ok).toBe(false);
  });

  it("refuses an ambiguous number rather than guessing an employee", async () => {
    const res = await linkTelegramByPhone(prisma, {
      telegramUserId: TWIN_A_TG,
      phone: TWIN_PHONE,
      isOwnContact: true,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("ambiguous");
  });

  it("reports an unknown number instead of failing silently", async () => {
    const res = await linkTelegramByPhone(prisma, {
      telegramUserId: OUTSIDER_TG,
      phone: "+998900000001",
      isOwnContact: true,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_found");
  });
});

describe("smart bind", () => {
  it("registers the chat and offers the admin a picker when the bot joins", async () => {
    const outbox = await handleBotAddedToGroup(
      prisma,
      {
        chatId: GROUP_CHAT,
        chatTitle: `${TAG} guruh`,
        chatType: "supergroup",
        actorTelegramId: ADMIN_TG,
        joined: true,
        at: new Date(),
      },
      { secret: SECRET },
    );

    // The chat exists immediately, unbound, so it is never invisible.
    const group = await prisma.telegramGroup.findUnique({ where: { chatId: GROUP_CHAT } });
    expect(group).not.toBeNull();
    expect(group!.companyId).toBeNull();

    // The prompt goes to the admin's DM, not to the group.
    expect(outbox).toHaveLength(1);
    expect(outbox[0].chatId).toBe(ADMIN_TG);
    const markup = outbox[0].replyMarkup as {
      inline_keyboard: Array<Array<{ callback_data?: string }>>;
    };
    expect(markup.inline_keyboard.length).toBeGreaterThan(0);
  });

  it("stays silent when a non-admin adds the bot", async () => {
    const outbox = await handleBotAddedToGroup(
      prisma,
      {
        chatId: GROUP_CHAT,
        chatTitle: `${TAG} guruh`,
        chatType: "supergroup",
        actorTelegramId: STAFF_TG,
        joined: true,
        at: new Date(),
      },
      { secret: SECRET },
    );
    expect(outbox).toEqual([]);
  });

  it("ignores a private chat and a mere permission change", async () => {
    const base = {
      chatId: GROUP_CHAT,
      actorTelegramId: ADMIN_TG,
      at: new Date(),
    };
    expect(
      await handleBotAddedToGroup(
        prisma,
        { ...base, chatType: "private", joined: true },
        { secret: SECRET },
      ),
    ).toEqual([]);
    expect(
      await handleBotAddedToGroup(
        prisma,
        { ...base, chatType: "supergroup", joined: false },
        { secret: SECRET },
      ),
    ).toEqual([]);
  });

  it("excludes companies that already have a live group", async () => {
    // The dev database holds real companies, so assert on the total rather than
    // on page 0 — which company lands on which page is not ours to control.
    const before = await listUnboundCompanies(prisma, 0);

    await prisma.telegramGroup.update({
      where: { chatId: GROUP_CHAT },
      data: { companyId: ids.company },
    });
    const after = await listUnboundCompanies(prisma, 0);
    expect(after.total).toBe(before.total - 1);

    await prisma.telegramGroup.update({
      where: { chatId: GROUP_CHAT },
      data: { companyId: null },
    });
    expect((await listUnboundCompanies(prisma, 0)).total).toBe(before.total);
  });

  it("clamps an out-of-range page instead of returning an empty screen", async () => {
    const page = await listUnboundCompanies(prisma, 99_999);
    expect(page.page).toBe(page.totalPages - 1);
    expect(page.companies.length).toBeGreaterThan(0);
  });
});

describe("routeCallback", () => {
  const callbackUpdate = (tg: bigint, data: string) =>
    upd({
      callback_query: {
        id: `cq-${Date.now()}`,
        from: from(tg),
        data,
        message: { message_id: 77, chat: { id: Number(tg), type: "private" } },
      },
    });

  it("returns null for an update that is not a callback", async () => {
    expect(await routeCallback(prisma, upd({}), { secret: SECRET })).toBeNull();
  });

  it("rejects callback_data we did not sign", async () => {
    const routed = await routeCallback(
      prisma,
      callbackUpdate(ADMIN_TG, "deadbeef:bnd:whatever"),
      { secret: SECRET },
    );
    expect(routed!.outcome.answer).toMatch(/eskirgan/i);
    expect(routed!.outcome.alert).toBe(true);
  });

  it("denies an admin action to a non-admin", async () => {
    const data = encodeCallback(
      SECRET,
      ACTION.BIND_PICK,
      `${packChatId(GROUP_CHAT)}:${packUuid(ids.company)}`,
    );
    const routed = await routeCallback(prisma, callbackUpdate(STAFF_TG, data), {
      secret: SECRET,
    });
    expect(routed!.outcome.answer).toMatch(/⛔/);

    const group = await prisma.telegramGroup.findUnique({ where: { chatId: GROUP_CHAT } });
    expect(group!.companyId).toBeNull(); // nothing happened
  });

  it("binds the group when the admin picks a company", async () => {
    const data = encodeCallback(
      SECRET,
      ACTION.BIND_PICK,
      `${packChatId(GROUP_CHAT)}:${packUuid(ids.company)}`,
    );
    const routed = await routeCallback(prisma, callbackUpdate(ADMIN_TG, data), {
      secret: SECRET,
    });
    expect(routed!.outcome.answer).toContain("✅");
    // The keyboard is replaced, so the choice cannot be re-pressed.
    expect(routed!.outcome.edit?.replyMarkup).toBeUndefined();

    const group = await prisma.telegramGroup.findUnique({ where: { chatId: GROUP_CHAT } });
    expect(group!.companyId).toBe(ids.company);
  });

  it("is idempotent when the same bind button is pressed twice", async () => {
    const data = encodeCallback(
      SECRET,
      ACTION.BIND_PICK,
      `${packChatId(GROUP_CHAT)}:${packUuid(ids.company)}`,
    );
    const routed = await routeCallback(prisma, callbackUpdate(ADMIN_TG, data), {
      secret: SECRET,
    });
    expect(routed!.outcome.answer).toContain("✅");

    const groups = await prisma.telegramGroup.findMany({ where: { chatId: GROUP_CHAT } });
    expect(groups).toHaveLength(1);
    expect(groups[0].companyId).toBe(ids.company);
  });

  it("turns an unlinked presser away from user actions", async () => {
    const data = encodeCallback(SECRET, ACTION.MENU_KPI);
    const routed = await routeCallback(prisma, callbackUpdate(OUTSIDER_TG, data), {
      secret: SECRET,
    });
    expect(routed!.outcome.answer).toMatch(/start/i);
    expect(routed!.outcome.alert).toBe(true);
  });

  it("renders the KPI screen for a linked user", async () => {
    const data = encodeCallback(SECRET, ACTION.MENU_KPI);
    const routed = await routeCallback(prisma, callbackUpdate(STAFF_TG, data), {
      secret: SECRET,
    });
    expect(routed!.outcome.edit?.text).toContain(`${TAG} Staff`);
    // Drill-down screens keep a way back to the menu.
    expect(routed!.outcome.edit?.replyMarkup?.inline_keyboard.length).toBe(1);
  });

  it("renders the tasks screen for a linked user", async () => {
    const data = encodeCallback(SECRET, ACTION.MENU_TASKS);
    const routed = await routeCallback(prisma, callbackUpdate(STAFF_TG, data), {
      secret: SECRET,
    });
    expect(routed!.outcome.edit?.text).toBeTruthy();
  });
});
