import type { PrismaClient } from "@prisma/client";

export interface AnswerQuestionInput {
  chatId: bigint;
  /** The message id this reply is answering (question's messageId). */
  replyToMessageId: bigint;
  answerMessageId: bigint;
  byUserId?: string | null;
  answeredAt: Date;
}

export interface AnswerQuestionResult {
  answered: boolean;
  questionId?: string;
  /** true when the answer landed at or before the deadline. */
  onTime?: boolean;
}

/**
 * Record a reply as the answer to a pending (or already-late) Question in the
 * same chat. A pending question becomes `answered`; a late one keeps its `late`
 * status (the SLA was already missed) but still records the answer time.
 */
export async function answerQuestion(
  prisma: PrismaClient,
  input: AnswerQuestionInput,
): Promise<AnswerQuestionResult> {
  const question = await prisma.question.findFirst({
    where: {
      chatId: input.chatId,
      messageId: input.replyToMessageId,
      status: { in: ["pending", "late"] },
    },
    select: { id: true, status: true, deadlineAt: true },
  });
  if (!question) return { answered: false };

  const onTime = input.answeredAt.getTime() <= question.deadlineAt.getTime();

  await prisma.$transaction(async (tx) => {
    await tx.answer.create({
      data: {
        questionId: question.id,
        byUserId: input.byUserId ?? null,
        messageId: input.answerMessageId,
      },
    });
    await tx.question.update({
      where: { id: question.id },
      data: {
        answeredAt: input.answeredAt,
        status: question.status === "pending" ? "answered" : question.status,
      },
    });
  });

  return { answered: true, questionId: question.id, onTime };
}
