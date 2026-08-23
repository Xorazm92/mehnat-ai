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
      /** "staff" (default) | "client" — client portal identity. */
      kind?: string;
      /** Client portal: the company the client belongs to. */
      companyId?: string | null;
      /**
       * Foydalanuvchi FAOL firmalarda egallagan mas'uliyatlar — lavozimdan
       * qat'i nazar (lib/userRelations.ts). Sahifa darvozasi shularga ham
       * tayanadi: bank-klient roli bilan buxgalter biriktiruvi bo'lgan odam
       * buxgalterlik ekranlarini ochadi.
       */
      relations?: string[];
      /** ASOSIY rol — bazadagi `User.role`. Faol roldan farqli. */
      primaryRole?: string;
      /** Barcha rollar (asosiy + qo'shimchalar) — ikki rolli xodimlar uchun. */
      roles?: string[];
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    extraRoles?: string[] | null;
    avatarColor?: string | null;
    kind?: string;
    companyId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    /** Qo'shimcha tizim rollari (User.extraRoles). */
    extraRoles?: string[];
    avatarColor?: string | null;
    kind?: string;
    companyId?: string | null;
    /** Firmadagi mas'uliyatlar — `proxy.ts` darvozasi baza so'rovisiz o'qiydi. */
    relations?: string[];
  }
}
