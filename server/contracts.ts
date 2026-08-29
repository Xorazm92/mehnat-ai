"use server";

// =====================================================
// SHARTNOMALAR — YARATISH VA TAHRIRLASH
// =====================================================
//
// `Contract` jadvali bor edi, lekin uni YARATADIGAN yo'l faqat
// `scripts/import-contracts.ts` — ya'ni 1C importi. Ekranda shartnomalar
// FAQAT O'QISH uchun ko'rinardi (`components/CompanyDrawer.tsx`), yangi
// shartnoma qo'shib bo'lmasdi. Shu sababdan yangi mijozning shartnomasi
// eski bitta ustunga (`Company.contractNumber`) yozilar va bitta mijozda bir
// nechta shartnoma bo'lishi ko'tarilmasdi.
//
// TO'LOV TURI (naqd / plastik / bank) BU YERDA EMAS: u shartnomaning emas,
// har bir TO'LOVning xossasi. Shartnomada faqat "odatiy kanal" saqlanadi va u
// kirim formasidagi standart qiymat uchun xizmat qiladi — haqiqiy kanal
// `PaymentAllocation.channelId` da, har to'lovda alohida tanlanadi.

import { prisma } from "@/lib/prisma";
import { requireKassa } from "@/server/guards";
import { serialize } from "@/lib/serialize";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

export interface ContractInput {
  companyId: string;
  number: string;
  signedAt?: string | Date | null;
  amount?: number | null;
  ownFirmId?: string | null;
  isActive?: boolean;
}

function normalize(input: ContractInput) {
  const number = input.number.trim();
  if (!number) throw new Error("Shartnoma raqami kiritilishi shart");

  const amount =
    input.amount === null || input.amount === undefined || input.amount === 0
      ? null
      : Number(input.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error("Shartnoma summasi manfiy bo'lishi mumkin emas");
  }

  const signedAt = input.signedAt ? new Date(input.signedAt) : null;
  if (signedAt && Number.isNaN(signedAt.getTime())) {
    throw new Error("Shartnoma sanasi noto'g'ri");
  }

  return {
    number,
    signedAt,
    amount: amount === null ? null : new Prisma.Decimal(amount.toFixed(2)),
    ownFirmId: input.ownFirmId || null,
  };
}

export async function getCompanyContracts(companyId: string) {
  await requireKassa();
  const rows = await prisma.contract.findMany({
    where: { companyId },
    select: {
      id: true,
      number: true,
      signedAt: true,
      amount: true,
      isActive: true,
      source: true,
      ownFirm: { select: { id: true, name: true } },
    },
    orderBy: [{ isActive: "desc" }, { signedAt: "desc" }],
  });
  return serialize(rows);
}

export async function createContract(input: ContractInput) {
  const { userId } = await requireKassa();
  const data = normalize(input);

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, contractNumber: true, contractAmount: true, contractDate: true },
  });
  if (!company) throw new Error("Firma topilmadi");

  // `@@unique([companyId, number])` baribir to'sadi, lekin Prisma xatosi
  // foydalanuvchiga tushunarsiz — tekshiruvni oldindan qilamiz.
  const clash = await prisma.contract.findUnique({
    where: { companyId_number: { companyId: input.companyId, number: data.number } },
    select: { id: true },
  });
  if (clash) throw new Error(`"${data.number}" raqamli shartnoma bu firmada allaqachon bor`);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.contract.create({
      data: { companyId: input.companyId, source: "manual", isActive: input.isActive ?? true, ...data },
    });

    // ESKI USTUNLAR BILAN MOSLIK: qarz formulasi (`lib/debt.ts`) hozircha
    // `Company.contractAmount` va `contractDate` dan o'qiydi. Firmada hali
    // hech narsa yozilmagan bo'lsa, BIRINCHI shartnoma ularni to'ldiradi —
    // aks holda yangi mijoz "shartnoma summasi 0" bo'lib qolar va unga hech
    // qachon hisob qo'yilmasdi.
    const patch: Prisma.CompanyUpdateInput = {};
    if (!company.contractNumber) patch.contractNumber = row.number;
    if (!Number(company.contractAmount ?? 0) && data.amount) patch.contractAmount = data.amount;
    if (!company.contractDate && data.signedAt) patch.contractDate = data.signedAt;
    if (Object.keys(patch).length > 0) {
      await tx.company.update({ where: { id: company.id }, data: patch });
    }
    return row;
  });

  await recordAuditLog({
    userId,
    action: "create",
    tableName: "Contract",
    recordId: created.id,
    newData: { companyId: input.companyId, number: created.number, amount: Number(created.amount ?? 0) },
  });

  revalidatePath("/organizations");
  revalidatePath("/kassa/kirim");
  revalidatePath("/kassa/qarzdorlik");
  return serialize(created);
}

export async function updateContract(id: string, input: Omit<ContractInput, "companyId">) {
  const { userId } = await requireKassa();

  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing) throw new Error("Shartnoma topilmadi");

  const data = normalize({ ...input, companyId: existing.companyId });

  if (data.number !== existing.number) {
    const clash = await prisma.contract.findUnique({
      where: { companyId_number: { companyId: existing.companyId, number: data.number } },
      select: { id: true },
    });
    if (clash) throw new Error(`"${data.number}" raqamli shartnoma bu firmada allaqachon bor`);
  }

  const updated = await prisma.contract.update({
    where: { id },
    data: { ...data, isActive: input.isActive ?? existing.isActive },
  });

  await recordAuditLog({
    userId,
    action: "update",
    tableName: "Contract",
    recordId: id,
    oldData: { number: existing.number, amount: Number(existing.amount ?? 0), isActive: existing.isActive },
    newData: { number: updated.number, amount: Number(updated.amount ?? 0), isActive: updated.isActive },
  });

  revalidatePath("/organizations");
  revalidatePath("/kassa/qarzdorlik");
  return serialize(updated);
}

/**
 * Shartnomani NOFAOL qiladi — o'chirmaydi.
 *
 * Jismoniy o'chirish taqiqlanadi: shartnomaga bog'langan to'lovlar
 * (`PaymentAllocation.contractId`) va bank tranzaksiyalari bor, ular
 * "qaysi shartnoma bo'yicha to'landi" savolini yo'qotmasligi kerak.
 */
export async function deactivateContract(id: string) {
  const { userId } = await requireKassa();
  const row = await prisma.contract.update({ where: { id }, data: { isActive: false } });

  await recordAuditLog({
    userId,
    action: "update",
    tableName: "Contract",
    recordId: id,
    newData: { isActive: false },
  });

  revalidatePath("/organizations");
  return serialize(row);
}
