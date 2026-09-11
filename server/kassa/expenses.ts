"use server";

// =====================================================
// XARAJATLAR — `KassaEntry(expense)` ustida
// =====================================================
//
// Tasdiq oqimi (`approveExpense` / `rejectExpense`) SHU YERDA, yozuv yo'li
// bilan BIRGA — ataylab. Pul aynan tasdiq paytida chiqadi: davr qulfi,
// balans yetarliligi, kanal qoldig'i va jurnal oyog'i bitta `serializable`
// tranzaksiyada bajariladi. Tasdiqni "RBAC" deb ajratib olish bu zanjirni
// uzardi va ikki marta tasdiqlash oynasini ochardi.

import { prisma } from "@/lib/prisma";
import { assertNotSalary, assertPositiveAmount, postExpenseLegs } from "./shared";
// `Expense` endi `KassaEntry` ustida yashaydi: yaratish va o'chirish aynan
// bir xil yo'ldan boradi, shuning uchun ular qayta yozilmaydi — chaqiriladi.
import { createKassaEntry, deleteKassaEntry } from "./entries";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/platform/permissions";
import { canApproveExpense } from "@/lib/expenseApproval";
import { assertSufficientFunds } from "@/lib/balance";
import { serializable } from "@/lib/tx";
import { assertPeriodOpen } from "@/lib/periodLock";
import { reverseLedger } from "@/lib/ledger";
import { assertFundingSource } from "@/server/fundingSources";
import { assertChannelFunds } from "@/lib/cashGate";
import { isFinanceRole } from "@/lib/platform/permissions";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { serialize } from "@/lib/serialize";

// =====================================================
// XARAJATLAR — `KassaEntry(expense)` ustida
// =====================================================
//
// ILGARI ALOHIDA `Expense` JADVALI BOR EDI. Ikkala jadval ham bitta savolga
// javob berardi ("pul chiqdi"), lekin `Expense` da tasdiq oqimi bor edi,
// `KassaEntry` da yo'q. Natijada olti modulda ikkita shox olib yurilardi
// (`lib/balance.ts`, `lib/monthClose.ts`, `lib/reconciliation.ts`,
// `scripts/backfill-ledger.ts`, `lib/cashGate.ts`, shu fayl), holbuki prodda
// `Expense` da atigi 3 ta `pending` qator va NOLTA tasdiqlangan qator bor edi.
//
// Endi tasdiq oqimi `KassaEntry` ning o'zida (`status`/`approvedBy`/
// `approvedAt`/`rejectedReason`) va jadval BITTA. `/expenses` ekrani
// o'zgarmadi — u faqat props va callback ishlatadi, quyidagi funksiyalar esa
// endi `KassaEntry` bilan gaplashadi.
//
// `paymentMethod` OLIB TASHLANDI: `channelId` uni to'liq almashtiradi va
// undan boyroq ("qaysi schyot/karta", nafaqat "naqdmi yoki plastikmi").
// Ikkalasini saqlash aynan biz yo'q qilayotgan takroriylik bo'lardi.

