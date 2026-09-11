// O'Z FIRMA HISOBIGA MOS PUL KANALI — ikki yozuv yo'li uchun umumiy.
//
// NEGA ALOHIDA MODUL. Bu yordamchi `commitStatementUpload` (avto-post) va
// `matchAndPostTransaction` (qo'lda post) — IKKALA yo'lda ham kerak. Bo'linishdan
// oldin ular bitta faylda yashardi, shuning uchun bog'liqlik ko'rinmasdi.
// Nusxa ko'chirilsa, ikkita kesh paydo bo'lardi va biri boshqasidan eskirardi.
//
// NEGA "use server" EMAS. Bu server action emas, ichki yordamchi: uni mijozdan
// chaqirib bo'lmaydi va chaqirilmasligi ham kerak. `"use server"` faylida har
// bir eksport tarmoq chegarasiga aylanadi — bu yerda bunga hojat yo'q.

import { prisma } from "@/lib/prisma";

/**
 * Jarayon umri davomida yashaydigan kesh.
 *
 * Xavfsiz, chunki javob deyarli o'zgarmas ma'lumot: o'z firmaning bank
 * kanali bir marta yaratiladi va import davomida o'zgarmaydi. Vipiskada
 * yuzlab qator bo'lishi mumkin, keshsiz har qator uchun alohida so'rov
 * ketardi.
 */
const cache = new Map<string, string | null>();

export async function resolveOwnAccountChannel(ownerCompanyId: string): Promise<string | null> {
  if (cache.has(ownerCompanyId)) return cache.get(ownerCompanyId)!;
  const ch = await prisma.disbursementChannel.findFirst({
    where: { type: "own_firm_account", ownFirmId: ownerCompanyId, isActive: true },
    select: { id: true },
  });
  const id = ch?.id ?? null;
  cache.set(ownerCompanyId, id);
  return id;
}
