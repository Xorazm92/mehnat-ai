/**
 * UFQ OYNALARI.
 *
 * Bitta xossa hammasidan muhim: KETMA-KET, KESISHMASDAN, BO'SHLIQSIZ. Birinchi
 * tahririmda oynalar mustaqil hisoblangan edi va oy oxirida "shu hafta"
 * keyingi oyga o'tib "chorak" bilan kesishardi — o'sha ishlar ikki marta
 * sanalardi.
 */
import { describe, it, expect } from "vitest";
import { horizonWindows } from "./horizon";

const days = ["2026-01-15", "2026-01-28", "2026-03-30", "2026-12-28", "2026-06-30", "2026-02-27", "2026-12-31"];

describe("horizonWindows", () => {
  for (const d of days) {
    it(`${d} — ketma-ket va kesishmasdan`, () => {
      const w = horizonWindows(new Date(`${d}T09:00:00Z`));
      expect(w[0].key).toBe("overdue");
      for (let i = 1; i < w.length; i++) {
        expect(w[i].from!.getTime()).toBe(w[i - 1].to.getTime());
        expect(w[i].to.getTime()).toBeGreaterThanOrEqual(w[i].from!.getTime());
      }
    });
  }

  it("oxirgi oyna kelasi yilning 1-yanvarida tugaydi", () => {
    const w = horizonWindows(new Date("2026-06-15T09:00:00Z"));
    expect(w[w.length - 1].to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("yil oxirida `yil` oynasi BO'SH — hafta undan oshib ketgan", () => {
    // 28-dekabr: hafta 4-yanvargacha, ya'ni yil chegarasidan narida. Oyna
    // manfiy bo'lib qolmaydi, bo'sh bo'ladi — va o'sha ishlar `week` da
    // allaqachon sanalgan.
    const w = horizonWindows(new Date("2026-12-28T09:00:00Z"));
    expect(w[w.length - 1].empty).toBe(true);
    expect(w.find((x) => x.key === "week")!.to.toISOString()).toBe("2027-01-04T00:00:00.000Z");
  });

  it("oy oxirida `shu oy` va `chorak` BO'SH bo'ladi, kesishgan emas", () => {
    // 30-dekabr: hafta 6-yanvargacha cho'ziladi, ya'ni oy ham chorak ham
    // allaqachon o'tib ketgan.
    const byKey = Object.fromEntries(horizonWindows(new Date("2026-12-30T09:00:00Z")).map((x) => [x.key, x]));
    expect(byKey.month.empty).toBe(true);
    expect(byKey.quarter.empty).toBe(true);
    expect(byKey.week.empty).toBe(false);
  });

  it("bugun oynasi aynan bir kun, soatdan qat'i nazar", () => {
    const w = horizonWindows(new Date("2026-06-15T23:59:00Z"));
    const today = w.find((x) => x.key === "today")!;
    expect(today.to.getTime() - today.from!.getTime()).toBe(MS_DAY);
    expect(today.from!.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
});

const MS_DAY = 86_400_000;
