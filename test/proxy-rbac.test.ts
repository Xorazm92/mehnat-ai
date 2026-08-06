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

const staff = (role: string) => {
  TOKEN = { role, kind: "staff" };
};
const client = () => {
  TOKEN = { role: "client", kind: "client" };
};

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

  it("mijoz portalga tushadi", async () => {
    client();
    expect(await go("/login")).toBe("/portal");
  });
});

describe("staff ↔ client isolation", () => {
  it("mijoz staff hududiga kira olmaydi", async () => {
    client();
    expect(await go("/dashboard")).toBe("/portal");
    expect(await go("/reports")).toBe("/portal");
  });

  it("staff portalga kira olmaydi — o'z uyiga qaytariladi", async () => {
    staff("accountant");
    expect(await go("/portal")).toBe("/cabinet");
  });

  it("mijoz portalda qoladi", async () => {
    client();
    expect(await go("/portal")).toBeNull();
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

  it("super_admin hammasini ochadi", async () => {
    staff("super_admin");
    for (const p of ["/admin", "/audit-logs", "/payroll"]) {
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

describe("fail-open on unmapped paths", () => {
  it("pathToView moslik topmasa to'sib qo'yilmaydi", async () => {
    // Qasddan shunday: yangi sahifa qo'shilganda u avtomatik 403 bo'lmaydi.
    // Narxi — PROTECTED_ROUTES ga qo'shilgan, lekin pathToView'ga qo'shilmagan
    // yo'l har qanday rol uchun ochiq qoladi. Ikkala ro'yxat birga o'zgarsin.
    staff("accountant");
    expect(await go("/some-new-page")).toBeNull();
  });

  it("PROTECTED_ROUTES va pathToView bir xil to'plamni qamraydi", async () => {
    // Yuqoridagi fail-open shu invariant buzilmagunicha xavfsiz.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../proxy.ts", import.meta.url), "utf8"),
    );
    const protectedList = [...src.matchAll(/^\s+"(\/[a-z-]+)",$/gm)].map((m) => m[1]);
    const mapped = new Set([...src.matchAll(/path\.startsWith\("(\/[a-z-]+)/g)].map((m) => m[1]));
    const unmapped = protectedList.filter((p) => !mapped.has(p));
    expect(unmapped, "PROTECTED_ROUTES da bor, pathToView da yo'q").toEqual([]);
  });
});
