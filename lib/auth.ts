import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.isActive) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          avatarColor: user.avatarColor,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? "";
        token.role = user.role;
        token.avatarColor = user.avatarColor;
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
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id },
            select: { isActive: true, role: true, avatarColor: true },
          });
          if (!dbUser || !dbUser.isActive) return null;
          token.role = dbUser.role;
          token.avatarColor = dbUser.avatarColor;
          token.checkedAt = Date.now();
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
      }
      return session;
    },
  },
});
