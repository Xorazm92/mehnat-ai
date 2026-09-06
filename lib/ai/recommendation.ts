// =====================================================
// TAVSIYA SHARTNOMASI — matn tushuntiradi, payload bajaradi (M5.3)
// =====================================================
// M5.2 da tizim "xavf bor" deyishni o'rgandi (yetakchi ko'rsatkichlar), lekin
// "nima qilish kerak" faqat modelning erkin matnida qolardi: uni bosib
// bo'lmasdi, o'lchab ham bo'lmasdi. PRODUCT.md ning 5-va'dasi esa aynan
// "tizim nima qilish kerakligini AYTADI va odam bir bosishda bajaradi"
// deydi va uning o'lchovi — qabul qilingan tavsiyalar ulushi (≥ 50%).
//
// IKKI YO'L, ATAYLAB AJRATILGAN.
//
//   `rationale` — AI ning ERKIN matni. Odam o'qiydi, tizim unga tayanmaydi.
//   `payload`   — TUZILGAN amal parametrlari. Tizim faqat shuni bajaradi.
//
// Nega ajratilgan: qabul qilingan tavsiya HAQIQIY amal bajaradi (majburiyat
// ko'chadi, eskalatsiya yoziladi, kechikish sababi tasdiqlanadi). Agar amal
// matndan o'qib olinsa, modelning bir so'zli o'zgarishi boshqa firmada
// boshqa ishni bajarib yuborardi. Shuning uchun payload har `kind` uchun
// ALOHIDA sxema bilan tekshiriladi va sxemadan o'tmagani bazaga ham
// tushmaydi — noto'g'ri payload "qabul" tugmasi bosilgunga qadar emas,
// YARATILISHDA rad etiladi.
//
// DA'VOLAR (M5.1). Tavsiya ostidagi raqamlar `AiClaim` bo'lib saqlanadi:
// direktor "nega bu tavsiya?" deb so'raganda javob matnda emas, manbada
// turadi (Modda 7).
import { z } from "zod";
import { aiClaimSchema, type AiClaim } from "@/lib/ai/claim";

/**
 * Tavsiya turlari.
 *
 * Ro'yxat YOPIQ va qisqa: har biri o'zining amal ishlovchisiga ega
 * (`lib/domains/accounting/recommendations.ts`). Yangi tur qo'shish =
 * yangi ishlovchi yozish, ya'ni "bajarib bo'lmaydigan tavsiya" holati
 * tuzilish jihatidan mumkin emas.
 */
export const RECOMMENDATION_KINDS = [
  /** Majburiyatni eskalatsiya zanjiriga qo'shish (nazoratchi → bosh buxgalter). */
  "escalate_obligation",
  /** Majburiyat mas'ulini almashtirish. */
  "reassign_responsible",
  /** Bank sverkasidagi taqqoslanmagan qatorlarni tekshirish (vazifa ochiladi). */
  "review_unmatched_bank",
  /** Kechikishni sabab bilan rasmiylashtirish (KPI dan chiqarish). */
  "postpone_obligation",
  /** Mas'uldan mijoz hujjatini so'rashni talab qilish. */
  "request_documentation",
] as const;

export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

/** Ekranda ko'rinadigan nom — inson tili, yagona manba (UI takrorlamaydi). */
export const RECOMMENDATION_LABELS: Record<RecommendationKind, string> = {
  escalate_obligation: "Majburiyatni zanjirga qo'shish",
  reassign_responsible: "Mas'ulni almashtirish",
  review_unmatched_bank: "Bank sverkasini tekshirish",
  postpone_obligation: "Kechikishni sabab bilan rasmiylashtirish",
  request_documentation: "Mijozdan hujjat so'rash",
};

