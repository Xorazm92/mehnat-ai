import type { PrismaClient } from "@prisma/client";
import { formatSom } from "../domain/message";
import { notifyUsers } from "../../../../lib/notify";

export interface RedNotificationDebt {
  companyId: string;
  companyName: string;
  period: string;
  amountDue: number;
}

/**
 * Create in-app notifications for a red (final) reminder: the company's
 * responsible accountant plus every active director (super_admin/admin) for the
 * director dashboard. Returns how many were newly created.
 *
 * IDEMPOTENTLIK ENDI DB DARAJASIDA. Bungacha bu yerda `findFirst({userId,
 * link})` → `create` turardi. Ikki muammo: (1) POYGA — ikkita parallel yurish
 * ikkalasi ham "yo'q" deb topib, ikkita xabar yozardi; (2) `Notification.link`
 * indekslanmagan, ya'ni har qabul qiluvchi uchun 65k qatorli jadval to'liq
 * skanerlanardi. Endi `dedupeKey` unikal indeksi ikkalasini ham yopadi.
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
  if (recipients.size === 0) return 0;

  const res = await notifyUsers(prisma, {
    userIds: [...recipients],
    type: "deadline",
    title: `🚨 To'lov muddati o'tdi: ${debt.companyName}`,
    message: `${debt.companyName} — ${debt.period} davri uchun ${formatSom(debt.amountDue)} so'm qarz 7 kundan ortiq to'lanmagan.`,
    link: `/kassa?company=${debt.companyId}&period=${debt.period}`,
    channel: "billing-red",
    // Yetkazish daftari kaliti — firma+davr bo'yicha bir marta.
    dedupKey: `billing:red:${debt.companyId}:${debt.period}`,
    // Ilova ichidagi kalit — har qabul qiluvchi uchun bir marta (poygaga
    // chidamli, chunki @@unique([userId, dedupeKey])).
    dedupeKey: `billing:red:${debt.companyId}:${debt.period}`,
    // Muddati o'tgan to'lov kunlik byudjet ortida turmasin.
    priority: "high",
  });
  return res.inapp;
}
