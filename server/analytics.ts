"use server";

// =====================================================
// FOYDALANISH O'LCHOVI — sessiya darvozasi (M4.2)
// =====================================================
// Yozuvchining o'zi `lib/engines/analytics/logEvent.ts` da va u sessiyaga
// bog'liq emas. Bu fayl faqat kim so'rayotganini aniqlaydi.
//
// TASHRIF O'ZI KO'RA OLADIGAN EKRAN UCHUNGINA YOZILADI. Aks holda o'lchov
// yolg'on bo'lardi: ruxsati yo'q odam `?tab=kokpit` deb yozib, "kokpitga
// kirdim" hodisasini yaratib qo'yardi va haftalik hisob shishardi.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentUserViews } from "@/server/rbac";
import { canDirectorCockpit } from "@/lib/platform/permissions";
import { logEvent, ANALYTICS_KINDS } from "@/lib/engines/analytics/logEvent";

export type CockpitVisitKind = "kokpit" | "director";

/**
 * Kokpit tashrifi.
 *
 * `tab` — mijoz nima ochganini AYTADI, lekin unga ISHONILMAYDI: qaysi hodisa
 * yozilishini server o'zi hal qiladi. Direktor bo'lmagan foydalanuvchi
 * `"director"` deb yuborsa ham, oddiy `cockpit_visit` yoziladi — ya'ni
 * "direktor tashrifi" hisobini mijoz shishira olmaydi.
 */
export async function recordCockpitVisit(tab: CockpitVisitKind): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  const views = await currentUserViews();

  // Kokpitni umuman ko'ra olmaydigan rol hodisa ham yozmaydi.
  if (!views.includes("cockpit")) {
    throw new Error("Ruxsat yo'q: kokpit ko'rinishi berilmagan");
  }

  const isDirector = canDirectorCockpit(role, views);
  const kind =
    tab === "director" && isDirector
      ? ANALYTICS_KINDS.directorCockpitVisit
      : ANALYTICS_KINDS.cockpitVisit;

  await logEvent(prisma, {
    kind,
    actor: { id: session.user.id as string, role },
    metadata: { tab },
  });

  return { ok: true };
}
