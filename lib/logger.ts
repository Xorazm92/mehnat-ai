// =====================================================
// STRUCTURED LOGGING (pino) — redaction majburiy
// =====================================================
// Bu modul FAQAT Node runtime uchun (pino Edge'da ishlamaydi). proxy.ts Edge'da
// ishlaydi — u yerdan HECH QACHON import qilinmasin, aks holda build buziladi.
//
// Nima uchun o'z redaction'imiz bor: pino'ning `redact` opsiyasi aniq yo'llarni
// (`req.headers.cookie`) talab qiladi, biz esa ixtiyoriy chuqurlikdagi obyektlarni
// log qilamiz (Prisma qatorlari, server action payload'lari, xato konteksti).
// Shuning uchun kalit nomi bo'yicha rekursiv tozalash qilamiz — parol/token/cookie/
// secret hech qachon diskka tushmaydi, hatto kimdir butun obyektni log qilsa ham.

import pino from "pino";

export const REDACTED = "[redacted]";

// Bir ma'noli kalitlar — substring bo'yicha mos kelsa ham tozalanadi.
const SENSITIVE_SUBSTRINGS = [
  "password",
  "passwd",
  "passphrase",
  "pwd",
  "secret",
  "token",
  "cookie",
  "authorization",
  "credential",
  "apikey",
  "api_key",
  "privatekey",
  "private_key",
  "sessionid",
  "session_id",
];

// Qisqa/ko'p ma'noli kalitlar — FAQAT to'liq mos kelganda tozalanadi, aks holda
// `periodKey`, `checksumHash`, `keyFilePath` kabi zararsiz maydonlar ham yo'qolardi.
const SENSITIVE_EXACT = new Set(["auth", "hash", "salt", "key", "pin", "otp", "jwt"]);

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE_EXACT.has(k)) return true;
  return SENSITIVE_SUBSTRINGS.some((s) => k.includes(s));
}

// Zararsiz kalit ostida ham uchraydigan sirlar (masalan `detail: "Bearer eyJ…"`).
const BEARER_RE = /\bBearer\s+[\w-]+\.[\w-]+\.[\w-]+/gi;
const JWT_RE = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g;

function scrubString(value: string): string {
  return value.replace(BEARER_RE, `Bearer ${REDACTED}`).replace(JWT_RE, REDACTED);
}

const MAX_DEPTH = 6;
const MAX_ARRAY = 50;

/**
 * Obyektni rekursiv tozalaydi: sezgir kalitlar qiymati `[redacted]` ga
 * almashadi. Sikl (circular) havolalar, chuqurlik va massiv uzunligi cheklangan
 * — log yozish hech qachon jarayonni osib qo'ymasligi kerak.
 */
export function redactSensitive(input: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof input === "string") return scrubString(input);
  if (input === null || typeof input !== "object") return input;
  if (depth >= MAX_DEPTH) return "[depth-limit]";

  if (input instanceof Error) {
    return { name: input.name, message: scrubString(input.message), stack: input.stack };
  }
  if (input instanceof Date) return input.toISOString();

  if (seen.has(input)) return "[circular]";
  seen.add(input);

  if (Array.isArray(input)) {
    const out = input.slice(0, MAX_ARRAY).map((v) => redactSensitive(v, depth + 1, seen));
    if (input.length > MAX_ARRAY) out.push(`[+${input.length - MAX_ARRAY} more]`);
    return out;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redactSensitive(v, depth + 1, seen);
  }
  return out;
}

function resolveLevel(): pino.Level | "silent" {
  const explicit = process.env.LOG_LEVEL as pino.Level | "silent" | undefined;
  if (explicit) return explicit;
  if (process.env.VITEST) return "silent"; // testlar log bilan to'lib ketmasin
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

export const logger = pino({
  level: resolveLevel(),
  base: { service: process.env.SERVICE_NAME ?? "asro" },
  // Standart pino `level: 30` o'rniga o'qiladigan yorliq — log agregatorlar uchun.
  formatters: { level: (label) => ({ level: label }) },
  // Ikkinchi qatlam himoya: pino'ning o'z redaction'i keng tarqalgan HTTP shakllari uchun.
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'req.headers["x-telegram-bot-api-secret-token"]',
      "headers.cookie",
      "headers.authorization",
    ],
    censor: REDACTED,
  },
  hooks: {
    logMethod(args, method) {
      if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
        args[0] = redactSensitive(args[0]) as object;
      }
      return method.apply(this, args);
    },
  },
});

// ── Kuzatiladigan hodisalar ───────────────────────────────────────────────────
// Nomlangan yordamchilar: `event` maydoni barqaror qoladi, shuning uchun alert
// qoidalarini (`event="login.failure"`) matn bo'yicha emas, maydon bo'yicha yozish
// mumkin. Chaqiruvchi hech qachon parolni uzatmaydi — faqat sabab toifasi.

export type LoginFailureReason =
  | "missing_credentials"
  | "unknown_account"
  | "inactive_account"
  | "bad_password";

/** Muvaffaqiyatsiz login urinishi. `login` normallashtirilgan (email) — PII, parol emas. */
export function logLoginFailure(fields: {
  reason: LoginFailureReason;
  login?: string;
  ip?: string;
  kind?: "staff" | "client" | "unknown";
}): void {
  logger.warn({ event: "login.failure", ...fields }, "login failed");
}

/** Muvaffaqiyatli login — audit izi va anomaliya aniqlash uchun. */
export function logLoginSuccess(fields: { userId: string; kind: "staff" | "client"; ip?: string }): void {
  logger.info({ event: "login.success", ...fields }, "login ok");
}

/** Rate limit bloki — brute-force hujumining asosiy signali. */
export function logRateLimitBlock(fields: {
  scope: string;
  ip?: string;
  login?: string;
  retryAfterMs: number;
  backend: "redis" | "memory";
}): void {
  logger.warn({ event: "ratelimit.block", ...fields }, "rate limit exceeded");
}

/** Server xatosi (route handler, server action, kritik oqim). */
export function logServerError(scope: string, err: unknown, context?: Record<string, unknown>): void {
  logger.error({ event: "server.error", scope, err, ...context }, "server error");
}

/** BullMQ job muvaffaqiyatsizligi — barcha worker'lar shu orqali xabar beradi. */
export function logJobFailure(fields: {
  queue: string;
  jobId?: string;
  jobName?: string;
  attempts?: number;
  err: unknown;
}): void {
  logger.error({ event: "job.failed", ...fields }, "queue job failed");
}
