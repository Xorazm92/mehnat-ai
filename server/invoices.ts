"use server";

// =====================================================
// SCHYOT-FAKTURA — yaratish, ro'yxat, bekor qilish
// =====================================================
//
// To'lov holati BU YERDA saqlanmaydi (qarang schema'dagi Invoice izohi):
// ro'yxat mijoz qancha to'laganini `PaymentAllocation` dan HISOBLAB
// ko'rsatadi. Shu sababdan schyotda "paid" bayrog'i yo'q — ikkinchi
// haqiqat manbai yaratilmaydi.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/platform/permissions";
import { serialize } from "@/lib/serialize";
import { serializable } from "@/lib/tx";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { resolveServiceTerm, roundToMonthStart } from "@/lib/terms";
import { periodKeyOf, isMonthPeriod } from "@/lib/periods";
import { clampPage, hasMorePages } from "@/lib/pagination";
import type { Invoice, Prisma } from "@prisma/client";
import { buildInvoiceLines, nextInvoiceNumber } from "@/lib/invoiceBuild";
import { getCollectedByCompany } from "@/lib/payrollCollected";
import { expectedByCompany } from "@/lib/debt";
import { updateTag } from "next/cache";

async function requireSenior() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");
  return session;
}

function assertPeriod(period: unknown): asserts period is string {
  if (!isMonthPeriod(period)) throw new Error("Davr formati noto'g'ri (YYYY-MM, oy 01–12)");
}

async function reactivateInvoice(tx: Prisma.TransactionClient, inv: Invoice, userId: string) {
  if (inv.status !== "cancelled") throw new Error("Faqat bekor qilingan schyotni qayta chiqarish mumkin");
  // Berilgan hujjatning summasi va satrlari tarixiy nusxa: katalogdan qayta
  // hisoblash yoki satrlarni o'chirish eski hujjat mazmunini yo'qotardi.
  const updated = await tx.invoice.update({
    where: { id: inv.id },
    data: { status: "draft", cancelReason: null },
    select: { id: true, number: true, total: true },
  });
  await tx.auditLog.create({
    data: {
      userId, action: "update", tableName: "Invoice", recordId: inv.id,
      oldData: { status: inv.status, cancelReason: inv.cancelReason, issuedAt: inv.issuedAt.toISOString() },
      newData: { status: "draft", operation: "reissue", number: inv.number, total: String(inv.total) },
    },
  });
  return { ...updated, adjustment: 0, reissued: true };
}

export async function reissueInvoice(id: string) {
  const session = await requireSenior();
  const result = await serializable(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) throw new Error("Schyot topilmadi");
    return reactivateInvoice(tx, inv, session.user.id as string);
  });
  updateTag("invoices");
  return serialize(result);
}

export interface InvoiceListRow {
  id: string;
  number: string;
  period: string;
  status: string;
  companyId: string;
  companyName: string;
  total: number;
  /** Shu davrda haqiqatda tushgan pul — schyotdan emas, taqsimotlardan. */
  collected: number;
  issuedAt: string;
  dueAt: string | null;
}

export interface InvoicePage {
  rows: InvoiceListRow[];
  totalCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export async function listInvoices(
  period?: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<InvoicePage> {
  await requireSenior();
  if (period !== undefined) assertPeriod(period);
  const requestedPage = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("Sahifa musbat butun son, sahifa hajmi esa 1–100 bo'lishi kerak");
  }
  const where = period === undefined ? {} : { period };
  // Count va qatorlar bir snapshotdan: parallel o'zgarish pagination
  // chegarasini siljitib, foydalanuvchini bo'sh sahifada qoldirmasin.
  const { rows, totalCount, page } = await prisma.$transaction(async (tx) => {
    const totalCount = await tx.invoice.count({ where });
    const page = clampPage(requestedPage, totalCount, pageSize);
    const rows = await tx.invoice.findMany({
      where,
      select: {
        id: true, number: true, period: true, status: true, total: true,
        issuedAt: true, dueAt: true, companyId: true,
        company: { select: { name: true } },
      },
      orderBy: [{ period: "desc" }, { number: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { rows, totalCount, page };
  }, { isolationLevel: "RepeatableRead" });

  // Davr bo'yicha bir marta o'qiladi — har qator uchun alohida so'rov
  // qilinsa 500 qatorli ro'yxat 500 ta so'rov qilardi.
  const periods = [...new Set(rows.map((r) => r.period))];
  const collectedByPeriod = new Map<string, Record<string, number>>();
  for (const p of periods) {
    collectedByPeriod.set(p, await getCollectedByCompany(p));
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      number: r.number,
      period: r.period,
      status: r.status,
      companyId: r.companyId,
      companyName: r.company.name,
      total: Number(r.total),
      collected: collectedByPeriod.get(r.period)?.[r.companyId] ?? 0,
      issuedAt: r.issuedAt.toISOString(),
      dueAt: r.dueAt?.toISOString() ?? null,
    })),
    totalCount,
    hasMore: hasMorePages(page, pageSize, totalCount),
    // So'ralgan emas, AMALDAGI sahifa qaytariladi: u siqilgan bo'lishi mumkin
    // (mavjud bo'lmagan sahifa so'ralganda), ekran esa qaysi sahifada
    // turganini shundan biladi.
    page,
    pageSize,
  };
}

export async function getInvoice(id: string) {
  await requireSenior();
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      company: {
        select: { id: true, name: true, inn: true, directorName: true, legalAddress: true },
      },
    },
  });
  if (!inv) throw new Error("Schyot topilmadi");
  return serialize(inv);
}

