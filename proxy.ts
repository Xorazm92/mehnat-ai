import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Himoyalangan yo'llar
const PROTECTED_ROUTES = [
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

// Rolga mos boshlang'ich sahifa
const ROLE_HOME: Record<string, string> = {
  super_admin: "/dashboard",
  admin: "/dashboard",
  chief_accountant: "/dashboard",
  supervisor: "/dashboard",
  accountant: "/cabinet",
  bank_manager: "/cabinet/bank",
};

// Rol uchun ruxsat borligini tekshirish
function isAllowed(path: string, role: string): boolean {
  // Settings — faqat super_admin
  if (path.startsWith("/settings") && role !== "super_admin") return false;

  // Bank kabineti — faqat bank_manager
  if (path.startsWith("/cabinet/bank") && role !== "bank_manager") return false;

  // Asosiy kabinet — accountant uchun
  if (path === "/cabinet" && role === "bank_manager") return false;

  // Accountant va bank_manager dashboard/organizations va h.k. ga kirmasin
  if (
    ["accountant", "bank_manager"].includes(role) &&
    [
      "/dashboard",
      "/organizations",
      "/staff",
      "/kpi",
      "/payroll",
      "/audit-logs",
      "/attendance",
      "/documents",
      "/inventory",
    ].some((r) => path.startsWith(r))
  ) {
    return false;
  }

  // bank_manager kassa va expenses ko'ra oladi
  if (role === "bank_manager") {
    if (path.startsWith("/kassa") || path.startsWith("/expenses") || path.startsWith("/notifications")) {
      return true;
    }
  }

  // accountant — faqat cabinet, reports, notifications
  if (role === "accountant") {
    if (
      path.startsWith("/cabinet") ||
      path.startsWith("/reports") ||
      path.startsWith("/notifications")
    ) {
      return true;
    }
    return false;
  }

  return true;
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const isProtected = PROTECTED_ROUTES.some((r) => path.startsWith(r));

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  // Login bo'lmagan foydalanuvchi himoyalangan sahifaga kirmoqchi
  if (!token && isProtected) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  // Login bo'lgan → login/root sahifasidan yo'naltir
  if (token && (path === "/login" || path === "/" || path === "")) {
    const role = token.role as string;
    const home = ROLE_HOME[role] || "/dashboard";
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
