import { describe, it, expect } from "vitest";
import { NAV_ITEMS, NAV_SECTIONS, MOBILE_NAV_ORDER, MOBILE_NAV_SHORT_LABELS } from "./navigation";
import { KPI_TAB_IDS } from "./kpiTabs";
import { REPORTS_TAB_IDS } from "./reportsTabs";
import { PAYROLL_TAB_IDS } from "./payrollTabs";
import { CABINET_TAB_IDS } from "./cabinetTabs";
import { WORK_TAB_IDS } from "./workTabs";

/**
 * Navigatsiya endi YAGONA manba: yon panel, mobil panel va qidiruv shu
 * ro'yxatlardan oziqlanadi. Bu testlar shu yagona manbaning o'zi bilan
 * ziddiyatga tushmasligini qo'riqlaydi — ilgari uchta ro'yxat bir-biridan
 * ajralib ketgani uchun qidiruv sahifalarning yarmini topmasdi.
 */

/** Qaysi ekranning `?tab=` qiymatlari qaysi reyestrda. */
const TAB_REGISTRY: Record<string, readonly string[]> = {
  "/kpi": KPI_TAB_IDS,
  "/reports": REPORTS_TAB_IDS,
  "/payroll": PAYROLL_TAB_IDS,
  "/cabinet": CABINET_TAB_IDS,
  "/deadlines": WORK_TAB_IDS,
};

describe("NAV_SECTIONS", () => {
  it("har bir havola MAVJUD yorliqqa ishora qiladi", () => {
    for (const s of NAV_SECTIONS) {
      const [path, query] = s.href.split("?");
      const tab = new URLSearchParams(query).get("tab");
      expect(tab, `${s.href} da ?tab= yo'q`).toBeTruthy();

      const known = TAB_REGISTRY[path];
      expect(known, `${path} uchun yorliq reyestri ro'yxatga olinmagan`).toBeTruthy();
      // Yorliq id o'zgarsa qidiruvdagi havola JIMGINA noto'g'ri yorliqni
      // ochardi (yoki default'ga tushardi) — shu yerda ushlanadi.
      expect(known, `${s.href}`).toContain(tab);
    }
  });

  it("har bir bo'limning ota sahifasi navigatsiyada bor", () => {
    const paths = new Set(NAV_ITEMS.map((n) => n.href));
    for (const s of NAV_SECTIONS) {
      expect(paths, `${s.href}`).toContain(s.href.split("?")[0]);
    }
  });

  it("bir xil havola ikki marta ro'yxatga olinmagan", () => {
    const hrefs = NAV_SECTIONS.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("NAV_ITEMS", () => {
  it("ota bo'lim (`parent`) haqiqiy element manzili", () => {
    const hrefs = new Set(NAV_ITEMS.map((n) => n.href));
    for (const n of NAV_ITEMS) {
      if (n.parent) expect(hrefs, `${n.href} → ${n.parent}`).toContain(n.parent);
    }
  });

  it("bola element otasidan KEYIN keladi — menyu tartibi shunga tayanadi", () => {
    for (const [i, n] of NAV_ITEMS.entries()) {
      if (!n.parent) continue;
      const parentIndex = NAV_ITEMS.findIndex((p) => p.href === n.parent);
      expect(parentIndex, `${n.href}`).toBeLessThan(i);
      expect(NAV_ITEMS[parentIndex].group, `${n.href} otasi boshqa guruhda`).toBe(n.group);
    }
  });

  it("manzillar takrorlanmaydi", () => {
    const hrefs = NAV_ITEMS.map((n) => n.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("mobil pastki panel", () => {
  it("tartibdagi har bir view navigatsiyada mavjud", () => {
    const views = new Set(NAV_ITEMS.map((n) => n.view));
    for (const v of MOBILE_NAV_ORDER) expect(views, v).toContain(v);
  });

  it("qisqa yorliqlar 8 belgidan oshmaydi — 60px panelga sig'sin", () => {
    for (const [view, label] of Object.entries(MOBILE_NAV_SHORT_LABELS)) {
      expect(label!.length, `${view}: ${label}`).toBeLessThanOrEqual(8);
    }
  });
});
