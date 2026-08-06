import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
      "no-restricted-syntax": [
        "error",
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
      ],
    },
  },
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
    files: ["scripts/**/*.ts", "prisma/**/*.ts"],
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
]);

export default eslintConfig;
