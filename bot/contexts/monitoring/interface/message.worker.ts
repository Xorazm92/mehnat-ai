import { Worker, type Job } from "bullmq";
import { logJobFailure, logServerError } from "../../../../lib/logger";
import { prisma } from "../../../../lib/prisma";
import { createRedisConnection } from "../../../queues/connection";
import { QUEUE, appBaseUrl, callbackSecret } from "../../../config";
import { captureUpdate } from "../application/capture-update";
import {
  parseInboundMessage,
  parseChatMemberUpdate,
  parseContact,
  type InboundMessage,
  type RawTelegramUpdate,
} from "../domain/inbound-message";
import { looksLikeQuestion } from "../domain/question-detection";
import { resolveUserIdByTelegramId } from "../../identity/application/identity-service";
import { routeCommand } from "../../identity/interface/command-router";
import { routeCallback } from "../../interaction/interface/callback-router";
import { handleBotAddedToGroup } from "../../identity/application/bind-suggest";
import { linkTelegramByPhone } from "../../identity/application/link-by-phone";
import { mainMenuKeyboard, renderMenu } from "../../interaction/application/menu";
import { removeKeyboard } from "../../../telegram/keyboard";
import {
  answerCallbackQuery,
  editMessageReplyMarkup,
  editMessageText,
  sendMessage,
  sendPhoto,
} from "../../../telegram/bot";
import { handleGroupPhoto } from "../../billing/application/receipt-flow";
import { deliver } from "../../../telegram/deliver";
import { enqueueQuestionJob } from "../../../queues/question.queue";
import type { TelegramUpdateJob } from "../../../queues/message.queue";

/**
 * A shared contact — the reply to the "📱 Raqamni yuborish" button. This is the
 * primary onboarding path, so it runs before command handling and before any
 * question fan-out.
 */
async function handleContact(update: RawTelegramUpdate, secret: string): Promise<boolean> {
  const contact = parseContact(update);
  if (!contact) return false;

  const res = await linkTelegramByPhone(prisma, {
    telegramUserId: contact.fromUserId,
    telegramUsername: contact.fromUsername ?? null,
    phone: contact.phone,
    isOwnContact: contact.isOwn,
  });

  if (!res.ok) {
    // Keep the contact button up so a corrected attempt is still one tap away,
    // except when the number simply is not ours — then typing will not help
    // either and the message says who to ask.
    await sendMessage(contact.chatId, `⚠️ ${res.message}`);
    return true;
  }

  await sendMessage(contact.chatId, `✅ ${res.message}`, { replyMarkup: removeKeyboard() });
  const user = res.userId
    ? await prisma.user.findUnique({
        where: { id: res.userId },
        select: { fullName: true, role: true },
      })
    : null;
  if (user) {
    await sendMessage(contact.chatId, renderMenu(user.fullName), {
      replyMarkup: mainMenuKeyboard(secret, user.role),
    });
  }
  return true;
}

/**
 * Best-effort side-effects that run once per fresh update: contact linking,
 * command replies and question/answer fan-out. They run AFTER capture has
 * committed, so a failure here must not fail the job (a redelivery would dedup
 * and skip them). The slow Gemini classify happens in the Question worker, not
 * on this capture path.
 */
