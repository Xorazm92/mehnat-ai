import NextAuth, { type Session } from "next-auth";
import { cookies } from "next/headers";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { ACTIVE_ROLE_COOKIE, rolesOf } from "@/lib/effective-role";
import { authConfig } from "./auth.config";
import {
  checkLoginRateLimit,
  clientIpFromHeaders,
  loginRateLimitRules,
  normalizeLoginId,
  recordLoginFailure,
  resetLoginRateLimit,
} from "@/lib/rateLimit";
import { logLoginFailure, logLoginSuccess, logRateLimitBlock } from "@/lib/platform/logger";
import { revalidateSessionToken } from "@/lib/sessionRevalidation";
import { getUserCompanyRelations, parseRelations } from "@/lib/userRelations";
import { verifyInitData } from "@/lib/telegramInitData";

const providers = [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Parol", type: "password" },
      },
      // `request` — original Request; klient IP'si faqat shu yerdan olinadi.
      // Xodim ham, mijoz ham SHU authorize orqali kiradi (bitta /login sahifasi),
      // shuning uchun rate limit ikkala portal uchun bir xil qo'llanadi.
      async authorize(credentials, request) {
        const ip = clientIpFromHeaders(request?.headers);
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        const login = normalizeLoginId(email);

        if (!email || !password) {
          logLoginFailure({ reason: "missing_credentials", ip, kind: "unknown" });
          return null;
        }

        // Brute-force himoyasi: IP + normallashtirilgan login bo'yicha 15 daq
        // oynada 5 xato urinish (+ IP va hisob bo'yicha kengroq zaxira chegaralar).
        // Faqat muvaffaqiyatsizlik hisoblanadi.
        const rules = loginRateLimitRules(ip, login);
        const gate = await checkLoginRateLimit(rules);
        if (!gate.allowed) {
          logRateLimitBlock({
            scope: gate.blockedScope ?? "unknown",
            ip,
            login,
            retryAfterMs: gate.retryAfterMs,
            backend: gate.backend,
          });
          // Klientga baribir generik "Invalid credentials" ketadi — bloklanganlik
          // faktini oshkor qilmaymiz (hisob mavjudligini bilib olish yo'li).
          return null;
        }

        // 1) Staff (User) — mavjud bo'lsa faqat shu tekshiriladi.
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
          if (!user.isActive) {
            await recordLoginFailure(rules);
            logLoginFailure({ reason: "inactive_account", login, ip, kind: "staff" });
            return null;
          }
          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) {
            await recordLoginFailure(rules);
            logLoginFailure({ reason: "bad_password", login, ip, kind: "staff" });
            return null;
          }
          await resetLoginRateLimit(rules);
          logLoginSuccess({ userId: user.id, kind: "staff", ip });
          return {
            id: user.id,
            email: user.email,
            name: user.fullName,
            role: user.role,
            extraRoles: user.extraRoles ?? [],
            avatarColor: user.avatarColor,
          };
        }

        await recordLoginFailure(rules);
        logLoginFailure({ reason: "unknown_account", login, ip, kind: "unknown" });
        return null;
      },
    }),

    // Telegram Mini App kirishi. Parol yo'q: Telegram bergan `initData` bot
    // token bilan HMAC imzolangan, uni tekshirish o'zi identifikatsiya.
    // Rate limit qo'yilmagan — imzoni topish uchun bot tokenini bilish kerak,
    // ya'ni bu yerda "urinib ko'rish" degan hujum yo'zasi yo'q.
    CredentialsProvider({
      id: "telegram",
      name: "Telegram Mini App",
      credentials: { initData: { label: "initData", type: "text" } },
      async authorize(credentials) {
        const initData = typeof credentials?.initData === "string" ? credentials.initData : "";
        const verified = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN ?? "");
        if (!verified.ok) {
          // Sabab (imzo/muddat/bo'sh) faqat debug logga — foydalanuvchiga ham,
          // audit satriga ham qaysi bosqichda to'xtagani chiqarilmaydi.
          logLoginFailure({ reason: "telegram_invalid", kind: "staff" });
          return null;
        }

        // Faqat OLDINDAN bog'langan xodim kira oladi. Bog'lash botda, telefon
        // raqami orqali bo'ladi — Mini App yangi hisob ochmaydi.
        const user = await prisma.user.findUnique({
          where: { telegramUserId: verified.telegramUserId },
        });
        if (!user) {
          logLoginFailure({ reason: "telegram_unlinked", kind: "staff" });
          return null;
        }
        if (!user.isActive) {
          logLoginFailure({ reason: "inactive_account", login: user.email, kind: "staff" });
          return null;
        }

        logLoginSuccess({ userId: user.id, kind: "staff" });
        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          extraRoles: user.extraRoles ?? [],
          avatarColor: user.avatarColor,
        };
      },
    }),
];

