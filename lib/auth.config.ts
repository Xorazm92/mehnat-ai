import type { NextAuthConfig } from "next-auth";

/**
 * Single source of truth for whether auth cookies use the `__Secure-` prefix.
 * MUST match on both sides of the session flow:
 *   - next-auth SETS the cookie with this (auth.config `useSecureCookies` below),
 *   - proxy.ts READS it back via `getToken({ secureCookie: USE_SECURE_COOKIES })`.
 * A mismatch is fatal: v5 salts the JWT with the (prefixed) cookie name, so the
 * wrong prefix means the token silently fails to decode → user looks logged out.
 * Production is ALWAYS secure (NODE_ENV=production) so a container that boots
 * without AUTH_URL can't silently fall back to non-secure cookies and break
 * login; otherwise derived from the origin scheme (https → secure). Edge-safe
 * (no Node deps), so proxy.ts can import it.
 */
export const USE_SECURE_COOKIES =
  process.env.NODE_ENV === "production" ||
  (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.startsWith("https://") === true;

/**
 * 24 soat — MUTLAQ sessiya muddati.
 *
 * Avval 7 kun edi, lekin JWT strategiyasida token faollikda qayta beriladi,
 * ya'ni har kuni ishlaydigan xodim amalda HECH QACHON chiqmasdi: bir marta
 * kirilgan brauzer oylab ochiq qolardi. Endi muddat kirish paytidan boshlab
 * sanaladi va faollik uni uzaytirmaydi — `lib/sessionRevalidation.ts` dagi
 * `loginAt` tekshiruvi buni majburlaydi.
 *
 * Kundalik qayta kirish to'siq emas: xodim parolni istalgan payt botdagi
 * "🔑 Sayt paroli" tugmasidan oladi.
 */
export const SESSION_MAX_AGE = 60 * 60 * 24;

/**
 * Mini App ICHIDA kirish uchun cookie'lar `SameSite=None` bo'lishi SHART.
 *
 * Telegram Mini App'ni odatdagi brauzer sahifasi kabi ochmaydi — u boshqa
 * saytga joylashtirilgan kontekstda (Telegram Web'da iframe, ilovada webview)
 * yuklanadi. Bunday kontekstda `SameSite=Lax` cookie umuman yuborilmaydi, va
 * NextAuth kirishni CSRF tokeni bilan boshlaydi: token GET bilan qo'yiladi,
 * POST bilan qaytishi kerak. Cookie yuborilmagach POST tokensiz keladi va
 * server `MissingCSRF` bilan rad etadi — prod loglarida aynan shu turgan edi,
 * ekranda esa foydalanuvchi "Kirib bo'lmadi" degan bir jumlani ko'rardi.
 *
 * NARXI ochiq aytiladi: `SameSite=None` cookie boshqa saytdan kelgan
 * so'rovlarga ham qo'shiladi, ya'ni SameSite bergan CSRF himoyasi yo'qoladi.
 * Uning o'rnida ikkita to'siq qoladi va ikkalasi ham faol: NextAuth'ning o'z
 * CSRF tokeni (kirish amallari uchun) va Next.js Server Action'larining
 * Origin tekshiruvi (ma'lumot o'zgartiradigan hamma yo'l shundan o'tadi).
 *
 * Faqat HTTPS'da: `SameSite=None` `Secure` siz brauzer tomonidan rad etiladi,
 * shuning uchun lokal HTTP ishga tushirishda odatdagi `Lax` qoladi.
 */
const SAME_SITE = USE_SECURE_COOKIES ? "none" : "lax";
const PREFIX = USE_SECURE_COOKIES ? "__Secure-" : "";

/**
 * Nomlar next-auth v5 ning O'Z sukut nomlari bilan AYNAN bir xil bo'lishi
 * kerak: `proxy.ts` tokenni `getToken()` orqali o'qiydi va v5 JWT'ni (prefiksli)
 * cookie nomi bilan tuzlaydi — nom bir harfga farq qilsa token jimgina
 * ochilmaydi va kirgan foydalanuvchi chiqib qolgandek ko'rinadi.
 */
export const authConfig = {
  // The app is always served behind a trusted proxy (nginx/ALB) in prod or on
  // localhost in dev, so trust the forwarded Host unconditionally. Without this
  // v5 rejects the proxied Host and login breaks (previously depended on the
  // AUTH_TRUST_HOST env being remembered at deploy time).
  trustHost: true,
  basePath: "/api/auth",
  useSecureCookies: USE_SECURE_COOKIES,
  cookies: {
    sessionToken: {
      name: `${PREFIX}authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: SAME_SITE,
        path: "/",
        secure: USE_SECURE_COOKIES,
      },
    },
    callbackUrl: {
      name: `${PREFIX}authjs.callback-url`,
      options: {
        httpOnly: true,
        sameSite: SAME_SITE,
        path: "/",
        secure: USE_SECURE_COOKIES,
      },
    },
    csrfToken: {
      // v5 xavfsiz rejimda ATAYIN `__Host-` prefiksini ishlatadi (Path=/,
      // Secure va Domain'siz bo'lishni majburlaydi) — bu `SameSite=None`
      // bilan to'liq mos.
      name: `${USE_SECURE_COOKIES ? "__Host-" : ""}authjs.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: SAME_SITE,
        path: "/",
        secure: USE_SECURE_COOKIES,
      },
    },
  },
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [], // Providers without Node dependencies, empty for now
} satisfies NextAuthConfig;
