/**
 * Integration tests for the KPI bot's Identity context (Phase B).
 *
 * Exercises the real Prisma write path for linking Telegram accounts to
 * mehnat-ai employees, binding group chats to companies, resolution, and the
 * command dispatcher's authorization. Needs a live Postgres (DATABASE_URL);
 * fixtures are TAG-isolated and torn down per file.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  resolveUserIdByTelegramId,
  resolveCompanyIdByChatId,
} from "@/bot/contexts/identity/application/identity-service";
import { linkTelegramUser } from "@/bot/contexts/identity/application/link-user";
import { bindGroupToCompany } from "@/bot/contexts/identity/application/bind-group";
import { authorizeAdmin } from "@/bot/contexts/identity/application/authorize";
import { handleCommand } from "@/bot/contexts/identity/application/handle-command";
import { routeCommand } from "@/bot/contexts/identity/interface/command-router";

const TAG = `vitest-id-${Date.now()}`;
const ADMIN_TG = BigInt(990_000_000_001);
const NONADMIN_TG = BigInt(990_000_000_002);
const TARGET_TG = BigInt(990_000_000_003);
/** Never linked to any User — exercises the onboarding branch of /start. */
const UNLINKED_TG = BigInt(990_000_000_009);
const CHAT_ID = BigInt(-1009000000000 - (Date.now() % 100000));

const ids = { company: "", admin: "", nonAdmin: "", target: "" };
const targetEmail = `${TAG}-target@vitest.local`;
const companyInn = `77${Date.now() % 100000000}`;

beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `${TAG} company`, inn: companyInn },
    select: { id: true },
  });
  const admin = await prisma.user.create({
    data: {
      email: `${TAG}-admin@vitest.local`,
      fullName: `${TAG} Admin`,
      passwordHash: "x",
      role: "admin",
      telegramUserId: ADMIN_TG,
      telegramUsername: "adminuser",
    },
    select: { id: true },
  });
  const nonAdmin = await prisma.user.create({
    data: {
      email: `${TAG}-nonadmin@vitest.local`,
      fullName: `${TAG} NonAdmin`,
      passwordHash: "x",
      role: "accountant",
      telegramUserId: NONADMIN_TG,
    },
    select: { id: true },
  });
  const target = await prisma.user.create({
    data: {
      email: targetEmail,
      fullName: `${TAG} Target`,
      passwordHash: "x",
      role: "accountant",
    },
    select: { id: true },
  });
  ids.company = company.id;
  ids.admin = admin.id;
  ids.nonAdmin = nonAdmin.id;
  ids.target = target.id;
});

afterAll(async () => {
  const userIds = [ids.admin, ids.nonAdmin, ids.target];
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { recordId: { in: [...userIds, CHAT_ID.toString()] } },
        { userId: { in: userIds } },
      ],
    },
  });
  await prisma.telegramGroup.deleteMany({ where: { chatId: CHAT_ID } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.$disconnect();
});

describe("bindGroupToCompany", () => {
  it("binds a chat to a company (by INN) and resolves it back", async () => {
    const res = await bindGroupToCompany(prisma, {
      chatId: CHAT_ID,
      title: "ACME group",
      companyRef: companyInn,
      byUserId: ids.admin,
    });
    expect(res.ok).toBe(true);
    expect(res.companyId).toBe(ids.company);
    expect(await resolveCompanyIdByChatId(prisma, CHAT_ID)).toBe(ids.company);
  });

  it("fails for an unknown company", async () => {
    const res = await bindGroupToCompany(prisma, {
      chatId: CHAT_ID,
      companyRef: "does-not-exist",
    });
    expect(res.ok).toBe(false);
  });
});

describe("linkTelegramUser", () => {
  it("links a Telegram account to an employee (by email) and resolves it", async () => {
    const res = await linkTelegramUser(prisma, {
      telegramUserId: TARGET_TG,
      telegramUsername: "targetuser",
      identifier: targetEmail,
      byUserId: ids.admin,
    });
    expect(res.ok).toBe(true);
    expect(res.userId).toBe(ids.target);
    expect(await resolveUserIdByTelegramId(prisma, TARGET_TG)).toBe(ids.target);
  });

  it("refuses to hijack a Telegram id already linked elsewhere", async () => {
    const res = await linkTelegramUser(prisma, {
      telegramUserId: ADMIN_TG, // already the admin's
      identifier: targetEmail,
    });
    expect(res.ok).toBe(false);
  });
});

describe("authorizeAdmin", () => {
  it("grants admins and denies non-admins", async () => {
    expect((await authorizeAdmin(prisma, ADMIN_TG)).admin).toBe(true);
    expect((await authorizeAdmin(prisma, NONADMIN_TG)).admin).toBe(false);
  });
});

describe("handleCommand", () => {
  const SECRET = "test-callback-secret";
  const base = { chatId: CHAT_ID, chatTitle: "ACME group", secret: SECRET };

  /** Handlers may answer with a bare string or with text plus a keyboard. */
  const textOf = (reply: Awaited<ReturnType<typeof handleCommand>>): string =>
    reply == null ? "" : typeof reply === "string" ? reply : reply.text;

  it("/whoami reports the linked profile", async () => {
    const reply = await handleCommand(prisma, {
      ...base,
      callerTelegramId: ADMIN_TG,
      text: "/whoami",
    });
    expect(textOf(reply)).toContain("Admin");
    expect(textOf(reply)).toContain("admin");
  });

  it("/bind is blocked for non-admins", async () => {
    const reply = await handleCommand(prisma, {
      ...base,
      callerTelegramId: NONADMIN_TG,
      text: `/bind ${companyInn}`,
    });
    expect(textOf(reply)).toContain("⛔");
  });

  it("/start offers the contact button to an unlinked user in private", async () => {
    const reply = await handleCommand(prisma, {
      ...base,
      chatId: UNLINKED_TG,
      chatType: "private",
      chatTitle: null,
      callerTelegramId: UNLINKED_TG,
      text: "/start",
    });
    expect(typeof reply).toBe("object");
    const markup = (reply as { replyMarkup?: unknown }).replyMarkup as {
      keyboard?: Array<Array<{ request_contact?: boolean }>>;
    };
    expect(markup.keyboard?.[0]?.[0]?.request_contact).toBe(true);
  });

  it("/start shows the menu to a linked user in private", async () => {
    const reply = await handleCommand(prisma, {
      ...base,
      chatId: ADMIN_TG,
      chatType: "private",
      chatTitle: null,
      callerTelegramId: ADMIN_TG,
      text: "/start",
    });
    const markup = (reply as { replyMarkup?: unknown }).replyMarkup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    };
    expect(markup.inline_keyboard?.[0]?.length).toBeGreaterThan(0);
    expect(markup.inline_keyboard?.[0]?.[0]?.callback_data).toBeTruthy();
  });

  it("routeCommand handles a raw /bind update from an admin", async () => {
    const reply = await routeCommand(
      prisma,
      {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: Number(CHAT_ID), type: "supergroup", title: "ACME group" },
          from: { id: Number(ADMIN_TG), username: "adminuser" },
          text: `/bind ${companyInn}`,
        },
      },
      { secret: SECRET },
    );
    expect(reply).not.toBeNull();
    expect(reply!.text).toContain("✅");
  });
});
