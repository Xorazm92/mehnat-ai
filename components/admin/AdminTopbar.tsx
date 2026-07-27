"use client";

import React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon, ExternalLink, Menu } from "lucide-react";
import { useMobileNav } from "@/components/MobileNavContext";

export function AdminTopbar({
  userName,
  role,
  avatarColor,
}: {
  userName: string;
  role: string;
  avatarColor?: string;
}) {
  const { theme, setTheme } = useTheme();
  const { toggle } = useMobileNav();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted && theme === "dark";

  const initials = userName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header
      className="h-16 flex-shrink-0 flex items-center justify-between px-3 md:px-5"
      style={{
        background: "var(--topbar-bg)",
        borderBottom: "1px solid var(--rule)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={toggle} aria-label="Menyu" className="icon-btn md:hidden">
          <Menu size={20} />
        </button>
        {/* Bu yerda qotirilgan "ASRO / Admin" satri turardi: u semantik emas,
            bosilmaydi va `/admin/users` da ham, `/admin/sla-policies` da ham
            AYNAN bir xil ko'rinardi. Endi haqiqiy breadcrumb `<main>` ichida. */}
        <span className="font-mono text-meta font-medium uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>
          ASRO
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Link
          href="/dashboard"
          className="hidden sm:flex items-center gap-1.5 px-3 h-11 rounded-lg font-mono text-micro font-semibold uppercase transition-colors duration-100 hover:bg-[var(--bg-hover)]"
          style={{
            border: "1px solid var(--rule-strong)",
            color: "var(--text-secondary)",
            letterSpacing: "0.1em",
          }}
        >
          <ExternalLink size={13} /> Ilova
        </Link>

        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="icon-btn"
          aria-label={isDark ? "Yorug' rejim" : "Qorong'u rejim"}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="flex items-center gap-2.5 pl-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-mono text-meta font-bold flex-shrink-0"
            style={{ background: avatarColor || "var(--accent-purple)" }}
          >
            {initials || "A"}
          </div>
          <div className="hidden sm:block leading-none">
            <div className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>
              {userName}
            </div>
            <div
              className="font-mono text-micro font-medium uppercase mt-1"
              style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}
            >
              {role}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
