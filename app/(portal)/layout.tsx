import { signOut } from "@/lib/auth";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh" style={{ background: "var(--bg, var(--bg-sunken))" }}>
      <header
        className="h-14 flex items-center justify-between px-4 md:px-6 border-b"
        style={{ borderColor: "var(--border, var(--rule))", background: "var(--card-bg)" }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>ASRO</span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Mijoz kabineti</span>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-primary)" }}>
            Chiqish
          </button>
        </form>
      </header>
      <main className="max-w-4xl mx-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
