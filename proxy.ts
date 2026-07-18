import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { canSeeView, getHomeRoute, type AppView } from "@/lib/permissions";

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

// Ruxsat — yagona manba: lib/permissions.ts ALLOWED_VIEWS (sidebar bilan bir xil)
function isAllowed(path: string, role: string): boolean {
  const view = pathToView(path);
  if (!view) return true; // moslik topilmasa to'sib qo'ymaymiz
  return canSeeView(role as never, view);
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const isProtected = PROTECTED_ROUTES.some((r) => path.startsWith(r));

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: true,
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
    if (role && !isAllowed(path, role)) {
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
