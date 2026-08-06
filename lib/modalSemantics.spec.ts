/**
 * Dialog semantikasi — RATCHET.
 *
 * `components/ui/Modal.tsx` fokus tuzog'i, Escape, fokusni qaytarish, scroll
 * qulfi va `role="dialog"` ni o'z ichiga oladi. Qo'lda yozilgan `fixed inset-0`
 * overlay bularning birortasini ham bermaydi, va ikkita oqibati bor:
 *
 *   1. Klaviatura bilan ishlaydigan xodim dialogdan chiqa olmaydi (WCAG 2.1.2).
 *   2. `hooks/useAutoRefresh.ts` ochiq dialog ustida pauza qilish uchun DOM'da
 *      `[role="dialog"]` ni qidiradi. Semantikasiz modal shu tekshiruvdan
 *      ko'rinmaydi, ya'ni foydalanuvchi yozib turganda 15 soniyalik
 *      `router.refresh()` uning ostidan ishlaydi.
 *
 * Ya'ni bu faqat a11y masalasi emas — bu ma'lumot yo'qolishi yo'li.
 *
 * Baza 16 da ochildi (2026-08-07); PayrollTable primitivga ko’chgach 15.
 * Faqat KAMAYISHI mumkin.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = join(__dirname, "..");

/** Dialog EMAS overlay'lar: mobil nav paneli va popover fonlari. */
const NOT_DIALOGS = new Set([
  "components/DashboardSidebar.tsx",
  "components/admin/AdminSidebar.tsx",
  "components/ui/TableToolbar.tsx",
  "components/ui/MonthPicker.tsx",
  "components/RiskBadge.tsx",
]);

const BASELINE = 15;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function offenders(): string[] {
  const found: string[] = [];
  for (const p of [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))]) {
    const rel = relative(ROOT, p);
    if (NOT_DIALOGS.has(rel)) continue;
    const src = readFileSync(p, "utf8");
    if (!src.includes("fixed inset-0")) continue;
    // `<Modal` primitivi semantikani o'zi beradi.
    if (src.includes('role="dialog"') || src.includes("<Modal")) continue;
    found.push(rel);
  }
  return found.sort();
}

describe("dialog semantics", () => {
  it(`hand-rolled modals without dialog semantics never grow (baseline ${BASELINE})`, () => {
    const bad = offenders();
    expect(bad.length, `semantikasiz modal qo'shildi:\n${bad.join("\n")}`).toBeLessThanOrEqual(BASELINE);
  });

  it("the Modal primitive itself carries the semantics it promises", () => {
    const src = readFileSync(join(ROOT, "components/ui/Modal.tsx"), "utf8");
    expect(src).toContain('role="dialog"');
    expect(src).toContain("aria-modal");
    expect(src).toContain("useModalA11y");
  });

  it("useAutoRefresh pauses on an open dialog", () => {
    // Markazlashgan pauza — har chaqiruv joyida bayroq uzatish o'rniga.
    const src = readFileSync(join(ROOT, "hooks/useAutoRefresh.ts"), "utf8");
    expect(src).toContain('[role="dialog"]');
  });
});
