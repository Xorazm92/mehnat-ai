"use client";

import { signOut } from "next-auth/react";
import {
  LogOut, User, Sun, Moon, ChevronDown,
  Bell, BellOff, Settings, PanelLeftClose, PanelLeftOpen
} from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { useMobileNav } from "@/components/MobileNavContext";
import { useDismissable } from "@/hooks/useDismissable";
import { useTheme } from "next-themes";
import GlobalSearch from "@/components/GlobalSearch";
import FinanceAssistant from "@/components/FinanceAssistant";
import { getHomeRoute, type AppView } from "@/lib/permissions";
import RoleContextSwitcher from "@/components/RoleContextSwitcher";
import MultiRoleSwitcher from "@/components/MultiRoleSwitcher";
import type { ContextOption, RoleContext } from "@/lib/roleContext";
import {
  useNotificationSound,
  isNotifySoundEnabled,
  setNotifySoundEnabled,
} from "@/hooks/useNotificationSound";

const ROLE_LABELS: Record<string, string> = {
  super_admin:      "Super Admin",
  admin:            "Admin",
  chief_accountant: "Bosh Buxgalter",
  supervisor:       "Nazoratchi",
  accountant:       "Buxgalter",
  bank_manager:     "Bank Menejer",
};

// Tokenlar orqali — avval bu yerda light-tema hex qiymatlari qotib qolgan edi,
// shu bois rol rangi qorong'u temada doim noto'g'ri ko'k bo'lib qolardi.
const ROLE_COLORS: Record<string, string> = {
  super_admin:      "var(--accent-purple)",
  admin:            "var(--brand)",
  chief_accountant: "var(--success)",
  supervisor:       "var(--warning)",
  accountant:       "var(--brand)",
  bank_manager:     "var(--accent-indigo)",
};

interface DashboardTopBarProps {
  userName: string;
  userEmail: string;
  userRole: string;
  avatarColor?: string;
  unreadCount?: number;
  /** Ko'p vazifali odam uchun kontekst tanlash (bo'sh bo'lsa chizilmaydi). */
  roleContexts?: ContextOption[];
  roleContext?: RoleContext;
  /** Tizim rollari — ikki rolli xodim uchun (server/activeRole.ts). */
  multiRoles?: { roles: string[]; active: string } | null;
  /** Admin RBAC override'lari — qidiruv ham yon panel bilan bir xil ko'rsin. */
  allowedViews?: AppView[];
}

