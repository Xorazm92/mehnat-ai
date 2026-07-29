import { describe, it, expect } from "vitest";
import {
  parseInboundMessage,
  parseCallbackQuery,
  parseChatMemberUpdate,
  parseContact,
  type RawTelegramUpdate,
} from "./inbound-message";

const chat = { id: -1001234567890, type: "supergroup", title: "ACME" };
const from = { id: 42, username: "aziz", first_name: "Aziz" };
const DATE = 1_752_600_000; // 2025-07-15T ... unix seconds

function upd(partial: Partial<RawTelegramUpdate>): RawTelegramUpdate {
  return { update_id: 1000, ...partial };
}

describe("parseInboundMessage", () => {
  it("normalises a plain text message with BigInt ids and message time", () => {
    const m = parseInboundMessage(
      upd({ message: { message_id: 7, date: DATE, chat, from, text: "salom" } }),
    );
    expect(m).not.toBeNull();
    expect(m!.chatId).toBe(BigInt(chat.id));
    expect(m!.messageId).toBe(BigInt(7));
    expect(m!.fromUserId).toBe(BigInt(42));
    expect(m!.text).toBe("salom");
    expect(m!.kind).toBe("text");
    expect(m!.createdAt.toISOString()).toBe(new Date(DATE * 1000).toISOString());
  });

  it("marks a reply and captures replyToId", () => {
    const m = parseInboundMessage(
      upd({
        message: {
          message_id: 8,
          date: DATE,
          chat,
          from,
          text: "javob",
          reply_to_message: { message_id: 7 },
        },
      }),
    );
    expect(m!.kind).toBe("reply");
    expect(m!.replyToId).toBe(BigInt(7));
  });

  it("classifies an edited message as 'edit'", () => {
    const m = parseInboundMessage(
      upd({
        edited_message: { message_id: 7, date: DATE, chat, from, text: "tuzatildi" },
      }),
    );
    expect(m!.kind).toBe("edit");
    expect(m!.messageId).toBe(BigInt(7));
  });

  it("detects voice / document / photo content and records replyToId regardless of kind", () => {
    const voice = parseInboundMessage(
      upd({ message: { message_id: 9, date: DATE, chat, from, voice: {} } }),
    );
    expect(voice!.kind).toBe("voice");
    expect(voice!.mediaType).toBe("voice");

    const file = parseInboundMessage(
      upd({ message: { message_id: 10, date: DATE, chat, from, document: {} } }),
    );
    expect(file!.kind).toBe("file");
    expect(file!.mediaType).toBe("document");

    const photoReply = parseInboundMessage(
      upd({
        message: {
          message_id: 11,
          date: DATE,
          chat,
          from,
          photo: [{}],
          caption: "chek",
          reply_to_message: { message_id: 7 },
        },
      }),
    );
    expect(photoReply!.kind).toBe("media");
    expect(photoReply!.mediaType).toBe("photo");
    expect(photoReply!.text).toBe("chek"); // caption promoted to text
    expect(photoReply!.replyToId).toBe(BigInt(7)); // reply still captured
  });

  it("classifies a reaction update", () => {
    const m = parseInboundMessage(
      upd({ message_reaction: { chat, message_id: 7, user: from, date: DATE } }),
    );
    expect(m!.kind).toBe("reaction");
    expect(m!.messageId).toBe(BigInt(7));
    expect(m!.fromUserId).toBe(BigInt(42));
  });

  it("returns null for updates that carry no capturable message", () => {
    expect(parseInboundMessage(upd({}))).toBeNull();
  });

  it("tolerates a missing sender (channel post) and missing date", () => {
    const m = parseInboundMessage(
      upd({ channel_post: { message_id: 5, chat, text: "e'lon" } }),
    );
    expect(m!.fromUserId).toBeUndefined();
    expect(m!.kind).toBe("text");
    expect(m!.createdAt).toBeInstanceOf(Date);
  });

  it("keeps the largest photo's file_id so the file can be fetched later", () => {
    const m = parseInboundMessage(
      upd({
        message: {
          message_id: 12,
          date: DATE,
          chat,
          from,
          photo: [{ file_id: "small" }, { file_id: "large" }],
        },
      }),
    );
    expect(m!.fileId).toBe("large");
  });

  it("returns null for the interactive updates, leaving them to their parsers", () => {
    const cb = upd({
      callback_query: { id: "q1", from, data: "sig:act:1" },
    });
    expect(parseInboundMessage(cb)).toBeNull();
    expect(parseInboundMessage(upd({ my_chat_member: { chat, from } }))).toBeNull();
  });
});

