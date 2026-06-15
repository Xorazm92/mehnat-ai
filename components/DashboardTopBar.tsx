"use client";

import { signOut } from "next-auth/react";
import { LogOut, User, Sun, Moon, Building2, ChevronDown, Globe } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  chief_accountant: "Bosh Buxgalter",
  supervisor: "Nazoratchi",
  accountant: "Buxgalter",
  bank_manager: "Bank Menejer",
};

interface DashboardTopBarProps {
  userName: string;
  userEmail: string;
  userRole: string;
  avatarColor?: string;
}

export function DashboardTopBar({
  userName,
  userEmail,
  userRole,
  avatarColor,
}: DashboardTopBarProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut({ callbackUrl: "/login" });
    } catch {
      toast.error("Chiqishda xatolik");
      setLoggingOut(false);
    }
  };

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="flex items-center justify-between px-6 h-20 bg-bg-secondary border-b border-border-glass flex-shrink-0 z-10 sticky top-0">
      {/* Left: UTY BI Logo and Dropdown */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
           <h2 className="text-xl font-black text-accent-blue tracking-wider">UTY<span className="text-text-primary">BI</span></h2>
        </div>
        
        {/* Korxona dropdowni placeholder */}
        <button className="flex items-center gap-2 px-4 py-2 bg-bg-primary border border-border-glass rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <Building2 size={16} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">"O'ztemiryo'lxisob"</span>
            <ChevronDown size={16} className="text-text-secondary ml-2" />
        </button>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Til tanlash */}
        <button className="flex items-center gap-2 px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all border border-transparent">
          <Globe size={18} />
          <span className="text-sm font-medium">O'zbekcha</span>
          <ChevronDown size={14} />
        </button>

        {/* Theme Toggler */}
        {mounted && (
            <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2.5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all border border-transparent"
            title="Mavzuni o'zgartirish"
            >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
        )}

        {/* User info */}
        <div className="flex items-center gap-3 pl-4 border-l border-border-glass ml-2">
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-black/10 flex-shrink-0 border border-border-glass"
            style={{ backgroundColor: avatarColor || "var(--accent-blue)" }}
          >
            {initials || <User size={16} />}
          </div>

          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-text-primary leading-none">{userName}</p>
            <p className="text-xs text-text-secondary mt-1">
              {ROLE_LABELS[userRole] || userRole}
            </p>
          </div>

          {/* Logout */}
          <button
            id="logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
            className="ml-1 p-2.5 text-text-secondary hover:text-accent-red hover:bg-accent-red/10 rounded-xl transition-all disabled:opacity-50"
            title="Chiqish"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
