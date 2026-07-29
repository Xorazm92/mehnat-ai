import { describe, it, expect } from "vitest";
import {
  encodeCallback,
  decodeCallback,
  packUuid,
  unpackUuid,
  packChatId,
  unpackChatId,
  CALLBACK_DATA_MAX_BYTES,
} from "./callback-token";

const SECRET = "test-webhook-secret";

describe("encodeCallback / decodeCallback", () => {
  it("round-trips an action and a uuid", () => {
    const id = "9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
    const data = encodeCallback(SECRET, "qpen", id);
    expect(decodeCallback(SECRET, data)).toEqual({ action: "qpen", id });
  });

  it("keeps a uuid payload inside Telegram's 64-byte limit", () => {
    const data = encodeCallback(SECRET, "bindpk", "9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f");
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES);
  });

  it("round-trips an argument-less action", () => {
    const data = encodeCallback(SECRET, "menu");
    expect(decodeCallback(SECRET, data)).toEqual({ action: "menu", id: "" });
  });

  it("preserves colons inside the id", () => {
    const data = encodeCallback(SECRET, "bindpg", "2:asc");
    expect(decodeCallback(SECRET, data)).toEqual({ action: "bindpg", id: "2:asc" });
  });
});

describe("rejection", () => {
  it("refuses a payload that would exceed the byte limit", () => {
    expect(() => encodeCallback(SECRET, "action", "x".repeat(60))).toThrow(/64/);
  });

  it("refuses an action containing the separator", () => {
    expect(() => encodeCallback(SECRET, "a:b", "1")).toThrow(/colon-free/);
  });

  it("rejects a tampered id", () => {
    const data = encodeCallback(SECRET, "qpen", "aaaa");
    const forged = data.replace("aaaa", "bbbb");
    expect(decodeCallback(SECRET, forged)).toBeNull();
  });

  it("rejects a tampered action", () => {
    const data = encodeCallback(SECRET, "qwarn", "aaaa");
    expect(decodeCallback(SECRET, data.replace("qwarn", "qpenx"))).toBeNull();
  });

  it("rejects data signed with a different secret", () => {
    const data = encodeCallback("other-secret", "qpen", "aaaa");
    expect(decodeCallback(SECRET, data)).toBeNull();
  });

  it("rejects malformed and empty input", () => {
    expect(decodeCallback(SECRET, "")).toBeNull();
    expect(decodeCallback(SECRET, undefined)).toBeNull();
    expect(decodeCallback(SECRET, "nope")).toBeNull();
    expect(decodeCallback(SECRET, "abcdefgh:noseparator")).toBeNull();
  });
});

describe("compact id encodings", () => {
  const UUID = "9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  const CHAT = BigInt("-1001234567890");

  it("round-trips a uuid in 22 characters", () => {
    const packed = packUuid(UUID);
    expect(packed).toHaveLength(22);
    expect(unpackUuid(packed)).toBe(UUID);
  });

  it("round-trips negative and positive chat ids", () => {
    expect(unpackChatId(packChatId(CHAT))).toBe(CHAT);
    expect(unpackChatId(packChatId(BigInt(42)))).toBe(BigInt(42));
    expect(unpackChatId(packChatId(BigInt(0)))).toBe(BigInt(0));
  });

  it("fits a chat id AND a company uuid in one callback", () => {
    // This is the smart-bind button: without packing it would be 67+ bytes.
    const data = encodeCallback(SECRET, "bnd", `${packChatId(CHAT)}:${packUuid(UUID)}`);
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES);
    const decoded = decodeCallback(SECRET, data)!;
    const [chat, company] = decoded.id.split(":");
    expect(unpackChatId(chat)).toBe(CHAT);
    expect(unpackUuid(company)).toBe(UUID);
  });

  it("rejects malformed packed ids instead of returning garbage", () => {
    expect(packUuid).toThrow();
    expect(() => packUuid("not-a-uuid")).toThrow(/not a uuid/);
    expect(unpackUuid("tooshort")).toBeNull();
    expect(unpackChatId("")).toBeNull();
    expect(unpackChatId("-")).toBeNull();
    expect(unpackChatId("ABC!")).toBeNull();
  });
});
