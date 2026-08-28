"use client";

// KASSA BO'LIMLARI ORASIDA KO'CHISH — "qayerga borishni bilmayman" muammosi.
//
// Pul harakati 4 ta URL'ga bo'lingan (/kassa, /kirim, /chiqim, /qarzdorlik)
// va ular yon panelda ichma-ich (parent/child) turadi — lekin sahifaning
// o'zida, ayniqsa yon panel yig'ilgan yoki mobil holatda, foydalanuvchi
// "men qayerdaman, yana qayerga borsam bo'ladi" savolini faqat brauzer
// orqaga tugmasi bilan hal qilardi. Bu chiziq har bir kassa sahifasining
// yuqorisida BIR XIL joyda turadi va joriy bo'limni aniq ko'rsatadi.
//
// RBAC bilan bir manba: faqat `currentUserViews()` ruxsat bergan bo'limlar
// ko'rinadi — yon panel bilan aynan bir ro'yxat (`lib/navigation.ts`).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Banknote, CreditCard, HandCoins, Scale, type LucideIcon } from "lucide-react";

interface Section {
  href: string;
  label: string;
  /** Mobil ikonka ostidagi tor ustunga sig'adigan qisqa shakl. */
  shortLabel: string;
  icon: LucideIcon;
  /** `currentUserViews()` dagi kalit — bo'lim shu ruxsat bo'lmasa yashirin. */
  view: string;
}

const SECTIONS: Section[] = [
  { href: "/kassa", label: "Umumiy ko'rinish", shortLabel: "Umumiy", icon: Wallet, view: "kassa" },
  { href: "/kassa/kirim", label: "Kirim", shortLabel: "Kirim", icon: Banknote, view: "kassa_income" },
  { href: "/kassa/chiqim", label: "Chiqim", shortLabel: "Chiqim", icon: CreditCard, view: "kassa_expense" },
  { href: "/kassa/qarzdorlik", label: "Qarzdorlik", shortLabel: "Qarzdor.", icon: HandCoins, view: "kassa_debt" },
  { href: "/kassa/sverka", label: "Kassa–bank sverka", shortLabel: "Sverka", icon: Scale, view: "kassa_sverka" },
];

export default function KassaSectionNav({ views }: { views: string[] }) {
  const pathname = usePathname();
  const visible = SECTIONS.filter((s) => views.includes(s.view));
  if (visible.length <= 1) return null;

  return (
    // GRID, SKROLL EMAS: 390px enida 4 ta to'liq yorliq (masalan "Umumiy
    // ko'rinish") sig'may, oxirgi bo'lim yarim chetga chiqib ketardi va
    // skroll borligini hech narsa ko'rsatmasdi (buni real brauzerda
    // skrinshot orqali topildi). Grid hech qachon o'lchamdan chiqmaydi;
    // matn faqat `sm:` dan boshlab ko'rinadi, mobil'da faqat ikonka +
    // `title` tooltip qoladi.
    <nav
      aria-label="Kassa bo'limlari"
      className="grid gap-1 p-1 rounded-xl"
      style={{
        background: "var(--input-bg)",
        border: "1px solid var(--card-border)",
        gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
      }}
    >
      {visible.map((s) => {
        const active = s.href === "/kassa" ? pathname === "/kassa" : pathname.startsWith(s.href);
        const Icon = s.icon;
        return (
          <Link
            key={s.href}
            href={s.href}
            title={s.label}
            aria-current={active ? "page" : undefined}
            className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1.5 sm:px-3 py-1.5 rounded-lg text-micro sm:text-meta font-semibold transition-colors"
            style={
              active
                ? { background: "var(--accent-blue)", color: "#fff" }
                : { color: "var(--text-secondary)" }
            }
          >
            <Icon size={14} className="shrink-0" />
            {/* Mobil'da ikonka ostida qisqa matn (MobileBottomNav bilan bir xil
                naqsh) — faqat ikonka o'z-o'zidan yetarlicha aniq emas. */}
            <span className="sm:hidden truncate max-w-full leading-tight text-center">{s.shortLabel}</span>
            <span className="hidden sm:inline truncate">{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