/**
 * Bitta firma uchun bir oylik schyot yaratish.
 *
 * Satrlar `CompanyService` dan, JAMI esa har doim `CompanyServiceTerm` dan
 * (qarang lib/invoiceBuild.ts). Raqam va yozuv bitta Serializable
 * tranzaksiyada: ikki parallel chaqiruv bir raqamni ikki marta bera olmasin.
 */
export async function createInvoice(input: {
  companyId: string;
  period: string;
  dueAt?: string | null;
  note?: string | null;
}) {
  const session = await requireSenior();
  assertPeriod(input.period);

  const periodStart = roundToMonthStart(new Date(`${input.period}-01T00:00:00`));

  const [company, term, services] = await Promise.all([
    prisma.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, name: true, isActive: true },
    }),
    resolveServiceTerm(input.companyId, periodStart),
    prisma.companyService.findMany({
      where: { companyId: input.companyId, isActive: true },
      include: { service: true },
      orderBy: [{ service: { sortOrder: "asc" } }],
    }),
  ]);

  if (!company) throw new Error("Firma topilmadi");
  if (!term) {
    throw new Error(
      `${company.name}: shu davr uchun shartnoma summasi (CompanyServiceTerm) yo'q — avval narxni kiriting`
    );
  }

  const built = buildInvoiceLines({
    termTotal: Number(term.totalAmount),
    services: services.map((cs) => ({
      serviceId: cs.serviceId,
      name: cs.service.name,
      price: Number(cs.price ?? cs.service.defaultPrice ?? 0),
      qty: cs.qty,
    })),
  });

  const created = await serializable(async (tx) => {
    const dupe = await tx.invoice.findUnique({
      where: { companyId_period: { companyId: input.companyId, period: input.period } },
      select: { id: true, number: true, status: true },
    });
    if (dupe) {
      throw new Error(
        `${company.name} uchun ${input.period} davriga schyot allaqachon bor (${dupe.number}). ` +
          `Yangisini yozish uchun avval uni bekor qiling.`
      );
    }

    const year = Number(input.period.slice(0, 4));
    const last = await tx.invoice.findFirst({
      where: { number: { startsWith: `${year}-` } },
      orderBy: { number: "desc" },
      select: { number: true },
    });

    return tx.invoice.create({
      data: {
        companyId: input.companyId,
        period: input.period,
        number: nextInvoiceNumber(year, last?.number ?? null),
        total: built.total,
        note: input.note?.trim() || null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        createdById: session.user.id as string,
        createdByName: (session.user.name as string) ?? null,
        lines: {
          create: built.lines.map((l) => ({
            serviceId: l.serviceId,
            description: l.description,
            qty: l.qty,
            unitPrice: l.unitPrice,
            amount: l.amount,
            sortOrder: l.sortOrder,
          })),
        },
      },
      select: { id: true, number: true, total: true },
    });
  });

  await recordAuditLog({
    userId: session.user.id as string,
    action: "create",
    tableName: "Invoice",
    recordId: created.id,
    newData: { number: created.number, companyId: input.companyId, period: input.period, total: built.total },
  });

  updateTag("invoices");
  return serialize({ ...created, adjustment: built.adjustment });
}

export interface BulkInvoiceResult {
  period: string;
  created: number;
  skippedExisting: number;
  skippedNoTerm: number;
  errors: { companyName: string; message: string }[];
}

