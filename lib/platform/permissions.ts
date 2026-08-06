// lib/permissions.ts
// Role-based access control — mavjud permissions.ts dan ko'chirildi va yangilandi

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  CHIEF_ACCOUNTANT: "chief_accountant",
  SUPERVISOR: "supervisor",
  ACCOUNTANT: "accountant",
  BANK_MANAGER: "bank_manager",
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export type AppView =
  | "dashboard"
  | "organizations"
  | "staff"
  | "reports"
  | "deadlines"
  | "tasks"
  | "kpi"
  | "kassa"
  | "kassa_income"
  | "kassa_expense"
  | "kassa_debt"
  | "kassa_sverka"
  | "expenses"
  | "cabinet"
  | "cabinet_bank"
  | "payroll"
  | "attendance"
  | "notifications"
  | "settings"
  | "admin";

export type Capability =
  | "view_all_companies"
  | "edit_contracts"
  | "manage_staff"
  | "view_salaries"
  | "approve_kpi"
  | "process_payments"
  | "view_audit_logs"
  | "manage_users"
  | "manage_system"
  | "view_bank_operations"
  | "view_own_kpi"
  | "submit_reports";

export const ROLE_PERMISSIONS: Record<UserRole, Capability[]> = {
  [ROLES.SUPER_ADMIN]: [
    "view_all_companies",
    "edit_contracts",
    "manage_staff",
    "view_salaries",
    "approve_kpi",
    "process_payments",
    "view_audit_logs",
    "manage_users",
    "manage_system",
    "view_bank_operations",
    "view_own_kpi",
    "submit_reports",
  ],
  [ROLES.ADMIN]: [
    "view_all_companies",
    "edit_contracts",
    "manage_staff",
    "view_salaries",
    "approve_kpi",
    "process_payments",
    "view_audit_logs",
    "manage_users",
    "view_bank_operations",
    "view_own_kpi",
    "submit_reports",
  ],
  // "view_all_companies" ATAYLAB yo'q: bosh buxgalter ham o'z portfeliga
  // cheklanadi (chiefAccountantId + boshqaradigan Department).
  [ROLES.CHIEF_ACCOUNTANT]: [
    "manage_staff",
    "view_salaries",
    "approve_kpi",
    "view_own_kpi",
    "submit_reports",
  ],
  // "view_all_companies" ATAYLAB yo'q: nazoratchi faqat o'zi biriktirilgan
  // firmalarni ko'radi (nazorat + buxgalteriya + bank firmalari birlashmasi).
  [ROLES.SUPERVISOR]: [
    "manage_staff",
    "approve_kpi",
    "view_salaries",
    "view_own_kpi",
    "submit_reports",
  ],
  [ROLES.ACCOUNTANT]: [
    "view_own_kpi",
    "submit_reports",
  ],
  [ROLES.BANK_MANAGER]: [
    "process_payments",
    "view_bank_operations",
    "view_own_kpi",
    "submit_reports",
  ],
};

