import {
  LayoutDashboard, Building2, Users, FileText, Wallet, Receipt, CreditCard, Calendar, TrendingUp, Bell, ScrollText, UserCircle, Banknote, HandCoins, CalendarClock, ShieldCheck,
  Grid3x3, Trophy, CheckSquare, Settings, User, AlarmClock, Calculator, History, Lock, type LucideIcon,
  Scale, Landmark, Link2, ListChecks,
  Gauge, Package,
} from "lucide-react";
import type { AppView } from "@/lib/platform/permissions";
import { KPI_CONFIG_ROLES, KPI_REVIEW_ROLES } from "@/lib/kpiTabs";

/**
 * NAVIGATSIYA REYESTRI — YAGONA manba.
 *
 * Bungacha ikkita alohida ro'yxat bor edi va ular ajralib ketgandi:
 * `DashboardSidebar` 21 ta manzilni bilardi, `GlobalSearch` esa atigi 10 tasini.
 * Ya'ni Muddatlar, Vazifalar, Rentabellik, Hujjatlar, Inventar, Sozlamalar,
 * Admin va Audit jurnali qidiruvda UMUMAN topilmasdi.
 *
 * Yangi bo'lim qo'shilganda shu yerga bir marta yoziladi — ikkalasi ham oladi.
 */

export type NavGroup = "asosiy" | "moliya" | "boshqa" | "kabinet" | "admin";

/**
 * Menyu ikonkasining rangi — `--nav-*` tokenlaridan biri.
 *
 * DIQQAT: bu ranglar STATUS ranglari EMAS. Yon paneldagi g'ishtrang "Chiqim
 * kassa" ikonkasi "muammo" degani emas — u shunchaki bo'limni ajratadi.
 * Shu sabab palitra alohida (`globals.css` → "Navigatsiya ikonka ranglari")
 * va barcha qiymatlar bir xil yorug'likda: hech bir band boshqasidan
 * shoshilinchroq ko'rinmaydi.
 *
 * Rang MA'NOGA bog'lanadi, tasodifiy emas: pul kiradigan joylar yashil,
 * chiqadigani g'ishtrang, odam bilan bog'liqlari siyohrang va hokazo —
 * shunda bir marta o'rgangan odam ikonkani o'qimay taniydi.
 */
export type NavTint =
  | "blue" | "teal" | "green" | "olive" | "amber" | "clay" | "plum" | "indigo";

/**
 * Ton → CSS o'zgaruvchisi.
 *
 * Ataylab aniq yozilgan xarita, ton nomini CSS o'zgaruvchisiga yopishtirib
 * yasaydigan satr emas: dinamik nom noto'g'ri yozilganda CSS xato bermaydi — ikonka
 * jimgina rangsiz qoladi va buni faqat ko'z bilan payqash mumkin. Xarita
 * esa TypeScript va `designTokens.spec.ts` tekshiruvidan o'tadi.
 */
export const NAV_TINT_VAR: Record<NavTint, string> = {
  blue: "var(--nav-blue)",
  teal: "var(--nav-teal)",
  green: "var(--nav-green)",
  olive: "var(--nav-olive)",
  amber: "var(--nav-amber)",
  clay: "var(--nav-clay)",
  plum: "var(--nav-plum)",
  indigo: "var(--nav-indigo)",
};

export interface NavItem {
  href: string;
  view: AppView;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  tint: NavTint;
  /** Qidiruv uchun qo'shimcha kalit so'zlar (sinonim, ruscha, xato yozilishi) */
  keywords?: string;
  /**
   * Ota bo'limning `href` i — menyuda ichkariga surib chiziladi.
   *
   * Bungacha MOLIYA guruhida "Kassa", "Kirim kassa", "Chiqim kassa" va
   * "Qarzdorlik" to'rtta TENG element bo'lib turardi, garchi oxirgi uchtasi
   * birinchisining ichida bo'lsa ham. Yon paneldagi tekis ro'yxat "kirim
   * kassa" ning "kassa" ga aloqasini ko'rsatmasdi va foydalanuvchi qaysi
   * birini ochishni har safar taxmin qilardi.
   *
   * Ota element ko'rinmasa (masalan nazoratchida faqat "Qarzdorlik" bor),
   * bola element o'z guruhida oddiy element sifatida chiziladi — hech narsa
   * yashirilmaydi.
   */
  parent?: string;
  /**
   * Yon panelda chizilmaydi. Manzil, RBAC view'i, qidiruv va mobil pastki
   * panel o'z kuchida qoladi — element reyestrda turaveradi, faqat yon
   * paneldan chiqariladi.
   *
   * Shaxsiy kabinet uchun kerak: u endi yuqori o'ngdagi foydalanuvchi
   * menyusidan ochiladi, lekin reyestrdan olib tashlansa qidiruv ham, mobil
   * pastki panel ham uni yo'qotadi.
   */
  inSidebar?: false;
}

