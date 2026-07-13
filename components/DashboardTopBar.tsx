"use client";

import { signOut } from "next-auth/react";
import {
  LogOut, User, Sun, Moon, ChevronDown, Globe,
  Bell, Settings, Menu
} from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { useMobileNav } from "@/components/MobileNavContext";
import { useTheme } from "next-themes";
import GlobalSearch from "@/components/GlobalSearch";
import FinanceAssistant from "@/components/FinanceAssistant";
import { getHomeRoute } from "@/lib/permissions";

const ROLE_LABELS: Record<string, string> = {
  super_admin:      "Super Admin",
  admin:            "Admin",
  chief_accountant: "Bosh Buxgalter",
  supervisor:       "Nazoratchi",
  accountant:       "Buxgalter",
  bank_manager:     "Bank Menejer",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin:      "#7C3AED",
  admin:            "#2563EB",
  chief_accountant: "#059669",
  supervisor:       "#D97706",
  accountant:       "#2563EB",
  bank_manager:     "#DC2626",
};

interface DashboardTopBarProps {
  userName: string;
  userEmail: string;
  userRole: string;
  avatarColor?: string;
  unreadCount?: number;
}

export function DashboardTopBar({
  userName,
  userEmail,
  userRole,
  avatarColor,
  unreadCount = 0,
}: DashboardTopBarProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { theme, setTheme } = useTheme();
  const { toggle } = useMobileNav();
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

  const roleColor = ROLE_COLORS[userRole] || "#2563EB";
  const bgColor = avatarColor || "#2563EB";

  return (
    <header
      className="flex items-center justify-between px-6 flex-shrink-0 z-30 sticky top-0"
      style={{
        height: "var(--topbar-height)",
        background: "var(--topbar-bg)",
        borderBottom: "1px solid var(--topbar-border)",
        boxShadow: "0 1px 0 0 var(--topbar-border)",
      }}
    >
      {/* Left: Search */}
      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
        <button
          onClick={toggle}
          aria-label="Menyu"
          className="md:hidden p-2 rounded-lg transition-all"
          style={{ color: "var(--text-secondary)" }}
        >
          <Menu size={20} />
        </button>
        {/* Mobil brend belgisi (sidebar yashiringanda) — rolga mos boshlang'ich sahifa */}
        <Link href={getHomeRoute(userRole)} className="md:hidden flex items-center gap-2 shrink-0" aria-label="ASRO">
          <Image src="/asro-logo-192.png" alt="ASRO" width={28} height={28} priority className="w-7 h-7 object-contain" />
          <span className="text-[15px] font-black tracking-tight whitespace-nowrap" style={{ color: "var(--text-primary)" }}>ASRO</span>
        </Link>
        {/* Global qidiruv */}
        <GlobalSearch userRole={userRole} />

        {/* AI moliyachi yordamchi */}
        <FinanceAssistant />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5">
        {/* Language */}
        <button
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all"
          style={{
            color: "var(--text-secondary)",
            fontSize: "12px",
            fontWeight: 600,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <Globe size={15} />
          <span>O&apos;zbekcha</span>
          <ChevronDown size={12} className="opacity-60" />
        </button>

        {/* Theme toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg transition-all"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            title={theme === "dark" ? "Yorug' rejim" : "Qorong'u rejim"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        )}

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative p-2 rounded-lg transition-all"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 w-2 h-2 rounded-full"
              style={{ background: "var(--accent-red)" }}
            />
          )}
        </Link>

        {/* Settings */}
        <Link
          href="/settings"
          className="p-2 rounded-lg transition-all"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <Settings size={17} />
        </Link>

        {/* Divider */}
        <div
          className="w-px h-6 mx-1"
          style={{ background: "var(--topbar-border)" }}
        />

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "";
            }}
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${bgColor}, ${bgColor}cc)`,
                boxShadow: `0 2px 8px ${bgColor}44`,
                fontSize: "12px",
              }}
            >
              {initials || <User size={14} />}
            </div>

            <div className="hidden sm:block text-left leading-none">
              <p
                className="text-[13px] font-semibold leading-none"
                style={{ color: "var(--text-primary)" }}
              >
                {userName || "Foydalanuvchi"}
              </p>
              <p
                className="text-[11px] mt-0.5 font-medium leading-none"
                style={{ color: roleColor }}
              >
                {ROLE_LABELS[userRole] || userRole}
              </p>
            </div>

            <ChevronDown
              size={14}
              className="hidden sm:block"
              style={{ color: "var(--text-muted)" }}
            />
          </button>

          {/* Dropdown */}
          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowUserMenu(false)}
              />
              <div
                className="absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden z-50 animate-scale-in"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  boxShadow:
                    "0 10px 40px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)",
                }}
              >
                {/* Header */}
                <div
                  className="px-4 py-3"
                  style={{ borderBottom: "1px solid var(--card-border)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${bgColor}, ${bgColor}cc)`,
                      }}
                    >
                      {initials || <User size={16} />}
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-[13px] font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {userName}
                      </p>
                      <p
                        className="text-[11px] truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {userEmail}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Role badge */}
                <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{
                      background: `${roleColor}15`,
                      color: roleColor,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: roleColor }}
                    />
                    {ROLE_LABELS[userRole] || userRole}
                  </span>
                </div>

                {/* Logout */}
                <div className="p-1.5">
                  <button
                    id="logout-btn"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all disabled:opacity-50"
                    style={{ color: "var(--danger)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--danger-bg)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "";
                    }}
                  >
                    <LogOut size={15} />
                    {loggingOut ? "Chiqilmoqda..." : "Tizimdan chiqish"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
