import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function ForbiddenPage() {
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
          className="text-5xl font-black tabular-nums mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          403
        </div>
        <h1
          className="text-lg font-black uppercase tracking-tight mb-2"
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
          href="/dashboard"
          className="inline-flex px-6 py-3 rounded-xl text-white text-meta font-bold uppercase tracking-widest transition-all shadow-md hover:shadow-lg active:scale-95"
          style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-blue-hover))" }}
        >
          Dashboardga qaytish
        </Link>
      </div>
    </div>
  );
}
