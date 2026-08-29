// lib/terms.ts
// =====================================================
// COMPANY SERVICE TERM — versiyalangan shartnoma summasi + split
// (bank / plastik / naqd / offset)
// =====================================================
// Yagona yo'l: CompanyServiceTerm ga to'g'ridan-to'g'ri `create`/`update`
// chaqirilmaydi, faqat shu fayl orqali. Sabab — ikkita invariant DB
// darajasida (CHECK + EXCLUDE) qo'riqlanadi, lekin ularni "avval eskisini
// yop, keyin yangisini och" tartibida to'g'ri yozish ilova qatlamining ishi:
// noto'g'ri tartib EXCLUDE constraint'ga (23P01) urilib, foydalanuvchiga
// tushunarsiz Postgres xatosi ko'rinardi.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/tx";
import { recordAuditLog } from "@/lib/platform/auditTrail";

type Db = Prisma.TransactionClient | typeof prisma;

export interface ServiceTermInput {
  companyId: string;
  totalAmount: number;
  bankAmount: number;
  plastikAmount?: number;
  naqdAmount?: number;
  offsetAmount: number;
  /** Amal qilish boshlanadigan oy — kun qismi tashlanadi (oy boshiga yumaloqlanadi). */
  effectiveFrom: Date;
  reason?: string;
  createdById?: string;
}

/** Sanani UTC oy boshiga yumaloqlaydi — versiyalar doim oy chegarasida almashadi. */
export function roundToMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function isExclusionViolation(e: unknown): boolean {
  const err = e as { code?: string; meta?: { code?: string } };
  return err?.code === "23P01" || err?.meta?.code === "23P01";
}

/**
 * `at` sanada amalda bo'lgan versiyani qaytaradi (yoki topilmasa `null`).
 * Har doim shu funksiya orqali o'qiladi — `Company.contractAmount` FAQAT
 * kesh, tarixiy hisob-kitob uchun ishlatilmaydi.
 */
export async function resolveServiceTerm(companyId: string, at: Date, db: Db = prisma) {
  return db.companyServiceTerm.findFirst({
    where: {
      companyId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

/**
 * Yangi versiya yaratadi: eski OCHIQ versiyani (effectiveTo=null) yopadi,
 * yangisini ochadi, `Company.contractAmount` keshini yangilaydi — bitta
 * Serializable tranzaksiyada. Parallel ikki chaqiruv (ikki admin bir vaqtda
 * narx o'zgartirsa) biridan keyin biri avtomatik qayta uriniladi
 * (`lib/tx.ts#serializable`), shuning uchun "eski qatorni topdim, lekin
 * boshqasi allaqachon yopib ulgurgan" holati yuzaga kelmaydi.
 */
export async function createServiceTerm(input: ServiceTermInput) {
  const total = round2(input.totalAmount);
  const bank = round2(input.bankAmount);
  const plastik = round2(input.plastikAmount ?? 0);
  const naqd = round2(input.naqdAmount ?? 0);
  const offset = round2(input.offsetAmount);
  if (round2(bank + plastik + naqd + offset) !== total) {
    throw new Error("Bank + Plastik + Naqd + Offset summasi umumiy summaga teng bo'lishi kerak");
  }
  if (total < 0 || bank < 0 || plastik < 0 || naqd < 0 || offset < 0) {
    throw new Error("Summalar manfiy bo'lolmaydi");
  }
  const effectiveFrom = roundToMonthStart(input.effectiveFrom);

  try {
    return await serializable(async (tx) => {
      const open = await tx.companyServiceTerm.findFirst({
        where: { companyId: input.companyId, effectiveTo: null },
        orderBy: { effectiveFrom: "desc" },
      });
      if (open && open.effectiveFrom.getTime() >= effectiveFrom.getTime()) {
        throw new Error(
          `Yangi versiya oldingi versiyadan (${open.effectiveFrom.toISOString().slice(0, 10)}) keyin bo'lishi kerak`
        );
      }

      if (open) {
        await tx.companyServiceTerm.update({
          where: { id: open.id },
          data: { effectiveTo: effectiveFrom },
        });
      }

      const created = await tx.companyServiceTerm.create({
        data: {
          companyId: input.companyId,
          totalAmount: total,
          bankAmount: bank,
          plastikAmount: plastik,
          naqdAmount: naqd,
          offsetAmount: offset,
          effectiveFrom,
          reason: input.reason,
          createdById: input.createdById,
        },
      });

      // Kesh — UI joriy summani Term'ga murojaat qilmasdan tez o'qishi uchun.
      await tx.company.update({
        where: { id: input.companyId },
        data: { contractAmount: total },
      });

      await recordAuditLog({
        userId: input.createdById ?? null,
        action: "create",
        tableName: "CompanyServiceTerm",
        recordId: created.id,
        newData: {
          totalAmount: total,
          bankAmount: bank,
          plastikAmount: plastik,
          naqdAmount: naqd,
          offsetAmount: offset,
          effectiveFrom: effectiveFrom.toISOString(),
        },
      });

      return created;
    });
  } catch (e) {
    if (isExclusionViolation(e)) {
      // Backstop: yuqoridagi mantiq to'g'ri ishlagan bo'lsa bu yerga
      // yetib kelmasligi kerak — yetib kelsa demak biror joyda term
      // to'g'ridan-to'g'ri (shu fayldan chetlab) yozilgan.
      throw new Error("Bu davr uchun versiya ziddiyati aniqlandi — sahifani yangilab qayta urinib ko'ring");
    }
    throw e;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
