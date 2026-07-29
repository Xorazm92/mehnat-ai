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

/** Any Telegram object that carries a downloadable file. */
interface RawFile {
  file_id?: string;
}

export interface RawTelegramContact {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  /** Present only when the contact IS the sender — i.e. a request_contact tap. */
  user_id?: number;
}

export interface RawTelegramMessage {
  message_id: number;
  date?: number; // unix seconds
  chat: RawTelegramChat;
  from?: RawTelegramUser;
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number; from?: RawTelegramUser };
  contact?: RawTelegramContact;
  voice?: RawFile;
  document?: RawFile;
  audio?: RawFile;
  video?: RawFile;
  photo?: RawFile[];
  animation?: RawFile;
  sticker?: RawFile;
}

export interface RawMessageReaction {
  chat: RawTelegramChat;
  message_id: number;
  user?: RawTelegramUser;
  date?: number;
}

export interface RawCallbackQuery {
  id: string;
  from: RawTelegramUser;
  data?: string;
  message?: { message_id: number; chat: RawTelegramChat };
}

export interface RawChatMemberUpdated {
  chat: RawTelegramChat;
  from: RawTelegramUser;
  date?: number;
  old_chat_member?: { status?: string };
  new_chat_member?: { status?: string };
}

export interface RawTelegramUpdate {
  update_id: number;
  message?: RawTelegramMessage;
  edited_message?: RawTelegramMessage;
  channel_post?: RawTelegramMessage;
  edited_channel_post?: RawTelegramMessage;
  message_reaction?: RawMessageReaction;
  callback_query?: RawCallbackQuery;
  /** The bot's OWN membership changed — how we learn we were added to a group. */
  my_chat_member?: RawChatMemberUpdated;
}

export interface InboundMessage {
  chatId: bigint;
  messageId: bigint;
  fromUserId?: bigint;
  text?: string;
  kind: MessageKind;
  replyToId?: bigint;
  mediaType?: string;
  /** Telegram file_id of the attachment, when the message carries one. */
  fileId?: string;
  /** Telegram message time (falls back to now if the update omits `date`). */
  createdAt: Date;
}

function unixToDate(seconds: number | undefined): Date {
  return seconds != null ? new Date(seconds * 1000) : new Date();
}

/**
 * Content type of a message, if it carries an attachment, plus the `file_id`
 * needed to fetch it later (payment receipts, report screenshots). For photos
 * Telegram sends every rendered size — the last entry is the largest.
 */
function detectMedia(
  m: RawTelegramMessage,
): { kind: MessageKind; mediaType: string; fileId?: string } | null {
  if (m.voice) return { kind: "voice", mediaType: "voice", fileId: m.voice.file_id };
  if (m.document) return { kind: "file", mediaType: "document", fileId: m.document.file_id };
  if (m.photo) return { kind: "media", mediaType: "photo", fileId: m.photo.at(-1)?.file_id };
  if (m.video) return { kind: "media", mediaType: "video", fileId: m.video.file_id };
  if (m.audio) return { kind: "media", mediaType: "audio", fileId: m.audio.file_id };
  if (m.animation) return { kind: "media", mediaType: "animation", fileId: m.animation.file_id };
  if (m.sticker) return { kind: "media", mediaType: "sticker", fileId: m.sticker.file_id };
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
    fileId: media?.fileId,
    createdAt: unixToDate(msg.date),
  };
}

// ── Interactive updates ─────────────────────────────────────────────────────
// These carry no chat message, so `parseInboundMessage` returns null for them
// and they get their own parsers. Dedup still works: `captureUpdate` writes the
// ProcessedUpdate row whether or not a message came out of the update.

export interface InboundCallback {
  /** Must be answered within ~10s or the button keeps spinning. */
  callbackQueryId: string;
  fromUserId: bigint;
  fromUsername?: string;
  /** Chat the button lives in — where the acknowledgement is edited in. */
  chatId?: bigint;
  /** The message carrying the button, so its keyboard can be replaced. */
  messageId?: number;
  data?: string;
}

/** A button press. Returns null when the update is not a callback query. */
export function parseCallbackQuery(update: RawTelegramUpdate): InboundCallback | null {
  const cq = update.callback_query;
  if (!cq) return null;
  return {
    callbackQueryId: cq.id,
    fromUserId: BigInt(cq.from.id),
    fromUsername: cq.from.username,
    chatId: cq.message ? BigInt(cq.message.chat.id) : undefined,
    messageId: cq.message?.message_id,
    data: cq.data,
  };
}

export interface InboundChatMember {
  chatId: bigint;
  chatTitle?: string;
  chatType?: string;
  /** Whoever performed the change — for `my_chat_member`, who added the bot. */
  actorTelegramId: bigint;
  actorUsername?: string;
  oldStatus?: string;
  newStatus?: string;
  /** true ⇒ the bot just gained access to a chat it previously had none in. */
  joined: boolean;
  at: Date;
}

/** Statuses in which the bot can read and post in a chat. */
const PRESENT_STATUSES = new Set(["member", "administrator", "creator"]);

/** The bot's own membership change (`my_chat_member`). */
export function parseChatMemberUpdate(update: RawTelegramUpdate): InboundChatMember | null {
  const cm = update.my_chat_member;
  if (!cm) return null;
  const oldStatus = cm.old_chat_member?.status;
  const newStatus = cm.new_chat_member?.status;
  return {
    chatId: BigInt(cm.chat.id),
    chatTitle: cm.chat.title,
    chatType: cm.chat.type,
    actorTelegramId: BigInt(cm.from.id),
    actorUsername: cm.from.username,
    oldStatus,
    newStatus,
    joined:
      newStatus != null &&
      PRESENT_STATUSES.has(newStatus) &&
      !(oldStatus != null && PRESENT_STATUSES.has(oldStatus)),
    at: unixToDate(cm.date),
  };
}

export interface InboundContact {
  chatId: bigint;
  fromUserId: bigint;
  fromUsername?: string;
  phone: string;
  /**
   * false ⇒ the user forwarded SOMEONE ELSE's contact card. Linking must refuse
   * those: sharing a colleague's number would otherwise bind their employee
   * record to your Telegram account.
   */
  isOwn: boolean;
}

/** A shared contact card, i.e. the reply to a `request_contact` button. */
export function parseContact(update: RawTelegramUpdate): InboundContact | null {
  const msg = update.message;
  const contact = msg?.contact;
  if (!msg || !contact || !msg.from) return null;
  return {
    chatId: BigInt(msg.chat.id),
    fromUserId: BigInt(msg.from.id),
    fromUsername: msg.from.username,
    phone: contact.phone_number,
    isOwn: contact.user_id != null && BigInt(contact.user_id) === BigInt(msg.from.id),
  };
}
