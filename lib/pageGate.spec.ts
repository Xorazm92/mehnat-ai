import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * SAHIFA DARVOZASI BITTA MANBADAN.
 *
 * Prod intsidenti: ekranlar biriktiruvga qarab ochildi (`VIEWS_BY_RELATION`),
 * lekin sahifalarning o'zidagi tekshiruvlar eski holida qoldi — ular
 * `canSeeViewWith(role, view, overrides)` ni chaqirardi, ya'ni biriktiruvni
 * bilmasdi. Natijada uch qatlam uch xil javob berdi:
 *
 *   yon panel havolani KO'RSATADI → proxy KIRITADI → sahifa QAYTARIB YUBORADI
 *
 * Yon panel o'sha havolani prefetch qilgani uchun bu bir martalik sakrash
 * emas, cheksiz sikl edi (sekundiga o'nlab so'rov).
 *
 * Shuning uchun sahifa ichida darvoza FAQAT `currentUserViews()` orqali
 * qo'yiladi — u proxy bilan aynan bir manbadan hisoblaydi.
 */

const APP_DIR = join(process.cwd(), "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(p);
  }
  return out;
}

/**
 * Izohlarni olib tashlaydi — aks holda "ilgari bu yerda `canSeeViewWith`
 * turardi" degan tushuntirish ham buzilish deb hisoblanardi.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("sahifa darvozasi", () => {
  const files = walk(APP_DIR);

  it("app/ ichida `canSeeViewWith` QO'LDA chaqirilmaydi", () => {
    const offenders = files.filter((f) => {
      const src = stripComments(readFileSync(f, "utf8"));
      // Import qatorining o'zi emas, HAQIQIY chaqiruv qidiriladi.
      return /\bcanSeeViewWith\s*\(/.test(src);
    });

    expect(
      offenders.map((f) => f.replace(process.cwd() + "/", "")),
      "Bu fayllar darvozani proxy'dan mustaqil hisoblaydi — `currentUserViews()` ishlating",
    ).toEqual([]);
  });

  it("app/ ichida `effectiveViewsForRole` faqat layout'da (sessiyadan biriktiruv bilan)", () => {
    const offenders = files.filter((f) => {
      const src = stripComments(readFileSync(f, "utf8"));
      if (!/\beffectiveViewsForRole\s*\(/.test(src)) return false;
      // Layout uni sessiyadagi `relations` bilan chaqiradi — bu to'g'ri.
      return !/relations/.test(src);
    });

    expect(
      offenders.map((f) => f.replace(process.cwd() + "/", "")),
      "`effectiveViewsForRole` biriktiruvsiz chaqirilgan — menyu proxy'dan ajraladi",
    ).toEqual([]);
  });
});
