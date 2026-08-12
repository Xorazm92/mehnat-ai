"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

/**
 * BREADCRUMB — loyihada NOL ta edi (`grep -rni "breadcrumb"` hech narsa
 * topmasdi). Yagona o'xshash narsa `AdminTopbar` dagi qotirilgan
 * "ASRO / Admin" satri edi va u `/admin/users` da ham, `/admin/sla-policies`
 * da ham bir xil turardi.
 *
 * Sahifa sarlavhasi "bu nima" degan savolga javob beradi; breadcrumb esa
 * "men qayerdaman va bir qadam yuqoriga qanday chiqaman" degan savolga.
 * Ikkalasi ham kerak.
 */

const LABELS: Record<string, string> = {
  dashboard: "Boshqaruv paneli",
  organizations: "Firmalar",
  staff: "Xodimlar",
  reports: "Hisobotlar",
  proof: "Skrinshot",
  expenses: "Xarajatlar",
  kassa: "Kassa",
  // Kassa ichki bo'limlari — bularsiz `/kassa/kirim` da breadcrumb xom
  // "kirim" satrini ko'rsatardi.
  kirim: "Kirim kassa",
  chiqim: "Chiqim kassa",
  qarzdorlik: "Qarzdorlik",
  payroll: "Oylik",
  attendance: "Davomat",
  notifications: "Xabarlar",
  settings: "Sozlamalar",
  kpi: "KPI",
  // Yon paneldagi nom bilan bir xil: `/deadlines` endi "Ishlar" ekrani.
  deadlines: "Ishlar",
  tasks: "Vazifalar",
  "audit-logs": "Audit jurnali",
  cabinet: "Kabinet",
  bank: "Bank",
  admin: "Admin",
  users: "Foydalanuvchilar",
  roles: "Rollar",
  departments: "Bo'limlar",
  "deadline-templates": "Muddat shablonlari",
  "business-calendar": "Ish kalendari",
  "month-closing": "Oy yopilishi",
  "operation-matrix": "Amallar matritsasi",
  audit: "Audit",
};

/** ID ko'rinishidagi segment (cuid/uuid/raqam) — yorliq sifatida ko'rsatilmaydi. */
function isIdSegment(seg: string) {
  return /^[0-9]+$/.test(seg) || /^c[a-z0-9]{20,}$/i.test(seg) || /^[0-9a-f-]{20,}$/i.test(seg);
}

export function Breadcrumbs({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Bitta segment — bu allaqachon ildiz sahifa, breadcrumb ortiqcha shovqin.
  if (segments.length <= 1) return null;

  const crumbs = segments.map((seg, i) => ({
    seg,
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: isIdSegment(seg) ? "…" : LABELS[seg] ?? seg.replace(/-/g, " "),
    isLast: i === segments.length - 1,
  }));

  return (
    <nav aria-label="Yo'nalish" className={`flex items-center gap-1 flex-wrap ${className}`}>
      <Link
        href={`/${segments[0]}`}
        className="flex items-center hover:underline"
        style={{ color: "var(--text-muted)" }}
        aria-label="Bo'lim boshiga"
      >
        <Home size={12} />
      </Link>

      {crumbs.map((c) => (
        <span key={c.href} className="flex items-center gap-1">
          <ChevronRight size={12} style={{ color: "var(--text-muted)", opacity: 0.5 }} aria-hidden="true" />
          {c.isLast ? (
            <span
              aria-current="page"
              className="text-micro font-bold uppercase tracking-widest"
              style={{ color: "var(--text-secondary)" }}
            >
              {c.label}
            </span>
          ) : (
            <Link
              href={c.href}
              className="text-micro font-bold uppercase tracking-widest hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export default Breadcrumbs;
