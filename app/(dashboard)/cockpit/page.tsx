import { redirect } from "next/navigation";

/**
 * `/cockpit` — endi mustaqil ekran EMAS.
 *
 * U "Boshqaruv paneli"ning ikkinchi nusxasi bo'lib qolgan edi: menyuda
 * ikkita "uy" turardi ("Boshqaruv paneli" va "Kabina") va foydalanuvchi
 * qaysi biridan boshlashni bilmasdi. Ustiga nomi "Mening kabinetim"
 * (`/cabinet`) bilan chalkashardi, holbuki u butunlay boshqa ekran —
 * xodimning o'zi haqidagi sahifa.
 *
 * Endi u `/dashboard` ning "Kokpit" yorlig'i. Yo'l saqlanadi: eski
 * havolalar, bildirishnomalar va `cockpit` RBAC view'i ishlashda davom
 * etadi — `lib/routeViews.ts` dagi `/cockpit` → `cockpit` satri ataylab
 * qoldirilgan, shunda ruxsatsiz rol yo'naltirilishdan OLDIN to'siladi.
 *
 * Naqsh `app/(dashboard)/tasks/page.tsx` bilan bir xil.
 */
export default function CockpitPage() {
  redirect("/dashboard?tab=kokpit");
}
