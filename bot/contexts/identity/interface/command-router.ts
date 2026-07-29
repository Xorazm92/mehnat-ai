import type { PrismaClient } from "@prisma/client";
import { handleCommand } from "../application/handle-command";
import type { RawTelegramUpdate } from "../../monitoring/domain/inbound-message";
import type { ReplyMarkup } from "../../../telegram/keyboard";

export interface CommandReply {
  chatId: bigint;
  text: string;
  replyMarkup?: ReplyMarkup;
}

/**
 * Anti-corruption boundary for commands: turn a raw update into a CommandContext
 * and dispatch it. Only fresh `message` updates with a sender and slash text can
 * issue a command. Returns the reply to send, or null.
 */
export async function routeCommand(
  prisma: PrismaClient,
  update: RawTelegramUpdate,
  opts: { secret: string },
): Promise<CommandReply | null> {
  const msg = update.message;
  if (!msg || !msg.from || !msg.text || !msg.text.startsWith("/")) return null;

  const chatId = BigInt(msg.chat.id);
  const replyFrom = msg.reply_to_message?.from;

  const reply = await handleCommand(prisma, {
    chatId,
    chatType: msg.chat.type ?? null,
    chatTitle: msg.chat.title ?? null,
    callerTelegramId: BigInt(msg.from.id),
    callerUsername: msg.from.username ?? null,
    text: msg.text,
    secret: opts.secret,
    reply: replyFrom
      ? { telegramUserId: BigInt(replyFrom.id), username: replyFrom.username ?? null }
      : undefined,
  });

  if (!reply) return null;
  return typeof reply === "string"
    ? { chatId, text: reply }
    : { chatId, text: reply.text, replyMarkup: reply.replyMarkup };
}
