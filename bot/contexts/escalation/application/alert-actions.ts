import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { assertCompanyPermission, type Actor } from "../../../../lib/platform/access";
import { recordAuditLog } from "../../../../lib/platform/auditTrail";
import { ESCALATION_PENALTY_PERCENT } from "../../../../lib/engines/automation/escalation";
import { excuseObligationDelay, reassignObligationTo } from "../../../../lib/engines/obligation/obligationDelay";
import { appendKpiEvent } from "../../kpi/application/append-kpi-event";
import { resolveResponsibleUserId } from "../../kpi/application/resolve-responsible";
import { periodOf } from "../../kpi/domain/kpi-event";
import type { CallbackOutcome, OutboundMessage } from "../../interaction/domain/outbound";

export type QuestionVerdict = "penalty" | "warn" | "excuse";

const EXPIRED = "Bu tugma eskirgan.";
const ALREADY = "Bu holat allaqachon hal qilingan.";

/**
 * Verdict channel in the NotificationDelivery ledger. The three question
 * verdicts are mutually exclusive, so one claim per question settles it: the
 * first press wins and the others answer "already handled". Reuses the existing
 * @@unique([channel, dedupKey]) — no new table.
 */
const VERDICT_CHANNEL = "verdict";

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
  const err = e as { code?: string; message?: string } | null;
  return (
    !!err &&
    (err.code === "P2002" || (typeof err.message === "string" && err.message.includes("Unique constraint failed")))
  );
}

