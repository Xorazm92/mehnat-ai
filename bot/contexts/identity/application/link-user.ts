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

/** The minimum an employee row must expose for the anti-hijack guards. */
export interface LinkTarget {
  id: string;
  fullName: string;
  telegramUserId: bigint | null;
}

export interface BindInput {
  telegramUserId: bigint;
  telegramUsername?: string | null;
  byUserId?: string | null;
  requireUnlinkedTarget?: boolean;
  /** How the target was named, for the refusal message ("aziz@..." / a phone). */
  label?: string;
}

/**
 * Bind a Telegram account to an already-resolved employee and record an audit
 * entry. This is the shared tail of every linking route (email/PINFL, phone
 * contact, admin reply) so the hijack guards can never drift between them.
 *
 * Idempotent when re-linking the same pair; refuses when the Telegram id
 * already belongs to a different employee.
 */
export async function bindTelegramToUser(
  prisma: PrismaClient,
  target: LinkTarget,
  input: BindInput,
): Promise<LinkUserResult> {
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
      message: `"${input.label ?? target.fullName}" allaqachon boshqa Telegram akkauntga bog'langan. Administrator bilan bog'laning.`,
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

/**
 * Bind a Telegram account to a mehnat-ai employee found by email or PINFL.
 * Kept as the fallback route for staff whose `phone` is missing or ambiguous —
 * the primary route is the one-tap contact share (`link-by-phone.ts`).
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
  return bindTelegramToUser(prisma, target, { ...input, label: input.identifier });
}
