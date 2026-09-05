import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ─────────────────────────────────────────────────────────────────
// DIZAYN TIZIMI DARVOZASI — BAZAVIY RO'YXAT (baseline)
//
// Qoida yangi kodga DARHOL tegadi; quyidagi fayllar esa mavjud qarz
// sifatida vaqtincha ozod. Ro'yxat FAYL nomlari bilan yozilgan, ya'ni:
//   • yangi fayl ro'yxatda yo'q → qoida ishlaydi;
//   • eski faylni primitivga ko'chirdingiz → uni ro'yxatdan O'CHIRING,
//     shunda u qayta qarzga tushmaydi.
// Ro'yxat faqat QISQARISHI kerak. O'sishi = regressiya.
// ─────────────────────────────────────────────────────────────────
const RAW_BUTTON_BASELINE = [
  "app/(admin)/admin/business-calendar/BusinessCalendarClient.tsx",
  "app/(admin)/admin/crm/page.tsx",
  "app/(admin)/admin/deadline-templates/DeadlineTemplatesClient.tsx",
  "app/(admin)/admin/invoices/\\[id\\]/InvoiceDocument.tsx",
  "app/(admin)/admin/invoices/InvoicesClient.tsx",
  "app/(admin)/admin/month-closing/MonthClosingClient.tsx",
  "app/(admin)/admin/operation-matrix/OperationMatrixClient.tsx",
  "app/(admin)/admin/services/ServiceCatalogClient.tsx",
  "app/(admin)/admin/settings/AdminSettingsClient.tsx",
  "app/(admin)/error.tsx",
  "app/(auth)/login/page.tsx",
  // Koʻchirildi: `/cockpit` mustaqil marshrut boʻlishdan toʻxtadi va
  // "Boshqaruv paneli"ning yorligʻiga aylandi. Fayl MAZMUNI oʻzgarmadi —
  // faqat yoʻli, shuning uchun roʻyxat UZUNLIGI ham oʻzgarmaydi.
  "components/cockpit/CockpitPanel.tsx",
  "app/(dashboard)/error.tsx",
  "app/(dashboard)/kassa/CashDeskTable.tsx",
  "app/(dashboard)/kassa/chiqim/ExpenseQueue.tsx",
  "app/(dashboard)/kassa/JournalClient.tsx",
  "app/(dashboard)/kassa/PeriodPicker.tsx",
  "app/(dashboard)/kassa/qarzdorlik/DebtStatement.tsx",
  "app/(dashboard)/kassa/qarzdorlik/QarzdorlikClient.tsx",
  "app/(dashboard)/kassa/sverka/SverkaClient.tsx",
  "app/(dashboard)/reports/proof/\\[id\\]/ProofViewClient.tsx",
  "app/global-error.tsx",
  "app/portal/page.tsx",
  "app/telegram-app/proof/ProofUploader.tsx",
  "components/admin/AdminDepartments.tsx",
  "components/admin/AdminTopbar.tsx",
  "components/admin/AdminUserManager.tsx",
  "components/admin/RoleViewEditor.tsx",
  "components/admin/TemplateOverridesPanel.tsx",
  "components/AttendanceModule.tsx",
  "components/BotKpiProjectionButton.tsx",
  "components/BulkAssignModal.tsx",
  "components/cabinets/MyCabinet.tsx",
  "components/CompanyDocumentsPanel.tsx",
  "components/CompanyServicesPanel.tsx",
  "components/DashboardTopBar.tsx",
  "components/DocumentsModule.tsx",
  "components/ErrorBoundary.tsx",
  "components/ExpenseModule.tsx",
  "components/FinanceAssistant.tsx",
  "components/GlobalSearch.tsx",
  "components/HisobotlarModule.tsx",
  "components/ImageZoomModal.tsx",
  "components/KassaModule.tsx",
  "components/kpi/KpiEntryCard.tsx",
  "components/KPIRulesManager.tsx",
  "components/MatrixFilterPanel.tsx",
  "components/MobileBottomNav.tsx",
  "components/MultiRoleSwitcher.tsx",
  "components/NotificationsModule.tsx",
  "components/OnboardingWizard.tsx",
  "components/OperationModule.tsx",
  "components/operation/StatusCell.tsx",
  "components/OrganizationModule.tsx",
  "components/PayrollDrafts.tsx",
  "components/PayrollTable.tsx",
  "components/ReportInsightModal.tsx",
  "components/ReportProofModal.tsx",
  "components/RiskBadge.tsx",
  "components/RoleContextSwitcher.tsx",
  "components/StaffDrawer.tsx",
  "components/StaffModule.tsx",
  "app/(dashboard)/kassa/kirim/KirimKassaClient.tsx",
  "app/(dashboard)/kassa/kirim/IncomeRegister.tsx",
];