/**
 * Butun oy uchun schyot yozish.
 *
 * Har firma ALOHIDA try/catch bilan — bittasidagi kutilmagan xato (term yo'q,
 * summa nol) butun partiyani to'xtatib qo'ymasligi kerak. Xuddi shu qoida
 * `lib/paymentGeneration.ts` da ham amal qiladi.
 */
export async function createInvoicesForPeriod(period: string): Promise<BulkInvoiceResult> {
  await requireSenior();
  assertPeriod(period);

  const companies = await prisma.company.findMany({
    where: { isActive: true, isOwnFirm: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const res: BulkInvoiceResult = {
    period,
    created: 0,
    skippedExisting: 0,
    skippedNoTerm: 0,
    errors: [],
  };

  for (const c of companies) {
    try {
      await createInvoice({ companyId: c.id, period });
      res.created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("allaqachon bor")) res.skippedExisting++;
      else if (msg.includes("CompanyServiceTerm")) res.skippedNoTerm++;
      else res.errors.push({ companyName: c.name, message: msg });
    }
  }

  updateTag("invoices");
  return res;
}

/** Qoralamani "berilgan" holatiga o'tkazish — shundan keyin satrlar o'zgarmaydi. */
export async function issueInvoice(id: string) {
  const session = await requireSenior();
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { status: true, number: true } });
  if (!inv) throw new Error("Schyot topilmadi");
  if (inv.status === "cancelled") throw new Error("Bekor qilingan schyotni berib bo'lmaydi");
  if (inv.status === "issued") return serialize(inv);

  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: "issued", issuedAt: new Date() },
    select: { id: true, number: true, status: true },
  });

  await recordAuditLog({
    userId: session.user.id as string,
    action: "update",
    tableName: "Invoice",
    recordId: id,
    newData: { status: "issued" },
  });

  updateTag("invoices");
  return serialize(updated);
}

/**
 * Bekor qilish — jismonan o'chirilmaydi.
 *
 * Raqam BAND qoladi: ketma-ketlikdan raqam olib tashlansa hujjat oqimida
 * tushunarsiz bo'shliq paydo bo'lardi va "yo'qolgan schyot" savolini
 * tug'dirardi.
 */
export async function cancelInvoice(id: string, reason: string) {
  const session = await requireSenior();
  if (!reason?.trim()) throw new Error("Bekor qilish sababini yozing");

  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: "cancelled", cancelReason: reason.trim() },
    select: { id: true, number: true, status: true },
  });

  await recordAuditLog({
    userId: session.user.id as string,
    action: "update",
    tableName: "Invoice",
    recordId: id,
    newData: { status: "cancelled", reason: reason.trim() },
  });

  updateTag("invoices");
  return serialize(updated);
}

/**
 * Matritsaning "To'lov" ustuni uchun: companyId → kutilgan va tushgan summa.
 *
 * KUTILGAN summa `CompanyServiceTerm` dan (versiyalangan narx), `Payment.amount`
 * dan EMAS: generator `Payment.amount` ga kutilayotgan summani yozib qo'yadi,
 * lekin birinchi to'lovdan keyin uni taqsimotlar yig'indisiga almashtiradi —
 * ya'ni to'langan firmada "kutilgan" va "tushgan" bir xil ko'rinib, hech
 * qachon kam to'lov ko'rinmasdi.
 *
 * Bitta LATERAL so'rov — 259 firma uchun 259 ta so'rov qilinmasin.
 */
export async function getPeriodPaymentStatus(
  period: string
): Promise<Record<string, { expected: number; collected: number }>> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  assertPeriod(period);

  // Kutilgan summa — `lib/debt.ts#expectedByCompany` (yagona manba: xuddi
  // shu raqamdan `server/debt.ts` 1C kesimlaridan to'lovni chiqaradi).
  const expected = await expectedByCompany(prisma, period);

  const collected = await getCollectedByCompany(period);

  const out: Record<string, { expected: number; collected: number }> = {};
  for (const [companyId, amount] of expected) {
    out[companyId] = { expected: amount, collected: collected[companyId] ?? 0 };
  }
  // Shartnoma summasi yo'q, lekin pul tushgan firma ham ko'rinsin — aks holda
  // u matritsada "ma'lumot yo'q" bo'lib qolardi.
  for (const [cid, amount] of Object.entries(collected)) {
    if (!out[cid]) out[cid] = { expected: 0, collected: amount };
  }
  return out;
}

/** Joriy davr kaliti — ekran boshlang'ich holati uchun. */
export async function currentInvoicePeriod(): Promise<string> {
  await requireSenior();
  return periodKeyOf(roundToMonthStart(new Date()));
}