export const ALLOWED_VIEWS: Record<UserRole, AppView[]> = {
  [ROLES.SUPER_ADMIN]: [
    "dashboard",
    "organizations",
    "staff",
    "reports",
    "deadlines",
    "tasks",
    "kpi",
    "kassa",
    "expenses",
    "cabinet",
    "payroll",
    "attendance",
    "notifications",
    "settings",
    "admin",
  ],
  [ROLES.ADMIN]: [
    "dashboard",
    "organizations",
    "staff",
    "reports",
    "deadlines",
    "tasks",
    "kpi",
    "kassa",
    "kassa_income",
    "kassa_expense",
    "kassa_debt",
    "kassa_sverka",
    "expenses",
    "cabinet",
    "payroll",
    "attendance",
    "notifications",
    "settings",
    "admin",
  ],
  [ROLES.CHIEF_ACCOUNTANT]: [
    "dashboard",
    "organizations",
    "staff",
    "reports",
    "deadlines",
    "tasks",
    "kpi",
    "kassa",
    "kassa_income",
    "kassa_debt",
    "expenses",
    "cabinet",
    "payroll",
    "attendance",
    "notifications",
    "settings",
  ],
  [ROLES.SUPERVISOR]: [
    "dashboard",
    "organizations",
    "staff",
    "reports",
    "deadlines",
    "tasks",
    "kpi",
    "kassa_debt",
    "expenses",
    "cabinet",
    "attendance",
    "notifications",
    "settings",
  ],
  [ROLES.ACCOUNTANT]: [
    "cabinet",
    "reports",
    "deadlines",
    "tasks",
    "notifications",
    "settings",
  ],
  // Bank-klient KASSA XODIMI: kirim ham, chiqim ham unda.
  //
  // Ilgari bu yerda faqat `kassa_income` bor edi va izohda "rasxodni faqat
  // admin qiladi" deb yozilgandi. Qoida 2026-08-18 da o'zgardi: kassani
  // kundalik yurituvchi xodim chiqim tomonini ham yozadi.
  //
  // Bu PUL CHIQARISH huquqi EMAS. `/kassa/chiqim` dagi amallar allaqachon
  // sodir bo'lgan harakatni QAYD qiladi: bank pulni o'tkazib bo'lgan, karta
  // xarajati qilingan. Haqiqiy ruxsat qatlami boshqa joyda va o'zgarmadi —
  // xarajat tasdig'i summaga qarab (`lib/expenseApproval.ts`), kanalni
  // muzlatish faqat adminda (`server/transit.ts setChannelActive`).
  //
  // "Firmalar" (organizations) — bank-klient o'zi yuritadigan firmaning
  // bank-klient login/parolini KIRITISHI kerak, u esa firma kartochkasining
  // "Loginlar" tabida yashaydi. Ro'yxat baribir PORTFELGA cheklangan
  // (lib/access.ts companyScopeWhere), yaratish/o'chirish tugmalari esa faqat
  // senior rolda ochiq — ya'ni bu ko'rish yuzasi, huquq kengaytmasi emas.
  [ROLES.BANK_MANAGER]: [
    "cabinet",
    "cabinet_bank",
    "organizations",
    "kassa",
    "kassa_income",
    "kassa_expense",
    "kassa_debt",
    "kassa_sverka",
    "expenses",
    "notifications",
    "settings",
  ],
};

// Rolga mos boshlang'ich yo'nalish (login bo'lgandan keyin)
export const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  [ROLES.SUPER_ADMIN]: "/dashboard",
  [ROLES.ADMIN]: "/dashboard",
  [ROLES.CHIEF_ACCOUNTANT]: "/dashboard",
  [ROLES.SUPERVISOR]: "/dashboard",
  [ROLES.ACCOUNTANT]: "/cabinet",
  [ROLES.BANK_MANAGER]: "/cabinet/bank",
};

// Rol uchun o'zbek nomi
export const ROLE_LABELS: Record<UserRole, string> = {
  [ROLES.SUPER_ADMIN]: "Superadmin",
  [ROLES.ADMIN]: "Admin",
  [ROLES.CHIEF_ACCOUNTANT]: "Bosh Buxgalter",
  [ROLES.SUPERVISOR]: "Nazoratchi",
  [ROLES.ACCOUNTANT]: "Buxgalter",
  [ROLES.BANK_MANAGER]: "Bank-Klient",
};

// Rol uchun rang (badge)
export const ROLE_COLORS: Record<UserRole, string> = {
  [ROLES.SUPER_ADMIN]: "#ef4444",  // qizil
  [ROLES.ADMIN]: "#f97316",        // to'q sariq
  [ROLES.CHIEF_ACCOUNTANT]: "#8b5cf6", // binafsha
  [ROLES.SUPERVISOR]: "#3b82f6",   // ko'k
  [ROLES.ACCOUNTANT]: "#10b981",   // yashil
  [ROLES.BANK_MANAGER]: "#06b6d4", // moviy
};

// Barcha view'lar ro'yxati (AppView union bilan mos) — admin RBAC editori uchun
export const ALL_VIEWS: AppView[] = [
  "dashboard",
  "organizations",
  "staff",
  "reports",
  "deadlines",
  "tasks",
  "kpi",
  "kassa",
  "kassa_income",
  "kassa_expense",
  "kassa_debt",
  "kassa_sverka",
  "expenses",
  "cabinet",
  "cabinet_bank",
  "payroll",
  "attendance",
  "notifications",
  "settings",
  "admin",
];

export const VIEW_LABELS: Record<AppView, string> = {
  dashboard: "Boshqaruv paneli",
  organizations: "Firmalar",
  staff: "Xodimlar",
  reports: "Hisobotlar",
  deadlines: "Muddatlar",
  tasks: "Vazifalar",
  kpi: "KPI",
  kassa: "Kassa",
  kassa_income: "Kirim kassa",
  kassa_expense: "Chiqim kassa",
  kassa_debt: "Qarzdorlik",
  kassa_sverka: "Kassa–bank sverka",
  expenses: "Xarajatlar",
  cabinet: "Kabinet",
  cabinet_bank: "Bank kabineti",
  payroll: "Oylik",
  attendance: "Davomat",
  notifications: "Xabarlar",
  settings: "Sozlamalar",
  admin: "Admin panel",
};

