/**
 * Integration tests for the client payment-receipt flow (Faza 4).
 *
 * The value being protected: a photo posted in a client group reaches the
 * responsible accountant ONLY when the client actually asked to send a receipt,
 * and confirming it never writes money. Needs a live Postgres and Redis.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  handleReceiptAsk,
  handleGroupPhoto,
  receiptButton,
} from "@/bot/contexts/billing/application/receipt-flow";
import { takeReceiptExpectation } from "@/bot/contexts/billing/infrastructure/receipt-window";
import { getSharedRedis } from "@/bot/queues/connection";
import { decodeCallback } from "@/bot/contexts/interaction/domain/callback-token";
import { ACTION } from "@/bot/contexts/interaction/domain/actions";

const TAG = `vitest-rcpt-${Date.now()}`;
const SECRET = "vitest-receipt-secret";
const GROUP_CHAT = BigInt(-1009400000000 - (Date.now() % 100000));
const UNBOUND_CHAT = GROUP_CHAT - BigInt(1);
const ACC_TG = BigInt(995_000_000_000 + (Date.now() % 100000));

const ids = { company: "", accountant: "" };

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
  const company = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`,
      inn: `71${Date.now() % 100000000}`,
      isActive: true,
      accountantId: accountant.id,
    },
    select: { id: true },
  });
  await prisma.telegramGroup.create({
    data: { chatId: GROUP_CHAT, companyId: company.id, isActive: true },
  });
  // A chat the bot knows about but that is not bound to any company yet.
  await prisma.telegramGroup.create({ data: { chatId: UNBOUND_CHAT, companyId: null } });

  ids.accountant = accountant.id;
  ids.company = company.id;
});

afterAll(async () => {
  await getSharedRedis().del(`asro:receipt-expect:${GROUP_CHAT}`);
  await prisma.notification.deleteMany({ where: { userId: ids.accountant } });
  await prisma.telegramGroup.deleteMany({ where: { chatId: { in: [GROUP_CHAT, UNBOUND_CHAT] } } });
  await prisma.user.deleteMany({ where: { id: ids.accountant } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await getSharedRedis().quit();
  await prisma.$disconnect();
});

describe("receiptButton", () => {
  it("carries a signed callback the client can press", () => {
    const kb = receiptButton(SECRET);
    const data = (kb.inline_keyboard[0][0] as { callback_data: string }).callback_data;
    expect(decodeCallback(SECRET, data)).toEqual({ action: ACTION.RECEIPT_ASK, id: "" });
  });
});

describe("handleReceiptAsk", () => {
  it("opens the window and posts the instruction in the group", async () => {
    const outcome = await handleReceiptAsk(prisma, GROUP_CHAT);
    expect(outcome.answer).toMatch(/kvitansiya/i);
    expect(outcome.send?.[0]?.chatId).toBe(GROUP_CHAT);

    // The window is armed — read it back without consuming through the helper.
    const stored = await getSharedRedis().get(`asro:receipt-expect:${GROUP_CHAT}`);
    expect(stored).toMatch(/^\d{4}-\d{2}$/);
  });

  it("refuses a chat that is not bound to a company", async () => {
    const outcome = await handleReceiptAsk(prisma, UNBOUND_CHAT);
    expect(outcome.alert).toBe(true);
    expect(await getSharedRedis().get(`asro:receipt-expect:${UNBOUND_CHAT}`)).toBeNull();
  });

  it("refuses a callback with no chat context", async () => {
    expect((await handleReceiptAsk(prisma, undefined)).alert).toBe(true);
  });
});

describe("handleGroupPhoto", () => {
  it("ignores an ordinary group photo when no window is open", async () => {
    await takeReceiptExpectation(GROUP_CHAT); // make sure the window is closed
    const res = await handleGroupPhoto(prisma, {
      chatId: GROUP_CHAT,
      fileId: "AgACphoto1",
      secret: SECRET,
    });
    expect(res).toBeNull();
  });

  it("forwards to the accountant once the client has asked", async () => {
    await handleReceiptAsk(prisma, GROUP_CHAT);
    const res = await handleGroupPhoto(prisma, {
      chatId: GROUP_CHAT,
      fileId: "AgACphoto2",
      secret: SECRET,
      appUrl: "https://asro.uz",
    });

    expect(res).not.toBeNull();
    expect(res!.chatId).toBe(ACC_TG); // the accountant's private chat
    expect(res!.fileId).toBe("AgACphoto2"); // re-sent by file_id, never downloaded
    expect(res!.caption).toContain(`${TAG} MChJ`);

    // The ✅ path is a LINK into the ERP, not a money write.
    const buttons = res!.replyMarkup.inline_keyboard.flat();
    const link = buttons.find((b) => "url" in b) as { url: string } | undefined;
    expect(link?.url).toContain("/kassa?company=");

    // In-app notification is the channel of record.
    const note = await prisma.notification.findFirst({
      where: { userId: ids.accountant, type: "payment_receipt" },
    });
    expect(note).not.toBeNull();
  });

  it("consumes the window, so a second photo is not forwarded again", async () => {
    await handleReceiptAsk(prisma, GROUP_CHAT);
    const first = await handleGroupPhoto(prisma, {
      chatId: GROUP_CHAT,
      fileId: "AgACphoto3",
      secret: SECRET,
    });
    expect(first).not.toBeNull();

    const second = await handleGroupPhoto(prisma, {
      chatId: GROUP_CHAT,
      fileId: "AgACphoto4",
      secret: SECRET,
    });
    expect(second).toBeNull();
  });

  it("never writes a Payment row", async () => {
    // Recording money needs an amount, a period lock and double-entry ledger
    // rows — a button cannot supply any of that. See receipt-flow.ts.
    const payments = await prisma.payment.findMany({ where: { companyId: ids.company } });
    expect(payments).toHaveLength(0);
  });

  it("ignores a photo with no file_id", async () => {
    await handleReceiptAsk(prisma, GROUP_CHAT);
    expect(
      await handleGroupPhoto(prisma, { chatId: GROUP_CHAT, fileId: undefined, secret: SECRET }),
    ).toBeNull();
  });
});
