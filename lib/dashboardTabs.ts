/**
 * "Boshqaruv paneli" ekranining yorliq reyestri.
 *
 * Nega alohida fayl (`lib/kirimTabs.ts` bilan bir xil sabab): sahifa server
 * komponenti va `?tab=` ni SERVERDA tekshirishi kerak, `DashboardTabs` esa
 * `"use client"` — undan eksport qilingan ro'yxatni server chaqira olmaydi.
 *
 * `kokpit` yorlig'i ILGARI mustaqil `/cockpit` marshruti edi. Menyuda ikkita
 * "bosh ekran" turardi ("Boshqaruv paneli" va "Kabina") va foydalanuvchi
 * qaysi biri uy ekanini bilmasdi; ustiga "Kabina" (`/cockpit`) bilan "Mening
 * kabinetim" (`/cabinet`) nomlari bir-biriga yaqin edi, holbuki ular butunlay
 * boshqa ekranlar. Endi bitta uy, ichida ikki yorliq.
 *
 * DIQQAT: `kokpit` yorlig'i `cockpit` RBAC ko'rinishini talab qiladi va u
 * SAHIFADA tekshiriladi — marshrutda emas, chunki marshrut endi umumiy
 * (`/dashboard`).
 *
 * Statik ro'yxatda (`ALLOWED_VIEWS`) `/dashboard` ga kira oladigan to'rtala
 * rolda `cockpit` ham bor, ya'ni bugun yorliq har doim ko'rinadi. Darvoza
 * baribir KERAK: rol→ko'rinish xaritasi admin tomonidan tahrirlanadi
 * (`SystemSetting: "roleViews"`), ya'ni `dashboard` berilib `cockpit`
 * berilmagan rol istalgan payt paydo bo'lishi mumkin. Buxgalter va
 * bank-klientda ikkalasi ham yo'q — ularning uyi `/cabinet`.
 */
export type DashboardTab = "holat" | "kokpit";

export const DASHBOARD_TAB_IDS: readonly DashboardTab[] = ["holat", "kokpit"];

export const DASHBOARD_DEFAULT_TAB: DashboardTab = "holat";
