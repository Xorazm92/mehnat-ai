// lib/reportPermissions.ts
// Amallar matritsasi katagiga KIM qanday qiymat yoza oladi — yagona manba.
//
// Bu fayl ATAYLAB toza TypeScript (prisma/auth import qilmaydi), chunki uni
// ham klient (menyuni filtrlash), ham server action (majburlash) ishlatadi.
// Klientdagi filtr faqat QULAYLIK; haqiqiy chegara serverda — assertCellWrite.

import { isSeniorRole } from "@/lib/permissions";

/** Katakning maxsus (matn bo'lmagan) qiymatlari. */
export const CELL_APPROVED = "+";
export const CELL_SUBMITTED = "topshirildi";
export const CELL_FAILED = "-";
export const CELL_KARTOTEKA = "kartoteka";
export const CELL_EMPTY = "0";

export type CellAction =
  | typeof CELL_APPROVED
  | typeof CELL_SUBMITTED
  | typeof CELL_FAILED
  | typeof CELL_KARTOTEKA
  | typeof CELL_EMPTY
  | "izoh";

/** Matritsani umuman tahrirlay oladigan rollar (bank_manager — faqat o'qish). */
const MATRIX_EDITOR_ROLES = [
  "super_admin",
  "admin",
  "chief_accountant",
  "supervisor",
  "accountant",
];

export function canEditMatrix(role: string): boolean {
  return MATRIX_EDITOR_ROLES.includes(role);
}

/**
 * Tasdiqlash (+) — FAQAT nazoratchi rollari. Buxgalter o'z ishini o'zi
 * tasdiqlay olmaydi: u skrinshot bilan topshiradi, qarorni nazoratchi qabul
 * qiladi (server/proofs.ts → reviewReportProof).
 */
export function canApproveCell(role: string): boolean {
  return isSeniorRole(role);
}

/**
 * Buxgalter "topshirildi" ni to'g'ridan-to'g'ri yoza olmaydi — u saveReportProof
 * orqali, skrinshot bilan o'tishi shart. Aks holda dalil talabi bir so'rov bilan
 * chetlab o'tilardi.
 */
export function canMarkSubmittedDirectly(role: string): boolean {
  return isSeniorRole(role);
}

/**
 * Rol uchun katak menyusida ko'rinadigan amallar (tartib saqlanadi).
 */
export function allowedCellActions(role: string): CellAction[] {
  if (!canEditMatrix(role)) return [];
  if (isSeniorRole(role)) {
    return [CELL_APPROVED, CELL_SUBMITTED, CELL_FAILED, CELL_KARTOTEKA, "izoh", CELL_EMPTY];
  }
  // Buxgalter: tasdiqlash yo'q. "Topshirish" menyuda bor, lekin u qiymat
  // yozmaydi — skrinshot oynasini ochadi (UI da onRequestSubmit).
  return [CELL_SUBMITTED, CELL_FAILED, CELL_KARTOTEKA, "izoh", CELL_EMPTY];
}

/** Qiymat "nazoratchi qo'ygan" holatmi — buxgalter uni buza olmaydi. */
export function isReviewerOwnedValue(value: unknown): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === CELL_APPROVED || v === CELL_SUBMITTED || v === "accepted" || v === "submitted";
}

export interface CellWriteCheck {
  role: string;
  /** Yozilayotgan yangi qiymat. */
  nextValue: unknown;
  /** Katakning hozirgi qiymati (bilingan bo'lsa) — ortga qaytarishni bloklash uchun. */
  currentValue?: unknown;
}

/**
 * Yozishga ruxsat bormi? Ruxsat bo'lmasa — sabab matni, bo'lsa — null.
 * Server action shu natijani xatoga aylantiradi.
 */
export function checkCellWrite({ role, nextValue, currentValue }: CellWriteCheck): string | null {
  if (!canEditMatrix(role)) return "Bu amal uchun ruxsat yo'q";
  if (isSeniorRole(role)) return null;

  const next = String(nextValue ?? "").trim().toLowerCase();

  if (next === CELL_APPROVED || next === "accepted") {
    return "Hisobotni tasdiqlash faqat nazoratchi huquqida. Skrinshot bilan topshiring.";
  }

  if (next === CELL_SUBMITTED || next === "submitted") {
    return "Topshirish uchun skrinshot yuklash shart (katak → Topshirish).";
  }

  // Nazoratchi tasdiqlagan yoki tekshiruvda turgan katakni buxgalter
  // o'zgartira/tozalay olmaydi — aks holda tasdiqni o'chirib yuborardi.
  if (currentValue !== undefined && isReviewerOwnedValue(currentValue)) {
    return "Tasdiqlangan yoki tekshiruvdagi katakni o'zgartirib bo'lmaydi.";
  }

  return null;
}
