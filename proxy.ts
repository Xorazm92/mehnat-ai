import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { USE_SECURE_COOKIES, SESSION_MAX_AGE } from "@/lib/auth.config";
import {
  canSeeViewWith,
  getHomeRoute,
  type CompanyRelation,
  type RoleViewOverrides,
  type UserRole,
} from "@/lib/platform/permissions";
import { parseRelations } from "@/lib/userRelations";
// Manzil → ekran xaritasi YAGONA manbada: `Breadcrumbs` ham shu javobga
// tayanadi, aks holda UI ocholmaydigan havolani taklif qilardi.
import { pathToViews, isProtectedPath } from "@/lib/routeViews";
import { getPrisma } from "@/lib/prisma";


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
// + foydalanuvchining HAQIQIY biriktiruvlari.
//
// Biriktiruvlar tokendan o'qiladi (lib/userRelations.ts ularni kirish paytida
// va har 5 daqiqada yozadi), shuning uchun bu yerda qo'shimcha baza so'rovi
// yo'q — darvoza har bir so'rovda ishlaydi.
async function isAllowed(
  path: string,
  role: string,
  relations: readonly CompanyRelation[]
): Promise<boolean> {
  // Ba'zi sahifalar ikki ko'rinishdan BIRI bilan ochiladi (`lib/routeViews.ts`
  // dagi `pathToViews` izohiga qarang) — shuning uchun bitta emas, ro'yxat.
  const views = pathToViews(path);
  if (views.length === 0) {
    // FAIL-CLOSED. Ilgari bu yerda `return true` turardi va oqibati o'lchandi:
    // `/director` sahifasi xaritaning uchala qavatidan ham tushib qolgan edi,
    // shuning uchun proxy uni HAR QANDAY rolga ochib berardi — buxgalter ham,
    // bank-klient ham firma oylik fondi bilan so'nggi to'lovlarni ko'rardi.
    //
    // Bu yerga faqat HIMOYALANGAN manzil keladi (`isProtectedPath`), ya'ni
    // ochiq sahifalarga ta'sir yo'q. Xaritada yo'q himoyalangan manzil endi
    // "hali yozilmagan" deb emas, "ruxsat berilmagan" deb o'qiladi.
    //
    // Xarita to'liqligini `lib/routeViews.spec.ts` majburlaydi: har bir
    // `app/**/page.tsx` yo ochiqlar ro'yxatida, yo himoyalangan VA
    // xaritalangan bo'lishi shart. Ya'ni bu shox ishlab chiqarishda emas,
    // testda ushlanadi.
    console.error(`[proxy] xaritada yo'q himoyalangan manzil — rad etildi: ${path}`);
    return false;
  }
  const overrides = await getRoleViewOverridesCached();
  return views.some((v) => canSeeViewWith(role as UserRole, v, overrides, relations));
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // `/telegram-app` — Mini App handshake sahifasi: u ATAYIN ochiq, chunki
  // sessiya aynan o'sha yerda `initData` orqali yaratiladi. Uning ostidagi
  // ekranlar esa oddiy himoyalangan sahifalar (`isProtectedPath`).
  const isTelegramApp = path.startsWith("/telegram-app");
  const isProtected = isProtectedPath(path);

  // `secureCookie` MUST match how next-auth set the cookie (see USE_SECURE_COOKIES
  // in lib/auth.config.ts). It drives both the cookie name (`__Secure-` prefix)
  // AND the JWT decryption salt — omitting it made getToken look for the wrong
  // cookie in prod HTTPS and always return null, bouncing logged-in users to /login.
  const rawToken = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: USE_SECURE_COOKIES,
  });

  /**
   * MUTLAQ MUDDAT — `lib/sessionRevalidation.ts` bilan bir xil qoida, lekin
   * bazasiz (proxy har so'rovda ishlaydi).
   *
   * Busiz proxy muddati o'tgan cookie'ni ham "kirgan" deb hisoblardi, `auth()`
   * esa sessiyani bekor qilardi — va ikkalasining kelishmovchiligi cheksiz
   * qayta yuklanishga olib kelardi. `loginAt` faollikda YANGILANMAYDI, ya'ni
   * muddat cho'zilmaydi. Eski (loginAt'siz) tokenlar ham muddati o'tgan
   * hisoblanadi — bir marta qayta kirish talab qilinadi.
   */
  const loginAt = typeof rawToken?.loginAt === "number" ? rawToken.loginAt : 0;
  const expired = !!rawToken && Date.now() - loginAt > SESSION_MAX_AGE * 1000;
  const token = expired ? null : rawToken;

  // Login bo'lmagan foydalanuvchi himoyalangan sahifaga kirmoqchi
  if (!token && isProtected) {
    // Telegram ichida /login sahifasini ko'rsatish ma'nosiz — u yerda email
    // va parol so'raladi, holbuki foydalanuvchi allaqachon Telegramda. Uni
    // handshake'ga qaytaramiz, u initData bilan kirib, shu yerga qaytaradi.
    if (isTelegramApp) {
      const handshake = new URL("/telegram-app", req.url);
      handshake.searchParams.set("next", path);
      return NextResponse.redirect(handshake);
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  /**
   * Login bo'lgan → login/root sahifasidan mos boshlang'ich sahifaga.
   *
   * `sessionUsable` SHART: bu yerda `getToken()` cookie'ni shunchaki
   * ochadi, `auth()` esa qo'shimcha `jwt` callback'ini yurgizadi va sessiya
   * haqiqiy emasligini aniqlashi mumkin (mutlaq muddat tugagan, xodim
   * bloklangan). Ikkalasi kelishmaganda CHEKSIZ SIKL hosil bo'lardi:
   *
   *   /dashboard → sessiya yo'q → /login → proxy cookie'ni ko'radi →
   *   /dashboard → …  (sekundiga bir necha marta, prod'da kuzatildi)
   *
   * Shuning uchun ikkita to'siq:
   *   1. mutlaq muddat SHU YERDA ham tekshiriladi (sof hisob, bazasiz);
   *   2. sahifa "sessiya tugadi" deb yuborgan bo'lsa (`?expired=1`), bu
   *      qoida umuman qo'llanmaydi — sikl yopiladi, sababidan qat'i nazar.
   */
  const cameFromExpiredSession = req.nextUrl.searchParams.get("expired") === "1";

  // FAOL ROL — ikki rolli xodim almashtirgich orqali tanlagani.
  // Cookie server tomonda tekshiriladi: faqat token ichidagi rollar
  // (asosiy + extraRoles) ichidan tanlov kuchga kiradi. Edge-safe:
  // faqat satr solishtirish, baza so'rovi yo'q.
  const extra = Array.isArray(token?.extraRoles) ? (token!.extraRoles as string[]) : [];
  const allowedRoles = [token?.role as string | undefined, ...extra].filter(
    (r): r is string => typeof r === "string" && r.length > 0
  );
  const wantedRole = req.cookies.get("asro.active-role")?.value;
  const activeRole =
    wantedRole && allowedRoles.includes(wantedRole) ? wantedRole : (token?.role as string);

  if (token && !cameFromExpiredSession && (path === "/login" || path === "/" || path === "")) {
    return NextResponse.redirect(new URL(getHomeRoute(activeRole), req.url));
  }

  // RBAC: ruxsatsiz sahifadan himoya (staff)
  if (token && isProtected) {
    const role = activeRole;
    if (role && !(await isAllowed(path, role, parseRelations(token.relations)))) {
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