export const NAV_ITEMS: NavItem[] = [
  // `/cockpit` menyudan olib tashlandi — u shu ekranning "Kokpit" yorlig'i
  // bo'ldi. Ilgari menyuda IKKITA "uy" turardi ("Boshqaruv paneli" va
  // "Kabina") va foydalanuvchi qaysi biridan boshlashni bilmasdi; ustiga
  // "Kabina" nomi "Mening kabinetim" bilan chalkashardi. Manzil o'z kuchida
  // qoladi va `/dashboard?tab=kokpit` ga yo'naltiradi (eski havolalar va
  // `cockpit` RBAC view'i ishlaydi). Yorliqlar `NAV_SECTIONS` da.
  { href: "/dashboard",     view: "dashboard",     label: "Boshqaruv paneli", icon: LayoutDashboard, group: "asosiy",  tint: "blue",  keywords: "dashboard bosh sahifa asosiy kabina kokpit" },
  { href: "/organizations", view: "organizations", label: "Firmalar",         icon: Building2,       group: "asosiy",  tint: "teal",  keywords: "korxona kompaniya mijoz tashkilot" },
  { href: "/staff",         view: "staff",         label: "Xodimlar",         icon: Users,           group: "asosiy",  tint: "plum",  keywords: "hodim kadr jamoa xizmatchi" },
  { href: "/kpi",           view: "kpi",           label: "KPI",              icon: TrendingUp,      group: "asosiy",  tint: "olive",  keywords: "reyting ball ko'rsatkich" },
  // Muddatlar va Vazifalar BIR ekran: ikkovi ham "bajarilishi kerak bo'lgan ish".
  // Alohida turganda buxgalter bitta ishni ikki joyda belgilardi. Yo'llar
  // saqlanadi (/tasks — o'sha ekranning vazifalar yorlig'i), menyuda esa bitta
  // kirish nuqtasi.
  { href: "/deadlines",     view: "deadlines",     label: "Ishlar",           icon: CalendarClock,   group: "asosiy",  tint: "amber",  keywords: "muddat deadline kechikish vazifa topshiriq task majburiyat ish" },
  // Bank kabineti SHAXSIY kabinet emas — u bank-klient xodimining ish ekrani
  // (kirim/chiqim kartalari + muddatlar vidjeti), shu bois MOLIYA guruhida va
  // shu rolning boshlang'ich ekrani sifatida guruh boshida turadi.
  { href: "/cabinet/bank",  view: "cabinet_bank",  label: "Bank kabineti",    icon: Banknote,        group: "moliya",  tint: "green", keywords: "bank klient" },
  { href: "/reports",       view: "reports",       label: "Hisobotlar",       icon: FileText,        group: "moliya",  tint: "blue",  keywords: "hisobot matritsa report" },
  { href: "/kassa",         view: "kassa",         label: "Kassa",            icon: Wallet,          group: "moliya",  tint: "green",  keywords: "kirim to'lov naqd" },
  { href: "/kassa/kirim",   view: "kassa_income",  label: "Kirim kassa",      icon: Banknote,        group: "moliya",  tint: "green",  parent: "/kassa", keywords: "vipiska bank kirim tushum vypiska plastik" },
  { href: "/kassa/chiqim",  view: "kassa_expense", label: "Chiqim kassa",     icon: CreditCard,      group: "moliya",  tint: "clay",  parent: "/kassa", keywords: "rasxod chiqim tranzit karta xodim kanal" },
  { href: "/kassa/qarzdorlik", view: "kassa_debt",  label: "Qarzdorlik",       icon: HandCoins,       group: "moliya",  tint: "amber",  parent: "/kassa", keywords: "qarz debitor 1c zadolzhennost" },
  { href: "/kassa/sverka",  view: "kassa_sverka",  label: "Kassa–bank sverka", icon: Scale,       group: "moliya",  tint: "teal",  parent: "/kassa", keywords: "sverka kassa apparat terminal ekvayring pos fiskal chek" },
  // `/expenses` `Kassa → Chiqim`ning "Xarajat" tabiga birlashtirildi (ikkalasi
  // bir xil `KassaEntry` jadvaliga yozardi). Bu yorliq faqat `kassa_expense`
  // YO'Q, `expenses`i BOR rollarga (Nazoratchi, Bosh buxgalter) kerak — ular
  // "Chiqim kassa" yorlig'ini (u `kassa_expense` talab qiladi) ko'rmaydi.
  // Ikkala ruxsat ham bor rolda (Admin, Bank-klient) ikkala yorliq ham
  // ko'rinadi va bir joyga olib boradi — kichik ortiqcha, lekin xato emas.
  { href: "/kassa/chiqim?tab=xarajat", view: "expenses", label: "Xarajatlar", icon: Receipt, group: "moliya", tint: "clay", parent: "/kassa", keywords: "chiqim xarajat rasxod" },
  { href: "/payroll",       view: "payroll",       label: "Oylik",            icon: CreditCard,      group: "moliya",  tint: "olive",  keywords: "maosh zarplata avans" },
  { href: "/attendance",    view: "attendance",    label: "Davomat",          icon: Calendar,        group: "boshqa",  tint: "indigo",  keywords: "kelish ketish tabel" },
  { href: "/notifications", view: "notifications", label: "Xabarlar",         icon: Bell,            group: "boshqa",  tint: "amber",  keywords: "bildirishnoma xabar" },
  // `inSidebar: false` — shaxsga oid hamma narsa endi BITTA joyda: yuqori
  // o'ngdagi avatar menyusida. Ilgari bitta profil uchun to'rtta kirish
  // nuqtasi bor edi (yon panel guruhi, tishli ikonka, avatar menyusi va yon
  // panel pastidagi o'lik kartochka) va xodim qaysi biri "haqiqiy" ekanini
  // bilmasdi. Reyestrda esa qoladi — qidiruv va mobil pastki panel shu
  // yozuvdan oziqlanadi.
  { href: "/cabinet",       view: "cabinet",       label: "Mening kabinetim", icon: UserCircle,      group: "kabinet", tint: "plum", inSidebar: false, keywords: "profil shaxsiy kabinet" },
  { href: "/admin",         view: "admin",         label: "Admin panel",      icon: ShieldCheck,     group: "admin",   tint: "blue",   keywords: "admin sozlash boshqaruv" },
  // `/settings` menyudan olib tashlandi — u `/cabinet` ning KUCHSIZROQ
  // nusxasi edi: bir xil profil formasi va bir xil parol o'zgartirish, faqat
  // JSHSHIR/jinsi/tug'ilgan sana/ma'lumot maydonlarisiz. Ikkita joyda bitta
  // profilni tahrirlash — xodim qaysi biri "haqiqiy" ekanini bilmasdi.
  // Manzil o'z kuchida qoladi va `/cabinet?tab=profile` ga yo'naltiradi
  // (eski havolalar, `settings` RBAC view'i va bildirishnomalar ishlaydi).
  // Tizim parametrlari admin uchun `/admin/settings` da.
];

