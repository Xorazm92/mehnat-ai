"use client";

import React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon, ExternalLink } from "lucide-react";

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
      className="h-16 flex-shrink-0 flex items-center justify-between px-6"
      style={{ background: "var(--topbar-bg)", borderBottom: "1px solid var(--topbar-border)" }}
    >
      <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: "var(--text-secondary)" }}>
        <span style={{ color: "var(--text-muted)" }}>ASRO</span>
        <span style={{ color: "var(--text-muted)" }}>/</span>
        <span style={{ color: "var(--text-primary)" }}>Admin</span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all"
          style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
        >
          <ExternalLink size={13} /> Ilova
        </Link>

        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
          style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
          aria-label="Mavzuni almashtirish"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="flex items-center gap-2.5 pl-2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-black"
            style={{ background: avatarColor || "linear-gradient(135deg, #7C3AED, #4F46E5)" }}
          >
            {initials || "A"}
          </div>
          <div className="hidden sm:block leading-tight">
            <div className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{userName}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
