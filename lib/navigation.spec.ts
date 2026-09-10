import { describe, it, expect } from "vitest";
import { NAV_ITEMS, NAV_SECTIONS, MOBILE_NAV_ORDER, MOBILE_NAV_SHORT_LABELS } from "./navigation";
import { DASHBOARD_TAB_IDS } from "./dashboardTabs";
import { KPI_TAB_IDS } from "./kpiTabs";
import { REPORTS_TAB_IDS } from "./reportsTabs";
import { PAYROLL_TAB_IDS } from "./payrollTabs";
import { CABINET_TAB_IDS } from "./cabinetTabs";
import { WORK_TAB_IDS } from "./workTabs";
import { KIRIM_TAB_IDS } from "./kirimTabs";
import { CHIQIM_TAB_IDS } from "./chiqimTabs";
import { QARZDORLIK_TAB_IDS } from "./qarzdorlikTabs";
import { SVERKA_TAB_IDS } from "./sverkaTabs";

/**
 * Navigatsiya endi YAGONA manba: yon panel, mobil panel va qidiruv shu
 * ro'yxatlardan oziqlanadi. Bu testlar shu yagona manbaning o'zi bilan
 * ziddiyatga tushmasligini qo'riqlaydi — ilgari uchta ro'yxat bir-biridan
 * ajralib ketgani uchun qidiruv sahifalarning yarmini topmasdi.
 */

/** Qaysi ekranning `?tab=` qiymatlari qaysi reyestrda. */
const TAB_REGISTRY: Record<string, readonly string[]> = {
  "/dashboard": DASHBOARD_TAB_IDS,
  "/kpi": KPI_TAB_IDS,
  "/reports": REPORTS_TAB_IDS,
  "/payroll": PAYROLL_TAB_IDS,
  "/cabinet": CABINET_TAB_IDS,
  "/deadlines": WORK_TAB_IDS,
  "/kassa/kirim": KIRIM_TAB_IDS,
  "/kassa/chiqim": CHIQIM_TAB_IDS,
  "/kassa/qarzdorlik": QARZDORLIK_TAB_IDS,
  "/kassa/sverka": SVERKA_TAB_IDS,
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

  // `parentHref` — yon panel uchun join kaliti (`DashboardSidebar` uchinchi
  // darajani shunga qarab chizadi). Noto'g'ri manzil bo'lsa yorliq jimgina
  // yo'qolardi.
  //
  // `view` ATAYIN otasinikidan farq qilishi mumkin: "Chiqim kassa" sahifasi
  // `kassa_expense` talab qiladi, lekin uning "Xarajat" yorlig'i `expenses`,
  // "Oylik" yorlig'i esa `payroll` bilan ochiladi (`ChiqimKassaClient` →
  // `allowedTabs`). Yon panel har yorliqni O'Z `view`i bilan filtrlaydi.
  it("parentHref haqiqiy NAV_ITEMS manzili", () => {
    const byHref = new Map(NAV_ITEMS.map((n) => [n.href, n]));
    for (const s of NAV_SECTIONS) {
      if (!s.parentHref) continue;
      expect(byHref.get(s.parentHref), `${s.href} → ${s.parentHref} topilmadi`).toBeTruthy();
    }
  });

  it("parentHref bor har bir bo'lim faol bo'lim sahifasida chiziladi", () => {
    // Hozircha faqat Kassa bloki + Oylik yon panelga chiqadi.
    const expected = new Set([
      "/kassa/kirim",
      "/kassa/chiqim",
      "/kassa/qarzdorlik",
      "/kassa/sverka",
      "/payroll",
    ]);
    const actual = new Set(
      NAV_SECTIONS.filter((s) => s.parentHref).map((s) => s.parentHref!)
    );
    expect(actual).toEqual(expected);
  });

  /**
   * PARITET RATCHETI — yon paneldagi ro'yxat sahifadagi yorliqlar bilan
   * AYNAN bir xil bo'lishi shart.
   *
   * Nega kerak: "Chiqim kassa" sahifasida besh yorliq bor edi, reyestrda esa
   * uchtasi — yon panel jimgina `xarajat` va `oylik` ni tashlab ketdi.
   * "Sverka" da esa DEFAULT yorliq (`sverka`) yo'q edi, ya'ni sahifa ochilganda
   * yon panelda hech bir yorliq faol ko'rinmasdi. Yangi yorliq qo'shilganda
   * shu test uni reyestrga yozishni majburlaydi.
   */
  /**
   * Yon panelga chiqqan bo'limning tavsifi SAHIFA SARLAVHASIGA tushadi
   * (`PageHeader description` — `sectionMeta`). Tavsifsiz bo'lim sahifada
   * sarlavha ostida bo'sh qator qoldirardi.
   */
  it("yon panelga chiqqan har bir bo'limning tavsifi bor", () => {
    for (const s of NAV_SECTIONS) {
      if (!s.parentHref) continue;
      expect(s.description?.trim(), `${s.href} tavsifsiz`).toBeTruthy();
    }
  });

  it("yon panelga chiqqan sahifaning HAR BIR yorlig'i reyestrda bor", () => {
    const parents = new Set(
      NAV_SECTIONS.filter((s) => s.parentHref).map((s) => s.parentHref!)
    );
    for (const path of parents) {
      const known = TAB_REGISTRY[path];
      expect(known, `${path} uchun yorliq reyestri yo'q`).toBeTruthy();
      const listed = NAV_SECTIONS.filter((s) => s.parentHref === path).map(
        (s) => new URLSearchParams(s.href.split("?")[1]).get("tab")
      );
      expect(listed, `${path} — yon panel yorliqlari sahifanikidan farq qiladi`)
        .toEqual([...known]);
    }
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
