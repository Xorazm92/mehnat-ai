// =====================================================
// MATRITSA KATAGI → MAJBURIYAT
// =====================================================
// DOMEN qatlami: matritsa lug'ati (`+`, `topshirildi`, `kartoteka`) — sof
// buxgalteriya atamalari, shuning uchun bu fayl `lib/engines/` da EMAS.
//
// `lib/obligationBridge.ts` ning o'rnini bosadi. Undagi to'rtta nuqson:
//
//   1. `COL_KEY_TO_TEMPLATE_CODE` — qo'lda yozilgan xarita. 15 yozuvdan
//      uchtasi hech qanday matritsa ustuniga mos kelmasdi (`qqs`,
//      `aylanma_soliq`, `payroll_posted`), ya'ni ular hech qachon ishlamagan.
//      Endi xarita emas — `DeadlineTemplate.matrixKey` bo'yicha SO'ROV.
//   2. Davr kaliti HAR DOIM oylik qurilardi (`toObligationMonthKey`), shuning
//      uchun yillik template (`FOYDA_YILLIK` → `"2026-Y"`) hech qachon
//      topilmasdi. Endi oyna TEMPLATE davriyligidan hisoblanadi.
//   3. Har xatoda jimgina `return` — ko'prik oylar davomida deyarli hech narsa
//      qilmadi va buni hech kim sezmadi. Endi natija QAYTARILADI, chaqiruvchi
//      uni loglaydi yoki sanaydi.
//   4. `findFirst(periodKey)` — kompozit unique bo'la turib.
//
// Qarang: ADR-0009.
import { Prisma, type ObligationStatus } from "@prisma/client";
import { periodWindowFor } from "@/lib/engines/obligation/deadlines";
import { timingPatch } from "@/lib/engines/workflow/obligationWorkflow";
import { toYearMonthKey } from "@/lib/periods";
import {
  CELL_APPROVED,
  CELL_SUBMITTED,
  CELL_FAILED,
  CELL_KARTOTEKA,
  CELL_EMPTY,
} from "@/lib/reportPermissions";

type Db = Prisma.TransactionClient;

/** Katak qiymati majburiyat holatiga qanday tarjima qilinadi. */
export interface CellMeaning {
  status: ObligationStatus | null;
  /** `kartoteka` — kechikish sababi belgilanadi, LEKIN tasdiqlanmaydi. */
  markDelay?: boolean;
  /** Vaqt maydonlari tozalanadimi (katak bo'shatilganda). */
  clearTiming?: boolean;
}

export function meaningOf(value: string): CellMeaning {
  switch (value) {
    case CELL_APPROVED:
      return { status: "accepted" };
    case CELL_SUBMITTED:
      return { status: "sent" };
    case CELL_FAILED:
      return { status: "rejected" };
    case CELL_KARTOTEKA:
      // Ish to'xtagan va javob mijozda. Sabab TASDIQLANMAGAN holda yoziladi —
      // senior tasdiqlamaguncha u KPI'dan chiqarmaydi (ADR-0005).
      return { status: "in_progress", markDelay: true };
    case CELL_EMPTY:
    case "":
      return { status: "planned", clearTiming: true };
    default:
      // Erkin matn — izoh. Holat tegilmaydi.
      return { status: null };
  }
}

export type MatrixWriteOutcome =
  | { ok: true; obligationId: string; from: ObligationStatus; to: ObligationStatus }
  | { ok: true; skipped: "comment_only" }
  | { ok: false; reason: "no_template" | "no_obligation" | "bad_period"; detail: string };

export interface CellWrite {
  companyId: string;
  /** `"2026-07"` | `"2026-07-01"` | `"2026 Iyul"` — normalizatsiya ichkarida. */
  period: string;
  matrixKey: string;
  value: string;
  /** Kim yozdi — `ObligationStatusEvent.byUserId`. */
  userId?: string | null;
}

export interface StatusWrite {
  companyId: string;
  period: string;
  matrixKey: string;
  status: ObligationStatus;
  userId?: string | null;
  /** `kartoteka` semantikasi — tasdiqlanmagan kechikish sababi yoziladi. */
  markDelay?: boolean;
  /** Katak bo'shatilganda vaqt maydonlari tozalanadi. */
  clearTiming?: boolean;
  /** `ObligationStatusEvent.note` uchun manba belgisi. */
  note?: string;
}

