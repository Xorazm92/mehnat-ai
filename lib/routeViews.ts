import type { AppView } from "@/lib/permissions";

/**
 * MANZIL → EKRAN (view) XARITASI — yagona manba.
 *
 * Ilgari bu xarita faqat `proxy.ts` ichida edi. Natijada UI ning boshqa
 * qismlari "bu manzilni ocha olamanmi?" degan savolga javob bera olmasdi —
 * `Breadcrumbs` masalan har bir yo'l bo'lagini shartsiz havola qilardi va
 * bank-klient `/kassa/kirim` da turganda ocholmaydigan "Kassa" havolasini
 * ko'rardi. Next uni prefetch qilar, proxy esa `/403` ga otardi.
 *
 * Tartib MUHIM: aniqroq prefiks umumiyroqdan OLDIN tekshiriladi
 * (`/kassa/kirim` — `/kassa` dan oldin), aks holda kirim kassasi butun
 * kassa ruxsatini talab qilib qolardi.
 */
export function pathToView(path: string): AppView | null {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/audit-logs")) return "audit_logs";
  if (path.startsWith("/organizations")) return "organizations";
  if (path.startsWith("/staff")) return "staff";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/deadlines")) return "deadlines";
  if (path.startsWith("/tasks")) return "tasks";
  if (path.startsWith("/kpi")) return "kpi";
  // Kirim kassasi ALOHIDA view: bank-klient faqat shuni ko'radi, chiqimni emas.
  // /kassa dan OLDIN tekshiriladi — prefiks mos kelib qolmasin.
  if (path.startsWith("/kassa/kirim")) return "kassa_income";
  if (path.startsWith("/kassa/chiqim")) return "kassa_expense";
  if (path.startsWith("/kassa/qarzdorlik")) return "kassa_debt";
  if (path.startsWith("/kassa")) return "kassa";
  if (path.startsWith("/expenses")) return "expenses";
  if (path.startsWith("/payroll")) return "payroll";
  if (path.startsWith("/attendance")) return "attendance";
  if (path.startsWith("/notifications")) return "notifications";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/cabinet/bank")) return "cabinet_bank";
  if (path.startsWith("/cabinet")) return "cabinet";
  if (path.startsWith("/dashboard")) return "dashboard";
  // Telegram Mini App ekranlari — mavjud view ruxsatlaridan foydalanadi, ya'ni
  // botdagi ekran ham, veb sahifa ham bir xil RBAC bilan qo'riqlanadi.
  if (path.startsWith("/telegram-app/proof")) return "reports";
  if (path.startsWith("/telegram-app/dashboard")) return "dashboard";
  return null;
}
