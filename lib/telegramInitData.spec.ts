import { describe, it, expect } from "vitest";
import { verifyInitData, signInitDataForTest, INIT_DATA_MAX_AGE_MS } from "./telegramInitData";

const TOKEN = "123456:AAH-test-bot-token";
const NOW = new Date("2026-07-29T10:00:00Z");
const AUTH_DATE = String(Math.floor(NOW.getTime() / 1000) - 60); // a minute old

function validInitData(overrides: Record<string, string> = {}, token = TOKEN): string {
  return signInitDataForTest(
    {
      auth_date: AUTH_DATE,
      query_id: "AAEtest",
      user: JSON.stringify({ id: 42, username: "aziz", first_name: "Aziz" }),
      ...overrides,
    },
    token,
  );
}

describe("verifyInitData — acceptance", () => {
  it("accepts data signed with the bot token and returns the Telegram id", () => {
    const res = verifyInitData(validInitData(), TOKEN, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.telegramUserId).toBe(BigInt(42));
    expect(res.username).toBe("aziz");
    expect(res.firstName).toBe("Aziz");
  });

  it("ignores the separate Ed25519 `signature` field when hashing", () => {
    // Telegram adds `signature` alongside `hash`; including it in the check
    // string would make every real payload fail.
    const base = validInitData();
    const withSignature = `${base}&signature=abc123`;
    expect(verifyInitData(withSignature, TOKEN, NOW).ok).toBe(true);
  });

  it("accepts data right up to the freshness limit", () => {
    const edge = new Date(NOW.getTime() + INIT_DATA_MAX_AGE_MS - 61_000);
    expect(verifyInitData(validInitData(), TOKEN, edge).ok).toBe(true);
  });
});

describe("verifyInitData — rejection", () => {
  it("rejects a tampered user id", () => {
    // The whole point: claiming to be someone else must not work.
    const data = validInitData();
    const forged = data.replace(
      encodeURIComponent(JSON.stringify({ id: 42, username: "aziz", first_name: "Aziz" })),
      encodeURIComponent(JSON.stringify({ id: 99, username: "aziz", first_name: "Aziz" })),
    );
    const res = verifyInitData(forged, TOKEN, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("bad_signature");
  });

  it("rejects data signed with a different bot token", () => {
    const res = verifyInitData(validInitData({}, "999:other"), TOKEN, NOW);
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects stale data", () => {
    const later = new Date(NOW.getTime() + INIT_DATA_MAX_AGE_MS + 60_000);
    expect(verifyInitData(validInitData(), TOKEN, later)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a payload with no user", () => {
    const noUser = signInitDataForTest({ auth_date: AUTH_DATE, query_id: "x" }, TOKEN);
    expect(verifyInitData(noUser, TOKEN, NOW)).toEqual({ ok: false, reason: "missing_user" });
  });

  it("rejects unparsable user JSON", () => {
    const bad = signInitDataForTest({ auth_date: AUTH_DATE, user: "{not json" }, TOKEN);
    expect(verifyInitData(bad, TOKEN, NOW)).toEqual({ ok: false, reason: "missing_user" });
  });

  it("rejects missing, empty and hash-less input", () => {
    expect(verifyInitData("", TOKEN, NOW)).toEqual({ ok: false, reason: "empty" });
    expect(verifyInitData(null, TOKEN, NOW)).toEqual({ ok: false, reason: "empty" });
    expect(verifyInitData("user=%7B%7D", TOKEN, NOW)).toEqual({
      ok: false,
      reason: "missing_hash",
    });
  });

  it("rejects a non-hex hash without throwing", () => {
    expect(verifyInitData("auth_date=1&hash=zzzz", TOKEN, NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("fails closed when the bot token is not configured", () => {
    // Otherwise a deployment with no token would accept anything.
    expect(verifyInitData(validInitData(), "", NOW)).toEqual({ ok: false, reason: "no_token" });
  });

  // BOT API 7.10+ — haqiqiy Telegram initData'da `signature` ham keladi.
  // Prod'da butun Mini App aynan shu maydon tufayli ishlamay turgan edi:
  // testlarda u yo'q, shuning uchun xato ko'rinmasdi.
  it("signature maydoni HMAC ichida bo'lsa ham qabul qiladi", () => {
    const fields = {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "AAF",
      signature: "ed25519-imzo",
      user: JSON.stringify({ id: 42, first_name: "Test" }),
    };
    // `signature` CHIQARILMASDAN imzolangan — Telegram shunday yuboradi.
    const initData = signInitDataForTest(fields, TOKEN);
    const res = verifyInitData(initData, TOKEN);
    expect(res.ok).toBe(true);
  });

  // Eski talqin ham ishlashda davom etsin (signature hisobga kirmagan holat).
  it("signature chiqarib imzolangan initData ham o'tadi", () => {
    const base = {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 42, first_name: "Test" }),
    };
    const signed = new URLSearchParams(signInitDataForTest(base, TOKEN));
    signed.set("signature", "ed25519-imzo");
    expect(verifyInitData(signed.toString(), TOKEN).ok).toBe(true);
  });
});
