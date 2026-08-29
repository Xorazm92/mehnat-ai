// =====================================================
// FOYDALANUVCHINING HAQIQIY BIRIKTIRUVLARI
// =====================================================
// "Bu odam qaysi VAZIFALARDA ishlaydi" — lavozimidan qat'i nazar. Sahifa
// darvozasi (`effectiveViewsForRole`) shu ro'yxatni oladi.
//
// Nega sessiyada saqlanadi: darvoza `proxy.ts` da, ya'ni HAR SO'ROVDA
// ishlaydi. U yerda baza so'rovi qilish har bir sahifa yuklanishiga qo'shimcha
// yuk bo'lardi. Shuning uchun ro'yxat kirish paytida hisoblanadi va sessiya
// qayta tekshiruvining o'sha 5 daqiqalik oralig'ida yangilanadi
// (lib/sessionRevalidation.ts) — biriktiruv o'zgarsa 5 daqiqada kuchga kiradi.

import { prisma } from "@/lib/prisma";
import { normalizeAssignmentRole, type CompanyRelation } from "@/lib/platform/permissions";

/** `contractAssignment.role` (kanonik) → mas'uliyat turi. */
const ASSIGNMENT_TO_RELATION: Record<string, CompanyRelation> = {
  accountant: "accountant",
  chief_accountant: "chief_accountant",
  controller: "supervisor",
  bank_manager: "bank_manager",
};

/**
 * Foydalanuvchi FAOL firmalarda egallagan mas'uliyatlar to'plami.
 *
 * Ikki manbadan: firma qatoridagi slotlar (accountantId va h.k.) va Jamoa
 * yorlig'idagi biriktiruvlar. Ikkinchisining `role` ustunida bazada imlo bir
 * xil emas (`supervisor`/`controller`, `chief`/`chief_accountant`), shuning
 * uchun `normalizeAssignmentRole` orqali o'tkaziladi.
 *
 * Xato bo'lsa BO'SH ro'yxat qaytadi — bu darvozani kengaytirmaydi, ya'ni baza
 * nosozligi hech kimga ortiqcha ruxsat bermaydi.
 */
export async function getUserCompanyRelations(userId: string): Promise<CompanyRelation[]> {
  if (!userId) return [];
  try {
    const [slots, assignments] = await Promise.all([
      prisma.company.findMany({
        where: {
          isActive: true,
          OR: [
            { accountantId: userId },
            { supervisorId: userId },
            { chiefAccountantId: userId },
            { bankClientId: userId },
            { departmentRef: { chiefAccountantId: userId } },
          ],
        },
        select: {
          accountantId: true,
          supervisorId: true,
          chiefAccountantId: true,
          bankClientId: true,
          departmentRef: { select: { chiefAccountantId: true } },
        },
      }),
      prisma.contractAssignment.findMany({
        where: { userId, isActive: true, company: { isActive: true } },
        select: { role: true },
        distinct: ["role"],
      }),
    ]);

    const rels = new Set<CompanyRelation>();
    for (const c of slots) {
      if (c.accountantId === userId) rels.add("accountant");
      if (c.supervisorId === userId) rels.add("supervisor");
      if (c.chiefAccountantId === userId || c.departmentRef?.chiefAccountantId === userId) {
        rels.add("chief_accountant");
      }
      if (c.bankClientId === userId) rels.add("bank_manager");
    }
    for (const a of assignments) {
      const canonical = normalizeAssignmentRole(a.role);
      const rel = canonical ? ASSIGNMENT_TO_RELATION[canonical] : null;
      if (rel) rels.add(rel);
    }
    return [...rels];
  } catch {
    return [];
  }
}

/** Tokendagi noma'lum qiymatni ishonchli `CompanyRelation[]` ga keltiradi. */
export function parseRelations(raw: unknown): CompanyRelation[] {
  if (!Array.isArray(raw)) return [];
  const valid: CompanyRelation[] = ["accountant", "supervisor", "chief_accountant", "bank_manager"];
  return valid.filter((v) => raw.includes(v));
}
