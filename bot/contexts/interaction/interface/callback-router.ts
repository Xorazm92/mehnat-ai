import type { PrismaClient } from "@prisma/client";
import {
  parseCallbackQuery,
  type InboundCallback,
  type RawTelegramUpdate,
} from "../../monitoring/domain/inbound-message";
import { decodeCallback } from "../domain/callback-token";
import { ACTION } from "../domain/actions";
import type { CallbackOutcome } from "../domain/outbound";
import { resolveUserByTelegramId } from "../../identity/application/identity-service";
import { authorizeAdmin } from "../../identity/application/authorize";
import { handleBindPage, handleBindPick } from "../../identity/application/bind-suggest";
import {
  handleObligationExcuse,
  handleObligationTake,
  handleQuestionVerdict,
} from "../../escalation/application/alert-actions";
import {
  backToMenuKeyboard,
  mainMenuKeyboard,
  renderMenu,
  renderMyKpi,
  renderMyTasks,
  renderTeam,
} from "../application/menu";
import { buildDigest } from "../../../../lib/dailyDigest";
import { renderDigest } from "../../digest/application/render-digest";
import {
  handleReceiptAsk,
  handleReceiptDismiss,
} from "../../billing/application/receipt-flow";

const EXPIRED = "Bu tugma eskirgan.";
const ADMIN_ONLY = "⛔ Bu amal faqat administratorlar uchun.";
const NOT_LINKED = "Avval botga /start yuborib, raqamingizni tasdiqlang.";

/** Actions only an admin may run. Everything else needs a linked, active user. */
const ADMIN_ACTIONS = new Set<string>([ACTION.BIND_PICK, ACTION.BIND_PAGE]);

export interface RoutedCallback {
  callback: InboundCallback;
  outcome: CallbackOutcome;
}

/**
 * Turn a button press into an outcome.
 *
 * Authorization is redone here on every press and never trusted from the
 * payload: the signature only proves WE built the button, not that THIS person
 * may act on it — the same alert may sit in a chat long after a role changed.
 *
 * Returns null when the update is not a callback query. Otherwise it always
 * returns an outcome, because Telegram spins the button until the query is
 * answered.
 */
export async function routeCallback(
  prisma: PrismaClient,
  update: RawTelegramUpdate,
  opts: { secret: string },
): Promise<RoutedCallback | null> {
  const callback = parseCallbackQuery(update);
  if (!callback) return null;

  const payload = decodeCallback(opts.secret, callback.data);
  if (!payload) {
    return { callback, outcome: { answer: EXPIRED, alert: true } };
  }

  try {
    const outcome = await dispatch(prisma, callback, payload, opts);
    return { callback, outcome };
  } catch (err) {
    // A thrown handler must still answer the query, or the button spins forever.
    console.error(
      `[callback-router] ${payload.action} failed: ${(err as Error).message}`,
    );
    return {
      callback,
      outcome: { answer: "Xatolik yuz berdi. Keyinroq urinib ko'ring.", alert: true },
    };
  }
}

async function dispatch(
  prisma: PrismaClient,
  callback: InboundCallback,
  payload: { action: string; id: string },
  opts: { secret: string },
): Promise<CallbackOutcome> {
  // The client's receipt button is pressed by someone with no ASRO account, so
  // it is handled BEFORE the linked-user gate. It only arms a window on a chat
  // already bound to a company and discloses nothing.
  if (payload.action === ACTION.RECEIPT_ASK) {
    return handleReceiptAsk(prisma, callback.chatId);
  }

  if (ADMIN_ACTIONS.has(payload.action)) {
    const authz = await authorizeAdmin(prisma, callback.fromUserId);
    if (!authz.admin) return { answer: ADMIN_ONLY, alert: true };

    switch (payload.action) {
      case ACTION.BIND_PAGE:
        return handleBindPage(prisma, payload.id, opts);
      case ACTION.BIND_PICK:
        return handleBindPick(prisma, payload.id, { userId: authz.userId });
    }
  }

  const user = await resolveUserByTelegramId(prisma, callback.fromUserId);
  if (!user || !user.isActive) {
    return { answer: NOT_LINKED, alert: true };
  }
  const actor = { id: user.id, role: user.role };

  switch (payload.action) {
    // Escalation verdicts. The role/scope gate lives inside each handler
    // (assertCompanyPermission), because it depends on the entity's company —
    // an alert may sit in a chat long after the presser's portfolio changed.
    case ACTION.Q_PENALTY:
      return handleQuestionVerdict(prisma, payload.id, "penalty", actor);
    case ACTION.Q_WARN:
      return handleQuestionVerdict(prisma, payload.id, "warn", actor);
    case ACTION.Q_EXCUSE:
      return handleQuestionVerdict(prisma, payload.id, "excuse", actor);
    case ACTION.O_EXCUSE:
      return handleObligationExcuse(prisma, payload.id, actor);
    case ACTION.O_TAKE:
      return handleObligationTake(prisma, payload.id, actor);
    case ACTION.RECEIPT_DISMISS:
      return handleReceiptDismiss(prisma, payload.id, user.id);

    case ACTION.MENU:
      return {
        edit: {
          text: renderMenu(user.fullName),
          replyMarkup: mainMenuKeyboard(opts.secret, user.role),
        },
      };
    case ACTION.MENU_TASKS:
      return {
        edit: {
          text: await renderMyTasks(prisma, user),
          replyMarkup: backToMenuKeyboard(opts.secret),
        },
      };
    case ACTION.MENU_KPI:
      return {
        edit: {
          text: await renderMyKpi(prisma, user),
          replyMarkup: backToMenuKeyboard(opts.secret),
        },
      };
    case ACTION.MENU_TODAY: {
      // Same data as the 08:50 digest, on demand — and deliberately WITHOUT
      // claiming the daily dedup key, so checking twice never suppresses the
      // scheduled morning message.
      const digest = await buildDigest(prisma, {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        telegramUserId: callback.fromUserId,
      });
      return {
        edit: {
          text: digest.empty
            ? "📅 Bugun uchun ochiq ish yo'q."
            : renderDigest(opts.secret, digest).text,
          replyMarkup: backToMenuKeyboard(opts.secret),
        },
      };
    }
    case ACTION.MENU_TEAM:
      return {
        edit: {
          text: await renderTeam(prisma, actor),
          replyMarkup: backToMenuKeyboard(opts.secret),
        },
      };
    default:
      return { answer: EXPIRED, alert: true };
  }
}