// Admin tomonidan tahrirlanadigan rol→view override'lari (SystemSetting: "roleViews")
export type RoleViewOverrides = Partial<Record<UserRole, AppView[]>>;

/**
 * Rol uchun AMALDAGI view'lar: override bo'lsa o'sha, aks holda koddagi default.
 * Bu faqat KO'RINISHNI (menyu/nav) boshqaradi — server xavfsizlik tekshiruvlari
 * (isSeniorRole/isAdminRole/rol massivlari) o'z kuchida qoladi.
 */
/** Firmada odam egallashi mumkin bo'lgan mas'uliyat turlari. */
export type CompanyRelation = "accountant" | "supervisor" | "chief_accountant" | "bank_manager";

/**
 * BIRIKTIRUV BERADIGAN EKRANLAR.
 *
 * `lib/access.ts` da yozilgan qoida: "ROL = nima qila olasan, BIRIKTIRUV =
 * qaysi firmada". Firma RO'YXATI shu qoidaga amal qilardi, sahifa DARVOZASI
 * esa faqat lavozim yorlig'iga qarardi. Natijada bazadagi haqiqiy holat
 * ishlamay qolardi:
 *
 *   · Ruslan — roli `bank_manager` (65 firmada bank-klient), lekin 10 ta
 *     firmada BUXGALTER. O'sha 10 firmada 140 ta majburiyat bor edi, u esa
 *     na "Hisobotlar", na "Ishlar" ekranini ocholmasdi.
 *   · Zamira va Humora — roli `accountant`, lekin 2 tadan firmada bank-klient
 *     slotida turishardi va bank kabinetiga kira olmasdilar.
 *
 * Bu jadval ATAYLAB tor: faqat firma bo'yicha CHEKLANADIGAN ish yuzalari.
 * `staff`, `payroll`, `expenses`, `kassa`, `organizations`, `audit_logs`,
 * `admin` bu yerda YO'Q — ular butun tizim bo'yicha ma'lumot ko'rsatadi yoki
 * boshqaruv funksiyasi, ya'ni ularni bitta firmadagi biriktiruv ochib
 * yubormasligi kerak. Ular faqat lavozim orqali beriladi.
 *
 * Ma'lumot xavfsizligi bu yerda buzilmaydi: ochilgan ekranlarning o'zi
 * `companyScopeWhere` bilan cheklangan, ya'ni Ruslan matritsada faqat o'z
 * portfelini ko'radi.
 */
export const VIEWS_BY_RELATION: Record<CompanyRelation, AppView[]> = {
  accountant: ["reports", "deadlines", "tasks"],
  supervisor: ["reports", "deadlines", "tasks", "kpi"],
  chief_accountant: ["reports", "deadlines", "tasks", "kpi"],
  // "organizations" bu yerda ATAYLAB YO'Q: u boshqaruv ekrani va biriktiruv
  // orqali berilmaydi (yuqoridagi izoh + lib/viewsByRelation.spec.ts). Bank
  // lavozimidagi odam uni LAVOZIMI orqali oladi.
  bank_manager: ["cabinet_bank", "kassa_income"],
};

export const effectiveViewsForRole = (
  role: UserRole,
  overrides?: RoleViewOverrides | null,
  /**
   * Foydalanuvchining HAQIQIY biriktiruvlari (sessiya tokenidan). Berilmasa
   * eski xatti-harakat — faqat lavozim.
   */
  relations?: readonly CompanyRelation[] | null
): AppView[] => {
  // Superadmin hamma narsani ko'radi — hech qachon cheklanmaydi (o'zini bloklamaslik)
  if (role === "super_admin") return ALL_VIEWS;
  const ov = overrides?.[role];
  const base = ov && Array.isArray(ov) ? ov : ALLOWED_VIEWS[role] || [];

  if (!relations?.length) return base;

  // Birlashma: lavozim bergani + biriktiruv bergani. Biriktiruv hech qachon
  // TORAYTIRMAYDI — admin override'i bilan berilgan ekran o'z kuchida qoladi.
  const out = new Set<AppView>(base);
  for (const rel of relations) {
    for (const v of VIEWS_BY_RELATION[rel] ?? []) out.add(v);
  }
  return ALL_VIEWS.filter((v) => out.has(v));
};

