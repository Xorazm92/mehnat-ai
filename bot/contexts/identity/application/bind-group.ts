import type { PrismaClient } from "@prisma/client";

export interface BindGroupInput {
  chatId: bigint;
  title?: string | null;
  /** Company id or INN to bind this chat to. */
  companyRef: string;
  byUserId?: string | null;
}

export interface BindGroupResult {
  ok: boolean;
  message: string;
  companyId?: string;
}

/**
 * Map a Telegram group chat to a company (found by id or INN) so activity in the
 * chat can be attributed. Upserts the TelegramGroup and records an audit entry.
 */
export async function bindGroupToCompany(
  prisma: PrismaClient,
  input: BindGroupInput,
): Promise<BindGroupResult> {
  const company = await prisma.company.findFirst({
    where: { OR: [{ id: input.companyRef }, { inn: input.companyRef }] },
    select: { id: true, name: true },
  });
  if (!company) {
    return { ok: false, message: `"${input.companyRef}" bo'yicha korxona topilmadi.` };
  }

  const existing = await prisma.telegramGroup.findUnique({
    where: { chatId: input.chatId },
    select: { companyId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.telegramGroup.upsert({
      where: { chatId: input.chatId },
      create: {
        chatId: input.chatId,
        companyId: company.id,
        title: input.title ?? null,
        isActive: true,
      },
      update: {
        companyId: company.id,
        title: input.title ?? undefined,
        isActive: true,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: input.byUserId ?? null,
        action: existing ? "update" : "create",
        tableName: "TelegramGroup",
        recordId: input.chatId.toString(),
        oldData: existing ? { companyId: existing.companyId } : undefined,
        newData: { chatId: input.chatId.toString(), companyId: company.id },
      },
    });
  });

  return {
    ok: true,
    message: `Guruh "${company.name}" korxonasiga bog'landi.`,
    companyId: company.id,
  };
}
