// TEZKOR AMALLAR — kundalik eng ko'p bosiladigan yo'llar bitta ustunda.
//
// Bo'lim sahifasiga o'tish o'rniga to'g'ridan-to'g'ri o'sha sahifadagi tez
// kiritish formasiga olib boradi (`?add=` — JournalClient/KirimKassaClient
// buni o'qib formani avtomatik ochadi), aks holda "tezkor amal" foydalanuvchini
// yana bir marta "qo'shish" tugmasini qidirishga majburlar edi.
//
// NAQSH: 2×2 ikonka gridi emas, BUYRUQ RO'YXATI. Grid har amalni bir xil
// og'irlikda ko'rsatardi va nima qilishini faqat yorliqdan bilardik. Ro'yxatda
// har qatorda amal + u NIMA QILISHI yozilgan, ya'ni o'qish bir marta bo'ladi.
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  FileText,
  HandCoins,
  Scale,
} from "lucide-react";

const ACTIONS = [
  {
    href: "/kassa?add=kirim",
    label: "Kirim qo'shish",
    hint: "Jurnalga naqd yoki plastik tushum",
    icon: ArrowDownRight,
    tone: "var(--accent-green)",
    bg: "var(--accent-green-light)",
  },
  {
    href: "/kassa?add=chiqim",
    label: "Chiqim qo'shish",
    hint: "Tasdiqlanadigan xarajat yozuvi",
    icon: ArrowUpRight,
    tone: "var(--accent-red)",
    bg: "var(--accent-red-light)",
  },
  {
    href: "/kassa/qarzdorlik",
    label: "Qarzdorlikni tekshirish",
    hint: "Muddati o'tgan to'lovlar va undirish",
    icon: HandCoins,
    tone: "var(--accent-blue)",
    bg: "var(--accent-blue-light)",
  },
  {
    href: "/kassa/sverka",
    label: "Sverka o'tkazish",
    hint: "Terminal va bank kesimini solishtirish",
    icon: Scale,
    tone: "var(--accent-purple)",
    bg: "var(--accent-purple-light)",
  },
  {
    href: "/reports",
    label: "Hisobotlar",
    hint: "Oylik yakun va amallar matritsasi",
    icon: FileText,
    tone: "var(--text-muted)",
    bg: "var(--bg-sunken)",
  },
];

export default function QuickActions() {
  return (
    // `Card` primitivi bu yerda MOS KELMAYDI: u `<div>` chizadi, bu blok esa
    // `<nav aria-label>` bo'lishi kerak — aks holda ekran o'quvchi uchun
    // "Tezkor amallar" bo'limi yo'qoladi. Qobiq esa umumiy sinfdan olinadi.
    <nav
      className="dashboard-card overflow-hidden h-full flex flex-col"
      aria-label="Tezkor amallar"
    >
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--rule)" }}>
        <h3 className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>
          Tezkor amallar
        </h3>
        <p className="text-micro" style={{ color: "var(--text-muted)" }}>
          To&apos;g&apos;ridan-to&apos;g&apos;ri formaga olib boradi
        </p>
      </div>

      <div className="flex-1">
        {ACTIONS.map((a, i) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-hover)]"
              style={i > 0 ? { borderTop: "1px solid var(--rule)" } : undefined}
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: a.bg, color: a.tone }}
              >
                <Icon size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {a.label}
                </span>
                <span className="block text-micro truncate" style={{ color: "var(--text-muted)" }}>
                  {a.hint}
                </span>
              </span>
              <ChevronRight
                size={14}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-muted)" }}
                aria-hidden
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
