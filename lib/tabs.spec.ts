import { describe, it, expect } from "vitest";
import { readTabParam } from "./tabs";
import { KPI_TAB_IDS, defaultKpiTab, type KpiTabId } from "./kpiTabs";
import { REPORTS_TAB_IDS, type ReportsTabId } from "./reportsTabs";

/**
 * Yorliq holati endi URL'da yashaydi, ya'ni uni FOYDALANUVCHI ham yozishi
 * mumkin. Shu chegara tekshiriladi: begona qiymat hech qachon yorliqsiz
 * (bo'sh) ekran bermasligi kerak.
 */
describe("readTabParam", () => {
  it("ro'yxatdagi qiymatni o'tkazadi", () => {
    expect(readTabParam<KpiTabId>("reyting", KPI_TAB_IDS, "nazoratchi")).toBe("reyting");
  });

  it("begona qiymatda default'ga qaytadi", () => {
    expect(readTabParam<KpiTabId>("payroll", KPI_TAB_IDS, "nazoratchi")).toBe("nazoratchi");
    expect(readTabParam<KpiTabId>("<script>", KPI_TAB_IDS, "reyting")).toBe("reyting");
  });

  it("bo'sh yoki yo'q qiymatda default'ga qaytadi", () => {
    expect(readTabParam<KpiTabId>(undefined, KPI_TAB_IDS, "nazoratchi")).toBe("nazoratchi");
    expect(readTabParam<KpiTabId>("", KPI_TAB_IDS, "nazoratchi")).toBe("nazoratchi");
  });

  it("takrorlangan parametrda (?tab=a&tab=b) birinchisini oladi", () => {
    expect(readTabParam<ReportsTabId>(["reports", "matrix"], REPORTS_TAB_IDS, "matrix")).toBe(
      "reports",
    );
  });
});

describe("defaultKpiTab", () => {
  it("baholovchi rol baholash varaqasida ochiladi", () => {
    expect(defaultKpiTab("supervisor")).toBe("nazoratchi");
    expect(defaultKpiTab("chief_accountant")).toBe("nazoratchi");
  });

  it("baholamaydigan rolga o'z KPI'si ochiladi — ko'rmaydigan yorliq emas", () => {
    expect(defaultKpiTab("accountant")).toBe("mine");
    expect(defaultKpiTab("")).toBe("mine");
  });

  it("qaytargan qiymat har doim mavjud yorliq bo'ladi", () => {
    for (const role of ["super_admin", "admin", "supervisor", "accountant", "bank_manager"]) {
      expect(KPI_TAB_IDS).toContain(defaultKpiTab(role));
    }
  });
});
