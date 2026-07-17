/**
 * Integration tests for the KPI bot's Question Engine (Phase C).
 *
 * Exercises the real Prisma write path for opening questions with a computed
 * deadline, recording answers, and the deadline sweep. Needs a live Postgres
 * (DATABASE_URL); fixtures are chat-isolated and torn down per file.
 */
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { openQuestion } from "@/bot/contexts/monitoring/application/open-question";
import { answerQuestion } from "@/bot/contexts/monitoring/application/answer-question";
import { expireOverdueQuestions } from "@/bot/contexts/monitoring/application/expire-questions";

const CHAT = BigInt(-1009500000000 - (Date.now() % 100000));

afterAll(async () => {
  const qs = await prisma.question.findMany({ where: { chatId: CHAT }, select: { id: true } });
  await prisma.answer.deleteMany({ where: { questionId: { in: qs.map((q) => q.id) } } });
  await prisma.question.deleteMany({ where: { chatId: CHAT } });
  await prisma.$disconnect();
});

describe("question lifecycle", () => {
  it("opens a pending question with a working-hours deadline", async () => {
    const askedAt = new Date(Date.UTC(2026, 6, 6, 9, 0)); // Mon 09:00
    const res = await openQuestion(prisma, {
      chatId: CHAT,
      messageId: BigInt(101),
      responsibleRole: "accountant",
      confidence: 0.9,
      askedAt,
    });
    expect(res.opened).toBe(true);
    // accountant window = 10 working min from 09:00 → 09:10
    expect(res.deadlineAt?.toISOString()).toBe(new Date(Date.UTC(2026, 6, 6, 9, 10)).toISOString());

    const q = await prisma.question.findFirstOrThrow({ where: { chatId: CHAT, messageId: BigInt(101) } });
    expect(q.status).toBe("pending");
    expect(Number(q.aiConfidence)).toBeCloseTo(0.9, 3);
  });

  it("is idempotent per (chat, message)", async () => {
    const again = await openQuestion(prisma, {
      chatId: CHAT,
      messageId: BigInt(101),
      responsibleRole: "accountant",
      askedAt: new Date(),
    });
    expect(again.opened).toBe(false);
    expect(await prisma.question.count({ where: { chatId: CHAT, messageId: BigInt(101) } })).toBe(1);
  });

  it("records a reply as an answer and closes the question", async () => {
    const res = await answerQuestion(prisma, {
      chatId: CHAT,
      replyToMessageId: BigInt(101),
      answerMessageId: BigInt(102),
      byUserId: null,
      answeredAt: new Date(),
    });
    expect(res.answered).toBe(true);

    const q = await prisma.question.findFirstOrThrow({ where: { chatId: CHAT, messageId: BigInt(101) } });
    expect(q.status).toBe("answered");
    expect(q.answeredAt).not.toBeNull();
    expect(await prisma.answer.count({ where: { questionId: q.id } })).toBe(1);
  });

  it("expires an overdue pending question to late", async () => {
    await openQuestion(prisma, {
      chatId: CHAT,
      messageId: BigInt(200),
      responsibleRole: "bank_client",
      askedAt: new Date(Date.UTC(2020, 0, 1, 9, 0)), // long past its deadline
    });
    const expired = await expireOverdueQuestions(prisma, new Date());
    expect(expired.length).toBeGreaterThanOrEqual(1);

    const q = await prisma.question.findFirstOrThrow({ where: { chatId: CHAT, messageId: BigInt(200) } });
    expect(q.status).toBe("late");
  });
});