const RAW_TABLE_BASELINE = [
  "app/(admin)/admin/business-calendar/BusinessCalendarClient.tsx",
  "app/(admin)/admin/invoices/\\[id\\]/InvoiceDocument.tsx",
  "app/(admin)/admin/invoices/InvoicesClient.tsx",
  "app/(admin)/admin/month-closing/MonthClosingClient.tsx",
  "app/(admin)/admin/services/ServiceCatalogClient.tsx",
  "app/(dashboard)/kassa/CashDeskTable.tsx",
  "app/(dashboard)/kassa/CategoryBreakdown.tsx",
  "app/(dashboard)/kassa/chiqim/ChiqimKassaClient.tsx",
  "app/(dashboard)/kassa/chiqim/ExpenseQueue.tsx",
  "app/(dashboard)/kassa/JournalClient.tsx",
  "app/(dashboard)/kassa/kirim/IncomeRegister.tsx",
  "app/(dashboard)/kassa/kirim/KirimKassaClient.tsx",
  "app/(dashboard)/kassa/qarzdorlik/DebtStatement.tsx",
  "app/(dashboard)/kassa/qarzdorlik/QarzdorlikClient.tsx",
  "app/(dashboard)/kassa/sverka/SverkaClient.tsx",
  "app/(dashboard)/kassa/sverka/SverkaMatrix.tsx",
  "components/admin/AdminUserManager.tsx",
  "components/admin/RolePermissionMatrix.tsx",
  "components/admin/RoleViewEditor.tsx",
  "components/AuditLogModule.tsx",
  "components/cabinets/MyCabinet.tsx",
  "components/CompanyServicesPanel.tsx",
  "components/HisobotlarModule.tsx",
  "components/OperationModule.tsx",
  "components/PayrollDrafts.tsx",
  "components/ShiftCoverPanel.tsx",
];

const RAW_SELECT_BASELINE = [
  "app/telegram-app/proof/ProofUploader.tsx",
  "components/DocumentsModule.tsx",
  "components/StaffModule.tsx",
];

// `Modal`/`useModalA11y` qoidasi — HAR BIR faylga tegadi (bazaviy ro'yxatsiz),
// chunki uning migratsiyasi allaqachon tugagan. Bazaviy fayllar uchun ham
// saqlanib qolishi kerak, shuning uchun alohida const.
const MODAL_RULES = [
  {
    selector: "JSXAttribute[name.name='className'] > Literal[value=/fixed\\s+inset-0/]",
    message:
      "Qo'lda yozilgan dialog qatlami. `components/ui/Modal` dan foydalaning; o'z tartibini saqlashi kerak bo'lgan panel uchun `hooks/useModalA11y` (fokus tuzog'i + Escape + role=\"dialog\").",
  },
  {
    selector:
      "JSXAttribute[name.name='className'] > JSXExpressionContainer TemplateElement[value.raw=/fixed\\s+inset-0/]",
    message:
      "Qo'lda yozilgan dialog qatlami. `components/ui/Modal` dan foydalaning; o'z tartibini saqlashi kerak bo'lgan panel uchun `hooks/useModalA11y` (fokus tuzog'i + Escape + role=\"dialog\").",
  },
];

const RAW_BUTTON_RULE = {
  selector: "JSXOpeningElement[name.name='button']",
  message:
    "Xom `<button>`. `components/ui/Button` dan foydalaning — u o'lcham, ton, `loading` (ikki marta yuborishni yopadi), `disabled` va QORONG'I REJIM uchun to'g'ri `--on-*` matn rangini o'zi hal qiladi. Primitiv yetarli bo'lmasa — uni KENGAYTIRING, forklamang.",
};

const RAW_TABLE_RULE = {
  // `.erp-table` sinfi bilan yozilgan jadval — RUXSAT ETILGAN yo'l. Uch qatorli
  // statik ro'yxatga `DataTable` (saralash, tanlash, sahifalash, eksport)
  // majburlash primitivni forklashga undaydi. Qoida faqat SINFSIZ jadvalni
  // ushlaydi: aynan o'sha holatda har ekran o'z sarlavha uslubini qayta yozadi.
  selector:
    "JSXOpeningElement[name.name='table']:not(:has(JSXAttribute[name.name='className'] > Literal[value=/erp-table/]))",
  message:
    "Xom `<table>`. Interaktiv ro'yxat uchun `components/ui/DataTable` (saralash + `aria-sort`, `scope=\"col\"`, qator tanlash, zichlik, sahifalash, CSV/Excel, URL holati). Faqat DataTable mos kelmasa — `globals.css` dagi `.erp-table` sinfi bilan yozing va sababini izohda ko'rsating.",
};

