// =====================================================
// OBLIGATION WORKFLOW — status-transition qoidalari (Faza A)
// =====================================================
// Sof funksiyalar: qaysi o'tish qonuniy, o'tish uchun qanday permission kerak,
// va o'tishda qaysi timing maydonlari yoziladi. server/obligations.ts shu
// qoidalarni qo'llaydi. accepted/cancelled — terminal (orqaga qaytarish faqat
// senior override bilan, alohida). Reviewer #1 (status ≠ timing).
import type { ObligationStatus } from "@prisma/client";

/** Ruxsat etilgan o'tishlar grafi. */
const TRANSITIONS: Record<ObligationStatus, ObligationStatus[]> = {
  planned: ["in_progress", "cancelled"],
  in_progress: ["ready", "cancelled"],
  ready: ["sent", "in_progress", "cancelled"],
  sent: ["accepted", "rejected"],
  rejected: ["ready", "in_progress", "cancelled"], // qayta ishlash
  accepted: [], // terminal
  cancelled: [], // terminal
};

export function canTransition(from: ObligationStatus, to: ObligationStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** O'tish uchun kerak bo'lgan permission (assertCompanyPermission uchun). */
export function permissionForTransition(to: ObligationStatus): string {
  switch (to) {
    case "accepted":
      return "obligation:accept"; // senior/reviewer
    case "rejected":
      return "obligation:reject"; // senior/reviewer
    case "cancelled":
      return "obligation:cancel"; // senior
    default:
      return "obligation:change-status"; // egasi yoki senior (in_progress/ready/sent)
  }
}

/** O'tishda yoziladigan timing maydonlari. */
export function timingPatch(to: ObligationStatus, now: Date): Record<string, Date> {
  switch (to) {
    case "sent":
      return { sentAt: now };
    case "accepted":
      return { acceptedAt: now, completedAt: now };
    case "cancelled":
      return { completedAt: now };
    default:
      return {};
  }
}

/**
 * Bir sahifada ko'rsatiladigan eng ko'p majburiyat.
 *
 * Chegarasiz bo'lganda /deadlines butun jadvalni (8 295 qator) tortib, RSC
 * payload'ini 17 MB ga yetkazardi va brauzer shuncha <tr> ni chizishga majbur
 * bo'lardi. Odam baribir mingtalab qatorni ko'rmaydi — muddati eng yaqinlari
 * kerak. `"use server"` fayl konstanta eksport qila olmagani uchun shu yerda.
 */
export const OBLIGATION_PAGE_SIZE = 300;