function refDateFor(period: string): Date | null {
  const ym = toYearMonthKey(period);
  if (!ym) return null;
  const [y, m] = ym.split("-");
  // Oy o'rtasi: oyna hisoblashda chegara kunlari (1 yoki 31) noaniqlik bermasin.
  return new Date(Date.UTC(Number(y), Number(m) - 1, 15));
}

/**
 * Bitta katak yozuvini majburiyatga qo'llaydi.
 *
 * ATAYLAB tashlamaydi: matritsaga yozish foydalanuvchining asosiy ishi va u
 * majburiyat qatori yo'qligi uchun to'xtamasligi kerak. Lekin JIM ham emas —
 * natija qaytariladi, chaqiruvchi uni `SyncError` ga yozadi yoki sanaydi.
 */
export async function applyCellWrite(db: Db, w: CellWrite): Promise<MatrixWriteOutcome> {
  const meaning = meaningOf(w.value);
  if (meaning.status === null) return { ok: true, skipped: "comment_only" };
  return applyObligationStatus(db, {
    companyId: w.companyId,
    period: w.period,
    matrixKey: w.matrixKey,
    status: meaning.status,
    markDelay: meaning.markDelay,
    clearTiming: meaning.clearTiming,
    userId: w.userId,
    note: `matrix:${w.matrixKey}`,
  });
}

/**
 * Holatni to'g'ridan-to'g'ri qo'llaydi.
 *
 * `server/proofs.ts` katak qiymatini emas, MAQSAD holatini biladi (dalil
 * yuborildi → `sent`, tasdiqlandi → `accepted`), shuning uchun unga qiymatni
 * teskari xaritalash kerak emas.
 */
export async function applyObligationStatus(db: Db, w: StatusWrite): Promise<MatrixWriteOutcome> {
  const ref = refDateFor(w.period);
  if (!ref) return { ok: false, reason: "bad_period", detail: w.period };

  // Xarita emas, so'rov: `matrixKey` sxemada, ya'ni yangi ustun qo'shish kod
  // o'zgartirmaydi (Konstitutsiya, Modda 8).
  const templates = await db.deadlineTemplate.findMany({
    where: {
      matrixKey: w.matrixKey,
      active: true,
      lifecycle: "active",
      effectiveFrom: { lte: ref },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: ref } }],
    },
    select: { id: true, periodicity: true },
  });
  if (templates.length === 0) {
    return { ok: false, reason: "no_template", detail: w.matrixKey };
  }
  const meaning = { status: w.status, markDelay: w.markDelay, clearTiming: w.clearTiming };

  // Bir ustunga bir nechta template tushishi mumkin (QQS_DECL / AYLANMA_SOLIQ
  // — soliq rejimiga qarab). Firma uchun qaysi biri amal qilishini generator
  // allaqachon hal qilgan: majburiyat qatori qaysi template bilan yaratilgan
  // bo'lsa, o'sha. Shuning uchun taxmin qilmaymiz — MAVJUD majburiyatni
  // qidiramiz.
  for (const t of templates) {
    const window = periodWindowFor(t.periodicity, ref);
    const obligation = await db.obligation.findUnique({
      where: {
        companyId_templateId_periodStart_periodEnd: {
          companyId: w.companyId,
          templateId: t.id,
          periodStart: window.periodStart,
          periodEnd: window.periodEnd,
        },
      },
      select: { id: true, status: true },
    });
    if (!obligation) continue;

    const from = obligation.status as ObligationStatus;
    const to = meaning.status;
    if (from === to) return { ok: true, obligationId: obligation.id, from, to };

    const now = new Date();
    await db.obligation.update({
      where: { id: obligation.id },
      data: {
        status: to,
        ...timingPatch(to, now),
        ...(meaning.clearTiming ? { sentAt: null, acceptedAt: null, completedAt: null } : {}),
        ...(meaning.markDelay
          ? { delayReason: "client_delay", delayComment: CELL_KARTOTEKA, delayMarkedById: w.userId ?? null, delayMarkedAt: now }
          : {}),
      },
    });
    await db.obligationStatusEvent.create({
      data: {
        obligationId: obligation.id,
        fromStatus: from,
        toStatus: to,
        byUserId: w.userId ?? null,
        note: w.note ?? `matrix:${w.matrixKey}`,
      },
    });
    return { ok: true, obligationId: obligation.id, from, to };
  }

  return { ok: false, reason: "no_obligation", detail: `${w.matrixKey}@${w.period}` };
}