export function DashboardTopBar({
  userName,
  userEmail,
  userRole,
  avatarColor,
  unreadCount = 0,
  allowedViews,
  roleContexts = [],
  roleContext = "all",
  multiRoles = null,
}: DashboardTopBarProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Tashqariga bosilganda / Escape'da yopiladi; boshqa ochilma tetigini bosish
  // ham buni yopadi (bir vaqtda faqat bitta popover ochiq).
  const userMenuRef = useDismissable<HTMLDivElement>(showUserMenu, () => setShowUserMenu(false));
  const { theme, setTheme } = useTheme();
  const { toggle, toggleCollapsed, collapsed } = useMobileNav();
  const [mounted, setMounted] = useState(false);

  // localStorage faqat brauzerda mavjud — SSR va birinchi render mos kelishi
  // uchun boshlang'ich qiymat `false`, keyin mount'da haqiqiy holat o'qiladi.
  const [soundOn, setSoundOn] = useState(false);
  useNotificationSound(unreadCount, soundOn);

  useEffect(() => {
    setMounted(true);
    setSoundOn(isNotifySoundEnabled());
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotifySoundEnabled(next);
    toast.success(next ? "Bildirishnoma ovozi yoqildi" : "Bildirishnoma ovozi o'chirildi");
  };

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

  const roleColor = ROLE_COLORS[userRole] || "var(--brand)";
  // avatarColor foydalanuvchi profilidan keladigan qiymat; bo'lmasa brend.
  const bgColor = avatarColor || "var(--brand)";

  return (
    <header
      className="flex items-center justify-between px-3 md:px-5 flex-shrink-0 sticky top-0"
      style={{
        height: "var(--topbar-height)",
        background: "var(--topbar-bg)",
        borderBottom: "1px solid var(--rule)",
        zIndex: "var(--z-nav)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Left: Search */}
      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
        {/* Yon panelni yig'ish/ochish (Mobil + Desktop) */}
        <button
          onClick={() => {
            if (window.innerWidth < 768) {
              toggle();
            } else {
              toggleCollapsed();
            }
          }}
          aria-label={collapsed ? "Yon panelni ochish" : "Yon panelni yig'ish"}
          className="icon-btn flex"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        {/* Mobil brend belgisi (sidebar yashiringanda) — rolga mos boshlang'ich sahifa */}
        <Link href={getHomeRoute(userRole)} className="md:hidden flex items-center gap-2 shrink-0" aria-label="ASRO">
          <Image src="/asro-logo-192.png" alt="ASRO" width={26} height={26} priority className="w-[26px] h-[26px] object-contain" />
          <span className="text-sm font-bold tracking-tight whitespace-nowrap" style={{ color: "var(--text-primary)" }}>ASRO</span>
        </Link>
        {/* Qidiruv + AI */}
        <div className="flex items-center gap-2 md:gap-3">
          <GlobalSearch userRole={userRole} allowedViews={allowedViews} />
          <FinanceAssistant />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5">
        {/* Til tanlagich olib tashlandi: interfeys siyosat bo'yicha faqat o'zbek
            (lotin) tilida, `lang` "uz" ga qotirilgan — ya'ni tanlanadigan ikkinchi
            til yo'q. Tugmada `onClick` bo'lmagani holda ChevronDown turardi, ya'ni
            u mavjud bo'lmagan menyuni va'da qilardi. */}

        {/* Theme toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="icon-btn"
            aria-label={theme === "dark" ? "Yorug' rejim" : "Qorong'u rejim"}
            title={theme === "dark" ? "Yorug' rejim" : "Qorong'u rejim"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        )}

        {/* Rol konteksti — qaysi sifatda ishlayotgani */}
        <RoleContextSwitcher options={roleContexts} current={roleContext} />

        {/* TIZIM ROLI — ikki rolli xodimlar (bank klient + buxgalter kabi).
            Bir rolli odamda chizilmaydi. */}
        {multiRoles && <MultiRoleSwitcher roles={multiRoles.roles} active={multiRoles.active} />}

        {/* Notifications */}
        <Link
          href="/notifications"
          className="icon-btn relative"
          aria-label={unreadCount > 0 ? `Xabarlar — ${unreadCount} ta o'qilmagan` : "Xabarlar"}
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span
              className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full"
              style={{ background: "var(--danger)", outline: "2px solid var(--topbar-bg)" }}
            />
          )}
        </Link>

        {/* Bildirishnoma ovozi — yoq/o'chir. mounted'dan keyin, chunki holat
            localStorage'da (SSR'da noma'lum). */}
        {mounted && (
          <button
            onClick={toggleSound}
            className="icon-btn"
            aria-label={soundOn ? "Bildirishnoma ovozini o'chirish" : "Bildirishnoma ovozini yoqish"}
            title={soundOn ? "Ovoz yoqilgan" : "Ovoz o'chirilgan"}
            style={soundOn ? undefined : { opacity: 0.55 }}
          >
            {soundOn ? <Bell size={17} /> : <BellOff size={17} />}
          </button>
        )}

        {/* Profil sozlamalari — `/settings` endi kabinetning shu yorlig'iga
            yo'naltiradi, shuning uchun to'g'ridan-to'g'ri manzil beriladi
            (ortiqcha redirect qadamisiz). */}
        <Link href="/cabinet?tab=profile" className="icon-btn" aria-label="Profil sozlamalari" title="Profil sozlamalari">
          <Settings size={17} />
        </Link>

        {/* Divider */}
        <div className="w-px h-6 mx-1" style={{ background: "var(--rule)" }} />

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            aria-label="Foydalanuvchi menyusi"
            aria-expanded={showUserMenu}
            className="flex items-center gap-2.5 px-1.5 h-11 rounded-lg transition-colors duration-100 hover:bg-[var(--bg-hover)]"
          >
            {/* Avatar — tekis to'ldirish; gradient va soya olib tashlandi */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-mono text-meta font-bold flex-shrink-0"
              style={{ background: bgColor }}
            >
              {initials || <User size={14} />}
            </div>

            <div className="hidden sm:block text-left leading-none">
              <p
                className="text-body font-semibold leading-none"
                style={{ color: "var(--text-primary)" }}
              >
                {userName || "Foydalanuvchi"}
              </p>
              <p
                className="font-mono text-micro mt-1 font-medium leading-none uppercase"
                style={{ color: roleColor, letterSpacing: "0.08em" }}
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
              <div
                className="absolute right-0 top-full mt-2 w-60 rounded-xl overflow-hidden animate-scale-in layer-overlay"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--rule-strong)",
                  zIndex: "var(--z-popover)",
                }}
              >
                {/* Header */}
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--rule)" }}>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-mono text-body font-bold flex-shrink-0"
                      style={{ background: bgColor }}
                    >
                      {initials || <User size={16} />}
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-body font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {userName}
                      </p>
                      <p
                        className="font-mono text-micro truncate mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {userEmail}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Role badge */}
                <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--rule)" }}>
                  <span
                    className="inline-flex items-center gap-1.5 font-mono text-micro font-semibold uppercase"
                    style={{ color: roleColor, letterSpacing: "0.1em" }}
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
                    className="w-full flex items-center gap-2.5 px-2.5 h-11 rounded-lg text-body font-medium transition-colors duration-100 disabled:opacity-50 hover:bg-[var(--danger-bg)]"
                    style={{ color: "var(--danger)" }}
                  >
                    <LogOut size={15} />
                    {loggingOut ? "Chiqilmoqda..." : "Tizimdan chiqish"}
                  </button>
                </div>
              </div>
          )}
        </div>
      </div>
    </header>
  );
}
