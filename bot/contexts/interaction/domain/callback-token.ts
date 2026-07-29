/**
 * Signed, stateless `callback_data`.
 *
 * Telegram allows 64 BYTES per button. Rather than persist a row per rendered
 * button (and then expire it), a callback carries its own payload plus a short
 * HMAC of it:
 *
 *     <sig8>:<action>:<id>
 *     e5f1a2b3:qpen:9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f     → 49 bytes
 *
 * The signature is NOT the authorization. It only proves the payload came from
 * us, so a modified client in a shared chat cannot fabricate a button for an
 * arbitrary entity id. Every handler must still resolve the presser to a User
 * and run the normal role/scope checks, and every effect must be idempotent —
 * a stateless token can be replayed by pressing the same button twice.
 *
 * Pure and framework-free: node:crypto only, no Prisma, no grammY.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Telegram's hard limit on callback_data. */
export const CALLBACK_DATA_MAX_BYTES = 64;
const SIG_LENGTH = 8;

export interface CallbackPayload {
  /** Short verb, e.g. "qpen" (question penalty) or "bindpk" (bind: pick). */
  action: string;
  /** Entity reference: a uuid, a page number, or "" for argument-less actions. */
  id: string;
}

function signature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex").slice(0, SIG_LENGTH);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Build signed callback_data. Throws when the result would exceed Telegram's
 * limit — a truncated callback is silently unclickable in production, so this
 * must fail loudly at the call site instead.
 */
export function encodeCallback(secret: string, action: string, id = ""): string {
  if (!action || action.includes(":")) {
    throw new Error(`callback action must be non-empty and colon-free: "${action}"`);
  }
  const body = `${action}:${id}`;
  const data = `${signature(secret, body)}:${body}`;
  const bytes = Buffer.byteLength(data, "utf8");
  if (bytes > CALLBACK_DATA_MAX_BYTES) {
    throw new Error(
      `callback_data is ${bytes} bytes (max ${CALLBACK_DATA_MAX_BYTES}): "${data}". ` +
        `Shorten the action or reference the entity by a shorter key.`,
    );
  }
  return data;
}

/**
 * Verify and destructure callback_data. Returns null for anything we did not
 * sign — a stale button from an older secret, or a forged payload. Callers
 * answer such a query with "this button has expired" rather than acting.
 */
export function decodeCallback(secret: string, data: string | undefined | null): CallbackPayload | null {
  if (!data) return null;
  if (data.charAt(SIG_LENGTH) !== ":") return null;

  const sig = data.slice(0, SIG_LENGTH);
  const body = data.slice(SIG_LENGTH + 1);
  if (!safeEqual(sig, signature(secret, body))) return null;

  // The id may itself contain colons, so split on the FIRST one only.
  const sep = body.indexOf(":");
  if (sep <= 0) return null;
  return { action: body.slice(0, sep), id: body.slice(sep + 1) };
}

// ── Compact id encodings ────────────────────────────────────────────────────
// 64 bytes does not fit "<sig>:<action>:<chatId>:<uuid>" in their plain forms
// (67+ bytes). These shrink the two ids we most often need together, keeping
// the token stateless — no lookup table, no expiry sweep.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** uuid (36 chars) → base64url (22 chars). */
export function packUuid(uuid: string): string {
  if (!UUID_RE.test(uuid)) throw new Error(`not a uuid: "${uuid}"`);
  return Buffer.from(uuid.replace(/-/g, ""), "hex").toString("base64url");
}

/** Inverse of `packUuid`. Returns null for anything malformed. */
export function unpackUuid(packed: string): string | null {
  if (packed.length !== 22) return null;
  const buf = Buffer.from(packed, "base64url");
  if (buf.length !== 16) return null;
  const h = buf.toString("hex");
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  return UUID_RE.test(uuid) ? uuid : null;
}

// BigInt literals (0n) need target ES2020; this repo targets lower, so the
// helpers below construct BigInts explicitly — matching the rest of bot/.
const ZERO = BigInt(0);
const RADIX = BigInt(36);

/** Telegram chat id → base36 ("-1001234567890" → "-ckn0v0f6"-ish, ~10 chars). */
export function packChatId(chatId: bigint): string {
  const neg = chatId < ZERO;
  const abs = neg ? -chatId : chatId;
  return (neg ? "-" : "") + abs.toString(36);
}

/** Inverse of `packChatId`. Returns null for anything malformed. */
export function unpackChatId(packed: string): bigint | null {
  const neg = packed.startsWith("-");
  const digits = neg ? packed.slice(1) : packed;
  if (!/^[0-9a-z]+$/.test(digits)) return null;
  let value = ZERO;
  for (const ch of digits) {
    const d = parseInt(ch, 36);
    if (Number.isNaN(d)) return null;
    value = value * RADIX + BigInt(d);
  }
  return neg ? -value : value;
}
