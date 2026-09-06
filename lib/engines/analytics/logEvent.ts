// =====================================================
// FOYDALANISH HODISASI — yozuvchi (M4.2)
// =====================================================
// Bu qatlam `auth()` CHAQIRMAYDI: aktyor argument sifatida keladi. Sabab
// `lib/domains/accounting/twinCompute.ts` dagi bilan bir xil — o'lchov
// kelajakda navbat ishchisidan ham yozilishi mumkin va u yerda sessiya yo'q.
// Kirish tekshiruvi chaqiruvchi `server/analytics.ts` da.
//
// HODISA YOZUVI ASOSIY ISHNI HECH QACHON YIQITMAYDI. Foydalanish o'lchovi —
// yordamchi ma'lumot; u tufayli ekran ochilmay qolsa, biz o'lchayotgan
// narsani o'zimiz buzgan bo'lardik. Shuning uchun xato yutiladi va faqat
// logga chiqadi (`lib/platform/auditTrail.ts` dagi bilan bir xil qoida).
import type { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/platform/logger";

type Db = Prisma.TransactionClient;

/**
 * O'lchanadigan hodisalar. Ustun erkin satr (yangi o'lchov migratsiya talab
 * qilmasin), lekin BUGUN yoziladiganlari shu yerda sanaladi — nomi terilishida
 * xato ketsa, hisobot jimgina nolga aylanardi.
 */
export const ANALYTICS_KINDS = {
  cockpitVisit: "cockpit_visit",
  directorCockpitVisit: "director_cockpit_visit",
} as const;

export type AnalyticsKind = (typeof ANALYTICS_KINDS)[keyof typeof ANALYTICS_KINDS];

export interface LogEventInput {
  kind: string;
  /**
   * Kim. `id: null` — ODAM EMAS, cron/worker qarori (masalan javobsiz
   * tavsiyaning muddati o'tishi). `AnalyticsEvent.actorId` allaqachon
   * nullable; `role` esa har doim to'ldiriladi ("system"), aks holda
   * hodisani rol kesimida sanab bo'lmasdi.
   */
  actor: { id: string | null; role: string };
  metadata?: Prisma.InputJsonValue;
}

/** Foydalanish hodisasini yozadi. Xato yutiladi — chaqiruvchi buzilmaydi. */
export async function logEvent(db: Db, input: LogEventInput): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: {
        kind: input.kind,
        actorId: input.actor.id,
        // Rol SNAPSHOT: xodim keyin boshqa rolga o'tsa ham, o'sha paytda kim
        // sifatida kirgani saqlanadi.
        actorRole: input.actor.role,
        metadata: input.metadata,
      },
    });
  } catch (e) {
    logServerError("analytics.logEvent", e, { kind: input.kind });
  }
}