/**
 * SAHIFA ICHIDAGI BO'LIMLAR — qidiruv uchun.
 *
 * Yorliqlar endi manzilga ega (`?tab=`), ya'ni ularga to'g'ridan-to'g'ri
 * o'tish mumkin. Bungacha "matritsa" deb qidirgan odam "Hisobotlar"
 * sahifasini topardi va u yerdan yorliqni QO'LDA topishi kerak edi —
 * holbuki u aynan matritsani so'ragan edi.
 *
 * `roles` berilgan bo'lsa — bo'lim faqat o'sha rollarda ko'rinadi (yorliqning
 * o'zi ham shu chegara bilan chiziladi). Ruxsatning asosiy chegarasi esa
 * `view`: uni ko'rmaydigan rol bo'limni ham ko'rmaydi.
 */
export interface NavSection {
  href: string;
  view: AppView;
  /** Qaysi ekran ichida — natijada "Hisobotlar · Amallar matritsasi" deb chiqadi. */
  parentLabel: string;
  label: string;
  icon: LucideIcon;
  keywords?: string;
  roles?: readonly string[];
}

export const NAV_SECTIONS: NavSection[] = [
  { href: "/dashboard?tab=holat",    view: "dashboard", parentLabel: "Boshqaruv paneli", label: "Holat",  icon: LayoutDashboard, keywords: "bosh sahifa kabinet ko'rsatkich kunlik" },
  { href: "/dashboard?tab=kokpit",   view: "cockpit",   parentLabel: "Boshqaruv paneli", label: "Kokpit", icon: Gauge,           keywords: "cockpit kabina direktor xavf yuklama timeline twin sig'im" },

  { href: "/reports?tab=matrix",     view: "reports",   parentLabel: "Hisobotlar", label: "Amallar matritsasi",   icon: Grid3x3,      keywords: "matritsa amallar jadval topshirish holat" },
  { href: "/reports?tab=reports",    view: "reports",   parentLabel: "Hisobotlar", label: "Moliyaviy hisobotlar", icon: FileText,     keywords: "foyda zarar hujjat balans" },

  { href: "/kpi?tab=mine",           view: "kpi",       parentLabel: "KPI",        label: "Mening KPI'm",         icon: User,         keywords: "shaxsiy ball topshirish ko'rsatkich" },
  { href: "/kpi?tab=nazoratchi",     view: "kpi",       parentLabel: "KPI",        label: "Baholash",             icon: CheckSquare,  keywords: "nazoratchi baho tasdiqlash checklist", roles: KPI_REVIEW_ROLES },
  { href: "/kpi?tab=reyting",        view: "kpi",       parentLabel: "KPI",        label: "Reyting",              icon: Trophy,       keywords: "reyting leaderboard o'rin" },
  { href: "/kpi?tab=rules",          view: "kpi",       parentLabel: "KPI",        label: "KPI qoidalari",        icon: Settings,     keywords: "qoida koeffitsient sozlash rule", roles: KPI_CONFIG_ROLES },

  // KASSA SUB-YORLIQLARI. Ular `?tab=` da yashaydi va SERVERDA o'qiladi
  // (`readTabParam`), ya'ni havola qilinadigan holat — lekin global
  // qidiruvda topilmasdi: "bog'lash kerak" yoki "undirish" deb qidirgan
  // foydalanuvchi avval bo'limni, keyin yorliqni qo'lda topishi kerak edi.
  { href: "/kassa/kirim?tab=reyestr",       view: "kassa_income",  parentLabel: "Kirim kassa",  label: "Barcha tushum",     icon: Banknote,   keywords: "reyestr tushum kirim ro'yxat bank plastik naqd" },
  { href: "/kassa/kirim?tab=hisoblar",      view: "kassa_income",  parentLabel: "Kirim kassa",  label: "Firma hisoblari",   icon: Landmark,   keywords: "hisob schyot bank o'z firma vipiska" },
  { href: "/kassa/kirim?tab=navbat",        view: "kassa_income",  parentLabel: "Kirim kassa",  label: "Bog'lash kerak",    icon: Link2,      keywords: "moslashtirilmagan bog'lanmagan navbat nomsiz tushum" },

  { href: "/kassa/chiqim?tab=navbat",       view: "kassa_expense", parentLabel: "Chiqim kassa", label: "Yopish kerak",      icon: ListChecks, keywords: "navbat toifalash vipiska chiqim yopish" },
  { href: "/kassa/chiqim?tab=kartalar",     view: "kassa_expense", parentLabel: "Chiqim kassa", label: "Xodim kartalari",   icon: CreditCard, keywords: "tranzit karta kanal qoldiq xodim" },
  { href: "/kassa/chiqim?tab=xojalik",      view: "kassa_expense", parentLabel: "Chiqim kassa", label: "Xo'jalik xarajati", icon: Receipt,    keywords: "ovqat taksi non kundalik xo'jalik" },

  { href: "/kassa/qarzdorlik?tab=undirish", view: "kassa_debt",    parentLabel: "Qarzdorlik",   label: "Undirish",          icon: HandCoins,  keywords: "undirish qarzdor gaplashish navbat qo'ng'iroq" },
  { href: "/kassa/qarzdorlik?tab=holat",    view: "kassa_debt",    parentLabel: "Qarzdorlik",   label: "Hisob-kitob",       icon: Scale,      keywords: "hisob kitob varaqa 1c kesim qarz avans" },
  { href: "/kassa/qarzdorlik?tab=tolovlar", view: "kassa_debt",    parentLabel: "Qarzdorlik",   label: "To'lovlar",         icon: Wallet,     keywords: "to'lov oylik firma payment" },
  { href: "/kassa/qarzdorlik?tab=tekshiruv",view: "kassa_debt",    parentLabel: "Qarzdorlik",   label: "Tekshiruv",         icon: ShieldCheck,keywords: "sverka import nomuvofiqlik 1c solishtirish reja fakt" },

  { href: "/kassa/sverka?tab=terminals",    view: "kassa_sverka",  parentLabel: "Sverka",       label: "Terminallar",       icon: CreditCard, keywords: "terminal doira ekvayring uzcard humo" },
  { href: "/kassa/sverka?tab=devices",      view: "kassa_sverka",  parentLabel: "Sverka",       label: "Kassa apparatlari", icon: Receipt,    keywords: "apparat fiskal fm raqam kunlik hisobot" },

  { href: "/payroll?tab=drafts",     view: "payroll",   parentLabel: "Oylik",      label: "Oylik hisoblash",      icon: Calculator,   keywords: "qoralama hisoblash maosh draft" },
  { href: "/payroll?tab=history",    view: "payroll",   parentLabel: "Oylik",      label: "To'lovlar tarixi",     icon: History,      keywords: "tarix to'lov to'langan" },

  { href: "/deadlines?tab=overdue",  view: "deadlines", parentLabel: "Ishlar",     label: "Muddati o'tgan",       icon: AlarmClock,   keywords: "kechikkan muddat overdue prosrochka" },
  { href: "/deadlines?tab=mine",     view: "deadlines", parentLabel: "Ishlar",     label: "Mening ishlarim",      icon: UserCircle,   keywords: "mening menga biriktirilgan" },
  // `view: "deadlines"` — manzil o'sha ekran, ruxsat ham o'shanikidan.
  { href: "/deadlines?tab=tasks",    view: "deadlines", parentLabel: "Ishlar",     label: "Vazifalar",            icon: CheckSquare,  keywords: "vazifa topshiriq task" },

  { href: "/cabinet?tab=kpi",        view: "cabinet",   parentLabel: "Kabinet",    label: "KPI va oyligim",       icon: TrendingUp,   keywords: "mening oyligim maosh ball" },
  { href: "/cabinet?tab=companies",  view: "cabinet",   parentLabel: "Kabinet",    label: "Firmalarim",           icon: Building2,    keywords: "biriktirilgan firma mening" },
  { href: "/cabinet?tab=attendance", view: "cabinet",   parentLabel: "Kabinet",    label: "Davomatim",            icon: Calendar,     keywords: "kelish ketish tabel mening" },
  { href: "/cabinet?tab=profile",    view: "cabinet",   parentLabel: "Kabinet",    label: "Profil",               icon: User,         keywords: "profil sozlama settings shaxsiy ma'lumot" },
  { href: "/cabinet?tab=security",   view: "cabinet",   parentLabel: "Kabinet",    label: "Parolni o'zgartirish", icon: Lock,         keywords: "parol xavfsizlik password parol almashtirish" },
];

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  asosiy: "ASOSIY",
  moliya: "MOLIYA",
  boshqa: "BOSHQA",
  kabinet: "KABINET",
  admin: "ADMIN",
};

/**
 * MOBIL PASTKI PANEL — muhimlik tartibi. Rol ko'ra oladigan birinchi TO'RTTASI
 * chiziladi, beshinchi joyni "Yana" (to'liq menyu) egallaydi.
 *
 * Bu ro'yxat faqat TARTIBNI belgilaydi; manzil, ikonka va ruxsat `NAV_ITEMS`
 * dan olinadi. Ilgari `MobileBottomNav` bularning hammasini o'zida qaytadan
 * yozgan edi.
 */
export const MOBILE_NAV_ORDER: AppView[] = [
  "dashboard",
  "cabinet",
  "cabinet_bank",
  "deadlines",
  "reports",
  "organizations",
  "kpi",
  "kassa",
  "expenses",
  "notifications",
];

/** 60px balandlikdagi panelga sig'maydigan yorliqlarning qisqa shakli. */
export const MOBILE_NAV_SHORT_LABELS: Partial<Record<AppView, string>> = {
  dashboard: "Bosh",
  cabinet: "Kabinet",
  cabinet_bank: "Bank",
  reports: "Hisobot",
  organizations: "Firma",
  expenses: "Xarajat",
  notifications: "Xabar",
  kassa_income: "Kirim",
  kassa_expense: "Chiqim",
};
