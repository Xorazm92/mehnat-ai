import type { PrismaClient } from "@prisma/client";
import { parseCommand } from "../domain/command";
import { resolveUserByTelegramId } from "./identity-service";
import { authorizeAdmin } from "./authorize";
import { linkTelegramUser } from "./link-user";
import { bindGroupToCompany } from "./bind-group";
import { recordManualKpi, type ManualKind } from "../../kpi/application/manual-adjustment";

export interface CommandContext {
  chatId: bigint;
  chatTitle?: string | null;
  callerTelegramId: bigint;
  callerUsername?: string | null;
  text: string;
  /** The user whose message this command replied to (used by /link). */
  reply?: { telegramUserId: bigint; username?: string | null };
}

const HELP = [
  "Buyruqlar:",
  "/whoami — bog'langan profilingiz",
  "/link_me <email yoki JSHSHIR> — o'zingizni xodim kartochkangizga bog'lash",
  "/bind <INN yoki ID> — bu guruhni korxonaga bog'lash (admin)",
  "/link <email yoki JSHSHIR> — xodim xabariga reply qilib, uni Telegram akkauntga bog'lash (admin)",
  "/kpi_award <email|JSHSHIR> <foiz> [sabab] — qo'lda KPI bonusi (admin)",
  "/kpi_penalty <email|JSHSHIR> <foiz> [sabab] — qo'lda KPI jarimasi (admin)",
  "/help — ushbu ro'yxat",
].join("\n");

const ADMIN_ONLY = "⛔ Bu buyruq faqat administratorlar uchun.";

/**
 * Dispatch a slash command to its handler and return the reply text (or null to
 * stay silent — e.g. an unknown command). All work goes through application
 * use-cases; this function only routes and authorizes.
 */
export async function handleCommand(
  prisma: PrismaClient,
  ctx: CommandContext,
): Promise<string | null> {
  const cmd = parseCommand(ctx.text);
  if (!cmd) return null;

  switch (cmd.name) {
    case "start":
    case "whoami":
      return whoami(prisma, ctx);
    case "help":
      return HELP;
    case "link_me":
      return linkMe(prisma, ctx, cmd.argString);
    case "link":
      return link(prisma, ctx, cmd.argString);
    case "bind":
      return bind(prisma, ctx, cmd.argString);
    case "kpi_award":
      return kpiAdjust(prisma, ctx, "award", cmd.args);
    case "kpi_penalty":
      return kpiAdjust(prisma, ctx, "penalty", cmd.args);
    default:
      return null; // unknown command → ignore, don't spam the chat
  }
}

async function kpiAdjust(
  prisma: PrismaClient,
  ctx: CommandContext,
  kind: ManualKind,
  args: string[],
): Promise<string> {
  const authz = await authorizeAdmin(prisma, ctx.callerTelegramId);
  if (!authz.admin) return ADMIN_ONLY;

  const [identifier, percentRaw, ...reasonParts] = args;
  const usage = `Foydalanish: /${kind === "award" ? "kpi_award" : "kpi_penalty"} <email yoki JSHSHIR> <foiz> [sabab]`;
  if (!identifier || !percentRaw) return usage;

  const percent = Number(percentRaw.replace(",", "."));
  if (!Number.isFinite(percent) || percent <= 0) return "Foiz musbat son bo'lishi kerak.";

  const target = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { pinfl: identifier }] },
    select: { id: true, fullName: true },
  });
  if (!target) return `"${identifier}" bo'yicha xodim topilmadi.`;

  const reason =
    reasonParts.join(" ").trim() || (kind === "award" ? "Qo'lda bonus" : "Qo'lda jarima");
  const res = await recordManualKpi(prisma, kind, {
    employeeId: target.id,
    percent,
    reason,
    byUserId: authz.userId,
  });

  const sign = res.points >= 0 ? "+" : "";
  return `✅ ${target.fullName}: ${sign}${res.points}% KPI ledger'ga yozildi (${reason}).`;
}

async function whoami(prisma: PrismaClient, ctx: CommandContext): Promise<string> {
  const user = await resolveUserByTelegramId(prisma, ctx.callerTelegramId);
  if (!user) {
    return "Siz hali biror xodimga bog'lanmagansiz.\nBog'lanish uchun: /link_me <email yoki JSHSHIR>";
  }
  const status = user.isActive ? "" : " (faol emas)";
  return `Siz: ${user.fullName} — ${user.role}${status}.`;
}

/**
 * Self-service linking: the caller binds THEIR OWN Telegram account to their
 * employee record by email/PINFL. No admin needed. `requireUnlinkedTarget`
 * blocks binding to an employee already linked to someone else (anti-hijack).
 */
async function linkMe(
  prisma: PrismaClient,
  ctx: CommandContext,
  argString: string,
): Promise<string> {
  const identifier = argString.trim();
  if (!identifier) {
    return "Foydalanish: /link_me <email yoki JSHSHIR> — o'zingizni xodim kartochkangizga bog'laydi.";
  }
  const res = await linkTelegramUser(prisma, {
    telegramUserId: ctx.callerTelegramId,
    telegramUsername: ctx.callerUsername ?? null,
    identifier,
    byUserId: null,
    requireUnlinkedTarget: true,
  });
  return (res.ok ? "✅ " : "⚠️ ") + res.message;
}

async function link(
  prisma: PrismaClient,
  ctx: CommandContext,
  argString: string,
): Promise<string> {
  const authz = await authorizeAdmin(prisma, ctx.callerTelegramId);
  if (!authz.admin) return ADMIN_ONLY;
  if (!ctx.reply) {
    return "Iltimos, bog'lamoqchi bo'lgan xodimning xabariga reply qilib: /link <email yoki JSHSHIR>.";
  }
  const identifier = argString.trim();
  if (!identifier) return "Foydalanish: xabarga reply qilib /link <email yoki JSHSHIR>.";

  const res = await linkTelegramUser(prisma, {
    telegramUserId: ctx.reply.telegramUserId,
    telegramUsername: ctx.reply.username ?? null,
    identifier,
    byUserId: authz.userId,
  });
  return (res.ok ? "✅ " : "⚠️ ") + res.message;
}

async function bind(
  prisma: PrismaClient,
  ctx: CommandContext,
  argString: string,
): Promise<string> {
  const authz = await authorizeAdmin(prisma, ctx.callerTelegramId);
  if (!authz.admin) return ADMIN_ONLY;
  const ref = argString.trim();
  if (!ref) return "Foydalanish: /bind <korxona INN yoki ID>.";

  const res = await bindGroupToCompany(prisma, {
    chatId: ctx.chatId,
    title: ctx.chatTitle ?? null,
    companyRef: ref,
    byUserId: authz.userId,
  });
  return (res.ok ? "✅ " : "⚠️ ") + res.message;
}
