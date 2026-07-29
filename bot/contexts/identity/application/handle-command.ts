import type { PrismaClient } from "@prisma/client";
import { parseCommand } from "../domain/command";
import { resolveUserByTelegramId } from "./identity-service";
import { authorizeAdmin } from "./authorize";
import { linkTelegramUser } from "./link-user";
import { bindGroupToCompany } from "./bind-group";
import { recordManualKpi, type ManualKind } from "../../kpi/application/manual-adjustment";
import { contactKeyboard, type ReplyMarkup } from "../../../telegram/keyboard";
import { mainMenuKeyboard, renderMenu, renderMyKpi } from "../../interaction/application/menu";

export interface CommandContext {
  chatId: bigint;
  /** 'private' | 'group' | 'supergroup' | 'channel'. */
  chatType?: string | null;
  chatTitle?: string | null;
  callerTelegramId: bigint;
  callerUsername?: string | null;
  text: string;
  /** Signing secret for any inline keyboard the reply carries. */
  secret: string;
  /** The user whose message this command replied to (used by /link). */
  reply?: { telegramUserId: bigint; username?: string | null };
}

export interface CommandReplyPayload {
  text: string;
  replyMarkup?: ReplyMarkup;
}

/** A handler may answer with plain text or with text plus a keyboard. */
type CommandResult = string | CommandReplyPayload | null;

/**
 * The visible command surface is now just /start, /menu and /help — everything
 * else is a button (see scripts/set-telegram-webhook.ts, which registers only
 * those three with BotFather). The older commands below stay dispatchable as
 * hidden aliases for one release so anyone mid-habit is not stranded.
 */
const HELP = [
  "Bot tugmalar bilan ishlaydi.",
  "",
  "/start — boshlash yoki qayta bog'lanish",
  "/menu — asosiy menyu",
  "/help — ushbu yordam",
  "",
  "Muddat, KPI va eskalatsiya xabarlari o'zi kelib turadi — tugmani bosish kifoya.",
].join("\n");

const CONTACT_BUTTON = "📱 Raqamni yuborish";

const ONBOARD_TEXT = [
  "👋 ASRO boti.",
  "",
  "Sizni tanishim uchun pastdagi tugmani bosing — telefon raqamingiz orqali",
  "xodim kartochkangizga avtomatik bog'lanasiz.",
].join("\n");

const ADMIN_ONLY = "⛔ Bu buyruq faqat administratorlar uchun.";

/**
 * Dispatch a slash command to its handler and return the reply (or null to stay
 * silent — e.g. an unknown command). All work goes through application
 * use-cases; this function only routes and authorizes.
 */
export async function handleCommand(
  prisma: PrismaClient,
  ctx: CommandContext,
): Promise<CommandResult> {
  const cmd = parseCommand(ctx.text);
  if (!cmd) return null;

  switch (cmd.name) {
    case "start":
    case "menu":
      return start(prisma, ctx);
    case "whoami":
      return whoami(prisma, ctx);
    case "stats":
      return stats(prisma, ctx);
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

/**
 * The one entry point: either the main menu (linked) or the one-tap contact
 * request (unlinked). Nobody is asked to type an email or a PINFL.
 *
 * In a group chat this stays quiet — a contact keyboard cannot be shown there
 * and the bot's group behaviour is silent by design.
 */
async function start(prisma: PrismaClient, ctx: CommandContext): Promise<CommandResult> {
  const user = await resolveUserByTelegramId(prisma, ctx.callerTelegramId);
  const isPrivate = ctx.chatType == null || ctx.chatType === "private";

  if (user) {
    return isPrivate
      ? { text: renderMenu(user.fullName), replyMarkup: mainMenuKeyboard(ctx.secret, user.role) }
      : `Siz: ${user.fullName} — ${user.role}. Menyu uchun botga shaxsiy yozing.`;
  }

  if (!isPrivate) {
    return "Botga shaxsiy yozing va \"📱 Raqamni yuborish\" tugmasini bosing.";
  }
  return { text: ONBOARD_TEXT, replyMarkup: contactKeyboard(CONTACT_BUTTON) };
}

async function whoami(prisma: PrismaClient, ctx: CommandContext): Promise<string> {
  const user = await resolveUserByTelegramId(prisma, ctx.callerTelegramId);
  if (!user) {
    return "Siz hali biror xodimga bog'lanmagansiz.\n/start bosing va raqamingizni yuboring.";
  }
  const status = user.isActive ? "" : " (faol emas)";
  return `Siz: ${user.fullName} — ${user.role}${status}.`;
}

/** Hidden alias for the "📊 KPI ballarim" button. */
async function stats(prisma: PrismaClient, ctx: CommandContext): Promise<string> {
  const user = await resolveUserByTelegramId(prisma, ctx.callerTelegramId);
  if (!user) return "Avval /start bosing va raqamingizni yuboring.";
  return renderMyKpi(prisma, user);
}

/**
 * Self-service linking by email/PINFL — the FALLBACK route, kept for staff
 * whose `phone` is missing or shared by two records. The primary route is the
 * one-tap contact share handled in the message worker.
 * `requireUnlinkedTarget` blocks binding to an employee already linked to
 * someone else (anti-hijack).
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
