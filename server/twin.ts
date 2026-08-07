"use server";

// =====================================================
// DIGITAL TWIN — sessiya darvozasi (C1)
// =====================================================
// Hisoblashning o'zi `lib/domains/accounting/twinCompute.ts` da va u
// SESSIYAGA BOG'LIQ EMAS: aktyorni argument sifatida oladi. Sabab — bir xil
// ballar ikki joyda kerak: ekranda (sessiya bor) va ogohlantirish ishchisida
// (sessiya yo'q). Ikki nusxa kod yozilsa, ular albatta ajralib ketardi va
// direktor ekranda bir raqamni, Telegramda boshqasini ko'rardi.
//
// Bu fayl faqat kim so'rayotganini aniqlaydi va natijani seriyalaydi.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { serialize } from "@/lib/serialize";
import type { Actor } from "@/lib/platform/access";
import {
  computeCompanyTwins,
  computeStaffCapacity,
  type CompanyTwin,
  type StaffCapacity,
} from "@/lib/domains/accounting/twinCompute";

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id as string, role: session.user.role as string };
}

export async function getStaffCapacity(period: string): Promise<StaffCapacity[]> {
  return computeStaffCapacity(prisma, await requireActor(), period);
}

export async function getCompanyTwins(period: string): Promise<CompanyTwin[]> {
  return computeCompanyTwins(prisma, await requireActor(), period);
}

/**
 * Hisoblangan xavfni `Company.riskLevel` ga yozadi.
 *
 * O'ZGARGANLARNIGINA yozadi — 213 ta yozuv o'rniga bir nechta, va audit izi
 * shovqinga aylanmaydi. `unknown` (majburiyati yo'q firma) TEGILMAYDI: uni
 * `low` ga tushirish "xavfsiz" degan yolg'on bo'lardi.
 */
export async function persistRiskLevels(period: string) {
  const actor = await requireActor();
  const twins = await computeCompanyTwins(prisma, actor, period);

  const current = await prisma.company.findMany({
    where: { id: { in: twins.map((t) => t.companyId) } },
    select: { id: true, riskLevel: true },
  });
  const was = new Map(current.map((c) => [c.id, c.riskLevel]));

  let updated = 0;
  for (const t of twins) {
    if (t.risk.level === "unknown") continue;
    if (was.get(t.companyId) === t.risk.level) continue;
    await prisma.company.update({
      where: { id: t.companyId },
      data: { riskLevel: t.risk.level, riskNotes: t.explanation },
    });
    updated++;
  }

  if (updated > 0) {
    await recordAuditLog({
      userId: actor.id,
      action: "update",
      tableName: "Company",
      recordId: `twin:${period}`,
      newData: { period, updated },
    });
  }
  return serialize({ period, considered: twins.length, updated });
}
