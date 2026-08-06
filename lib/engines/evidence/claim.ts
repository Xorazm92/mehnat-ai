// =====================================================
// EVIDENCE CLAIM — manbadan mustaqil dalil lug'ati
// =====================================================
// DOMEN-NEYTRAL (Konstitutsiya 4a/4b). Bu fayl bironta manba nomini ham,
// bironta soha atamasini ham bilmaydi — u faqat DA'VO shaklini biladi.
// Har qanday manba shu bitta lug'atda gapiradi, shuning uchun yangisini
// qo'shish landing kodida nol qator o'zgartiradi (Modda 5).
//
// Qarang: docs/adr/0008-imported-evidence-proposes-it-never-accepts.md
import { z } from "zod";

/** Workflow tartibi — "oldinga siljish" shu ro'yxat bo'yicha o'lchanadi. */
export const STATUS_ORDER = [
  "planned",
  "in_progress",
  "ready",
  "sent",
  "accepted",
] as const;
export type RankedStatus = (typeof STATUS_ORDER)[number];

export const rankOf = (s: string): number => STATUS_ORDER.indexOf(s as RankedStatus);

/**
 * `confidence` — ANIQLIK EMAS, VAKOLAT.
 *
 * Savol "parsing to'g'ri bo'ldimi?" emas, "kim aytdi?". Operatorning jadvali
 * 200 qatorga "+" yozib 200 majburiyatni tasdiqlay olmaydi, chunki jadval
 * vakolatli organ emas — u boshqa shriftdagi xotira.
 *
 *   1.0  vakolatli organning kvitansiyasi          → accepted
 *   0.7  harakatni ko'rgan tizim (hujjat o'tkazildi) → sent
 *   0.4  operatorning jadvali                        → sent (taklif)
 */
export function maxStatusForConfidence(confidence: number): RankedStatus {
  if (!Number.isFinite(confidence)) return "planned";
  if (confidence >= 1) return "accepted";
  if (confidence >= 0.7) return "sent";
  if (confidence >= 0.4) return "sent";
  return "planned";
}

/** Da'vo turi → u nazarda tutgan status. */
export const CLAIM_TO_STATUS = {
  prepared: "ready",
  submitted: "sent",
  accepted: "accepted",
  rejected: "rejected",
  paid: "accepted",
  not_applicable: "cancelled",
} as const;
export type ClaimKind = keyof typeof CLAIM_TO_STATUS;

export const evidenceTypeSchema = z.enum([
  "screenshot",
  "pdf",
  "receipt",
  "external_reference",
  "api_response",
  "manual_approval",
]);

export const claimSchema = z.object({
  schemaVersion: z.literal(1),

  /** Subyektni qanday tanidik. Aynan bittasi — yangi manba yangi variant
      qo'shadi, landing qoidasini emas. */
  subject: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("inn"), inn: z.string().min(1) }),
    z.object({ kind: z.literal("externalOrgId"), externalOrgId: z.string().min(1) }),
    z.object({ kind: z.literal("companyId"), companyId: z.string().uuid() }),
  ]),

  /** Qaysi majburiyat. `templateCode` kanonik: integratsiyalar matritsa
      kalitlarini hech qachon o'rganmaydi, shuning uchun UI ustunni istagancha
      qayta nomlashi mumkin. */
  obligation: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("templateCode"), code: z.string().min(1) }),
    z.object({ kind: z.literal("matrixKey"), key: z.string().min(1) }),
  ]),

  /** "2026-07" | "2026-Q3" | "2026" — davr OYNASI template davriyligidan
      hisoblanadi, manbaning tasavvuridan emas. */
  period: z.string().min(4),

  claim: z.enum(["prepared", "submitted", "accepted", "rejected", "paid", "not_applicable"]),
  occurredAt: z.string().datetime(),
  externalId: z.string().optional(),
  confidence: z.number().min(0).max(1),

  provenance: z.object({
    /**
     * Manba identifikatori — ERKIN SATR, oq ro'yxat EMAS.
     *
     * Bu yerda yopiq enum bo'lgan edi va u Modda 5 ni buzardi: yangi manba
     * qo'shish shu faylni — ya'ni ENGINE'ni — o'zgartirishni talab qilardi.
     * Ruxsat etilgan manbalar ro'yxati ulanishlar ro'yxatida yashaydi
     * (`OneCConnection.kind`), chunki manba u yerda ro'yxatdan o'tadi.
     * Konstitutsiya testi buni tutdi.
     */
    sourceSystem: z.string().min(1),
    profileId: z.string().optional(),
    batchId: z.string().optional(),
    uploadedBy: z.string().optional(),
    fileName: z.string().optional(),
    sheet: z.string().optional(),
    rowNumber: z.number().int().optional(),
    /** sha256(kanonik qator) — idempotencyKey shundan quriladi, ya'ni
        o'zgarmagan faylni qayta yuklash nol hodisa yaratadi. */
    rawHash: z.string().min(1),
  }),

  evidence: z
    .array(
      z.object({
        type: evidenceTypeSchema,
        storageRef: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .optional(),
});

export type EvidenceClaim = z.infer<typeof claimSchema>;

/** Da'vo + vakolat → qo'yish MUMKIN bo'lgan status (ikkalasining minimumi). */
export function proposedStatus(claim: ClaimKind, confidence: number): string {
  const wanted = CLAIM_TO_STATUS[claim];
  // rejected/cancelled darajalanmaydi — ular vakolat bilan cheklanmaydi,
  // chunki ular ILGARILAB ketmaydi: rad etish hech qachon "yutuq" emas.
  if (wanted === "rejected" || wanted === "cancelled") return wanted;
  const ceiling = maxStatusForConfidence(confidence);
  return rankOf(wanted) <= rankOf(ceiling) ? wanted : ceiling;
}

/** Idempotentlik kaliti — mazmun bo'yicha, ya'ni tuzatilgan qator yangi hodisa. */
export function claimIdempotencyKey(c: EvidenceClaim): string {
  const scope = c.provenance.profileId ?? c.provenance.sourceSystem;
  return `${c.provenance.sourceSystem}:${scope}:${c.provenance.rawHash}`;
}
