/**
 * Anti-corruption boundary for Telegram updates.
 *
 * `parseInboundMessage` turns a raw Telegram Update (plain JSON, numeric ids)
 * into a normalised, storage-ready `InboundMessage` with BigInt ids and a
 * single `kind`. Pure and framework-free (no grammy/Prisma imports) so it is
 * fully unit-testable with no I/O.
 */

export type MessageKind =
  | "text"
  | "reply"
  | "edit"
  | "delete"
  | "reaction"
  | "media"
  | "voice"
  | "file";

export interface RawTelegramUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface RawTelegramChat {
  id: number;
  type?: string;
  title?: string;
}

export interface RawTelegramMessage {
  message_id: number;
  date?: number; // unix seconds
  chat: RawTelegramChat;
  from?: RawTelegramUser;
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number; from?: RawTelegramUser };
  voice?: unknown;
  document?: unknown;
  audio?: unknown;
  video?: unknown;
  photo?: unknown[];
  animation?: unknown;
  sticker?: unknown;
}

export interface RawMessageReaction {
  chat: RawTelegramChat;
  message_id: number;
  user?: RawTelegramUser;
  date?: number;
}

export interface RawTelegramUpdate {
  update_id: number;
  message?: RawTelegramMessage;
  edited_message?: RawTelegramMessage;
  channel_post?: RawTelegramMessage;
  edited_channel_post?: RawTelegramMessage;
  message_reaction?: RawMessageReaction;
}

export interface InboundMessage {
  chatId: bigint;
  messageId: bigint;
  fromUserId?: bigint;
  text?: string;
  kind: MessageKind;
  replyToId?: bigint;
  mediaType?: string;
  /** Telegram message time (falls back to now if the update omits `date`). */
  createdAt: Date;
}

function unixToDate(seconds: number | undefined): Date {
  return seconds != null ? new Date(seconds * 1000) : new Date();
}

/** Content type of a message, if it carries an attachment. */
function detectMedia(
  m: RawTelegramMessage,
): { kind: MessageKind; mediaType: string } | null {
  if (m.voice) return { kind: "voice", mediaType: "voice" };
  if (m.document) return { kind: "file", mediaType: "document" };
  if (m.photo) return { kind: "media", mediaType: "photo" };
  if (m.video) return { kind: "media", mediaType: "video" };
  if (m.audio) return { kind: "media", mediaType: "audio" };
  if (m.animation) return { kind: "media", mediaType: "animation" };
  if (m.sticker) return { kind: "media", mediaType: "sticker" };
  return null;
}

/**
 * Normalise a raw update to an InboundMessage, or null when the update carries
 * nothing we capture (e.g. chat-member changes). The reply relationship is
 * always recorded in `replyToId` even when `kind` reflects the content type, so
 * downstream answer-detection never depends on `kind`.
 */
export function parseInboundMessage(
  update: RawTelegramUpdate,
): InboundMessage | null {
  if (update.message_reaction) {
    const r = update.message_reaction;
    return {
      chatId: BigInt(r.chat.id),
      messageId: BigInt(r.message_id),
      fromUserId: r.user ? BigInt(r.user.id) : undefined,
      kind: "reaction",
      createdAt: unixToDate(r.date),
    };
  }

  const edited = update.edited_message ?? update.edited_channel_post;
  const msg = update.message ?? update.channel_post ?? edited;
  if (!msg) return null;

  const media = detectMedia(msg);
  let kind: MessageKind;
  let mediaType: string | undefined;
  if (edited) {
    kind = "edit";
    mediaType = media?.mediaType;
  } else if (media) {
    kind = media.kind;
    mediaType = media.mediaType;
  } else if (msg.reply_to_message) {
    kind = "reply";
  } else {
    kind = "text";
  }

  return {
    chatId: BigInt(msg.chat.id),
    messageId: BigInt(msg.message_id),
    fromUserId: msg.from ? BigInt(msg.from.id) : undefined,
    text: msg.text ?? msg.caption ?? undefined,
    kind,
    replyToId: msg.reply_to_message
      ? BigInt(msg.reply_to_message.message_id)
      : undefined,
    mediaType,
    createdAt: unixToDate(msg.date),
  };
}
