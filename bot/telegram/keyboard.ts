/**
 * Telegram keyboard markup builders.
 *
 * Plain JSON, no grammY import: the Bot API takes `reply_markup` as data, so
 * keeping these framework-free makes every keyboard unit-testable and lets the
 * domain/application layers describe a keyboard without touching Telegram I/O.
 */

/**
 * A discriminated union, mirroring the Bot API: a button carries exactly one
 * kind of action. Modelling it as one interface with optional fields would let
 * `{ text }` with no action typecheck — and Telegram rejects that at runtime.
 */
export type InlineButton =
  /** `callback_data` is ≤64 bytes — build it with `encodeCallback`, never by hand. */
  | { text: string; callback_data: string }
  | { text: string; url: string }
  | { text: string; web_app: { url: string } };

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineButton[][];
}

export interface ReplyKeyboardMarkup {
  keyboard: Array<Array<{ text: string; request_contact?: boolean }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  is_persistent?: boolean;
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true;
}

export type ReplyMarkup =
  | InlineKeyboardMarkup
  | ReplyKeyboardMarkup
  | ReplyKeyboardRemove;

/** A button that fires a callback query. `data` must already be encoded/signed. */
export function cbButton(text: string, data: string): InlineButton {
  return { text, callback_data: data };
}

/** A button that opens a Telegram Mini App. `url` must be https. */
export function webAppButton(text: string, url: string): InlineButton {
  return { text, web_app: { url } };
}

export function urlButton(text: string, url: string): InlineButton {
  return { text, url };
}

/** Drops empty rows so a conditionally-built keyboard never ships a blank line. */
export function inlineKeyboard(rows: Array<InlineButton[] | null | undefined>): InlineKeyboardMarkup {
  return { inline_keyboard: rows.filter((r): r is InlineButton[] => Array.isArray(r) && r.length > 0) };
}

/** Lay buttons out `perRow` at a time — used by paginated pick-lists. */
export function gridKeyboard(buttons: InlineButton[], perRow = 1): InlineKeyboardMarkup {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += perRow) rows.push(buttons.slice(i, i + perRow));
  return { inline_keyboard: rows };
}

/**
 * The one-tap onboarding keyboard: Telegram returns the user's own phone number
 * as a `contact` message, so nobody types an email or PINFL to get linked.
 * `request_contact` only works on a ReplyKeyboard, never on an inline one.
 */
export function contactKeyboard(text: string): ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

/** Clears a ReplyKeyboard once it has served its purpose. */
export function removeKeyboard(): ReplyKeyboardRemove {
  return { remove_keyboard: true };
}
