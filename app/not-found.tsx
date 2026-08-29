import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { auth } from "@/lib/auth";
import { getHomeRoute } from "@/lib/platform/permissions";

export const metadata = { title: "Sahifa topilmadi" };

/**
 * 404.
 *
 * Bungacha loyihada `not-found.tsx` yo'q edi, holbuki `notFound()` ikki joyda
 * chaqiriladi (`reports/proof/[id]`, `admin/m/[id]`). Natijada foydalanuvchi
 * Next.js ning uslublanmagan standart sahifasiga tushardi — qobiqdan tashqarida,
 * o'zbekcha emas va qaytish yo'lisiz.
 */
export default async function NotFound() {
  const session = await auth();
  const role = session?.user?.role as string | undefined;
  const homeHref = role ? getHomeRoute(role) : "/login";

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: "var(--bg-primary)" }}>
      <div
        className="w-full max-w-md rounded-xl p-8 text-center"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}
      >
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-5"
          style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}
        >
          <FileQuestion size={30} />
        </div>
        <div className="text-5xl font-semibold tabular-nums mb-2" style={{ color: "var(--text-muted)" }}>
          404
        </div>
        <h1 className="text-xl font-semibold tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>
          Sahifa topilmadi
        </h1>
        <p className="text-body font-medium mb-6" style={{ color: "var(--text-secondary)" }}>
          Siz izlagan sahifa o&apos;chirilgan yoki manzil noto&apos;g&apos;ri.
        </p>
        <Link
          href={homeHref}
          className="inline-flex px-6 py-3 rounded-xl text-meta font-bold uppercase tracking-widest transition-colors"
          style={{ background: "var(--brand)", color: "var(--on-brand)" }}
        >
          {session ? "Bosh sahifaga qaytish" : "Kirish"}
        </Link>
      </div>
    </div>
  );
}
