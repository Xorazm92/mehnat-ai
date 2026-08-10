// =====================================================
// QARZDORLIK — YAGONA MANBA
// =====================================================
//
// Auditda "qarzdorlik" so'zi UCH XIL raqamni bildirishi aniqlandi:
//
//   lib/directorReport.ts  contractAmount − joriy oy to'lovi   → 852 mln
//   server/debt.ts         (o'sha formulaning nusxasi)         → 852 mln
//   server/profitability.ts Invoice.amount − paidAmount        → boshqa manba
//   bot/.../domain/debt.ts  contractAmount − paidAmount        → eskalatsiya
//   DebtSnapshot (1C)      jamg'arilgan qarz                   → 902 mln
//
// Keyinchalik `Invoice` va u bilan birga `/profitability` butunlay olib
// tashlandi: hisob-faktura jadvali bitta ham qatorsiz turgan, sahifa esa
// qarzning zaifroq nusxasini ko'rsatardi. Endi shartnoma qarzi shu fayldan,
// 1C qarzi esa `DebtSnapshot` dan keladi — boshqa manba yo'q.
//
// Uchtasi mustaqil implementatsiya edi, ya'ni bittasini tuzatsang qolgani
// eskicha qolardi. Bu fayl SHARTNOMA asosidagi qarzni yagona joyga yig'adi.
//
// ATAYIN BIRLASHTIRILMAGANLAR:
//   * `bot/contexts/billing/domain/debt.ts` `assessDebt` — u eskalatsiya
//     DARAJASINI (yellow/orange/red) hisoblaydi; summa qismi shu yerdagi
//     bilan bir xil, lekin domen sof (DB'siz) bo'lib qolishi kerak.

import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

/** "2026-08" — joriy davr kaliti. */
export const periodKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * To'lov qarzni kamaytiradimi.
 *
 * Faqat HAQIQATAN tushgan pul: "pending" qatordagi reja summasi qarzni
 * yashirmasligi kerak. Bu qoida bot/billing bilan bir xil.
 */
export const isSettledPayment = (status: string | null | undefined): boolean =>
  status === "paid" || status === "partial";

export interface CompanyDebtInput {
  contractAmount: Prisma.Decimal | number | null;
  payments: { amount: Prisma.Decimal | number; status: string }[];
}

/** Bitta firmaning shu davrdagi qarzi. Sof funksiya — testlanadi. */
export function companyDebtOf(input: CompanyDebtInput): number {
  const due = Number(input.contractAmount ?? 0);
  if (due <= 0) return 0;
  const paid = input.payments
    .filter((p) => isSettledPayment(p.status))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  return Math.max(0, due - paid);
}

export interface DebtTotals {
  /** Qarzi bor firmalar soni. */
  companies: number;
  total: number;
  /** Umuman to'lamaganlar (bir tiyin ham tushmagan). */
  red: number;
  /** companyId → qarz summasi. */
  byCompany: Map<string, number>;
}

export interface DebtScopeOptions {
  /** Faqat shu firmalar. `null`/berilmasa — hammasi (admin). */
  companyIds?: string[] | null;
}

/**
 * Shartnoma asosidagi qarzdorlik.
 *
 * @param period "2026-08". Berilmasa joriy oy.
 *
 * DIQQAT — bu JORIY OY qarzi. 1C esa jamg'arilgan qarzni beradi (o'tgan
 * oylardan qolgani bilan), shuning uchun ikkalasi TENG BO'LMAYDI va ularni
 * yonma-yon ko'rsatish kerak, birini ikkinchisi bilan almashtirmaslik.
 */
export async function computeContractDebt(
  db: Db,
  period?: string,
  options: DebtScopeOptions = {}
): Promise<DebtTotals> {
  const key = period ?? periodKeyOf(new Date());
  const { companyIds } = options;

  const companies = await db.company.findMany({
    where: {
      isActive: true,
      isOwnFirm: false,
      contractAmount: { not: null },
      ...(companyIds ? { id: { in: companyIds } } : {}),
    },
    select: {
      id: true,
      contractAmount: true,
      payments: { where: { period: key, deletedAt: null }, select: { amount: true, status: true } },
    },
  });

  const byCompany = new Map<string, number>();
  let total = 0;
  let red = 0;

  for (const c of companies) {
    const debt = companyDebtOf(c);
    if (debt <= 0) continue;
    byCompany.set(c.id, debt);
    total += debt;
    const paidAnything = c.payments.some((p) => isSettledPayment(p.status) && Number(p.amount) > 0);
    if (!paidAnything) red++;
  }

  return { companies: byCompany.size, total, red, byCompany };
}
