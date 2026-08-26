import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * DIZAYN TOKENLARI QO'RIQCHISI.
 *
 * Nima uchun bu test bor. `var(--accent-color, #3b82f6)` yozuvi
 * TOKENLASHTIRILGANDEK ko'rinadi, lekin `--accent-color` loyihada hech
 * qayerda ta'riflanmagan edi — ya'ni rang HAR DOIM `#3b82f6` bo'lardi,
 * temaga ergashmasdi va loyihaning o'z ko'k rangiga (`--accent-blue`,
 * yorug'da #0F66AE) mos kelmasdi. Ko'z bilan topib bo'lmaydi: kod
 * to'g'ri yozilganday turadi.
 *
 * Zaxirasiz shakli battar: `var(--background)` ta'riflanmagan bo'lsa,
 * CSS e'lonning O'ZINI yaroqsiz deb tashlaydi — element umuman fon
 * olmaydi. Uchta ekranda aynan shunday edi.
 *
 * Shuning uchun tekshiruv avtomatlashtiriladi: koddagi har bir
 * `var(--x)` uchun `--x` ta'riflangan bo'lishi shart.
 */

const ROOT = path.resolve(__dirname, "..");

/** Tashqi tizim beradigan tokenlar — ular bizning CSS'da bo'lmaydi. */
const EXTERNAL_PREFIXES = [
  // Telegram Mini App klienti ish paytida o'zi kiritadi.
  "--tg-",
  // `next/font` ish paytida `<html>` elementiga qo'yadi (app/layout.tsx).
  "--font-plex-",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "dist", "coverage"].includes(entry)) continue;
    // Qo'riqchining o'zi izohlarida misol tokenlarni yozadi.
    if (entry === "designTokens.spec.ts") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

function definedTokens(): Set<string> {
  const names = new Set<string>();
  for (const file of walk(ROOT).filter((f) => f.endsWith(".css"))) {
    const css = readFileSync(file, "utf8");
    for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
  }
  return names;
}

describe("dizayn tokenlari", () => {
  const defined = definedTokens();

  it("globals.css asosiy tokenlarni ta'riflaydi", () => {
    // Qo'riqchining o'zi ishlayotganiga ishonch: ro'yxat bo'sh bo'lib
    // qolsa quyidagi test ham "hamma narsa joyida" deb yashil bo'lardi.
    expect(defined.has("--accent-blue")).toBe(true);
    expect(defined.has("--text-primary")).toBe(true);
    expect(defined.size).toBeGreaterThan(80);
  });

  it("koddagi har bir var(--token) ta'riflangan bo'lishi shart", () => {
    const missing: string[] = [];

    for (const file of walk(ROOT)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
        const name = m[1];
        if (defined.has(name)) continue;
        if (EXTERNAL_PREFIXES.some((p) => name.startsWith(p))) continue;
        missing.push(`${path.relative(ROOT, file)} → ${name}`);
      }
    }

    expect(missing.sort()).toEqual([]);
  });
});
