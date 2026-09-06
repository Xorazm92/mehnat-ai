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
import { serialize } from "@/lib/serialize";
import type { Actor } from "@/lib/platform/access";
import { runPersistRiskLevels } from "@/lib/domains/accounting/twinPersistRun";
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
 * Hisoblangan xavfni `Company.riskLevel` ga yozadi — ekrandagi tugma yo'li.
 *
 * Mantiqning O'ZI `lib/domains/accounting/twinPersistRun.ts` da: u kechalik
 * BullMQ ishchisidan ham chaqiriladi va u yerda sessiya YO'Q. Ikki nusxa kod
 * yozilsa, biri o'zgarganda ikkinchisi jimgina eskirardi va ekrandagi tugma
 * bilan kechalik yurish boshqa-boshqa natija berardi.
 */
export async function persistRiskLevels(period: string) {
  const actor = await requireActor();
  // `auditUserId` berilmaydi ⇒ `actor.id`: tugmani bosgan odam.
  return serialize(await runPersistRiskLevels(prisma, { actor, period }));
}
