// lib/reportPermissions.ts
// Amallar matritsasi katagiga KIM qanday qiymat yoza oladi — yagona manba.
//
// Bu fayl ATAYLAB toza TypeScript (prisma/auth import qilmaydi), chunki uni
// ham klient (menyuni filtrlash), ham server action (majburlash) ishlatadi.
// Klientdagi filtr faqat QULAYLIK; haqiqiy chegara serverda — assertCellWrite.
//
// DIQQAT: huquq ROL + AYNAN SHU FIRMADAGI MAS'ULIYAT dan kelib chiqadi.
// Bitta odam bir firmada nazoratchi, boshqasida buxgalter bo'lishi mumkin
// (bazadagi haqiqiy holat) — shuning uchun har bir funksiya `relations` oladi.

import { isAdminRole } from "@/lib/permissions";
import type { CompanyRelation } from "@/lib/access";

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

/** Shu firmadagi mas'uliyatlar. Iterable — Set ham, massiv ham bo'ladi. */
export type Relations = Iterable<CompanyRelation>;

const has = (relations: Relations | undefined, rel: CompanyRelation): boolean => {
  if (!relations) return false;
  for (const r of relations) if (r === rel) return true;
  return false;
};

/** Shu firmada umuman biror mas'uliyati bormi. */
const hasAny = (relations: Relations | undefined): boolean => {
  if (!relations) return false;
  for (const _ of relations) return true;
  return false;
};

/** Lavozimi bo'yicha matritsa ochiq bo'lgan rollar (bank_manager bu ro'yxatda yo'q). */
const MATRIX_EDITOR_ROLES = [
  "super_admin",
  "admin",
  "chief_accountant",
  "supervisor",
  "accountant",
];

/**
 * Matritsani tahrirlay oladimi?
 *
 * Lavozim bo'yicha, YOKI shu firmaga biriktirilgani bo'yicha. Ikkinchisi
 * kerak, chunki bank-klient lavozimidagi odam ham ayrim firmalarda buxgalter
 * bo'lib ishlaydi (Ruslan: 65 firmada bank, 10 tasida buxgalter) — o'sha 10 ta
 * firmada matritsa unga ochiq bo'lishi shart.
 */
export function canEditMatrix(role: string, relations?: Relations): boolean {
  return MATRIX_EDITOR_ROLES.includes(role) || hasAny(relations);
}

/**
 * Shu firmada nazorat huquqi bormi?
 *
 * Huquq LAVOZIMDAN emas, AYNAN SHU FIRMADAGI biriktiruvdan keladi: buxgalter
 * lavozimidagi Zamira 16 ta firmada nazoratchi o'rnida turadi va o'sha yerda
 * tasdiqlashi kerak. `relations` esa server tomonda `Company` qatoridan
 * hisoblanadi (`companyRelations`), ya'ni uni klient soxtalashtira olmaydi.
 *
 * O'Z-O'ZINI NAZORAT BLOKI: nazoratchi/bosh buxgalter o'zi buxgalteriyasini
 * yuritadigan firmada oddiy buxgalter sifatida ishlaydi — u yerda tasdiqlay
 * olmaydi. Aks holda o'z ishini o'zi qabul qilib qo'yardi.
 */
export function isCompanyReviewer(role: string, relations?: Relations): boolean {
  if (isAdminRole(role)) return true;
  if (has(relations, "accountant")) return false;
  return has(relations, "supervisor") || has(relations, "chief_accountant");
}

/**
 * Tasdiqlash (+) — FAQAT shu firmaning nazoratchisi. Buxgalter o'z ishini o'zi
 * tasdiqlay olmaydi: u skrinshot bilan topshiradi, qarorni nazoratchi qabul
 * qiladi (server/proofs.ts → reviewReportProof).
 */
export function canApproveCell(role: string, relations?: Relations): boolean {
  return isCompanyReviewer(role, relations);
}

/**
 * Buxgalter "topshirildi" ni to'g'ridan-to'g'ri yoza olmaydi — u saveReportProof
 * orqali, skrinshot bilan o'tishi shart. Aks holda dalil talabi bir so'rov bilan
 * chetlab o'tilardi.
 */
export function canMarkSubmittedDirectly(role: string, relations?: Relations): boolean {
  return isCompanyReviewer(role, relations);
}

/**
 * Rol uchun katak menyusida ko'rinadigan amallar (tartib saqlanadi).
 */
export function allowedCellActions(role: string, relations?: Relations): CellAction[] {
  if (!canEditMatrix(role, relations)) return [];
  if (isCompanyReviewer(role, relations)) {
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
  /** Yozuvchining AYNAN SHU firmadagi mas'uliyatlari. */
  relations?: Relations;
  /** Yozilayotgan yangi qiymat. */
  nextValue: unknown;
  /** Katakning hozirgi qiymati (bilingan bo'lsa) — ortga qaytarishni bloklash uchun. */
  currentValue?: unknown;
}

/**
 * Yozishga ruxsat bormi? Ruxsat bo'lmasa — sabab matni, bo'lsa — null.
 * Server action shu natijani xatoga aylantiradi.
 */
export function checkCellWrite({
  role,
  relations,
  nextValue,
  currentValue,
}: CellWriteCheck): string | null {
  if (!canEditMatrix(role, relations)) return "Bu amal uchun ruxsat yo'q";
  if (isCompanyReviewer(role, relations)) return null;

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
