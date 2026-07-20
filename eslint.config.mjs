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
    },
  },
]);

export default eslintConfig;
