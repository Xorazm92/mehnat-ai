import type { DefaultSession } from "next-auth";

// next-auth Session/JWT tur kengaytmasi — authorize() da qaytariladigan
// qo'shimcha maydonlar (role, avatarColor) tiplarga qo'shiladi. Shu tufayli
// kod bo'ylab `(session.user as any).role` kabi castlar shart emas.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      avatarColor?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    avatarColor?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    avatarColor?: string | null;
  }
}