export const canSeeView = (role: UserRole, viewId: string): boolean => {
  return ALLOWED_VIEWS[role]?.includes(viewId as AppView) || false;
};

// Override'larni hisobga oluvchi variant (server komponent/gate'lar uchun)
export const canSeeViewWith = (
  role: UserRole,
  viewId: string,
  overrides?: RoleViewOverrides | null,
  relations?: readonly CompanyRelation[] | null
): boolean => {
  return effectiveViewsForRole(role, overrides, relations).includes(viewId as AppView);
};

export const hasPermission = (
  role: UserRole,
  capability: Capability
): boolean => {
  return ROLE_PERMISSIONS[role]?.includes(capability) || false;
};

export const isAdminRole = (role: string): boolean => {
  return (["super_admin", "admin"] as string[]).includes(role);
};

/**
 * "Bu amalni umuman bajara oladimi" — tasdiqlash, xodim boshqarish, oylik ko'rish.
 *
 * DIQQAT: bu predikat "qaysi FIRMALARNI ko'radi" degan savolga javob BERMAYDI.
 * Firma ro'yxati faqat biriktiruvdan kelib chiqadi — lib/access.ts
 * `companyScopeWhere`. Ilgari shu ikkisi chalkashtirilgani uchun nazoratchi
 * tizimdagi barcha firmalarni ko'rardi.
 */
/**
 * MOLIYA ROLLARI — kassa, xarajat va pul manbalariga kirish chegarasi.
 *
 * Nazoratchi bu ro'yxatda ATAYLAB yo'q: u moliya roli emas. Buxgalter ham
 * yo'q — u xarajatni o'zi kiritib, o'zi avto-tasdiqlay olmasligi kerak.
 * Ilgari bu ro'yxat `server/kassa.ts` ichida yashiringan edi; manba tanlash
 * qatlami ham xuddi shu chegarani talab qilgani uchun bu yerga ko'chirildi.
 */
export const FINANCE_ROLES: string[] = ["super_admin", "admin", "chief_accountant", "bank_manager"];
export const isFinanceRole = (role: string): boolean => FINANCE_ROLES.includes(role);

export const isSeniorRole = (role: string): boolean => {
  return (["super_admin", "admin", "chief_accountant", "supervisor"] as string[]).includes(role);
};

/** Firma ro'yxati cheklanmaydigan rollar — faqat admin. */
export const canSeeAllCompanies = (role: string): boolean => isAdminRole(role);

export const getHomeRoute = (role: string): string => {
  return ROLE_HOME_ROUTES[role as UserRole] || "/dashboard";
};

// ─────────────────────────────────────────────
// FIRMAGA BIRIKTIRISH ROLLARI
// ─────────────────────────────────────────────
//
// `ContractAssignment.role` tarixan ikki xil imloda yozilgan:
// wizard 'chief' / 'controller', drawer esa 'chief_accountant' / 'supervisor'.
// Natijada bitta firmada ikkita faol bosh buxgalter qatori qolib ketardi
// (server/companies.ts dedupe'i `role` satri bo'yicha qidiradi).
// Shu sababli KANONIK qiymat bittaga keltirildi va hamma joyda
// `normalizeAssignmentRole` orqali o'tkaziladi.

/**
 * Firmaga biriktiriladigan rollar — kanonik imlo.
 *
 * `sales_manager` KEYIN qo'shildi: shartnomani olib kelgan odamning ulushi
 * (odatda 7%) hech qaysi rolga sig'masdi va qo'lda, oylikdan tashqarida
 * hisoblanardi. U alohida LAVOZIM emas — istalgan lavozimdagi xodim shu
 * o'rinni egallashi mumkin (qarang `staffFitsAssignmentRole`).
 */
export const ASSIGNMENT_ROLES = [
  "accountant",
  "chief_accountant",
  "controller",
  "bank_manager",
  "sales_manager",
] as const;

export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

/** Eski imlolarni kanonik qiymatga keltiradi. */
export const normalizeAssignmentRole = (role: string): AssignmentRole | null => {
  switch (role) {
    case "accountant":
      return "accountant";
    case "chief":
    case "chief_accountant":
      return "chief_accountant";
    case "controller":
    case "supervisor":
      return "controller";
    case "bank_manager":
    case "bank_client":
      return "bank_manager";
    case "sales_manager":
    case "sales":
    case "savdo":
      return "sales_manager";
    default:
      return null;
  }
};

