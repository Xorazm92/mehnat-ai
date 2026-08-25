// TEZKOR AMALLAR — kundalik eng ko'p bosiladigan 4 ta yo'l bitta qatorda.
//
// Bo'lim sahifasiga o'tish o'rniga to'g'ridan-to'g'ri o'sha sahifadagi tez
// kiritish formasiga olib boradi (`?add=` — JournalClient/KirimKassaClient
// buni o'qib formani avtomatik ochadi), aks holda "tezkor amal" foydalanuvchini
// yana bir marta "qo'shish" tugmasini qidirishga majburlar edi.
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, HandCoins, FileText } from "lucide-react";

const ACTIONS = [
  { href: "/kassa?add=kirim", label: "Kirim qo'shish", icon: ArrowDownRight, tone: "var(--accent-green)" },
  { href: "/kassa?add=chiqim", label: "Chiqim qo'shish", icon: ArrowUpRight, tone: "var(--accent-red)" },
  { href: "/kassa/qarzdorlik", label: "Qarzdorlikni tekshirish", icon: HandCoins, tone: "var(--accent-blue)" },
  { href: "/reports", label: "Hisobotlar", icon: FileText, tone: "var(--text-muted)" },
];

export default function QuickActions() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      <div className="px-3 py-2" style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}>
        <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
          Tezkor amallar
        </h2>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="flex flex-col items-start gap-2 p-3 rounded-lg transition-colors hover:bg-[var(--input-bg)]"
              style={{ border: "1px solid var(--card-border)" }}
            >
              <Icon size={16} style={{ color: a.tone }} />
              <span className="text-meta font-semibold" style={{ color: "var(--text)" }}>
                {a.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
