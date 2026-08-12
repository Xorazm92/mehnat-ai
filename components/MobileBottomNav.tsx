"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { canSeeView, type UserRole, type AppView } from "@/lib/permissions";
import { NAV_ITEMS, MOBILE_NAV_ORDER, MOBILE_NAV_SHORT_LABELS } from "@/lib/navigation";
import { useMobileNav } from "@/components/MobileNavContext";

/**
 * MOBIL PASTKI PANEL.
 *
 * Ilgari bu fayl navigatsiyaning UCHINCHI reyestri edi: o'z qotirilgan
 * ro'yxati, o'z ikonkalari va o'z yorliqlari ("Hisobot" — yon panelda
 * "Hisobotlar", qidiruvda yana boshqacha). Yangi bo'lim qo'shilganda uchta
 * joyni yangilash kerak edi va amalda hech kim uchalasini ham yangilamasdi.
 *
 * Endi manba bitta — `lib/navigation.ts`. Bu yerda faqat MOBILGA XOS ikkita
 * narsa qoladi: qaysi bo'limlar muhimligi (tartib) va tor ekran uchun
 * qisqartirilgan yorliq.
 */
export function MobileBottomNav({ userRole, allowedViews }: { userRole: string; allowedViews?: string[] }) {
  const pathname = usePathname();
  const { toggle } = useMobileNav();
  const role = userRole as UserRole;

  const canSee = (v: AppView) => (allowedViews ? allowedViews.includes(v) : canSeeView(role, v));

  // Muhimlik tartibida saralab, rol ko'ra oladigan birinchi to'rttasi.
  const items = MOBILE_NAV_ORDER.map((view) => NAV_ITEMS.find((n) => n.view === view))
    .filter((n): n is (typeof NAV_ITEMS)[number] => !!n && canSee(n.view))
    .slice(0, 4);

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/cabinet" && pathname.startsWith(href + "/")) ||
    (href === "/cabinet" && pathname === "/cabinet");

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch"
      style={{
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--rule-strong)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        height: "calc(60px + env(safe-area-inset-bottom, 0px))",
        zIndex: "var(--z-nav)",
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            // Faol band ustidagi jonli chiziq — sidebar bilan bir xil belgi.
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-100 ${active ? "live-rule-top" : ""}`}
            style={{ color: active ? "var(--brand)" : "var(--text-muted)" }}
          >
            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            <span className="font-mono text-micro font-semibold">
              {MOBILE_NAV_SHORT_LABELS[item.view] ?? item.label}
            </span>
          </Link>
        );
      })}
      {/* Yana — to'liq menyu (sidebar drawer) */}
      <button
        onClick={toggle}
        className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-100"
        style={{ color: "var(--text-muted)" }}
        aria-label="Yana"
      >
        <Menu size={20} strokeWidth={1.8} />
        <span className="font-mono text-micro font-semibold">Yana</span>
      </button>
    </nav>
  );
}