async function runSideEffects(
  update: RawTelegramUpdate,
  parsed: InboundMessage,
  secret: string,
): Promise<void> {
  // 0) One-tap onboarding beats everything else.
  if (await handleContact(update, secret)) return;

  // 0b) A photo in a group with an open receipt window → straight to the
  //     accountant. Only fires when the client actually pressed the button, so
  //     ordinary group photos are still ignored.
  if (parsed.mediaType === "photo" && parsed.chatId < 0) {
    const forward = await handleGroupPhoto(prisma, {
      chatId: parsed.chatId,
      fileId: parsed.fileId,
      secret,
      appUrl: appBaseUrl() ?? undefined,
    });
    if (forward) {
      await sendPhoto(forward.chatId, forward.fileId, {
        caption: forward.caption,
        replyMarkup: forward.replyMarkup,
      });
      return;
    }
  }

  // 1) Commands → immediate reply (delivery itself is best-effort).
  const reply = await routeCommand(prisma, update, { secret });
  if (reply) {
    try {
      await sendMessage(reply.chatId, reply.text, { replyMarkup: reply.replyMarkup });
    } catch (err) {
      console.error(
        `[message.worker] reply send failed for chat ${reply.chatId}: ${(err as Error).message}`,
      );
    }
    return;
  }
  if (parsed.text?.startsWith("/")) return; // unknown command — not a question

  // 2) A reply may answer a pending question.
  if (parsed.replyToId != null) {
    await enqueueQuestionJob({
      kind: "answer",
      chatId: Number(parsed.chatId),
      replyToMessageId: Number(parsed.replyToId),
      answerMessageId: Number(parsed.messageId),
      fromUserId: parsed.fromUserId != null ? Number(parsed.fromUserId) : undefined,
      answeredAtMs: parsed.createdAt.getTime(),
    });
  }

  // 3) A question-looking text/reply → classify + open (Question worker).
  if (
    (parsed.kind === "text" || parsed.kind === "reply") &&
    looksLikeQuestion(parsed.text)
  ) {
    await enqueueQuestionJob({
      kind: "classify",
      chatId: Number(parsed.chatId),
      messageId: Number(parsed.messageId),
      fromUserId: parsed.fromUserId != null ? Number(parsed.fromUserId) : undefined,
      text: parsed.text ?? "",
      askedAtMs: parsed.createdAt.getTime(),
    });
  }
}

/** A button press: authorize, act, then acknowledge so the spinner stops. */
async function handleCallback(update: RawTelegramUpdate, secret: string): Promise<boolean> {
  const routed = await routeCallback(prisma, update, { secret });
  if (!routed) return false;

  const { callback, outcome } = routed;
  if (outcome.edit && callback.chatId != null && callback.messageId != null) {
    const edited = await editMessageText(callback.chatId, callback.messageId, outcome.edit.text, {
      replyMarkup: outcome.edit.replyMarkup,
    });
    // A button attached to a PHOTO (a forwarded receipt) has no text to edit.
    // Strip its keyboard instead, so the action still visibly cannot repeat.
    if (!edited) {
      await editMessageReplyMarkup(callback.chatId, callback.messageId, outcome.edit.replyMarkup);
    }
  }
  if (outcome.send?.length) {
    await deliver(outcome.send);
  }
  // Always last, and always reached — Telegram spins the button until this runs.
  await answerCallbackQuery(callback.callbackQueryId, {
    text: outcome.answer,
    showAlert: outcome.alert,
  });
  return true;
}

/** The bot was added to (or removed from) a chat. */
async function handleChatMember(update: RawTelegramUpdate, secret: string): Promise<boolean> {
  const ev = parseChatMemberUpdate(update);
  if (!ev) return false;
  const outbox = await handleBotAddedToGroup(prisma, ev, { secret });
  if (outbox.length) await deliver(outbox);
  return true;
}

/**
 * The Message worker: the single processing path for every inbound Telegram
 * update, whichever ingress (webhook or polling) enqueued it. It dedups,
 * attributes the sender, captures the message, then fans out.
 *
 * Callback queries and membership changes carry no chat message, so
 * `parseInboundMessage` returns null for them and only the ProcessedUpdate row
 * is written — the dedup guarantee still holds, which is why they can be
 * dispatched here without any extra bookkeeping.
 */
export function startMessageWorker(): Worker<TelegramUpdateJob> {
  const secret = callbackSecret();

  const worker = new Worker<TelegramUpdateJob>(
    QUEUE.MESSAGE,
    async (job: Job<TelegramUpdateJob>) => {
      const update = job.data.update;

      const parsed = parseInboundMessage(update);
      const resolvedUserId = parsed?.fromUserId
        ? await resolveUserIdByTelegramId(prisma, parsed.fromUserId)
        : null;

      const result = await captureUpdate(prisma, update, resolvedUserId);
      if (result.deduped) return result;

      try {
        if (update.callback_query) {
          await handleCallback(update, secret);
        } else if (update.my_chat_member) {
          await handleChatMember(update, secret);
        } else if (parsed) {
          await runSideEffects(update, parsed, secret);
        }
      } catch (err) {
        console.error(`[message.worker] side-effects failed: ${(err as Error).message}`);
      }

      return result;
    },
    { connection: createRedisConnection(), concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    logJobFailure({
      queue: "message",
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
      err,
    });
  });
  worker.on("error", (err) => {
    logServerError("message.worker", err);
  });

  return worker;
}
