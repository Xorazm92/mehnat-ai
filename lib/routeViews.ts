import type { AppView } from "@/lib/platform/permissions";

/**
 * HIMOYALANGAN YO'L PREFIKSLARI.
 *
 * Ilgari bu ro'yxat `proxy.ts` ichida edi va shu sababli TEST QILINMASDI:
 * ro'yxatga sahifa qo'shilmasa ham, xaritaga (`pathToView`) qo'shilmasa ham
 * hech narsa qichqirmasdi. Endi ro'yxat ham, xarita ham bitta faylda va
 * `lib/routeViews.spec.ts` ikkalasining `app/**\/page.tsx` bilan
 * kelishishini majburlaydi.
 *
 * Har bir prefiks `pathToViews` da MOSLIK berishi shart — aks holda
 * fail-closed darvoza haqiqiy foydalanuvchini ham to'sib qo'yadi.
 */
export const PROTECTED_ROUTES: readonly string[] = [
  "/admin",
  "/cockpit",
  "/dashboard",
  "/organizations",
  "/reports",
  "/deadlines",
  "/tasks",
  "/kpi",
  "/payroll",
  "/staff",
  "/cabinet",
  "/expenses",
  "/kassa",
  "/attendance",
  "/notifications",
  "/settings",
];

/**
 * ATAYLAB OCHIQ sahifalar — sessiyasiz ham ochiladi.
 *
 * Bu ro'yxat qisqa va har bandi sababi bilan yozilgan, chunki fail-closed
 * darvozaning yagona teshigi shu yerda: yangi sahifa bexosdan bu ro'yxatga
 * tushib qolsa, u umuman qo'riqlanmaydi.
 */
export const PUBLIC_ROUTES: readonly string[] = [
  "/",              // token bo'lsa bosh sahifaga yo'naltiriladi
  "/login",
  "/403",           // rad javobi sahifasining O'ZI qo'riqlansa — cheksiz sikl
  "/portal",        // mijoz portali: kirish bir martalik token bilan (/api/portal/<token>)
  "/telegram-app",  // Mini App handshake: sessiya AYNAN shu yerda initData bilan tug'iladi
];

/**
 * Bu manzil sessiya talab qiladimi?
 *
 * `/telegram-app` ning O'ZI ochiq (handshake), ostidagi hamma narsa esa
 * himoyalangan — Mini App ekranlari veb sahifalar bilan bir xil RBAC ostida.
 */
export function isProtectedPath(path: string): boolean {
  if (path === "/telegram-app") return false;
  if (path.startsWith("/telegram-app/")) return true;
  return PROTECTED_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}


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
  // Sverka ham ALOHIDA view. Bu satr yo'q edi va `/kassa/sverka` umumiy
  // `kassa` ga tushardi: bosh buxgalterda `kassa` bor, `kassa_sverka` yo'q —
  // proxy uni KIRITAR, sahifaning o'z darvozasi esa `/cabinet` ga QAYTARAR,
  // yon panel o'sha havolani qayta prefetch qilar edi. Faylning tepasidagi
  // izoh aynan shu halqadan ogohlantiradi.
  if (path.startsWith("/kassa/sverka")) return "kassa_sverka";
  if (path.startsWith("/kassa")) return "kassa";
  if (path.startsWith("/expenses")) return "expenses";
  if (path.startsWith("/payroll")) return "payroll";
  if (path.startsWith("/attendance")) return "attendance";
  if (path.startsWith("/notifications")) return "notifications";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/cabinet/bank")) return "cabinet_bank";
  if (path.startsWith("/cabinet")) return "cabinet";
  if (path.startsWith("/dashboard")) return "dashboard";
  // Kabina — `PROTECTED_ROUTES` da bor edi, lekin bu xaritada YO'Q edi.
  // `proxy.ts` `isAllowed` moslik topilmasa RUXSAT BERADI (fail-open), ya'ni
  // buxgalter ham, bank-klient ham marshrutdan bemalol o'tardi. Sahifaning
  // o'z server darvozasi (`currentUserViews`) ularni qaytarardi — ma'lumot
  // ochilmagan — lekin himoyaning bir qavati ishlamay turgan edi.
  if (path.startsWith("/cockpit")) return "cockpit";
  // Telegram Mini App ekranlari — mavjud view ruxsatlaridan foydalanadi, ya'ni
  // botdagi ekran ham, veb sahifa ham bir xil RBAC bilan qo'riqlanadi.
  if (path.startsWith("/telegram-app/proof")) return "reports";
  if (path.startsWith("/telegram-app/dashboard")) return "dashboard";
  return null;
}

/**
 * MANZIL → RUXSAT BERUVCHI KO'RINISHLAR.
 *
 * Ba'zi sahifalar IKKI ko'rinishdan BIRI bilan ochiladi va sahifaning
 * O'ZI shunday yozilgan. Aniq holat — `/kassa/chiqim`:
 *
 *   `kassa_expense` → to'liq sahifa (tranzit kanallar, navbat, kartalar)
 *   `expenses`      → faqat "Xarajat" tabi (Nazoratchi, Bosh buxgalter)
 *
 * Sahifa buni allaqachon to'g'ri bajaradi: `canManageChannels` bo'lmasa
 * kanal so'rovlari umuman yurmaydi va tab almashtirgichning o'zi
 * yashiriladi. Menyu ham ataylab shu manzilga `view: "expenses"` bilan
 * bog'langan.
 *
 * Yagona yetishmagan bo'g'in — proxy edi: u ko'rinishni MANZILDAN qayta
 * hisoblab, faqat `kassa_expense` ni talab qilardi. Natijada nazoratchi
 * menyudagi "Xarajatlar" bandini bosganda har safar 403 olardi —
 * jonli tekshiruvda aynan shunday bo'ldi.
 *
 * Bu yerda ruxsat KENGAYTIRILMAYDI: sahifa allaqachon `expenses` ni
 * qabul qiladi, proxy endi u bilan kelishadi.
 */
export function pathToViews(path: string): AppView[] {
  if (path.startsWith("/kassa/chiqim")) return ["kassa_expense", "expenses"];
  const view = pathToView(path);
  return view ? [view] : [];
}