/** Xarajat ro'yxati — `/expenses` ekrani uchun. */
export async function getExpenses(filters?: {
  category?: string;
  from?: Date;
  to?: Date;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isFinanceRole(session.user.role as string)) throw new Error("Forbidden");

  return serialize(
    await prisma.kassaEntry.findMany({
      where: {
        type: "expense",
        deletedAt: null,
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.from || filters?.to
          ? {
              date: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { date: "desc" },
    })
  );
}

/**
 * Xarajat kiritish. Tasdiq chegarasi `lib/expenseApproval.ts` da:
 * <1 mln avto-tasdiq · 1–10 mln bosh buxgalter · >10 mln superadmin.
 *
 * Yozuv `createKassaEntry` orqali ketadi — bitta yozuv yo'li, bitta jurnal.
 */
export async function createExpense(data: {
  amount: number;
  date: Date;
  category: string;
  description?: string;
  channelId?: string;
}) {
  return createKassaEntry({ ...data, type: "expense" });
}

/**
 * Kutilayotgan xarajatni tasdiqlash — pul SHU PAYTDA chiqadi.
 *
 * Jurnal yozuvi ham aynan shu yerda: `createKassaEntry` `pending` yozuvga
 * jurnal yozmaydi (pul hali chiqmagan), tasdiqda esa yoziladi.
 */
export async function approveExpense(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;

  const row = await prisma.kassaEntry.findUnique({ where: { id } });
  if (!row || row.deletedAt || row.type !== "expense") throw new Error("Xarajat topilmadi");
  // Ikki marta tasdiqlash — ikki marta jurnal yozuvi; qat'iy bloklanadi.
  if (row.status === "approved") throw new Error("Xarajat allaqachon tasdiqlangan");
  if (!canApproveExpense(role, Number(row.amount))) {
    throw new Error(
      Number(row.amount) > 10_000_000
        ? "10 mln dan yuqori — faqat Superadmin tasdiqlaydi"
        : "Tasdiqlash huquqi yo'q"
    );
  }

  const approved = await serializable(async (tx) => {
    // Holatni tranzaksiya ICHIDA qayta o'qiymiz: tekshiruvdan beri boshqa
    // seans tasdiqlab ulgurgan bo'lishi mumkin.
    const fresh = await tx.kassaEntry.findUnique({ where: { id }, select: { status: true } });
    if (!fresh || fresh.status === "approved") throw new Error("Xarajat allaqachon tasdiqlangan");

    await assertPeriodOpen(tx, row.date, "xarajat");
    await assertSufficientFunds({
      amount: Number(row.amount), role, userId: session.user.id, context: "expense", db: tx,
    });
    // Manba qoldig'i — `createKassaEntry` dagi bilan bir xil darvoza. Pul
    // aynan TASDIQ paytida chiqadi, ya'ni tekshiruv ham shu yerda turishi kerak.
    if (row.channelId) {
      await assertChannelFunds(tx, {
        channelId: row.channelId, amount: Number(row.amount), role,
      });
    }

    const updated = await tx.kassaEntry.update({
      where: { id },
      data: {
        status: "approved",
        approvedBy: session.user.id,
        approvedAt: new Date(),
        rejectedReason: null,
      },
    });
    await postExpenseLegs(tx, updated, session.user.id);
    return updated;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "KassaEntry",
    recordId: id,
    newData: { status: "approved", amount: Number(row.amount) },
  });

  return serialize(approved);
}

export async function rejectExpense(id: string, reason: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");

  const row = await prisma.kassaEntry.findUnique({ where: { id } });
  if (!row || row.deletedAt || row.type !== "expense") throw new Error("Xarajat topilmadi");

  const rejected = await prisma.$transaction(async (tx) => {
    await assertPeriodOpen(tx, row.date, "xarajat");
    const updated = await tx.kassaEntry.update({
      where: { id },
      data: {
        status: "rejected",
        approvedBy: session.user.id,
        approvedAt: new Date(),
        rejectedReason: reason,
      },
    });
    // Avval tasdiqlangan bo'lsa — pul "qaytadi": jurnal izi nolga tushadi.
    await reverseLedger(tx, {
      sourceTable: "KassaEntry", sourceId: id,
      createdBy: session.user.id, reason: `rad etildi: ${reason}`,
    });
    return updated;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "KassaEntry",
    recordId: id,
    newData: { status: "rejected", rejectedReason: reason },
  });

  return serialize(rejected);
}

export async function updateExpense(id: string, data: {
  amount: number;
  date: Date;
  category: string;
  description?: string;
  channelId?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  const userId = session.user.id as string;

  if (data.channelId) await assertFundingSource(data.channelId);

  const existing = await prisma.kassaEntry.findUnique({ where: { id } });
  if (!existing || existing.deletedAt || existing.type !== "expense") {
    throw new Error("Xarajat topilmadi");
  }
  // Faqat senior rollar yoki (kutilayotgan xarajatning) muallifi tahrirlaydi.
  if (!isSeniorRole(role) && !(existing.createdBy === userId && existing.status === "pending")) {
    throw new Error("Forbidden");
  }
  assertPositiveAmount(data.amount, "Xarajat summasi");
  assertNotSalary("expense", data.category);

  // Tahrir tasdiq oqimini QAYTA BOSHLAYDI — `createExpense` bilan bir xil qoida.
  const autoApprove = data.amount < 1_000_000;

  const updated = await serializable(async (tx) => {
    // Ham eski, ham yangi davr ochiq bo'lishi kerak: yozuvni yopiq oydan
    // olib chiqib ketish ham taqiq.
    await assertPeriodOpen(tx, existing.date, "xarajat");
    await assertPeriodOpen(tx, data.date, "xarajat");

    if (autoApprove) {
      await assertSufficientFunds({
        amount: data.amount, role, userId, excludeKassaEntryId: id, context: "expense", db: tx,
      });
      // Manba qoldig'i — YANGI kanal bo'yicha, yozuvning o'z eski izi
      // chiqarib tashlangan holda (aks holda summa ikki marta sanalardi).
      if (data.channelId) {
        await assertChannelFunds(tx, {
          channelId: data.channelId, amount: data.amount, role, excludeKassaEntryId: id,
        });
      }
    }
    // Eski jurnal izi netto nolga tushadi, so'ng (avto-tasdiqda) qayta yoziladi.
    await reverseLedger(tx, {
      sourceTable: "KassaEntry", sourceId: id, createdBy: userId, reason: "xarajat tahrirlandi",
    });
    const row = await tx.kassaEntry.update({
      where: { id },
      // Maydonlar aniq sanaladi — sabab `createKassaEntry` dagi bilan bir xil:
      // mijoz yuborgan obyekt runtime da butunligicha keladi.
      data: {
        amount: data.amount,
        date: data.date,
        category: data.category,
        description: data.description ?? null,
        channelId: data.channelId ?? null,
        status: autoApprove ? "approved" : "pending",
        approvedBy: autoApprove ? userId : null,
        approvedAt: autoApprove ? new Date() : null,
        rejectedReason: null,
      },
    });
    if (autoApprove) await postExpenseLegs(tx, row, userId);
    return row;
  });

  await recordAuditLog({
    userId,
    action: "update",
    tableName: "KassaEntry",
    recordId: id,
    oldData: { amount: Number(existing.amount), category: existing.category, status: existing.status },
    newData: { amount: data.amount, category: data.category, status: updated.status },
  });

  return serialize(updated);
}

/** Xarajatni o'chirish — `deleteKassaEntry` bilan bir xil yo'l. */
export async function deleteExpense(id: string, reason?: string) {
  return deleteKassaEntry(id, reason);
}
