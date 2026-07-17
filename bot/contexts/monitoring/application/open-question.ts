import type { PrismaClient } from "@prisma/client";
import { WorkingHours } from "../../../shared/domain/value-objects/working-hours";
import { responseWindowForRole } from "../domain/response-window-policy";

export interface OpenQuestionInput {
  chatId: bigint;
  messageId: bigint;
  askedByUserId?: bigint | null;
  companyId?: string | null;
  responsibleRole: string;
  confidence?: number | null;
  /** Telegram message time — the clock the deadline is measured from. */
  askedAt: Date;
}

export interface OpenQuestionResult {
  opened: boolean;
  questionId?: string;
  deadlineAt?: Date;
}

/**
 * Open a pending Question with a deadline of `responseWindow × workingHours`
 * after the message time. Idempotent per (chat, message).
 */
export async function openQuestion(
  prisma: PrismaClient,
  input: OpenQuestionInput,
): Promise<OpenQuestionResult> {
  const existing = await prisma.question.findFirst({
    where: { chatId: input.chatId, messageId: input.messageId },
    select: { id: true },
  });
  if (existing) return { opened: false, questionId: existing.id };

  const window = responseWindowForRole(input.responsibleRole);
  const deadlineAt = WorkingHours.DEFAULT.addWorkingMinutes(
    input.askedAt,
    window.limitMinutes,
  );

  const question = await prisma.question.create({
    data: {
      chatId: input.chatId,
      companyId: input.companyId ?? null,
      messageId: input.messageId,
      askedByUserId: input.askedByUserId ?? null,
      responsibleRole: input.responsibleRole,
      status: "pending",
      deadlineAt,
      aiConfidence: input.confidence ?? null,
      createdAt: input.askedAt,
    },
    select: { id: true },
  });

  return { opened: true, questionId: question.id, deadlineAt };
}
