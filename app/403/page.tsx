import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import { getHomeRoute } from "@/lib/permissions";

export const metadata = { title: "Kirish taqiqlangan" };

/**
 * 403 — kirish taqiqlangan.
 *
 * Qaytish tugmasi ATAYLAB rolga qarab hisoblanadi. Ilgari u `/dashboard` ga
 * qotirilgan edi, lekin `accountant` va `bank_manager` rollarida `dashboard`
 * ko'rinishi yo'q — `proxy.ts` ularni yana `/403` ga qaytarardi. Ya'ni yagona
 * qutulish tugmasi foydalanuvchini xuddi shu sahifaga olib kelaverardi.
 */
export default async function ForbiddenPage() {
  const session = await auth();
  const role = session?.user?.role as string | undefined;
  const homeHref = role ? getHomeRoute(role) : "/login";

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4"
      style={{ background: "var(--bg-primary)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-8 text-center shadow-lg"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      >
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-5"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
        >
          <ShieldAlert size={30} />
        </div>
        <div
          className="text-5xl font-semibold tabular-nums mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          403
        </div>
        <h1
          className="text-lg font-semibold tracking-tight mb-2"
          style={{ color: "var(--text)" }}
        >
          Kirish taqiqlangan
        </h1>
        <p
          className="text-body font-medium mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          Sizda bu sahifaga kirish huquqi yo&apos;q.
        </p>
        <Link
          href={homeHref}
          className="inline-flex px-6 py-3 rounded-xl text-white text-meta font-bold uppercase tracking-widest transition-all shadow-md hover:shadow-lg active:scale-95"
          style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-blue-hover))" }}
        >
          {session ? "Bosh sahifaga qaytish" : "Kirish"}
        </Link>
      </div>
    </div>
  );
}
