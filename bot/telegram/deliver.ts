import { trySendMessage } from "./bot";
import type { OutboundMessage } from "../contexts/interaction/domain/outbound";

export interface DeliveryReport {
  sent: number;
  /** Recipients the bot cannot write to — they never pressed Start. */
  unreachable: bigint[];
  failed: number;
}

/**
 * Deliver what a handler asked for.
 *
 * A bot cannot open a private conversation, so writing to a staffer who never
 * pressed Start fails with 403. That is an onboarding gap, not an incident:
 * it is reported back so the caller can fall back to an in-app Notification
 * rather than retrying forever.
 */
export async function deliver(messages: OutboundMessage[]): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, unreachable: [], failed: 0 };

  for (const m of messages) {
    const res = await trySendMessage(m.chatId, m.text, { replyMarkup: m.replyMarkup });
    if (res.ok) {
      report.sent++;
      continue;
    }
    if (res.reason === "no_private_chat") {
      report.unreachable.push(m.chatId);
      console.warn(`[telegram] unreachable chat ${m.chatId} — user has not started the bot`);
      continue;
    }
    report.failed++;
    console.error(`[telegram] delivery failed for ${m.chatId}: ${res.message}`);
    if (!m.bestEffort) throw new Error(`Telegram delivery failed for ${m.chatId}: ${res.message}`);
  }

  return report;
}
