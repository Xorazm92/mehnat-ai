import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { USE_SECURE_COOKIES } from "@/lib/auth.config";
import {
  canSeeViewWith,
  getHomeRoute,
  type AppView,
  type RoleViewOverrides,
  type UserRole,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Himoyalangan yo'llar
const PROTECTED_ROUTES = [
  "/admin",
  "/dashboard",
  "/organizations",
  "/reports",
  "/kpi",
  "/payroll",
  "/staff",
  "/audit-logs",
  "/cabinet",
  "/expenses",
  "/kassa",
  "/attendance",
  "/documents",
  "/inventory",
  "/notifications",
  "/settings",
];

// URL yo'lini AppView'ga moslashtirish (aniqrog'i birinchi — /cabinet/bank /cabinet dan oldin)
function pathToView(path: string): AppView | null {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/audit-logs")) return "audit_logs";
  if (path.startsWith("/organizations")) return "organizations";
  if (path.startsWith("/staff")) return "staff";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/kpi")) return "kpi";
  if (path.startsWith("/kassa")) return "kassa";
  if (path.startsWith("/expenses")) return "expenses";
  if (path.startsWith("/payroll")) return "payroll";
  if (path.startsWith("/attendance")) return "attendance";
  if (path.startsWith("/documents")) return "documents";
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/notifications")) return "notifications";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/cabinet/bank")) return "cabinet_bank";
  if (path.startsWith("/cabinet")) return "cabinet";
  if (path.startsWith("/dashboard")) return "dashboard";
  return null;
}

// Admin tahrirlagan rol→view override'lari (SystemSetting: "roleViews").
// Sidebar shu override bilan chizadi — proxy ham AYNAN shu manbani ishlatmasa,
// admin bergan view menyuda ko'rinib, ochilganda 403 bo'lardi. Har so'rovda DB
// urmaslik uchun 60 soniya modul-darajali kesh; xatoda oxirgi ma'lum qiymat
// (bo'lmasa override'siz statik ro'yxat) ishlatiladi — routing hech qachon
// DB nosozligi tufayli yiqilmaydi.
const OVERRIDES_TTL_MS = 60_000;
let overridesCache: { at: number; value: RoleViewOverrides } | null = null;

async function getRoleViewOverridesCached(): Promise<RoleViewOverrides> {
  if (overridesCache && Date.now() - overridesCache.at < OVERRIDES_TTL_MS) {
    return overridesCache.value;
  }
  try {
    const row = await getPrisma().systemSetting.findUnique({ where: { key: "roleViews" } });
    const value =
      row?.value && typeof row.value === "object" && !Array.isArray(row.value)
        ? (row.value as RoleViewOverrides)
        : {};
    overridesCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error("[proxy] roleViews o'qib bo'lmadi (statik ruxsatlar ishlatiladi):", e);
    return overridesCache?.value ?? {};
  }
}

// Ruxsat — sidebar bilan bir xil manba: koddagi default + admin override'lari
async function isAllowed(path: string, role: string): Promise<boolean> {
  const view = pathToView(path);
  if (!view) return true; // moslik topilmasa to'sib qo'ymaymiz
  const overrides = await getRoleViewOverridesCached();
  return canSeeViewWith(role as UserRole, view, overrides);
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const isProtected = PROTECTED_ROUTES.some((r) => path.startsWith(r));

  // `secureCookie` MUST match how next-auth set the cookie (see USE_SECURE_COOKIES
  // in lib/auth.config.ts). It drives both the cookie name (`__Secure-` prefix)
  // AND the JWT decryption salt — omitting it made getToken look for the wrong
  // cookie in prod HTTPS and always return null, bouncing logged-in users to /login.
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: USE_SECURE_COOKIES,
  });

  // Login bo'lmagan foydalanuvchi himoyalangan sahifaga kirmoqchi
  if (!token && isProtected) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  // Login bo'lgan → login/root sahifasidan rolga mos boshlang'ich sahifaga
  if (token && (path === "/login" || path === "/" || path === "")) {
    const home = getHomeRoute(token.role as string);
    return NextResponse.redirect(new URL(home, req.url));
  }

  // RBAC: ruxsatsiz sahifadan himoya
  if (token && isProtected) {
    const role = token.role as string;
    if (role && !(await isAllowed(path, role))) {
      return NextResponse.redirect(new URL("/403", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
