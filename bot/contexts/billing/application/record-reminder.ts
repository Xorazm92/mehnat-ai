import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { ReminderLevel } from "../domain/debt";

export interface RecordReminderInput {
  companyId: string;
  period: string;
  level: ReminderLevel;
  amountDue: number;
  chatId?: bigint | null;
  status?: string; // 'sent' | 'failed' | 'skipped'
}

export interface RecordReminderResult {
  /** true when a new reminder row was written; false when this
   *  company+period+level was already reminded (no spam). */
  recorded: boolean;
}

/**
 * Idempotently record that a reminder at `level` was issued for a
 * company+period. The `@@unique([companyId, period, level])` constraint plus
 * `skipDuplicates` guarantees exactly one reminder per escalation step — restart
 * and re-run safe, no duplicate messages.
 */
export async function recordPaymentReminder(
  prisma: PrismaClient,
  input: RecordReminderInput,
): Promise<RecordReminderResult> {
  const res = await prisma.paymentReminder.createMany({
    data: [
      {
        companyId: input.companyId,
        period: input.period,
        level: input.level,
        amountDue: new Prisma.Decimal(input.amountDue),
        chatId: input.chatId ?? null,
        status: input.status ?? "sent",
      },
    ],
    skipDuplicates: true,
  });
  return { recorded: res.count > 0 };
}
