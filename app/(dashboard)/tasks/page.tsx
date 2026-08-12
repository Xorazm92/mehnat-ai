import { redirect } from "next/navigation";

/**
 * `/tasks` — birlashgan "Ishlar" ekranining vazifalar yorlig'i.
 *
 * Ilgari bu sahifa AYNAN o'sha komponentni ikkinchi manzilda qaytadan
 * chizardi. Ikki manzil bitta ekranni ko'rsatganda yorliq almashtirish
 * qaysi manzilda turganingizga qarab boshqacha URL yozardi
 * (`/tasks?tab=mine` va `/deadlines?tab=mine` — bir xil ko'rinish, ikki
 * havola). Endi yorliq manzilga ega, shuning uchun kanonik bittasiga
 * yo'naltiriladi.
 *
 * Yo'l saqlanadi: eski havolalar, bildirishnomalar va RBAC `tasks` view'i
 * ishlashda davom etadi.
 */
export default function TasksPage() {
  redirect("/deadlines?tab=tasks");
}
