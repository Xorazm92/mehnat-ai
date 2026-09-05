import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  pathToView,
  pathToViews,
  isProtectedPath,
  PROTECTED_ROUTES,
  PUBLIC_ROUTES,
} from "@/lib/routeViews";
import { NAV_ITEMS } from "@/lib/navigation";

/**
 * PROXY VA SAHIFA BIR XIL JAVOB BERISHI KERAK.
 *
 * Jonli tekshiruvda topilgan holat: nazoratchining menyusida "Xarajatlar"
 * bandi turardi, uni bosganda esa har safar 403 chiqardi. Sabab —
 * `/kassa/chiqim` sahifasi IKKI ko'rinishdan birini qabul qiladi
 * (`kassa_expense` yoki `expenses`), proxy esa faqat birinchisini bilardi.
 *
 * Bu testlar aynan shu kelishuvni qulflaydi.
 */
describe("pathToViews", () => {
  it("/kassa/chiqim ikkala ko'rinishni ham qabul qiladi", () => {
    expect(pathToViews("/kassa/chiqim")).toEqual(["kassa_expense", "expenses"]);
    expect(pathToViews("/kassa/chiqim?tab=xarajat")).toEqual(["kassa_expense", "expenses"]);
  });

  it("boshqa manzillar bitta ko'rinish qaytaradi", () => {
    expect(pathToViews("/organizations")).toEqual(["organizations"]);
    expect(pathToViews("/kassa/kirim")).toEqual(["kassa_income"]);
    expect(pathToViews("/kassa/qarzdorlik")).toEqual(["kassa_debt"]);
    expect(pathToViews("/dashboard")).toEqual(["dashboard"]);
  });

  it("noma'lum manzil bo'sh ro'yxat qaytaradi — proxy to'smaydi", () => {
    expect(pathToViews("/qwerty-yoq-sahifa")).toEqual([]);
  });

  it("aniqroq prefiks umumiyroqdan oldin tekshiriladi", () => {
    // `/kassa/kirim` butun `kassa` ruxsatini talab qilib qolmasin.
    expect(pathToView("/kassa/kirim")).toBe("kassa_income");
    expect(pathToView("/kassa")).toBe("kassa");
    expect(pathToView("/cabinet/bank")).toBe("cabinet_bank");
    expect(pathToView("/cabinet")).toBe("cabinet");
  });

  it("har bir kassa sub-manzili O'Z view'ini oladi", () => {
    // Regressiya: `/kassa/sverka` tarmog'i yo'q edi va umumiy `kassa` ga
    // tushardi. `kassa` bor, `kassa_sverka` yo'q rolda (bosh buxgalter)
    // proxy kiritar, sahifa `/cabinet` ga qaytarar, yon panel qayta
    // prefetch qilar — cheksiz sikl.
    expect(pathToView("/kassa/sverka")).toBe("kassa_sverka");
    expect(pathToView("/kassa/chiqim")).toBe("kassa_expense");
    expect(pathToView("/kassa/qarzdorlik")).toBe("kassa_debt");
  });

  it("har bir kassa menyu havolasi sahifa darvozasi bilan kelishadi", () => {
    // Menyudagi `view` va proxy hisoblagan ruxsat AYNI bo'lishi kerak —
    // aks holda band ko'rinadi, bosilganda esa qaytarib yuboriladi.
    for (const item of NAV_ITEMS) {
      if (!item.href.startsWith("/kassa")) continue;
      const path = item.href.split("?")[0];
      expect(pathToViews(path), `${item.href} → ${item.view}`).toContain(item.view);
    }
  });
});

/**
 * FAIL-CLOSED DARVOZA QO'RIQCHISI.
 *
 * `proxy.ts#isAllowed` ilgari xaritada moslik topmasa RUXSAT berardi.
 * Oqibati o'lchangan: `/director` sahifasi `lib/navigation.ts` da ham,
 * bu xaritada ham, `PROTECTED_ROUTES` da ham yo'q edi va sahifada faqat
 * `auth()` turardi — ya'ni RBAC ning uchala qavati ham uni o'tkazib
 * yuborardi va istalgan rol firma oylik fondini ko'ra olardi.
 *
 * Endi darvoza fail-closed. Buning narxi bor: xaritadan tushib qolgan
 * HAQIQIY sahifa ham 403 beradi. Shuning uchun to'liqlik shu yerda,
 * fayl tizimiga qarab majburlanadi — nosozlik ishlab chiqarishda emas,
 * testda chiqadi.
 */
describe("himoyalangan marshrutlar xaritasi to'liq", () => {
  it("har bir himoyalangan prefiks kamida bitta view beradi", () => {
    for (const r of PROTECTED_ROUTES) {
      expect(pathToViews(r), `${r} xaritada yo'q`).not.toHaveLength(0);
    }
  });

  it("ochiq va himoyalangan ro'yxatlar kesishmaydi", () => {
    for (const p of PUBLIC_ROUTES) {
      if (p === "/") continue; // ildiz alohida ishlanadi (token bo'lsa yo'naltiriladi)
      expect(isProtectedPath(p), `${p} ikkala ro'yxatda`).toBe(false);
    }
  });

  it("har bir sahifa yo ochiq, yo himoyalangan VA xaritalangan", () => {
    const appDir = path.resolve(__dirname, "..", "app");
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "api") continue; // API o'z avtorizatsiyasini o'zi qiladi
          walk(full);
        } else if (entry === "page.tsx") {
          // `(dashboard)` kabi guruhlar manzilga kirmaydi.
          const rel = path.relative(appDir, dir).split(path.sep)
            .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
            .join("/");
          routes.push("/" + rel);
        }
      }
    };
    walk(appDir);

    expect(routes.length).toBeGreaterThan(30); // skanner ishlayotganini tasdiqlash

    const bad: string[] = [];
    for (const r of routes) {
      const normalized = r === "/" ? "/" : r.replace(/\/$/, "");
      if (PUBLIC_ROUTES.includes(normalized)) continue;
      if (!isProtectedPath(normalized)) {
        bad.push(`${normalized} — na ochiqlar ro'yxatida, na PROTECTED_ROUTES da`);
        continue;
      }
      if (pathToViews(normalized).length === 0) {
        bad.push(`${normalized} — himoyalangan, lekin pathToView xaritasida yo'q (fail-closed 403 beradi)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("xaritalanmagan himoyalangan manzil ruxsat BERMAYDI", () => {
    // Aynan `/director` ni yiqitgan holat: himoyalangan daraxt ostida, lekin
    // xaritada yo'q. `pathToViews` bo'sh qaytaradi → proxy rad etadi.
    const unknown = "/telegram-app/hali-yozilmagan-ekran";
    expect(isProtectedPath(unknown)).toBe(true);
    expect(pathToViews(unknown)).toHaveLength(0);
  });

  it("handshake sahifasining o'zi ochiq qoladi", () => {
    // Sessiya AYNAN shu yerda tug'iladi — qo'riqlansa Mini App umuman kirolmaydi.
    expect(isProtectedPath("/telegram-app")).toBe(false);
    expect(isProtectedPath("/telegram-app/dashboard")).toBe(true);
  });

  it("prefiks yarim so'zga yopishmaydi", () => {
    // `startsWith("/settings")` `/settings-eksport` ni ham ushlardi.
    expect(isProtectedPath("/settings")).toBe(true);
    expect(isProtectedPath("/settings/profil")).toBe(true);
    expect(isProtectedPath("/settings-eksport")).toBe(false);
  });
});
