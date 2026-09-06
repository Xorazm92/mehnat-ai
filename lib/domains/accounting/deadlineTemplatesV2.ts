// =====================================================
// SHABLON TO'PLAMI v2 — REJA (P4A)
// =====================================================
// M2 ning texnik qismini yopadigan beshta shablon. Ta'riflar shu yerda,
// yozish esa `scripts/seed-deadline-templates-v2.ts` da — shunda REJA
// bazasiz sinaladi ("nima qilinadi?"), yozish esa alohida qadam bo'ladi.
//
// UCHTASI ALLAQACHON BAZADA. `MOL_MULK_SOLIQ`, `YER_SOLIQ`, `SUV_SOLIQ`
// draft holida yozilgan (yillik, 25-kun). Ularni `MULK`/`YER`/`SUV` degan
// YANGI kod bilan yaratish bir soliq uchun ikkita shablon, ikkita muddat va
// ikkita KPI yozuvi degani bo'lardi — shuning uchun mavjudlari FAOLLASHADI.
//
// IKKITASI YANGI: `STAT_BUXGALT`, `MEHNAT_SHARTNOMA_ROYXAT`.
//
// ⚠️ YANGILARI `draft` BO'LIB YARATILADI — sabab o'lchangan.
//
// Ularning applicability qoidasi bo'sh, ya'ni UNIVERSAL: `templateApplies`
// bo'sh mezonda `true` qaytaradi. Darhol `active` qilinsa generator ularni
// 259 ta firmaning HAMMASIGA yozadi — choraklik uchun yiliga 4 × 259 = 1 036,
// yillik uchun 259 ta majburiyat. Ular hali tasdiqlanmagan taxmin
// (docs/plan/deadline-templates-v2.md §4), ya'ni bu 1 295 ta soxta muddat,
// eskalatsiya va KPI yozuvi bo'lardi.
//
// `lifecycle` darvozasi aynan shuning uchun bor: sxema izohi "Admin darhol
// productionga chiqara olmaydi" deydi. Intervyudan keyin ular `active` ga
// o'tkaziladi — bir qatorlik o'zgarish (`lifecycle: "active"`), yoki
// skriptga `--activate-new` bayrog'i bilan.
//
// Mavjud uchtasi esa `service_key` bilan darvozalangan, ya'ni faoliyatga
// o'tkazilsa ham faqat kaliti bor firmalarga tushadi (bugun — 1 ta).
import type { Periodicity, DeadlineAnchorType } from "@prisma/client";
import { presetFor } from "@/lib/domains/accounting/normativePresets";

/** Draftdan faoliyatga o'tkaziladigan mavjud shablonlar. */
export const V2_ACTIVATE_CODES = ["MOL_MULK_SOLIQ", "YER_SOLIQ", "SUV_SOLIQ"] as const;

export interface TemplateSeedDef {
  code: string;
  name: string;
  obligationType: string;
  periodicity: Periodicity;
  anchorType: DeadlineAnchorType;
  dueDay: number | null;
  dueMonth: number | null;
  /** Boshlang'ich holat — yangi shablon uchun `draft` (yuqoridagi izoh). */
  lifecycle: "draft" | "active";
}

export const V2_NEW_TEMPLATES: TemplateSeedDef[] = [
  {
    code: "STAT_BUXGALT",
    name: "Statistika hisoboti — buxgalter",
    obligationType: "statistics",
    periodicity: "quarterly",
    // `dueMonth: null` ⇒ `rawDueDate` davrdan KEYINGI oyni oladi, ya'ni
    // chorak yopilgach 25-kun (Q1 → 25-aprel). Chorak uchun to'g'ri shakl.
    anchorType: "fixed_day_of_month",
    dueDay: 25,
    dueMonth: null,
    lifecycle: "draft",
  },
  {
    code: "MEHNAT_SHARTNOMA_ROYXAT",
    name: "Mehnat shartnomalari ro'yxati",
    obligationType: "internal_task",
    // YILLIK RO'YXAT, "bir martalik shartnoma" EMAS. `Periodicity` da
    // `one_time` yo'q va bo'lishi ham kerak emas: bir martalik ish —
    // `Task`, takrorlanuvchi muddat emas. Bu shablon esa har yil
    // yangilanadigan RO'YXATNI topshirishni nazarda tutadi.
    periodicity: "annual",
    anchorType: "fixed_day_of_month",
    dueDay: 31,
    dueMonth: 1,
    lifecycle: "draft",
  },
];

/** Normativ P1 jadvalidan keladi — bu yerda ikkinchi raqam yozilmaydi. */
export const normativeFor = (code: string): number => presetFor(code);

// ── Reja ────────────────────────────────────────────────────────────────

export interface ExistingTemplate {
  code: string;
  lifecycle: string;
  active: boolean;
}

export type SeedAction =
  | { kind: "activate"; code: string; from: string }
  | { kind: "already_active"; code: string }
  | { kind: "activate_missing"; code: string }
  | { kind: "create"; code: string; lifecycle: string; normativeMinutes: number }
  | { kind: "exists"; code: string };

/**
 * Bazaning joriy holatidan REJA quradi — hech narsa yozmaydi.
 *
 * Sof funksiya: skript ham, test ham shundan foydalanadi, ya'ni "skript nima
 * qiladi?" degan savolga bazaga tegmasdan javob berish mumkin.
 */
export function planTemplateSeed(existing: ExistingTemplate[]): SeedAction[] {
  const byCode = new Map(existing.map((e) => [e.code, e]));
  const out: SeedAction[] = [];

  for (const code of V2_ACTIVATE_CODES) {
    const row = byCode.get(code);
    if (!row) {
      // Kutilgan shablon yo'q — bu OGOHLANTIRISH, jimgina yaratish emas:
      // kod o'zgargan yoki baza boshqa holatda bo'lishi mumkin.
      out.push({ kind: "activate_missing", code });
    } else if (row.lifecycle === "active" && row.active) {
      out.push({ kind: "already_active", code });
    } else {
      out.push({ kind: "activate", code, from: row.lifecycle });
    }
  }

  for (const def of V2_NEW_TEMPLATES) {
    if (byCode.has(def.code)) {
      out.push({ kind: "exists", code: def.code });
    } else {
      out.push({
        kind: "create",
        code: def.code,
        lifecycle: def.lifecycle,
        normativeMinutes: normativeFor(def.code),
      });
    }
  }

  return out;
}
