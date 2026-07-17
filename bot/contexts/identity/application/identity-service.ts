import type { PrismaClient } from "@prisma/client";

export interface ResolvedUser {
  id: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

/** Resolve a Telegram numeric id to a mehnat-ai user, or null if unlinked. */
export async function resolveUserByTelegramId(
  prisma: PrismaClient,
  telegramUserId: bigint,
): Promise<ResolvedUser | null> {
  return prisma.user.findUnique({
    where: { telegramUserId },
    select: { id: true, fullName: true, role: true, isActive: true },
  });
}

/** Just the mehnat-ai user id for a Telegram id (used to enrich captured messages). */
export async function resolveUserIdByTelegramId(
  prisma: PrismaClient,
  telegramUserId: bigint,
): Promise<string | null> {
  const user = await resolveUserByTelegramId(prisma, telegramUserId);
  return user?.id ?? null;
}

/** Resolve a Telegram chat id to a bound company id, or null if unbound/inactive. */
export async function resolveCompanyIdByChatId(
  prisma: PrismaClient,
  chatId: bigint,
): Promise<string | null> {
  const group = await prisma.telegramGroup.findUnique({
    where: { chatId },
    select: { companyId: true, isActive: true },
  });
  return group?.isActive ? group.companyId : null;
}
