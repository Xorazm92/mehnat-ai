import type { PrismaClient } from "@prisma/client";
import { formatSom } from "../domain/message";

export interface RedNotificationDebt {
  companyId: string;
  companyName: string;
  period: string;
  amountDue: number;
}

/**
 * Create in-app notifications for a red (final) reminder: the company's
 * responsible accountant plus every active director (super_admin/admin) for the
 * director dashboard. Idempotent — keyed on (userId, link) where link encodes
 * company+period — so a re-run never duplicates a notification. Returns how many
 * were newly created.
 */
export async function createRedNotifications(
  prisma: PrismaClient,
  debt: RedNotificationDebt,
): Promise<number> {
  const [company, directors] = await Promise.all([
    prisma.company.findUnique({
      where: { id: debt.companyId },
      select: { accountantId: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["super_admin", "admin"] }, isActive: true },
      select: { id: true },
    }),
  ]);

  const recipients = new Set<string>();
  if (company?.accountantId) recipients.add(company.accountantId);
  for (const d of directors) recipients.add(d.id);

  const link = `/kassa?company=${debt.companyId}&period=${debt.period}`;
  const title = `🚨 To'lov muddati o'tdi: ${debt.companyName}`;
  const message = `${debt.companyName} — ${debt.period} davri uchun ${formatSom(debt.amountDue)} so'm qarz 7 kundan ortiq to'lanmagan.`;

  let created = 0;
  for (const userId of recipients) {
    // Idempotency guard: one billing notification per user per company+period.
    const existing = await prisma.notification.findFirst({
      where: { userId, link },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.notification.create({
      data: { userId, type: "deadline", title, message, link },
    });
    created++;
  }
  return created;
}
