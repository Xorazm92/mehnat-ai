/**
 * proxy.ts — the edge gate every page passes through, and until now the only
 * layer in the project with no tests at all. It decides four things:
 * who is redirected to login, where a logged-in user lands, whether staff and
 * client stay on their own side, and which roles may open which path.
 *
 * DB-free: getToken and Prisma are both mocked, so this runs in the fast CI job.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/** getToken'ning navbatdagi javobi — har testda o'rnatiladi. */
let TOKEN: Record<string, unknown> | null = null;
/** SystemSetting.roleViews qatori — null bo'lsa override yo'q. */
let ROLE_VIEWS: unknown = null;
/** roleViews o'qishda xato tashlansinmi (fail-safe yo'lini sinash uchun). */
let DB_THROWS = false;

vi.mock("next-auth/jwt", () => ({ getToken: async () => TOKEN }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    systemSetting: {
      findUnique: async () => {
        if (DB_THROWS) throw new Error("db down");
        return ROLE_VIEWS === null ? null : { value: ROLE_VIEWS };
      },
    },
  }),
  // `proxy.ts` ning O'ZI faqat `getPrisma` ni ishlatadi, lekin u
  // `lib/userRelations.ts` ni import qiladi va O'SHA modul yuklanish paytida
  // `{ prisma }` ni so'raydi. Mock uni bermagani uchun butun fayl yuklanishda
  // yiqilardi. Bu stub CHAQIRILMASLIGI kerak — chaqirilsa, DB'siz test
  // jimgina bazaga chiqmoqchi bo'lgani ma'nosini beradi, shuning uchun tashlaydi.
  // Bo'sh obyekt — ATAYLAB: bu testda hech kim uni chaqirmaydi, chaqirsa esa
  // aniq TypeError beradi (jimgina haqiqiy bazaga chiqib ketmaydi).
  prisma: {},
}));

const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

/**
 * Redirect bo'lsa maqsad yo'lini, aks holda null (ya'ni o'tkazildi).
 *
 * Modul HAR TESTDA qaytadan yuklanadi: proxy.ts ichida roleViews uchun 60
 * soniyalik modul-darajali kesh bor, va yuqorida bir marta olingan havola
 * `vi.resetModules()` dan keyin ham eski keshni ushlab qolardi — override
 * testlari qo'shni testning keshini o'qib, yolg'on yashil bo'lardi.
 */
async function go(path: string): Promise<string | null> {
  const { proxy } = await import("@/proxy");
  const res = await proxy(req(path));
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
}

// `loginAt` MAJBURIY: proxy.ts (118-120) sessiyaga MUTLAQ muddat qo'yadi va
// `loginAt` siz tokenni muddati o'tgan deb hisoblaydi (ataylab — eski tokenlar
// ham tugasin). Busiz har bir holat /login ga qaytarilardi va bu testlar
// RBAC ni emas, sessiya muddatini tekshirib qolardi.
const staff = (role: string) => {
  TOKEN = { role, kind: "staff", loginAt: Date.now() };
};
// MIJOZ PORTALI YO'Q. `client()` yordamchisi va u bilan bog'liq uchta holat
// olib tashlandi: portal moduli 2026-08 konsolidatsiyasida chiqarib
// yuborilgan. Bugungi `UserRole` da `client` umuman yo'q (olti xodim roli),
// `ROLE_HOME_ROUTES` da mijoz yozuvi yo'q va `proxy.ts` `kind` ni umuman
// o'qimaydi. Testlar esa `/portal` ga yo'naltirishni kutib turaverardi —
// ya'ni olib tashlangan xatti-harakatni tekshirardi.
//
// `app/portal/page.tsx` hali repoda yotibdi (qoldiq) — u alohida tozalanadi.

beforeEach(() => {
  TOKEN = null;
  ROLE_VIEWS = null;
  DB_THROWS = false;
  // Modul-darajali 60s kesh testlar orasida sizib o'tmasin.
  vi.resetModules();
});

describe("unauthenticated", () => {
  it("himoyalangan sahifa → /login, qaytish manzili bilan", async () => {
    expect(await go("/dashboard")).toBe("/login?callbackUrl=%2Fdashboard");
  });

  it("Telegram Mini App → /login EMAS, handshake'ga", async () => {
    // Telegram ichida email/parol so'rash ma'nosiz — u yerda sessiya initData
    // orqali tug'iladi.
    expect(await go("/telegram-app/dashboard")).toBe("/telegram-app?next=%2Ftelegram-app%2Fdashboard");
  });

  it("handshake sahifasining o'zi ochiq", async () => {
    expect(await go("/telegram-app")).toBeNull();
  });

  it("himoyalanmagan sahifa o'tkaziladi", async () => {
    expect(await go("/403")).toBeNull();
  });
});

describe("logged-in landing", () => {
  it("/login va / rol uyiga yo'naltiradi", async () => {
    staff("accountant");
    expect(await go("/login")).toBe("/cabinet");
    expect(await go("/")).toBe("/cabinet");

    staff("bank_manager");
    expect(await go("/login")).toBe("/cabinet/bank");

    staff("admin");
    expect(await go("/")).toBe("/dashboard");
  });

});

