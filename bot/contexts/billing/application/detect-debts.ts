import type { PrismaClient } from "@prisma/client";
import {
  assessDebt,
  DEFAULT_ESCALATION,
  type EscalationConfig,
  type ReminderLevel,
} from "../domain/debt";

export interface CompanyDebt {
  companyId: string;
  companyName: string;
  amountDue: number;
  level: ReminderLevel;
  period: string;
}

/**
 * Find every active company that owes for `period` ("YYYY-MM") and the
 * escalation level it has reached. Reuses the existing `Payment` + `Company`
 * (contractAmount / paymentDay) model — no new debt store. `now` drives the
 * day-of-month and months-past arithmetic.
 */
export async function detectPeriodDebts(
  prisma: PrismaClient,
  period: string,
  now: Date = new Date(),
  cfg: EscalationConfig = DEFAULT_ESCALATION,
): Promise<CompanyDebt[]> {
  const [py, pm] = period.split("-").map(Number);
  const dayOfMonth = now.getDate();
  const monthsPast = (now.getFullYear() - py) * 12 + (now.getMonth() + 1 - pm);

  const companies = await prisma.company.findMany({
    where: { isActive: true, contractAmount: { not: null } },
    select: {
      id: true,
      name: true,
      contractAmount: true,
      paymentDay: true,
      payments: { where: { period, deletedAt: null }, select: { amount: true, status: true } },
    },
  });

  const debts: CompanyDebt[] = [];
  for (const c of companies) {
    const payment = c.payments[0];
    // Faqat haqiqatan kelib tushgan pul (paid/partial) qarzni kamaytiradi —
    // 'pending' qatordagi reja summasi qarzni yashirmasligi kerak.
    const paidAmount =
      payment && (payment.status === "paid" || payment.status === "partial")
        ? Number(payment.amount)
        : 0;
    const res = assessDebt(
      {
        contractAmount: Number(c.contractAmount),
        paidAmount,
        status: payment?.status ?? null,
        paymentDay: c.paymentDay,
        dayOfMonth,
        monthsPast,
      },
      cfg,
    );
    if (res.hasDebt && res.level) {
      debts.push({ companyId: c.id, companyName: c.name, amountDue: res.amountDue, level: res.level, period });
    }
  }
  return debts;
}
