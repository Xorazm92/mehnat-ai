import { describe, it, expect } from "vitest";
import {
  parseInboundMessage,
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
});
