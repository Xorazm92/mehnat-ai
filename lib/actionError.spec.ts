import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { friendlyError, isRedactedServerError } from "./actionError";

/**
 * PROD'DA XATO MATNI YASHIRILADI.
 *
 * Next production qurilmasida server amali `throw` qilgan xatoning matnini
 * mijozga bermaydi. Kod esa `toast.error(e.message)` deb o'sha o'rnini
 * bosuvchi INGLIZCHA texnik matnni ko'rsatardi:
 *
 *   "An error occurred in the Server Components render. The specific message
 *    is omitted in production builds…"
 *
 * Buxgalter Maxmuda skrinshotni bekor qilmoqchi bo'lganda aynan shuni ko'rdi
 * (prod digest 2387468489) — holbuki server "Tasdiqlangan yoki tekshiruvdagi
 * katakni o'zgartirib bo'lmaydi" degan edi.
 *
 * DEV rejimida matn haqiqiy bo'ladi, ya'ni bu xato sinovda ko'rinmaydi —
 * shuning uchun statik qo'riqchi kerak.
 */

const REDACTED =
  "An error occurred in the Server Components render. The specific message is " +
  "omitted in production builds to avoid leaking sensitive details. A digest " +
  "property is included on this error instance which may provide additional " +
  "details about the nature of the error.";

describe("friendlyError", () => {
  it("Next yashirgan matnni o'zbekcha zaxira bilan almashtiradi", () => {
    expect(isRedactedServerError(REDACTED)).toBe(true);
    expect(friendlyError(new Error(REDACTED))).not.toContain("Server Components");
    expect(friendlyError(new Error(REDACTED), "Saqlanmadi")).toBe("Saqlanmadi");
  });

  it("haqiqiy o'zbekcha xabarni o'zgartirmaydi", () => {
    const msg = "Tasdiqlangan yoki tekshiruvdagi katakni o'zgartirib bo'lmaydi.";
    expect(friendlyError(new Error(msg))).toBe(msg);
  });

  it("bo'sh yoki noma'lum qiymatda zaxira matn qaytaradi", () => {
    expect(friendlyError(new Error(""), "Zaxira")).toBe("Zaxira");
    expect(friendlyError(undefined, "Zaxira")).toBe("Zaxira");
    expect(friendlyError({ weird: true }, "Zaxira")).toBe("Zaxira");
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("xato matnini ko'rsatish", () => {
  it("UI xom `Error.message` ni to'g'ridan-to'g'ri ko'rsatmaydi", () => {
    const files = [...walk(join(process.cwd(), "components")), ...walk(join(process.cwd(), "app"))];
    const offenders: string[] = [];

    for (const f of files) {
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // `(e as Error).message` yoki `x instanceof Error ? x.message : ...`
      if (/\(\w+ as Error\)\.message/.test(src) || /instanceof Error \? \w+\.message/.test(src)) {
        offenders.push(f.replace(process.cwd() + "/", ""));
      }
    }

    expect(
      offenders,
      "`friendlyError(e, 'o\\'zbekcha zaxira')` ishlating — aks holda prod'da Next'ning inglizcha matni chiqadi",
    ).toEqual([]);
  });
});
