import type { PrismaClient } from "@prisma/client";
import {
  parseInboundMessage,
  type InboundMessage,
  type RawTelegramUpdate,
} from "../domain/inbound-message";

export interface CaptureResult {
  /** true ⇒ this update_id was already processed; nothing was written. */
  deduped: boolean;
  /** true ⇒ a TelegramMessage row was persisted for this update. */
  captured: boolean;
}

function toMessageData(
  updateId: bigint,
  m: InboundMessage,
  resolvedUserId: string | null,
) {
  return {
    updateId,
    chatId: m.chatId,
    messageId: m.messageId,
    fromUserId: m.fromUserId ?? null,
    userId: resolvedUserId,
    text: m.text ?? null,
    kind: m.kind,
    replyToId: m.replyToId ?? null,
    mediaType: m.mediaType ?? null,
    fileId: m.fileId ?? null,
    createdAt: m.createdAt,
  };
}

/**
 * Idempotently capture one Telegram update.
 *
 * The ProcessedUpdate row (dedup) and the TelegramMessage row (capture) are
 * written in ONE transaction, so a retry can never leave an update marked
 * processed with its message missing, nor capture the same message twice.
 * Telegram delivers at-least-once, so this is the guarantee the whole pipeline
 * relies on.
 *
 * Dedup uses `createMany({ skipDuplicates })` rather than catching a unique
 * violation, so a re-delivered update is a cheap no-op (count 0) instead of a
 * thrown error — important at 10k–100k updates/day where retries are routine.
 */
export async function captureUpdate(
  prisma: PrismaClient,
  update: RawTelegramUpdate,
  resolvedUserId: string | null = null,
): Promise<CaptureResult> {
  const updateId = BigInt(update.update_id);
  const message = parseInboundMessage(update);

  return prisma.$transaction(async (tx) => {
    const inserted = await tx.processedUpdate.createMany({
      data: [{ updateId }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      return { deduped: true, captured: false };
    }
    if (message) {
      await tx.telegramMessage.create({
        data: toMessageData(updateId, message, resolvedUserId),
      });
    }
    return { deduped: false, captured: Boolean(message) };
  });
}