/** Claim the single verdict slot for an entity. false ⇒ someone already ruled. */
async function claimVerdict(
  prisma: PrismaClient,
  dedupKey: string,
  actorId: string,
): Promise<boolean> {
  try {
    await prisma.notificationDelivery.create({
      data: {
        channel: VERDICT_CHANNEL,
        level: "red",
        dedupKey,
        recipientId: actorId,
        status: "sent",
        sentAt: new Date(),
      },
    });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}

const VERDICT_LABEL: Record<QuestionVerdict, string> = {
  penalty: `🔴 Jarima −${ESCALATION_PENALTY_PERCENT}%`,
  warn: "🟡 Ogohlantirish",
  excuse: "🟢 Sababli",
};

/**
 * A supervisor's (or chief's) ruling on an unanswered question.
 *
 * A penalty writes to the KPI **ledger** and asks the chief to confirm it in the
 * ERP. It deliberately does NOT touch MonthlyPerformance: per ADR-0001 the bot
 * proposes and a human disposes, so nothing reaches payroll until the chief
 * approves it there.
 */
export async function handleQuestionVerdict(
  prisma: PrismaClient,
  questionId: string,
  verdict: QuestionVerdict,
  actor: Actor,
): Promise<CallbackOutcome> {
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      companyId: true,
      responsibleRole: true,
      responsibleUserId: true,
      createdAt: true,
    },
  });
  if (!q || !q.companyId) return { answer: EXPIRED, alert: true };

  // Question carries only `companyId` — there is no relation on the model.
  const company = await prisma.company.findUnique({
    where: { id: q.companyId },
    select: { name: true, chiefAccountantId: true },
  });
  if (!company) return { answer: EXPIRED, alert: true };

  try {
    await assertCompanyPermission(prisma, actor, q.companyId, "kpi:penalize");
  } catch (err) {
    return { answer: `⛔ ${(err as Error).message}`, alert: true };
  }

  const employeeId =
    q.responsibleUserId ?? (await resolveResponsibleUserId(prisma, q.companyId, q.responsibleRole));

  // Check what would block the ruling BEFORE claiming the verdict slot —
  // otherwise a penalty that cannot be applied would still burn the one slot
  // and leave the supervisor unable to pick a different verdict.
  if (verdict === "penalty" && !employeeId) {
    return { answer: "Mas'ul xodim aniqlanmadi — jarima yozilmadi.", alert: true };
  }

  if (!(await claimVerdict(prisma, `question:${questionId}:verdict`, actor.id))) {
    return { answer: ALREADY, alert: true };
  }

  const send: OutboundMessage[] = [];

  if (verdict === "penalty" && employeeId) {
    // Idempotent per (employee, sourceRef, type) — a replayed callback cannot
    // dock the same person twice for the same question.
    await appendKpiEvent(prisma, {
      employeeId,
      companyId: q.companyId,
      periodMonth: periodOf(q.createdAt),
      type: "manual",
      points: -ESCALATION_PENALTY_PERCENT,
      sourceRef: q.id,
      meta: { kind: "penalty", reason: "SLA: javobsiz savol", questionId: q.id, via: "telegram" },
      createdBy: actor.id,
    });

    // The chief confirms it in the ERP — that is what can reach payroll.
    if (company.chiefAccountantId) {
      await prisma.notification.create({
        data: {
          userId: company.chiefAccountantId,
          type: "kpi_penalty_proposed",
          title: `KPI jarimasi tasdiqlashni kutmoqda — ${company.name}`,
          message: `Javobsiz savol uchun −${ESCALATION_PENALTY_PERCENT}% taklif qilindi. Oylikka ta'sir qilishi uchun tasdiqlang.`,
          link: `/kpi?employee=${employeeId}`,
          // Tasdiqlanmasa oylikka yetib bormaydi — kutib turmaydi.
          priority: "high",
        },
      });
    }
  }

  if (verdict === "warn" && employeeId) {
    const staff = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { telegramUserId: true },
    });
    if (staff?.telegramUserId != null) {
      send.push({
        chatId: staff.telegramUserId,
        text:
          `🟡 Ogohlantirish — ${company.name}\n` +
          "Mijoz savoliga vaqtida javob berilmadi. KPI ballaringizga ta'sir qilmadi, lekin takrorlanmasin.",
        bestEffort: true,
      });
    }
    await prisma.notification.create({
      data: {
        userId: employeeId,
        type: "sla_warning",
        title: `Ogohlantirish — ${company.name}`,
        message: "Mijoz savoliga vaqtida javob berilmadi.",
        link: `/questions?id=${q.id}`,
      },
    });
  }

  await recordAuditLog({
    userId: actor.id,
    action: "update",
    tableName: "Question",
    recordId: q.id,
    newData: { verdict, employeeId, via: "telegram" },
  });

  return {
    answer: VERDICT_LABEL[verdict],
    edit: { text: `${VERDICT_LABEL[verdict]} — qaror qabul qilindi (${company.name}).` },
    send,
  };
}

/** "🟢 Sababli" on an obligation: mark + approve the delay reason in one press. */
export async function handleObligationExcuse(
  prisma: PrismaClient,
  obligationId: string,
  actor: Actor,
): Promise<CallbackOutcome> {
  try {
    const res = await excuseObligationDelay(prisma, actor, obligationId, "Telegram: nazoratchi qarori");
    return {
      answer: res.changed ? "🟢 Sababli deb belgilandi" : ALREADY,
      edit: { text: "🟢 Kechikish sababli deb tasdiqlandi — KPI jarimasi qo'llanmaydi." },
    };
  } catch (err) {
    return { answer: `⛔ ${(err as Error).message}`, alert: true };
  }
}

/** "🙋 O'zim bajaraman": reassign the obligation to whoever pressed the button. */
export async function handleObligationTake(
  prisma: PrismaClient,
  obligationId: string,
  actor: Actor,
): Promise<CallbackOutcome> {
  try {
    const res = await reassignObligationTo(
      prisma,
      actor,
      obligationId,
      actor.id,
      "Telegram: o'ziga oldi",
    );
    return {
      answer: res.changed ? "✅ Sizga biriktirildi" : "Allaqachon sizda.",
      edit: { text: "🙋 Majburiyat sizga biriktirildi." },
    };
  } catch (err) {
    return { answer: `⛔ ${(err as Error).message}`, alert: true };
  }
}
