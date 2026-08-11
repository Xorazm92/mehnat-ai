"use server";

// =====================================================
// PUL MANBALARI — xarajat/kassa yozuvi qaysi hisobdan chiqdi
// =====================================================
//
// ASRO'da pul ikki joydan harakatlanadi:
//   • o'z firmaning bank hisobi (schyot)  → `own_firm_account`
//   • xodimga berilgan plastik karta      → `employee_card`
//
// Ikkalasi ham `DisbursementChannel` da yashaydi — jadval buni boshidanoq
// nazarda tutgan (`KassaEntry.channelId` izohiga qarang: "o'z bank hisobi,
// naqd, plastik yoki xodim kartasi"). Shuning uchun yangi jadval qurilmadi:
// bitta `channelId` ikkala turni ham qamraydi va manba bo'yicha qoldiq
// hisoblash imkonini beradi.
//
// Bu modul YAGONA ro'yxat manbai: xarajat formasi ham, kirim/chiqim kassa ham
// shu yerdan oziqlanadi. Aks holda uch joyda uch xil filtr paydo bo'lardi.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isFinanceRole } from "@/lib/permissions";

export type FundingSourceKind = "own_firm_account" | "employee_card";

export interface FundingSource {
  id: string;
  kind: FundingSourceKind;
  /** Ro'yxatda ko'rinadigan nom. */
  label: string;
  /** Plastik uchun niqoblangan karta raqami, schyot uchun hisob raqami. */
  detail: string | null;
  /** Qaysi o'z firmaga tegishli (ikkala turda ham bo'lishi mumkin). */
  ownFirmName: string | null;
}

export interface FundingSourceGroups {
  /** Schyot — o'z firmalarning bank hisoblari. */
  accounts: FundingSource[];
  /** Plastik — xodim kartalari. */
  cards: FundingSource[];
}

/**
 * Tanlash uchun faol manbalar, ikki guruhga bo'lingan.
 *
 * Faqat `isActive` kanallar qaytariladi: o'chirilgan kartani yangi xarajatga
 * biriktirib bo'lmaydi, lekin ESKI yozuvlar o'z `channelId` sini saqlab
 * qoladi (shu sabab FK yo'q).
 */
export async function getFundingSources(): Promise<FundingSourceGroups> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isFinanceRole(session.user.role as string)) throw new Error("Forbidden");

  const channels = await prisma.disbursementChannel.findMany({
    where: { isActive: true },
    select: {
      id: true,
      type: true,
      label: true,
      cardMask: true,
      transitAccount: true,
      ownFirm: { select: { name: true } },
    },
    orderBy: [{ type: "asc" }, { label: "asc" }],
  });

  const groups: FundingSourceGroups = { accounts: [], cards: [] };

  for (const c of channels) {
    const item: FundingSource = {
      id: c.id,
      kind: c.type === "own_firm_account" ? "own_firm_account" : "employee_card",
      label: c.label,
      detail: c.type === "own_firm_account" ? c.transitAccount : c.cardMask,
      ownFirmName: c.ownFirm?.name ?? null,
    };
    if (item.kind === "own_firm_account") groups.accounts.push(item);
    else groups.cards.push(item);
  }

  return groups;
}

/**
 * Yozishdan oldingi tekshiruv: kanal mavjud va faolmi.
 *
 * Server tomonda TALAB QILINADI — forma majburiy qilgani yetarli emas, aks
 * holda bitta so'rov bilan manbasiz (yoki o'chirilgan kanalli) xarajat
 * kiritilardi va "pul qayerdan chiqdi" savoli yana javobsiz qolardi.
 */
export async function assertFundingSource(channelId: string): Promise<void> {
  const channel = await prisma.disbursementChannel.findUnique({
    where: { id: channelId },
    select: { id: true, isActive: true, label: true },
  });
  if (!channel) throw new Error("Pul manbai topilmadi");
  if (!channel.isActive) {
    throw new Error(`"${channel.label}" manbai faol emas — boshqasini tanlang`);
  }
}
