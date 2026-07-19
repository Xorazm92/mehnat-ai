import type { PrismaClient } from "@prisma/client";

export interface LinkUserInput {
  /** Telegram numeric id to bind. */
  telegramUserId: bigint;
  telegramUsername?: string | null;
  /** Email or PINFL of the mehnat-ai employee to link to. */
  identifier: string;
  /** mehnat-ai user id of the admin performing the link (null for the env bootstrap admin). */
  byUserId?: string | null;
  /**
   * Self-service safety (used by /link_me): refuse if the target employee is
   * already linked to a *different* Telegram account, so nobody can hijack a
   * colleague's record by knowing their email/PINFL. Admin /link (by reply)
   * leaves this off and may re-assign.
   */
  requireUnlinkedTarget?: boolean;
}

export interface LinkUserResult {
  ok: boolean;
  message: string;
  userId?: string;
}

/**
 * Bind a Telegram account to a mehnat-ai employee (found by email or PINFL) and
 * record an audit entry. Idempotent when re-linking the same pair; refuses when
 * the Telegram id already belongs to a different employee.
 */
export async function linkTelegramUser(
  prisma: PrismaClient,
  input: LinkUserInput,
): Promise<LinkUserResult> {
  const target = await prisma.user.findFirst({
    where: { OR: [{ email: input.identifier }, { pinfl: input.identifier }] },
    select: { id: true, fullName: true, telegramUserId: true },
  });
  if (!target) {
    return { ok: false, message: `"${input.identifier}" bo'yicha xodim topilmadi.` };
  }

  const holder = await prisma.user.findUnique({
    where: { telegramUserId: input.telegramUserId },
    select: { id: true, fullName: true },
  });
  if (holder && holder.id !== target.id) {
    return {
      ok: false,
      message: `Bu Telegram akkaunt allaqachon ${holder.fullName} ga bog'langan.`,
    };
  }
  if (
    input.requireUnlinkedTarget &&
    target.telegramUserId != null &&
    target.telegramUserId !== input.telegramUserId
  ) {
    return {
      ok: false,
      message: `"${input.identifier}" allaqachon boshqa Telegram akkauntga bog'langan. Administrator bilan bog'laning.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: {
        telegramUserId: input.telegramUserId,
        telegramUsername: input.telegramUsername ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: input.byUserId ?? null,
        action: "update",
        tableName: "User",
        recordId: target.id,
        // BigInt is not JSON-serialisable — store ids as strings.
        oldData: { telegramUserId: target.telegramUserId?.toString() ?? null },
        newData: {
          telegramUserId: input.telegramUserId.toString(),
          telegramUsername: input.telegramUsername ?? null,
        },
      },
    });
  });

  return {
    ok: true,
    message: `${target.fullName} Telegram akkaunti bilan bog'landi.`,
    userId: target.id,
  };
}
