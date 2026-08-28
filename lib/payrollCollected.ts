// =====================================================
// DAVR BO'YICHA TUSHUM — oylik hisobining "cash" bazasi
// =====================================================
//
// Manba ATAYLAB `PaymentAllocation`, `Payment.amount` EMAS: generator
// (`lib/paymentGeneration.ts`) `Payment.amount` ga KUTILAYOTGAN summani
// yozib qo'yadi va birinchi to'lovgacha u shartnoma summasiga teng turadi.
// Undan o'qish "hech kim to'lamagan oy" ni "hamma to'lagan oy" ko'rsatardi.
// Taqsimot qatori esa faqat haqiqiy pul kirganda paydo bo'ladi.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PAYROLL_BASIS_DEFAULT,
  isPayrollBasis,
  type PayrollBasis,
} from "@/lib/payrollBasis";

type Db = Prisma.TransactionClient | typeof prisma;

/** companyId → shu davrda tushgan summa (so'm). To'lovsiz firmalar ro'yxatda yo'q. */
export async function getCollectedByCompany(
  period: string,
  db: Db = prisma,
  companyIds?: string[]
): Promise<Record<string, number>> {
  const p = period.slice(0, 7);

  const payments = await db.payment.findMany({
    where: {
      period: p,
      deletedAt: null,
      ...(companyIds && companyIds.length > 0 ? { companyId: { in: companyIds } } : {}),
    },
    select: { companyId: true, allocations: { select: { amount: true } } },
  });

  const out: Record<string, number> = {};
  for (const pay of payments) {
    let sum = 0;
    for (const a of pay.allocations) sum += Number(a.amount ?? 0);
    if (sum !== 0) out[pay.companyId] = (out[pay.companyId] ?? 0) + sum;
  }
  return out;
}

/**
 * Oylik bazasi rejimi. `server/system-settings.ts` dagi o'quvchi admin talab
 * qiladi; oylik esa har bir xodim uchun hisoblanadi, shuning uchun bu yerda
 * darvozasiz, faqat SHU kalit o'qiladi.
 */
export async function readPayrollBasis(db: Db = prisma): Promise<PayrollBasis> {
  const row = await db.systemSetting.findUnique({ where: { key: "payrollBasis" } });
  const v = row?.value;
  if (isPayrollBasis(v)) return v;
  if (v && typeof v === "object" && "basis" in v && isPayrollBasis((v as { basis: unknown }).basis)) {
    return (v as { basis: PayrollBasis }).basis;
  }
  return PAYROLL_BASIS_DEFAULT;
}
