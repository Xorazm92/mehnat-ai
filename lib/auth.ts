import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { RATE_LIMIT } from "@/lib/constants";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/rateLimit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Parol", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Brute-force himoyasi: hisob bo'yicha muvaffaqiyatsiz urinishlarni
        // 15 daq oynada 5 taga cheklaymiz. Faqat muvaffaqiyatsizlik hisoblanadi.
        const rlKey = `login:${(credentials.email as string).toLowerCase()}`;
        if (!checkRateLimit(rlKey, RATE_LIMIT.LOGIN_ATTEMPTS, RATE_LIMIT.LOGIN_WINDOW_MS).allowed) {
          console.warn(`[auth] rate-limited login for ${rlKey}`);
          return null;
        }

        // 1) Staff (User) — mavjud bo'lsa faqat shu tekshiriladi.
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (user) {
          if (!user.isActive) {
            recordFailure(rlKey, RATE_LIMIT.LOGIN_WINDOW_MS);
            return null;
          }
          const isValid = await bcrypt.compare(credentials.password as string, user.passwordHash);
          if (!isValid) {
            recordFailure(rlKey, RATE_LIMIT.LOGIN_WINDOW_MS);
            return null;
          }
          resetRateLimit(rlKey);
          return {
            id: user.id,
            email: user.email,
            name: user.fullName,
            role: user.role,
            avatarColor: user.avatarColor,
          };
        }

        // 2) Staff topilmadi → client portal identity (alohida jadval).
        const client = await prisma.clientUser.findUnique({
          where: { email: credentials.email as string },
        });
        if (client && client.isActive && (await bcrypt.compare(credentials.password as string, client.passwordHash))) {
          resetRateLimit(rlKey);
          return {
            id: client.id,
            email: client.email,
            name: client.fullName,
            role: "client",
            kind: "client",
            companyId: client.companyId,
          };
        }

        recordFailure(rlKey, RATE_LIMIT.LOGIN_WINDOW_MS);
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? "";
        token.role = user.role;
        token.avatarColor = user.avatarColor;
        token.kind = user.kind ?? "staff";
        token.companyId = user.companyId ?? null;
        token.checkedAt = Date.now();
        return token;
      }

      // JWT strategiyada logout-siz revokatsiya yo'q: bloklangan xodim yoki
      // o'zgargan rol aks holda 7 kunlik sessiya tugaguncha kuchda qolardi.
      // Har 5 daqiqada bazadan qayta tekshiramiz: o'chirilgan foydalanuvchi
      // sessiyasi bekor bo'ladi (null), rol/avatar yangilanadi. DB nosozligida
      // sessiyani saqlab qolamiz — availability xavfsizlik tekshiruvidan ustun
      // emas, lekin bu yerda tekshiruvni keyingi so'rovda takrorlash yetarli.
      const REVALIDATE_MS = 5 * 60_000;
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      if (typeof token.id === "string" && token.id && Date.now() - checkedAt > REVALIDATE_MS) {
        try {
          if (token.kind === "client") {
            // Client identity — ClientUser jadvaliga qarab qayta tekshiramiz.
            const c = await prisma.clientUser.findUnique({
              where: { id: token.id },
              select: { isActive: true, companyId: true },
            });
            if (!c || !c.isActive) return null;
            token.companyId = c.companyId;
            token.checkedAt = Date.now();
          } else {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id },
              select: { isActive: true, role: true, avatarColor: true },
            });
            if (!dbUser || !dbUser.isActive) return null;
            token.role = dbUser.role;
            token.avatarColor = dbUser.avatarColor;
            token.checkedAt = Date.now();
          }
        } catch (e) {
          console.error("[auth] jwt qayta-tekshiruv xatosi (sessiya saqlanadi):", e);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.avatarColor = token.avatarColor;
        session.user.kind = token.kind;
        session.user.companyId = token.companyId;
      }
      return session;
    },
  },
});
