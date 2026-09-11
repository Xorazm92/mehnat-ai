"use server";

// =====================================================
// KASSA YOZUVLARI — `KassaEntry`
// =====================================================
//
// Kassa kirimi/chiqimining YAGONA yozuv yo'li. Chiqimda tasdiq oqimi ishlaydi
// (`lib/expenseApproval.ts` chegaralari) va JURNALGA faqat TASDIQLANGAN yozuv
// tushadi — `pending` da pul hali chiqmagan.
//
// Ofis kassasi FIRMAGA bog'lanmagan (`companyId` ixtiyoriy), shuning uchun
// chegara portfel emas, ROL ro'yxati bo'lib qoladi.

import { prisma } from "@/lib/prisma";
import { assertNotSalary, assertPositiveAmount, postExpenseLegs } from "./shared";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/platform/permissions";
import { assertSufficientFunds } from "@/lib/balance";
import { serializable } from "@/lib/tx";
import { assertPeriodOpen } from "@/lib/periodLock";
import { reverseLedger } from "@/lib/ledger";
import { assertFundingSource } from "@/server/fundingSources";
import { assertChannelFunds } from "@/lib/cashGate";
import { isFinanceRole } from "@/lib/platform/permissions";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { serialize } from "@/lib/serialize";

export async function getKassaEntries(filters?: {
  type?: string;
  category?: string;
  from?: Date;
  to?: Date;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  // Qo'lda ro'yxat emas — `isFinanceRole`. Ilgari shu ro'yxat shu yerda
  // nusxalangan edi va yangi rol qo'shilganda faqat bittasi eslab qolinardi.
  if (!isFinanceRole(session.user.role as string)) throw new Error("Forbidden");

  return serialize(
    await prisma.kassaEntry.findMany({
      where: {
        deletedAt: null,
        ...(filters?.type ? { type: filters.type } : {}),
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
      include: {
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { date: "desc" },
    })
  );
}

/**
 * Kassa kirimi/chiqimi — YAGONA yozuv yo'li.
 *
 * Chiqimda tasdiq oqimi ishlaydi (`lib/expenseApproval.ts` chegaralari):
 * <1 mln avto-tasdiq, undan yuqorisi `pending` bo'lib navbatga tushadi.
 * JURNALGA faqat TASDIQLANGAN yozuv tushadi — `pending` da pul hali
 * chiqmagan, shuning uchun uni balansdan ayirish noto'g'ri bo'lardi.
 */
export async function createKassaEntry(data: {
  type: string;
  category: string;
  amount: number;
  description?: string;
  date: Date;
  companyId?: string;
  /** Pul qaysi manbaga kirdi / qaysi manbadan chiqdi. */
  channelId?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  const userId = session.user.id as string;
  if (!isFinanceRole(role)) throw new Error("Forbidden");

  if (data.type !== "income" && data.type !== "expense") {
    throw new Error("Kassa turi noto'g'ri: 'income' yoki 'expense' bo'lishi kerak");
  }
  // CHIQIM MANBASIZ YOZILMAYDI: "Naqd", "Plastik" yoki aniq firma hisobi —
  // aks holda summa faqat umumiy balansdan ayirilib, manba ichki qoldig'i
  // o'zgarmasdan qolardi va manbalar kesimida chalkashlik tug'ilar edi.
  if (data.type === "expense" && !data.channelId) {
    throw new Error(
      "Chiqim qaysi manbadan chiqishini tanlang — firma hisobi, Plastik yoki Cash"
    );
  }
  assertNotSalary(data.type, data.category);
  assertPositiveAmount(data.amount);
  if (data.channelId) await assertFundingSource(data.channelId);

  // Kirim har doim yakuniy; chiqimda chegara qaraladi.
  const autoApprove = data.type === "income" || data.amount < 1_000_000;

  const created = await serializable(async (tx) => {
    await assertPeriodOpen(tx, data.date, "kassa yozuvi");

    // Chiqim mavjud balansdan oshmasligi kerak. Tekshiruv YOZUV BILAN BIR
    // TRANZAKSIYADA — aks holda ikki parallel chiqim bir xil balansni ko'rib
    // ikkalasi ham o'tib ketardi.
    if (data.type === "expense" && autoApprove) {
      await assertSufficientFunds({
        amount: data.amount, role, userId, context: "expense", db: tx,
      });
      // IKKINCHI DARVOZA — tanlangan manbaning O'Z qoldig'i (lib/cashGate.ts).
      // Umumiy balans yetarli bo'lsa ham bo'sh hisobdan pul chiqarib
      // bo'lmaydi; busiz ekran yo'li import yo'lidan zaifroq turardi.
      if (data.channelId) {
        await assertChannelFunds(tx, { channelId: data.channelId, amount: data.amount, role });
      }
    }
    // MAYDONLAR ANIQ SANALADI, `...data` EMAS.
    //
    // Bu server action — mijoz yuborgan obyekt RUNTIME da butunligicha
    // keladi va TypeScript tipi uni kesib tashlamaydi (tip faqat
    // kompilyatsiya vaqtida yashaydi). `/expenses` formasi hali eski
    // `paymentMethod` maydonini yuborardi; u `KassaEntry` da yo'q, va
    // spread uni to'g'ridan-to'g'ri Prisma'ga uzatib "Unknown argument
    // `paymentMethod`" bilan har bir xarajat kiritishni yiqitardi.
    //
    // Sanab yozish bu sinfdagi xatoni butunlay yopadi: jadvalda bo'lmagan
    // maydon bu yerdan o'tolmaydi, mijoz nima yuborishidan qat'i nazar.
    const row = await tx.kassaEntry.create({
      data: {
        type: data.type,
        category: data.category,
        amount: data.amount,
        description: data.description ?? null,
        date: data.date,
        companyId: data.companyId ?? null,
        channelId: data.channelId ?? null,
        createdBy: userId,
        status: autoApprove ? "approved" : "pending",
        ...(autoApprove ? { approvedBy: userId, approvedAt: new Date() } : {}),
      },
    });
    if (autoApprove) await postExpenseLegs(tx, row, userId);
    return row;
  });

  await recordAuditLog({
    userId,
    action: "create",
    tableName: "KassaEntry",
    recordId: created.id,
    newData: { type: data.type, category: data.category, amount: data.amount, status: created.status },
  });

  return serialize(created);
}

// Soft delete — jismoniy o'chirish yo'q: yozuv belgilanadi, ledger izi
// reversal bilan nolga tushadi, audit oldData saqlaydi.
export async function deleteKassaEntry(id: string, reason?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  const existing = await prisma.kassaEntry.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Kassa yozuvi topilmadi");

  await assertPeriodOpen(prisma, existing.date, "kassa yozuvi");

  const deleted = await prisma.$transaction(async (tx) => {
    const row = await tx.kassaEntry.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: session.user.id, deleteReason: reason?.trim() || null },
    });
    await reverseLedger(tx, {
      sourceTable: "KassaEntry",
      sourceId: id,
      createdBy: session.user.id,
      reason: reason?.trim() || "kassa yozuvi o'chirildi",
    });
    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "delete",
    tableName: "KassaEntry",
    recordId: id,
    oldData: { type: existing.type, category: existing.category, amount: Number(existing.amount), date: existing.date.toISOString() },
    newData: { deleteReason: reason?.trim() || null },
  });

  return serialize(deleted);
}
