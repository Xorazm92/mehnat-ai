/**
 * Callback action verbs.
 *
 * Kept short on purpose: every byte here competes with the entity id for
 * Telegram's 64-byte callback_data budget. Values are part of the wire format —
 * changing one invalidates buttons already sitting in people's chats (they will
 * answer "eskirgan" rather than misfire), so prefer adding a new verb.
 */
export const ACTION = {
  /** Smart bind: "<packedChatId>:<packedCompanyId>". */
  BIND_PICK: "bnd",
  /** Smart bind pagination: "<packedChatId>:<page>". */
  BIND_PAGE: "bpg",
  /** Main menu (no id). */
  MENU: "menu",
  /** Menu → my open obligations / questions. */
  MENU_TASKS: "mtsk",
  /** Menu → my current-month KPI. */
  MENU_KPI: "mkpi",
  /** Menu → today's plan on demand (same data as the 08:50 digest). */
  MENU_TODAY: "mday",
  /** Menu → portfolio overview. Senior roles only. */
  MENU_TEAM: "mteam",

  // ── Escalation verdicts ("<questionId>" / "<obligationId>") ──────────────
  /** Question: dock KPI points and ask the chief to confirm in the ERP. */
  Q_PENALTY: "qpen",
  /** Question: warn the responsible staffer, no KPI effect. */
  Q_WARN: "qwarn",
  /** Question: excuse it, no KPI effect. */
  Q_EXCUSE: "qexc",
  /** Obligation: mark + approve the delay reason in one press. */
  O_EXCUSE: "oexc",
  /** Obligation: reassign to whoever pressed the button. */
  O_TAKE: "otake",

  // ── Client-facing (pressed in a company group, by someone with no account) ──
  /** "📄 Kvitansiya yuborish": open the receipt window on this chat. */
  RECEIPT_ASK: "rcpt",
  /** Accountant dismisses a forwarded photo that was not a receipt. */
  RECEIPT_DISMISS: "rcno",
} as const;

export type ActionName = (typeof ACTION)[keyof typeof ACTION];
