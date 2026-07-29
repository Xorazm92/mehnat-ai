import type { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "../../../../lib/auditTrail";
import { encodeCallback } from "../../interaction/domain/callback-token";
import { ACTION } from "../../interaction/domain/actions";
import { cbButton, inlineKeyboard, urlButton } from "../../../telegram/keyboard";
import type { CallbackOutcome } from "../../interaction/domain/outbound";
import { expectReceipt, takeReceiptExpectation } from "../infrastructure/receipt-window";

export interface ReceiptForward {
  /** Accountant's private chat. */
  chatId: bigint;
  fileId: string;
  caption: string;
  replyMarkup: ReturnType<typeof inlineKeyboard>;
}

/** The button attached to a payment reminder in the client's group. */
export function receiptButton(secret: string) {
  return inlineKeyboard([
    [cbButton("📄 Kvitansiya yuborish", encodeCallback(secret, ACTION.RECEIPT_ASK))],
  ]);
}

/**
 * The client pressed "📄 Kvitansiya yuborish" in their group.
 *
 * Pressed by a CLIENT, who has no ASRO account — so this is one of the few
 * callbacks that must not demand a linked user. It is safe because it only
 * arms a window on a chat that is already bound to a company, and reveals
 * nothing about the company beyond what the reminder already said.
 */
export async function handleReceiptAsk(
  prisma: PrismaClient,
  chatId: bigint | undefined,
): Promise<CallbackOutcome> {
  if (chatId == null) return { answer: "Bu tugma eskirgan.", alert: true };

  const group = await prisma.telegramGroup.findUnique({
    where: { chatId },
    select: { companyId: true, isActive: true },
  });
  if (!group?.isActive || !group.companyId) {
    return { answer: "Bu guruh korxonaga bog'lanmagan.", alert: true };
  }

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await expectReceipt(chatId, period);

  return {
    answer: "Kvitansiya rasmini shu yerga yuboring",
    send: [
      {
        chatId,
        text: "📄 To'lov kvitansiyasi rasmini shu yerga yuboring — buxgalterga yetkazamiz.",
        bestEffort: true,
      },
    ],
  };
}

/**
 * A photo arrived in a group. Returns what to forward, or null when this chat
 * has no open receipt window (i.e. it is just an ordinary photo).
 *
 * The photo is NOT downloaded: Telegram accepts the original `file_id` when
 * re-sending, so the receipt never touches our storage.
 */
export async function handleGroupPhoto(
  prisma: PrismaClient,
  input: { chatId: bigint; fileId: string | undefined; secret: string; appUrl?: string },
): Promise<ReceiptForward | null> {
  if (!input.fileId) return null;

  const period = await takeReceiptExpectation(input.chatId);
  if (!period) return null;

  const group = await prisma.telegramGroup.findUnique({
    where: { chatId: input.chatId },
    select: { companyId: true },
  });
  if (!group?.companyId) return null;

  const company = await prisma.company.findUnique({
    where: { id: group.companyId },
    select: { id: true, name: true, accountantId: true },
  });
  if (!company?.accountantId) return null;

  const accountant = await prisma.user.findUnique({
    where: { id: company.accountantId },
    select: { id: true, telegramUserId: true, isActive: true },
  });

  // In-app is the channel of record — it survives an unreachable Telegram chat.
  await prisma.notification.create({
    data: {
      userId: company.accountantId,
      type: "payment_receipt",
      title: `To'lov kvitansiyasi — ${company.name}`,
      message: `Mijoz ${period} davri uchun kvitansiya yubordi. Summani kassaga kiriting.`,
      link: `/kassa?company=${company.id}&period=${period}`,
    },
  });

  if (!accountant?.isActive || accountant.telegramUserId == null) return null;

  // The ✅ path is a LINK, not a write. Recording a payment posts double-entry
  // ledger rows against a period lock and needs the real amount — a button can
  // only guess it. So the bot delivers the receipt and drops the accountant on
  // the screen where the number is typed.
  const buttons = [
    input.appUrl
      ? [urlButton("💳 Kassaga kiritish", `${input.appUrl}/kassa?company=${company.id}&period=${period}`)]
      : null,
    [cbButton("❌ Kvitansiya emas", encodeCallback(input.secret, ACTION.RECEIPT_DISMISS, company.id))],
  ];

  return {
    chatId: accountant.telegramUserId,
    fileId: input.fileId,
    caption: `📄 To'lov kvitansiyasi\n${company.name} — ${period}`,
    replyMarkup: inlineKeyboard(buttons),
  };
}

/** The accountant says the forwarded photo was not a receipt. */
export async function handleReceiptDismiss(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
): Promise<CallbackOutcome> {
  await recordAuditLog({
    userId: actorId,
    action: "update",
    tableName: "Company",
    recordId: companyId,
    newData: { receiptDismissed: true, via: "telegram" },
  });
  return {
    answer: "Bekor qilindi",
    edit: { text: "❌ Kvitansiya emas deb belgilandi." },
  };
}