export const RECOMMENDATION_STATUSES = ["pending", "accepted", "dismissed", "expired"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/**
 * Javobsiz tavsiya shuncha kundan keyin `expired` bo'ladi.
 *
 * `expiresAt` USTUNI YO'Q — muddat `createdAt` dan hisoblanadi. Sabab: ustun
 * bo'lsa u ikkinchi haqiqat bo'lardi (kim uni o'zgartira oladi? qayta
 * hisoblanadimi?), holbuki qoida bitta va o'zgarmaydi. Kunlik cron
 * (`bot/cron/chores.ts`) shu yoshdagi qatorlarni belgilaydi.
 *
 * Nega muddat bor: javobsiz qolgan tavsiya "rad etilgan" emas, lekin "kutmoqda"
 * ham emas — u shunchaki eskirgan. Uni pendingda qoldirish 5-va'da o'lchovini
 * ABADIY yaxshi ko'rsatardi (maxraj o'smasdi).
 */
export const RECOMMENDATION_TTL_DAYS = 7;

/** 5-va'da maqsadi: qabul qilingan ulush shu foizdan past bo'lmasin. */
export const ADOPTION_TARGET_PERCENT = 50;

// ── Payload sxemalari ────────────────────────────────────────────────────
// Har `kind` uchun alohida. Bo'sh obyekt qabul qilinmaydi: amalni
// bajarishga yetmaydigan payload tavsiyaning o'zini yaroqsiz qiladi.

const uuid = z.string().uuid();

/**
 * Eskalatsiya bosqichi. `0` — mas'ul xodim, `1` — nazoratchi, `2` — bosh
 * buxgalter (`lib/engines/automation/escalation.ts`). Standart `1`:
 * mas'ulning o'zi allaqachon biladi, direktor tavsiyasi zanjirni
 * KO'TARADI.
 */
const escalationLevel = z.union([z.literal(0), z.literal(1), z.literal(2)]);

/**
 * Kechikish sababi — `DelayReason` enumi bilan AYNAN bir xil ro'yxat.
 * Prisma tipidan olinmaydi, chunki bu fayl mijozga ham boradi; ro'yxat
 * `prisma/schema.prisma` dagidan chetga chiqsa `parseRecommendationPayload`
 * testi qulaydi.
 */
const delayReason = z.enum([
  "accountant_delay",
  "client_delay",
  "system_failure",
  "external_authority",
  "management_decision",
  "other",
]);

export const RECOMMENDATION_PAYLOAD_SCHEMAS = {
  escalate_obligation: z.object({
    obligationId: uuid,
    level: escalationLevel.optional(),
  }),
  reassign_responsible: z.object({
    obligationId: uuid,
    toUserId: uuid,
  }),
  review_unmatched_bank: z.object({
    /** Vazifa kimga tushadi. Berilmasa firmaning mas'ul buxgalteriga. */
    assigneeUserId: uuid.optional(),
  }),
  postpone_obligation: z.object({
    obligationId: uuid,
    delayReason,
  }),
  request_documentation: z.object({
    /** Qaysi hujjat — talab matni shundan quriladi, shuning uchun majburiy. */
    documentName: z.string().trim().min(3).max(200),
    /** Kimdan so'raladi (xodim). Berilmasa firmaning mas'ul buxgalteri. */
    toUserId: uuid.optional(),
  }),
} as const satisfies Record<RecommendationKind, z.ZodTypeAny>;

export type RecommendationPayload = {
  [K in RecommendationKind]: z.infer<(typeof RECOMMENDATION_PAYLOAD_SCHEMAS)[K]>;
};

/**
 * Payloadni `kind` sxemasi bo'yicha tekshiradi.
 *
 * Xato TASHLAYDI, `null` qaytarmaydi: noto'g'ri payloadli tavsiya keyin
 * "bajarib bo'lmaydigan" bo'lib navbatda qolib ketardi va direktor uni har
 * kuni ko'rib, har safar xato olardi.
 */
export function parseRecommendationPayload<K extends RecommendationKind>(
  kind: K,
  payload: unknown,
): RecommendationPayload[K] {
  const schema = RECOMMENDATION_PAYLOAD_SCHEMAS[kind];
  if (!schema) throw new Error(`Noma'lum tavsiya turi: ${kind}`);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `"${RECOMMENDATION_LABELS[kind]}" uchun parametr noto'g'ri: ${first?.path.join(".") || "payload"} — ${first?.message ?? "yaroqsiz"}`,
    );
  }
  return parsed.data as RecommendationPayload[K];
}

export const isRecommendationKind = (v: unknown): v is RecommendationKind =>
  typeof v === "string" && (RECOMMENDATION_KINDS as readonly string[]).includes(v);

/**
 * Bitta tavsiya.
 *
 * `id` — uuid (Prisma `@default(uuid())`), ulid emas: loyihaning qolgan
 * hamma modeli uuid ishlatadi va ikkinchi identifikator turi kiritish
 * hech nima bermasdi.
 */
export interface Recommendation {
  id: string;
  companyId: string;
  companyName: string;
  kind: RecommendationKind;
  /** Nima uchun — AI ning erkin matni (1-2 gap). Amal bunga tayanmaydi. */
  rationale: string;
  /** Tavsiya ostidagi raqamlar, manbasi bilan (M5.1). */
  claims: AiClaim[];
  /** Amal parametrlari — `kind` sxemasi bo'yicha tekshirilgan. */
  payload: Record<string, unknown>;
  /** Kim yaratdi: "system" (cron) yoki "assistant" (suhbat). */
  source: "system" | "assistant";
  createdAt: Date;
  status: RecommendationStatus;
  decidedBy?: string | null;
  decidedByName?: string | null;
  decidedAt?: Date | null;
  decisionNote?: string | null;
}

/** Bazadan o'qilgan `claims` Json — shaklga solib beradi (buzuq qator yiqitmasin). */
export function parseClaims(raw: unknown): AiClaim[] {
  if (!Array.isArray(raw)) return [];
  const out: AiClaim[] = [];
  for (const item of raw) {
    const p = aiClaimSchema.safeParse(item);
    if (p.success) out.push(p.data);
  }
  return out;
}