const RAW_SELECT_RULE = {
  selector: "JSXOpeningElement[name.name='select']",
  message:
    "Xom `<select>`. `components/ui/Select` dan foydalaning — u `.erp-input` uslubini (tokenli ramka, fokus halqasi, telefonda 16px), o'z g'ildiragini, `disabled`/`invalid` holatini va `placeholder` bo'sh variantini beradi. O'LCHOV: 75 ta xom tanlagichdan 60 tasi uslubni qayta yozardi. Primitiv yetarli bo'lmasa — uni KENGAYTIRING, forklamang.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Migratsiya manba-materiallari (eski Supabase davri skriptlari) — kod emas
    "data/**",
    // Claude Code plugin/skill tooling (.cjs helper scripts) — not app source.
    ".claude/**",
  ]),
  {
    // Same glob the Next.js config registers its plugins for — a wider match
    // (e.g. *.cjs) would reference react-hooks rules where the plugin isn't
    // loaded and abort the whole lint run.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      // Uzbek/Cyrillic UI text is full of apostrophes (o', g', ') — escaping
      // every one adds noise without any safety benefit.
      "react/no-unescaped-entities": "off",
      // Pre-existing React patterns (reseed-state-from-props effects) used across
      // many components. Satisfying these correctness rules requires behaviour
      // changes, which are out of scope for a no-logic-change lint cleanup. Kept
      // as warnings so they stay visible and can be burned down incrementally.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      // Devtools-naming nicety on a couple of inline components; non-blocking.
      "react/display-name": "warn",
      // Type-safety debt in legacy components/scripts. All new code is any-free;
      // this is burned down incrementally. Warning keeps it visible, not blocking.
      "@typescript-eslint/no-explicit-any": "warn",

      // Browser code has no server logger, so console.error/warn in a catch block
      // is the right tool. console.log is not — it is debug residue that ships.
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
  {
    // ─────────────────────────────────────────────────────────────
    // DIZAYN TIZIMI DARVOZASI
    //
    // Auditda topilgan holat: `components/ui/Modal.tsx` fokus tuzog'i,
    // Escape, scroll qulfi va `role="dialog"` bilan yozilgan — lekin u
    // ATIGI 2 faylda ishlatilardi, qo'lda yozilgan `fixed inset-0`
    // oynalar esa 25 faylda, 28 marta. Ularning 18 tasida Escape ham
    // ishlamasdi.
    //
    // Sabab intizomda: hech narsa 29-oynani qo'lda yozishga to'sqinlik
    // qilmasdi. Bu qoida aynan shuni to'xtatadi — endi yangi dialog
    // yozish `<Modal>` ni ishlatishdan QIYINROQ.
    //
    // MIGRATSIYA TUGADI. Boshlanishida 28 ta qo'lda yozilgan oyna bor edi;
    // hammasi yo `ModalLayer`/`Modal` ga ko'chirildi, yo `useModalA11y`
    // oldi, yo dialog EMASLIGI izohlangan holda istisno qilindi (mobil
    // menyu qorayishi, popover). Ya'ni qoida endi bitta ham eski holatni
    // ko'rsatmaydi va har bir yangi ogohlantirish HAQIQIY yangi holat.
    //
    // Shuning uchun "warn" dan "error" ga o'tkazildi: aks holda qoida
    // shovqinga aylanadi va yangi dialog yana jimgina qo'shiladi.
    //
    // Istisno kerak bo'lsa — `eslint-disable-next-line` ni ATRIBUT
    // pozitsiyasiga qo'ying. JSX BOLALARI orasida `//` izoh emas, MATN:
    // u ekranda ko'rinib qoladi.
    // ─────────────────────────────────────────────────────────────
    files: ["app/**/*.{tsx,jsx}", "components/**/*.{tsx,jsx}"],
    ignores: ["components/ui/**"],
    rules: {
      "no-restricted-syntax": ["error", ...MODAL_RULES, RAW_BUTTON_RULE, RAW_TABLE_RULE, RAW_SELECT_RULE],
    },
  },
  // ─────────────────────────────────────────────────────────────
  // BAZAVIY ISTISNOLAR — GENERATSIYA QILINADI.
  //
  // `no-restricted-syntax` BUTUN massiv sifatida almashadi, ya'ni bazaviy
  // fayl uchun qolgan qoidalarni QAYTA yozish kerak. Uch qoida = sakkiz
  // kombinatsiya; ularni qo'lda yozish xatoga olib keladi. Endi kombinatsiya
  // fayl ro'yxatlaridan HISOBLANADI: yangi qoida qo'shilsa ham bu blok
  // o'zgarmaydi.
  //
  // Migratsiya tartibi: faylni primitivga ko'chiring → nomini tegishli
  // ro'yxatdan o'chiring → `npm run lint` tekshiradi. Ro'yxatlar faqat
  // QISQARISHI kerak.
  // ─────────────────────────────────────────────────────────────
  ...(() => {
    const gates = [
      [RAW_BUTTON_BASELINE, RAW_BUTTON_RULE],
      [RAW_TABLE_BASELINE, RAW_TABLE_RULE],
      [RAW_SELECT_BASELINE, RAW_SELECT_RULE],
    ];
    const all = [...new Set(gates.flatMap(([list]) => list))];
    const groups = new Map();
    for (const file of all) {
      const sig = gates.map(([list]) => list.includes(file)).join("|");
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(file);
    }
    return [...groups].map(([sig, files]) => {
      const exempt = sig.split("|").map((v) => v === "true");
      return {
        files,
        rules: {
          "no-restricted-syntax": [
            "error",
            ...MODAL_RULES,
            ...gates.filter((_, i) => !exempt[i]).map(([, rule]) => rule),
          ],
        },
      };
    });
  })(),
  {
    // Request-path server code logs through lib/platform/logger.ts (pino):
    // structured, and it redacts password/token/cookie/secret keys at any depth.
    // console bypasses that, so one stray object dump could put a credential in
    // the logs. This layer is already clean — the rule keeps it that way.
    files: ["server/**/*.ts", "lib/**/*.ts", "app/api/**/*.ts"],
    rules: { "no-console": "error" },
  },
  {
    // The bot is a long-running Node process and pino is available to it, so its
    // 39 console calls are genuine debt — but converting them is its own change,
    // not a rider on a security pass. Visible, not blocking; same treatment the
    // react-hooks rules above already get.
    files: ["bot/**/*.ts"],
    rules: { "no-console": "warn" },
  },
  {
    // CLI entrypoints: console IS the user interface. An operator running
    // `tsx scripts/generate-obligations.ts` reads stdout, not a log aggregator.
    files: ["scripts/**/*.ts", "prisma/**/*.ts", "test/setup.ts"],
    // `test/setup.ts` — CLI bilan bir toifada: u test yuguruvchiga QAYSI bazaga
    // ulanganini aytadi. Bu xabar terminalda ko'rinishi kerak, jurnalda emas.
    rules: { "no-console": "off" },
  },
  {
    // proxy.ts runs on the Edge runtime and instrumentation.ts serves both
    // runtimes; pino is Node-only — lib/platform/logger.ts says so in its own
    // header ("proxy.ts dan HECH QACHON import qilinmasin"). Importing it here
    // breaks the build, or worse, puts a failure mode inside the error handler.
    // console is deliberate in exactly these two files.
    files: ["proxy.ts", "instrumentation.ts"],
    rules: { "no-console": "off" },
  },
  {
    // ATAYLAB TASHLAB YUBORILGAN qiymat `_` bilan boshlanadi.
    //
    // Bu shunchaki qulaylik emas — qoidaning ANIQLIGINI oshiradi. `_` siz
    // "men buni ataylab olmadim" degan niyatni ifodalashning yo'li yo'q edi
    // va shu sababli ro'yxatda haqiqiy o'lik kod bilan ataylab tashlangan
    // qiymat aralashib turardi (masalan `lib/directorReport.ts` dagi
    // `const { byCompany: _byCompany, ...totals } = debts` — u Telegram
    // qatlamiga Map yubormaslik uchun ATAYLAB ajratiladi).
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
    },
  },
  {
    // `.cjs` — TA'RIFI bo'yicha CommonJS. `ecosystem.config.cjs` ni pm2 Node
    // orqali `require()` bilan yuklaydi, ya'ni `import` u yerda ISHLAMAYDI.
    // Qoida esa butun repo bo'yicha yoqilgan edi va shu bitta faylda YAGONA
    // lint XATOSINI berardi — ya'ni "lint toza" holati hech qachon
    // erishib bo'lmaydigan bo'lib turardi va yangi xato eskisidan
    // ajralmasdi.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