describe("view RBAC", () => {
  it("buxgalter o'z 6 ta ekranini ochadi", async () => {
    staff("accountant");
    for (const p of ["/cabinet", "/reports", "/deadlines", "/tasks", "/notifications", "/settings"]) {
      expect(await go(p), p).toBeNull();
    }
  });

  it("buxgalterga yopiq ekranlar → /403", async () => {
    staff("accountant");
    for (const p of ["/dashboard", "/organizations", "/payroll", "/kassa", "/admin"]) {
      expect(await go(p), p).toBe("/403");
    }
  });

  it("bank-klient kassani ochadi, hisobotlarni ochmaydi", async () => {
    staff("bank_manager");
    expect(await go("/kassa")).toBeNull();
    expect(await go("/reports")).toBe("/403");
  });

  it("kabina — faqat senior rollarga", async () => {
    // Kabina butun portfelning xavfini va xodimlarning yuklamasini ko'rsatadi.
    // Buxgalter uni ko'rmasligi kerak, va bu qoida navigatsiyada yashirish
    // bilan emas, MARSHRUTDA majburlanadi.
    for (const role of ["super_admin", "admin", "chief_accountant", "supervisor"]) {
      staff(role);
      expect(await go("/cockpit"), role).toBeNull();
    }
    for (const role of ["accountant", "bank_manager"]) {
      staff(role);
      expect(await go("/cockpit"), role).toBe("/403");
    }
  });

  it("super_admin hammasini ochadi", async () => {
    staff("super_admin");
    for (const p of ["/admin", "/payroll", "/organizations"]) {
      expect(await go(p), p).toBeNull();
    }
  });
});

describe("pathToView ordering", () => {
  it("/cabinet/bank /cabinet dan OLDIN tekshiriladi", async () => {
    // Tartib buzilsa, /cabinet/bank "cabinet" view'iga tushib qolardi va
    // buxgalter bank kabinetiga kira olardi.
    staff("accountant"); // cabinet bor, cabinet_bank yo'q
    expect(await go("/cabinet")).toBeNull();
    expect(await go("/cabinet/bank")).toBe("/403");
  });

  it("Mini App ekranlari veb sahifalar bilan bir xil view'ni ishlatadi", async () => {
    staff("accountant"); // reports bor, dashboard yo'q
    expect(await go("/telegram-app/proof")).toBeNull();
    expect(await go("/telegram-app/dashboard")).toBe("/403");
  });
});

describe("roleViews overrides", () => {
  it("admin bergan view ochiladi", async () => {
    ROLE_VIEWS = { accountant: ["cabinet", "reports", "payroll"] };
    staff("accountant");
    expect(await go("/payroll")).toBeNull();
  });

  it("override RO'YXATNI ALMASHTIRADI, qo'shmaydi", async () => {
    // effectiveViewsForRole standart ro'yxatni almashtiradi — bu qasddan, lekin
    // oson unutiladi: ro'yxatga kirmagan ekran yopiladi.
    ROLE_VIEWS = { accountant: ["cabinet"] };
    staff("accountant");
    expect(await go("/cabinet")).toBeNull();
    expect(await go("/reports")).toBe("/403");
  });

  it("super_admin'ni override bilan qulflab bo'lmaydi", async () => {
    ROLE_VIEWS = { super_admin: ["cabinet"] };
    staff("super_admin");
    expect(await go("/admin")).toBeNull();
  });

  it("DB yiqilsa routing yiqilmaydi — statik ruxsatlarga qaytadi", async () => {
    DB_THROWS = true;
    staff("accountant");
    expect(await go("/reports")).toBeNull();
    expect(await go("/payroll")).toBe("/403");
  });
});

describe("fail-closed on unmapped protected paths", () => {
  it("himoyalanmagan manzil proxy'dan bemalol o'tadi", async () => {
    // `/some-new-page` `PROTECTED_ROUTES` da ham, ochiqlar ro'yxatida ham
    // yo'q — proxy uni umuman tekshirmaydi (sahifaning O'ZI mavjud bo'lsa,
    // o'z darvozasini o'zi qo'yadi). Fail-closed FAQAT himoyalangan
    // daraxtga tegishli.
    staff("accountant");
    expect(await go("/some-new-page")).toBeNull();
  });

  it("himoyalangan, lekin xaritalanmagan manzil → /403", async () => {
    // BU AVVAL TESKARI ISHLARDI. `isAllowed` moslik topmasa `true` qaytarardi
    // va o'sha "fail-open" `/director` ni HAR QANDAY rolga ochib qo'ygan edi:
    // sahifa `lib/navigation.ts` da ham, `lib/routeViews.ts` da ham,
    // `PROTECTED_ROUTES` da ham yo'q edi, o'zida esa faqat `auth()` turardi.
    //
    // `/telegram-app/*` — bugungi yagona "himoyalangan lekin xaritada
    // bo'lmasligi mumkin" tarmoq: ostidagi HAMMA narsa himoyalangan, ammo
    // xaritada faqat `dashboard` va `proof` bor.
    staff("super_admin");
    expect(await go("/telegram-app/hali-yozilmagan-ekran")).toBe("/403");
  });

  it("xaritalangan Mini App ekrani ochiq qoladi", async () => {
    staff("super_admin");
    expect(await go("/telegram-app/dashboard")).toBeNull();
  });

  it("PROTECTED_ROUTES va pathToView bir xil to'plamni qamraydi", async () => {
    // Fail-closed darvozaning narxi: xaritadan tushib qolgan HAQIQIY sahifa
    // ham 403 beradi. Shuning uchun to'liqlik majburlanadi.
    //
    // Ilgari bu tekshiruv ikkala ro'yxatni ham manba MATNIDAN regexp bilan
    // qidirardi va ro'yxat ko'chgach jim yiqildi. Endi ikkalasi ham bitta
    // moduldan EKSPORT qilinadi — regexp ham, ikki fayl ham yo'q.
    // Fayl tizimi bo'yicha to'liq skanerlash `lib/routeViews.spec.ts` da.
    const { PROTECTED_ROUTES, pathToViews } = await import("@/lib/routeViews");
    const unmapped = PROTECTED_ROUTES.filter((p) => pathToViews(p).length === 0);
    expect(unmapped, "PROTECTED_ROUTES da bor, pathToView da yo'q").toEqual([]);
  });
});