const { handlers, signIn, signOut, auth: baseAuth } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? "";
        token.role = user.role;
        // QO'SHIMCHA ROLLAR — ikki rolli xodimlar (bank klient + buxgalter
        // kabi). Faol rol cookie orqali tanlanadi (server/activeRole.ts),
        // barcha tekshiruvlar `session.user.role` ni o'qiyveradi.
        token.extraRoles = user.extraRoles ?? [];
        token.avatarColor = user.avatarColor;
        token.kind = user.kind ?? "staff";
        token.companyId = user.companyId ?? null;
        // Haqiqiy biriktiruvlar — sahifa darvozasi shularga ham tayanadi
        // (lib/permissions.ts → VIEWS_BY_RELATION). Kirish paytida bir marta;
        // keyin `revalidateSessionToken` har 5 daqiqada yangilaydi.
        token.relations = user.id ? await getUserCompanyRelations(user.id) : [];
        token.checkedAt = Date.now();
        // Mutlaq sessiya muddatining boshlanishi. FAQAT shu yerda —
        // `user` mavjud bo'lgan, ya'ni haqiqiy kirish bo'lgan paytda —
        // qo'yiladi. Keyingi so'rovlar buni yangilamaydi, shuning uchun
        // muddat faollikda cho'zilmaydi.
        token.loginAt = Date.now();
        return token;
      }

      // JWT strategiyada logout-siz revokatsiya yo'q: bloklangan xodim yoki
      // o'zgargan rol aks holda 7 kunlik sessiya tugaguncha kuchda qolardi.
      // Mantiq lib/sessionRevalidation.ts da — u yerdan test bilan chaqirsa
      // bo'ladi (bu callback NextAuth() ichida yopiq).
      return (await revalidateSessionToken(token)) as typeof token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        // `role` — FAOL rol. Standartda asosiy rol; ikki rolli xodim
        // almashtirgich orqali boshqasiga o'tishi mumkin (cookie asosida,
        // `lib/effective-role.ts` da tekshiriladi).
        session.user.role = token.role;
        session.user.primaryRole = token.role;
        session.user.roles = [token.role, ...(token.extraRoles ?? [])]
          .filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);
        session.user.avatarColor = token.avatarColor;
        session.user.kind = token.kind;
        session.user.companyId = token.companyId;
        // Server komponentlari menyuni AYNAN proxy darvozasi bilan bir xil
        // manbadan chizishi uchun — aks holda ekran menyuda ko'rinib,
        // ochilganda 403 bo'lardi (yoki teskarisi).
        session.user.relations = parseRelations(token.relations);
      }
      return session;
    },
  },
});

/**
 * FAOL ROL — sessiya ustidan oxirgi qatlam.
 *
 * Ikki rolli xodim almashtirgich orqali tanlagan rol cookie'da turadi
 * (`server/activeRole.ts`). Bu yerda u TEKSHIRILIB (foydalanuvchida
 * haqiqatan shu rol bormi) `session.user.role` ga yoziladi — ya'ni kod
 * bo'ylab yuzlab `session.user.role` tekshiruvi O'ZGARMASDAN faol rolni
 * oladi. Tekshiruv server tomonda: cookie'ni qo'lda o'zgartirish hech
 * narsa bermaydi, chunki ruxsat ro'yxati tokenda.
 */
export const auth = async (): Promise<Session | null> => {
  const session = await baseAuth();
  if (!session?.user || session.user.kind === "client") return session;

  const wanted = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value;
  if (!wanted) return session;

  // Tekshiruv server tomonda: faqat SHU odamning rollari ichida tanlov
  // kuchga kiradi (lib/effective-role.ts).
  const roles = rolesOf(session);
  if (roles.includes(wanted)) {
    session.user.role = wanted;
  }
  return session;
};

export { handlers, signIn, signOut };