/**
 * Biriktirish roli → shu ish uchun "odatdagi" lavozim.
 *
 * DIQQAT: bu jadval endi dropdown'ni FILTRLAMAYDI (qarang:
 * `staffFitsAssignmentRole`) — u faqat standart tarif preseti va hisobotlarda
 * "kim odatda bu ishni qiladi" ma'nosida qoladi.
 */
// `sales_manager` ATAYLAB yo'q: savdo o'rnining "odatdagi lavozimi" yo'q —
// uni buxgalter ham, rahbar ham egallaydi. `Partial` shuning uchun.
export const ASSIGNMENT_ROLE_TO_USER_ROLE: Partial<Record<AssignmentRole, UserRole>> = {
  accountant: ROLES.ACCOUNTANT,
  chief_accountant: ROLES.CHIEF_ACCOUNTANT,
  controller: ROLES.SUPERVISOR,
  bank_manager: ROLES.BANK_MANAGER,
};

/** Biriktirish roli uchun o'zbekcha sarlavha (UI'da bitta manba). */
export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  accountant: "Buxgalter",
  chief_accountant: "Bosh buxgalter",
  controller: "Nazoratchi",
  bank_manager: "Bank klient",
  sales_manager: "Savdo menejeri",
};

/**
 * Xodim shu biriktirish roliga yaroqlimi — HAR QANDAY xodim yaroqli.
 *
 * LAVOZIM ≠ FIRMADAGI ISH. Bitta odam bir firmada nazoratchi, boshqasida
 * buxgalter, uchinchisida bank-klient bo'ladi. Bazadagi haqiqiy holat:
 *   - Go'zaloy (nazoratchi) — 134 firmada nazorat, 10 tasida BUXGALTER
 *   - Ruslan (bank-klient) — 65 firmada bank, 10 tasida BUXGALTER
 *   - Zamira (buxgalter)   — 16 firmada buxgalter, 16 tasida NAZORATCHI, 2 tasida bank
 *
 * Ilgari bu funksiya har bir o'rinni bitta lavozimga qulflagan edi. Oqibati:
 * (1) yangi firma ochilganda "Buxgalter" ro'yxatida faqat `accountant`
 * lavozimidagilar chiqardi; (2) yuqoridagi mavjud firmalarni ochib SAQLAB ham
 * bo'lmasdi — `normalizeAssignments` "biriktirilmaydi" xatosini tashlardi.
 *
 * Huquq baribir bu yerdan kelmaydi: kim tasdiqlay oladi, kim faqat topshiradi —
 * `lib/reportPermissions.ts` shu firmadagi biriktiruv bo'yicha hal qiladi.
 * Bu yerda faqat "bunday biriktiruv yozilishi mumkinmi" tekshiriladi, va
 * `User` jadvalidagi hamma qator xodim (mijoz roli yo'q).
 */
export const staffFitsAssignmentRole = (
  userRole: string,
  assignmentRole: string
): boolean => {
  void userRole; // lavozim ahamiyatsiz — ataylab
  return normalizeAssignmentRole(assignmentRole) !== null;
};

/**
 * Biriktirish o'rni uchun xodimlar ro'yxati: HAMMASI chiqadi, lekin o'sha ishni
 * odatda bajaradigan lavozim tepada turadi.
 *
 * Ro'yxatni qisqartirish o'rniga tartiblash tanlandi: filtr kerakli odamni
 * butunlay yashirib qo'yardi (aynan shu sabab yangi firma ochganda "Buxgalter"
 * ro'yxatida nazoratchi/bank-klient ko'rinmasdi), tartib esa odatdagi tanlovni
 * bir qadamda qoldiradi.
 */
export const sortStaffForAssignmentRole = <T extends { role: string }>(
  staff: readonly T[],
  assignmentRole: string
): T[] => {
  const canonical = normalizeAssignmentRole(assignmentRole);
  if (!canonical) return [];
  const preferred = ASSIGNMENT_ROLE_TO_USER_ROLE[canonical];
  // `sort` joyida o'zgartiradi — nusxa olamiz, aks holda `staff` prop'i buziladi.
  return [...staff].sort((a, b) => {
    const rank = (r: string) => (r === preferred ? 0 : isAdminRole(r) ? 2 : 1);
    return rank(a.role) - rank(b.role);
  });
};
