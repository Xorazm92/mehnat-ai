import { redirect } from "next/navigation";

/**
 * `/settings` — endi mustaqil ekran EMAS.
 *
 * U `/cabinet` ning kuchsizroq nusxasi edi: bir xil profil formasi (faqat
 * JSHSHIR, jinsi, tug'ilgan sana, ma'lumot va malaka maydonlarisiz) va bir
 * xil parol o'zgartirish. Ikkalasi ham AYNAN bitta server amaliga yozardi
 * (`updateUser` / `changePassword`), ya'ni xodim profilini ikki joyda
 * tahrirlar, lekin bir joyda maydonlarning yarmini ko'rmasdi.
 *
 * Yo'l saqlanadi — eski havolalar, bildirishnomalar va `settings` RBAC
 * view'i sinmasin. Tizim parametrlari admin uchun `/admin/settings` da.
 */
export default function SettingsPage() {
  redirect("/cabinet?tab=profile");
}
