import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { detectPeriodDebts } from "./detect-debts";
import { createRedNotifications } from "./notify-red";
import { buildReminderMessage } from "../domain/message";
import { DEFAULT_ESCALATION, type EscalationConfig } from "../domain/debt";

export interface BillingDeps {
  /**
   * Injected so the pipeline is testable without real Telegram. `replyMarkup`
   * is opaque here on purpose — the keyboard is built by the caller, keeping
   * this layer free of the callback-signing secret.
   */
  sendTelegram: (chatId: bigint, text: string, replyMarkup?: unknown) => Promise<void>;
  /**
   * Keyboard attached to the reminder in the client's group — the
   * "📄 Kvitansiya yuborish" button. Omitted ⇒ plain text, as before.
   */
  reminderKeyboard?: unknown;
  now?: Date;
  escalation?: EscalationConfig;
}

export interface BillingRunResult {
  period: string;
  detected: number;
  sent: number;
  skippedAlready: number;
  skippedNoGroup: number;
  failed: number;
  redNotified: number;
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

/**
 * Detect debts for `period` and send one escalation reminder per company+level,
 * routing 🟡🟠 to the Telegram group and 🔴 additionally to in-app (accountant +
 * directors).
 *
 * Idempotent and retry-safe: a `PaymentReminder` row is reserved per
 * (company, period, level) before sending; a row already `sent` is skipped, so
 * re-running the cron never double-sends or double-notifies. A send failure
 * marks the row `failed` (surfaced, not auto-retried into a duplicate). Red
 * in-app notifications happen only AFTER the Telegram send is committed, and are
 * themselves idempotent, so a partial failure can never spam.
 */
export async function runBillingReminders(
  prisma: PrismaClient,
  period: string,
  deps: BillingDeps,
): Promise<BillingRunResult> {
  const now = deps.now ?? new Date();
  const escalation = deps.escalation ?? DEFAULT_ESCALATION;
  const debts = await detectPeriodDebts(prisma, period, now, escalation);

  const result: BillingRunResult = {
    period,
    detected: debts.length,
    sent: 0,
    skippedAlready: 0,
    skippedNoGroup: 0,
    failed: 0,
    redNotified: 0,
  };

  for (const debt of debts) {
    const where = {
      companyId_period_level: { companyId: debt.companyId, period, level: debt.level },
    };
    const existing = await prisma.paymentReminder.findUnique({
      where,
      select: { id: true, status: true },
    });
    if (existing?.status === "sent") {
      result.skippedAlready++;
      continue;
    }

    // Reserve the slot (unique-constraint guarded) before doing any I/O.
    let reminderId = existing?.id;
    if (!existing) {
      try {
        const reserved = await prisma.paymentReminder.create({
          data: {
            companyId: debt.companyId,
            period,
            level: debt.level,
            amountDue: new Prisma.Decimal(debt.amountDue),
            status: "pending",
          },
          select: { id: true },
        });
        reminderId = reserved.id;
      } catch (e) {
        if (isUniqueViolation(e)) {
          result.skippedAlready++; // a concurrent run reserved it
          continue;
        }
        throw e;
      }
    }

    const group = await prisma.telegramGroup.findFirst({
      where: { companyId: debt.companyId, isActive: true },
      select: { chatId: true },
    });
    if (!group) {
      await prisma.paymentReminder.update({
        where: { id: reminderId! },
        data: { status: "skipped", amountDue: new Prisma.Decimal(debt.amountDue) },
      });
      result.skippedNoGroup++;
      continue;
    }

    const text = buildReminderMessage({
      companyName: debt.companyName,
      period,
      amountDue: debt.amountDue,
      level: debt.level,
    });

    try {
      await deps.sendTelegram(group.chatId, text, deps.reminderKeyboard);
    } catch (e) {
      await prisma.paymentReminder.update({
        where: { id: reminderId! },
        data: { status: "failed", chatId: group.chatId },
      });
      console.error(
        `[billing] send failed for ${debt.companyName} (${debt.level}): ${(e as Error).message}`,
      );
      result.failed++;
      continue;
    }

    // Commit the send BEFORE the (best-effort) in-app notifications, so a
    // notification failure can never cause the Telegram message to be re-sent.
    await prisma.paymentReminder.update({
      where: { id: reminderId! },
      data: { status: "sent", chatId: group.chatId, sentAt: now },
    });
    result.sent++;

    if (debt.level === "red") {
      try {
        result.redNotified += await createRedNotifications(prisma, {
          companyId: debt.companyId,
          companyName: debt.companyName,
          period,
          amountDue: debt.amountDue,
        });
      } catch (e) {
        console.error(
          `[billing] red in-app notify failed for ${debt.companyName}: ${(e as Error).message}`,
        );
      }
    }
  }

  return result;
}
