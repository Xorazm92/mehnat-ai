"use server";

// =====================================================
// XIZMAT KATALOGI — sotiladigan xizmatlar va firma narxlari
// =====================================================
//
// DIQQAT: `Company.activeServices` (matritsa ustunlari) BILAN bog'liq emas.
// Qarang `prisma/schema.prisma` dagi `Service` izohi.

import { requireAdmin, requireSenior } from "@/server/guards";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { updateTag } from "next/cache";

const PERIODICITIES = ["monthly", "quarterly", "yearly", "one_time"] as const;

// ── KATALOG ────────────────────────────────────────────

export async function listServices(opts: { includeInactive?: boolean } = {}) {
  await requireSenior();
  return serialize(
    await prisma.service.findMany({
      where: opts.includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { companyServices: true } } },
    })
  );
}

export async function upsertService(input: {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  defaultPrice?: number | null;
  periodicity?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const actor = await requireAdmin();

  const key = input.key.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,40}$/.test(key)) {
    throw new Error("Kalit faqat lotin harfi, raqam va pastki chiziqdan iborat bo'lsin");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Xizmat nomi bo'sh bo'lmasin");

  const periodicity = input.periodicity ?? "monthly";
  if (!PERIODICITIES.includes(periodicity as (typeof PERIODICITIES)[number])) {
    throw new Error("Davriylik noto'g'ri");
  }
  if (input.defaultPrice != null && input.defaultPrice < 0) {
    throw new Error("Narx manfiy bo'lmaydi");
  }

  const data = {
    key,
    name,
    description: input.description?.trim() || null,
    defaultPrice: input.defaultPrice ?? null,
    periodicity,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
  };

  // Kalit UNIQUE: bir xil kalitli ikkinchi xizmat tijorat hisobotini ikkiga
  // bo'lib yuborardi, shuning uchun xato aniq matn bilan qaytariladi.
  const clash = await prisma.service.findUnique({ where: { key } });
  if (clash && clash.id !== input.id) {
    throw new Error(`"${key}" kaliti allaqachon band: ${clash.name}`);
  }

  const result = input.id
    ? await prisma.service.update({ where: { id: input.id }, data })
    : await prisma.service.create({ data });

  await recordAuditLog({
    userId: actor.userId,
    action: input.id ? "update" : "create",
    tableName: "Service",
    recordId: result.id,
    newData: data,
  });

  updateTag("services");
  return serialize(result);
}

/**
 * Xizmatni ARXIVLASH (isActive=false), jismonan o'chirish emas.
 *
 * Firmalarga biriktirilgan xizmatni o'chirish tarixiy schyot-faktura satrini
 * "nomsiz" qoldirardi — shuning uchun FK `Restrict` va bu yerda faqat bayroq
 * o'zgaradi.
 */
export async function archiveService(id: string) {
  const actor = await requireAdmin();
  const result = await prisma.service.update({ where: { id }, data: { isActive: false } });
  await recordAuditLog({
    userId: actor.userId,
    action: "update",
    tableName: "Service",
    recordId: id,
    newData: { isActive: false },
  });
  updateTag("services");
  return serialize(result);
}

// ── FIRMA XIZMATLARI ───────────────────────────────────

export async function getCompanyServices(companyId: string) {
  await requireSenior();
  return serialize(
    await prisma.companyService.findMany({
      where: { companyId },
      include: { service: true },
      orderBy: [{ service: { sortOrder: "asc" } }, { service: { name: "asc" } }],
    })
  );
}

export async function setCompanyService(input: {
  companyId: string;
  serviceId: string;
  price?: number | null;
  qty?: number;
  isActive?: boolean;
  note?: string | null;
}) {
  const actor = await requireSenior();
  if (input.price != null && input.price < 0) throw new Error("Narx manfiy bo'lmaydi");
  const qty = input.qty ?? 1;
  if (!Number.isInteger(qty) || qty < 1) throw new Error("Miqdor kamida 1 bo'lsin");

  const result = await prisma.companyService.upsert({
    where: { companyId_serviceId: { companyId: input.companyId, serviceId: input.serviceId } },
    create: {
      companyId: input.companyId,
      serviceId: input.serviceId,
      price: input.price ?? null,
      qty,
      isActive: input.isActive ?? true,
      note: input.note?.trim() || null,
      startedAt: new Date(),
    },
    update: {
      price: input.price ?? null,
      qty,
      isActive: input.isActive ?? true,
      note: input.note?.trim() || null,
    },
  });

  await recordAuditLog({
    userId: actor.userId,
    action: "update",
    tableName: "CompanyService",
    recordId: result.id,
    newData: { serviceId: input.serviceId, price: input.price ?? null, qty, isActive: input.isActive ?? true },
  });

  updateTag("services");
  return serialize(result);
}

export async function removeCompanyService(companyId: string, serviceId: string) {
  const actor = await requireSenior();
  const row = await prisma.companyService.findUnique({
    where: { companyId_serviceId: { companyId, serviceId } },
  });
  if (!row) return null;
  await prisma.companyService.delete({ where: { id: row.id } });
  await recordAuditLog({
    userId: actor.userId,
    action: "delete",
    tableName: "CompanyService",
    recordId: row.id,
    oldData: { companyId, serviceId },
  });
  updateTag("services");
  return { ok: true };
}

// ── TIJORAT HISOBOTI ───────────────────────────────────

export interface ServiceRevenueRow {
  serviceId: string;
  key: string;
  name: string;
  companyCount: number;
  /** Oylik rejalashtirilgan daromad (narx × miqdor). */
  monthlyAmount: number;
}

/**
 * "Qaysi xizmat qancha daromad keltiryapti" — katalog paydo bo'lgunga qadar
 * javobsiz qolgan savol: narx faqat yig'ma `CompanyServiceTerm.totalAmount`
 * da turardi.
 */
export async function getServiceRevenue(): Promise<ServiceRevenueRow[]> {
  await requireSenior();

  const rows = await prisma.companyService.findMany({
    where: { isActive: true, company: { isActive: true, isOwnFirm: false } },
    include: { service: true },
  });

  const byService = new Map<string, ServiceRevenueRow>();
  for (const r of rows) {
    const price = Number(r.price ?? r.service.defaultPrice ?? 0);
    const acc = byService.get(r.serviceId) ?? {
      serviceId: r.serviceId,
      key: r.service.key,
      name: r.service.name,
      companyCount: 0,
      monthlyAmount: 0,
    };
    acc.companyCount++;
    acc.monthlyAmount += price * r.qty;
    byService.set(r.serviceId, acc);
  }

  return [...byService.values()].sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}