describe("parseCallbackQuery", () => {
  it("extracts the query id, presser and host message", () => {
    const cb = parseCallbackQuery(
      upd({
        callback_query: {
          id: "q1",
          from,
          data: "abcdefgh:qpen:xyz",
          message: { message_id: 55, chat },
        },
      }),
    );
    expect(cb).toEqual({
      callbackQueryId: "q1",
      fromUserId: BigInt(42),
      fromUsername: "aziz",
      chatId: BigInt(chat.id),
      messageId: 55,
      data: "abcdefgh:qpen:xyz",
    });
  });

  it("tolerates a query whose host message is too old to be included", () => {
    const cb = parseCallbackQuery(upd({ callback_query: { id: "q2", from } }));
    expect(cb!.chatId).toBeUndefined();
    expect(cb!.messageId).toBeUndefined();
  });

  it("returns null for a non-callback update", () => {
    expect(parseCallbackQuery(upd({ message: { message_id: 1, chat, from } }))).toBeNull();
  });
});

describe("parseChatMemberUpdate", () => {
  it("flags the bot being added to a group", () => {
    const cm = parseChatMemberUpdate(
      upd({
        my_chat_member: {
          chat,
          from,
          date: DATE,
          old_chat_member: { status: "left" },
          new_chat_member: { status: "member" },
        },
      }),
    );
    expect(cm!.joined).toBe(true);
    expect(cm!.chatId).toBe(BigInt(chat.id));
    expect(cm!.actorTelegramId).toBe(BigInt(42));
    expect(cm!.chatTitle).toBe("ACME");
  });

  it("does not treat a promotion to admin as joining", () => {
    // Otherwise every permission change would re-trigger the bind prompt.
    const cm = parseChatMemberUpdate(
      upd({
        my_chat_member: {
          chat,
          from,
          old_chat_member: { status: "member" },
          new_chat_member: { status: "administrator" },
        },
      }),
    );
    expect(cm!.joined).toBe(false);
  });

  it("does not treat removal as joining", () => {
    const cm = parseChatMemberUpdate(
      upd({
        my_chat_member: {
          chat,
          from,
          old_chat_member: { status: "administrator" },
          new_chat_member: { status: "kicked" },
        },
      }),
    );
    expect(cm!.joined).toBe(false);
  });
});

describe("parseContact", () => {
  it("accepts the sender's own contact", () => {
    const c = parseContact(
      upd({
        message: {
          message_id: 3,
          date: DATE,
          chat: { id: 42, type: "private" },
          from,
          contact: { phone_number: "+998901234567", user_id: 42 },
        },
      }),
    );
    expect(c).toEqual({
      chatId: BigInt(42),
      fromUserId: BigInt(42),
      fromUsername: "aziz",
      phone: "+998901234567",
      isOwn: true,
    });
  });

  it("marks a forwarded third-party contact as not the sender's", () => {
    const c = parseContact(
      upd({
        message: {
          message_id: 4,
          date: DATE,
          chat: { id: 42, type: "private" },
          from,
          contact: { phone_number: "+998901112233", user_id: 999 },
        },
      }),
    );
    expect(c!.isOwn).toBe(false);
  });

  it("treats a contact card with no user_id as not the sender's", () => {
    // Manually-typed contacts carry no user_id and must not link an account.
    const c = parseContact(
      upd({
        message: {
          message_id: 5,
          date: DATE,
          chat: { id: 42, type: "private" },
          from,
          contact: { phone_number: "+998901112233" },
        },
      }),
    );
    expect(c!.isOwn).toBe(false);
  });

  it("returns null when the message carries no contact", () => {
    expect(
      parseContact(upd({ message: { message_id: 6, chat, from, text: "salom" } })),
    ).toBeNull();
  });
});
