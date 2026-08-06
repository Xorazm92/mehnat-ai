"use server";

// =====================================================
// COMPANY OBLIGATION OVERRIDE — firma bo'yicha istisno
// =====================================================
// XAVFSIZLIK KLAPANI. Generator `lib/engines/obligation/obligations.ts:95` da
// bu jadvalni O'QIYDI va `disable` bo'lsa majburiyat yaratmaydi — lekin
// bugungacha uni YARATADIGAN hech narsa yo'q edi: na server action, na UI.
//
// Nega u template rollout'idan OLDIN kerak: 213 firma × ~28 template ≈ 6 000
// majburiyat/oy, va soatlik sweep har mas'ulga besh bosqichda DM yuboradi.
// Template haddan tashqari keng qamrab olgani aniqlansa, uni deploy kutmasdan,
// o'n soniyada firma bo'yicha o'chirish yo'li bo'lishi shart.
//
// `reason` MAJBURIY: istisno — bu qaror, va qaror sababsiz qolsa keyin uni
// kim ham, nega ham qaytarishni bilmaydi.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isSeniorRole } from "@/lib/platform/permissions";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { serialize } from "@/lib/serialize";
import { companyScopeWhere, type Actor } from "@/lib/platform/access";
import { revalidateTag } from "next/cache";

const ACTIONS = ["disable", "custom_due", "reassign"] as const;
export type OverrideAction = (typeof ACTIONS)[number];

async function requireSenior(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Ruxsat yo'q: bu amal uchun senior rol talab qilinadi");
  return { id: session.user.id as string, role };
}

/** Aktyor shu firmaga tegishlimi (admin — hammasiga). */
async function assertCompanyInScope(actor: Actor, companyId: string): Promise<void> {
  if (isAdminRole(actor.role)) return;
  const hit = await prisma.company.findFirst({
    where: { id: companyId, ...companyScopeWhere(actor) },
    select: { id: true },
  });
  if (!hit) throw new Error("Bu kompaniyaga ruxsatingiz yo'q");
}

/**
 * Bitta template bo'yicha barcha firmalar va ularning istisnolari.
 *
 * Rollout paytida savol aynan shu shaklda tug'iladi: "shu template'ni yoqdim —
 * kimga tegmasligi kerak?". Shuning uchun ro'yxat firmadan emas, TEMPLATE'dan
 * boshlanadi.
 */
export async function getTemplateOverrides(templateId: string) {
  const actor = await requireSenior();

  const [template, companies, overrides] = await Promise.all([
    prisma.deadlineTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, code: true, name: true, lifecycle: true, matrixKey: true, periodicity: true },
    }),
    prisma.company.findMany({
      where: { isActive: true, ...(isAdminRole(actor.role) ? {} : companyScopeWhere(actor)) },
      select: { id: true, name: true, inn: true },
      orderBy: { name: "asc" },
    }),
    prisma.companyObligationOverride.findMany({ where: { templateId } }),
  ]);
  if (!template) throw new Error("Template topilmadi");

  const byCompany = new Map(overrides.map((o) => [o.companyId, o]));
  return serialize({
    template,
    rows: companies.map((c) => ({ ...c, override: byCompany.get(c.id) ?? null })),
  });
}

export interface OverrideInput {
  companyId: string;
  templateId: string;
  action: OverrideAction;
  reason: string;
  customDueDay?: number | null;
  customOffsetDays?: number | null;
  responsibleUserId?: string | null;
}

export async function setObligationOverride(input: OverrideInput) {
  const actor = await requireSenior();
  await assertCompanyInScope(actor, input.companyId);

  if (!ACTIONS.includes(input.action)) throw new Error("Istisno turi noto'g'ri");
  const reason = input.reason?.trim();
  if (!reason) throw new Error("Sabab majburiy");

  if (input.action === "custom_due") {
    const day = input.customDueDay;
    const off = input.customOffsetDays;
    if (day == null && off == null) throw new Error("custom_due uchun kun yoki siljish berilishi kerak");
    if (day != null && (!Number.isInteger(day) || day < 1 || day > 31)) throw new Error("Kun 1-31 oralig'ida bo'lishi kerak");
  }
  if (input.action === "reassign" && !input.responsibleUserId) {
    throw new Error("reassign uchun mas'ul tanlanishi kerak");
  }

  const data = {
    action: input.action,
    reason,
    customDueDay: input.action === "custom_due" ? (input.customDueDay ?? null) : null,
    customOffsetDays: input.action === "custom_due" ? (input.customOffsetDays ?? null) : null,
    responsibleUserId: input.action === "reassign" ? (input.responsibleUserId ?? null) : null,
  };

  const existing = await prisma.companyObligationOverride.findUnique({
    where: { companyId_templateId: { companyId: input.companyId, templateId: input.templateId } },
    select: { id: true, action: true, reason: true },
  });

  const row = await prisma.companyObligationOverride.upsert({
    where: { companyId_templateId: { companyId: input.companyId, templateId: input.templateId } },
    create: { companyId: input.companyId, templateId: input.templateId, ...data, createdBy: actor.id },
    update: data,
  });

  await recordAuditLog({
    userId: actor.id,
    action: existing ? "update" : "create",
    tableName: "CompanyObligationOverride",
    recordId: row.id,
    oldData: existing ? { action: existing.action, reason: existing.reason } : undefined,
    newData: { companyId: input.companyId, templateId: input.templateId, ...data },
  });

  revalidateTag("obligations", "max");
  return serialize(row);
}

/**
 * Istisnoni olib tashlash.
 *
 * KELAJAKDAGI majburiyatlarga ta'sir qiladi: generator keyingi ishga
 * tushishida yana yaratadi. O'TGAN davrlar TEGILMAYDI — tarix o'zgarmaydi.
 */
export async function removeObligationOverride(id: string) {
  const actor = await requireSenior();
  const row = await prisma.companyObligationOverride.findUnique({
    where: { id },
    select: { id: true, companyId: true, templateId: true, action: true, reason: true },
  });
  if (!row) throw new Error("Istisno topilmadi");
  await assertCompanyInScope(actor, row.companyId);

  await prisma.companyObligationOverride.delete({ where: { id } });
  await recordAuditLog({
    userId: actor.id,
    action: "delete",
    tableName: "CompanyObligationOverride",
    recordId: id,
    oldData: { companyId: row.companyId, templateId: row.templateId, action: row.action, reason: row.reason },
  });

  revalidateTag("obligations", "max");
  return { ok: true };
}
