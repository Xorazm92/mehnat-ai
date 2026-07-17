import type { PrismaClient } from "@prisma/client";
import { handleCommand } from "../application/handle-command";
import type { RawTelegramUpdate } from "../../monitoring/domain/inbound-message";

export interface CommandReply {
  chatId: bigint;
  text: string;
}

/**
 * Anti-corruption boundary for commands: turn a raw update into a CommandContext
 * and dispatch it. Only fresh `message` updates with a sender and slash text can
 * issue a command. Returns the reply to send, or null.
 */
export async function routeCommand(
  prisma: PrismaClient,
  update: RawTelegramUpdate,
): Promise<CommandReply | null> {
  const msg = update.message;
  if (!msg || !msg.from || !msg.text || !msg.text.startsWith("/")) return null;

  const chatId = BigInt(msg.chat.id);
  const replyFrom = msg.reply_to_message?.from;

  const text = await handleCommand(prisma, {
    chatId,
    chatTitle: msg.chat.title ?? null,
    callerTelegramId: BigInt(msg.from.id),
    callerUsername: msg.from.username ?? null,
    text: msg.text,
    reply: replyFrom
      ? { telegramUserId: BigInt(replyFrom.id), username: replyFrom.username ?? null }
      : undefined,
  });

  return text ? { chatId, text } : null;
}
