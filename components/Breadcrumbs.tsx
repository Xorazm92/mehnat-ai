"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { pathToView } from "@/lib/routeViews";
import { useBreadcrumbTrail } from "@/components/BreadcrumbTrail";

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
  "services": "Xizmat katalogi",
  "invoices": "Schyot-fakturalar",
  "month-closing": "Oy yopilishi",
  "operation-matrix": "Amallar matritsasi",
  audit: "Audit",
};

/** ID ko'rinishidagi segment (cuid/uuid/raqam) — yorliq sifatida ko'rsatilmaydi. */
function isIdSegment(seg: string) {
  return /^[0-9]+$/.test(seg) || /^c[a-z0-9]{20,}$/i.test(seg) || /^[0-9a-f-]{20,}$/i.test(seg);
}

export function Breadcrumbs({
  className = "",
  allowedViews,
}: {
  className?: string;
  /**
   * Foydalanuvchi ocha oladigan ekranlar. Berilmasa hamma bo'lak havola
   * bo'ladi (eski xatti-harakat) — `(admin)` qobig'i shunday ishlatadi.
   */
  allowedViews?: string[];
}) {
  const pathname = usePathname();
  // Hooklar shartsiz chaqirilishi shart — ildiz sahifadagi erta qaytish
  // pastda, `segments` hisoblangandan keyin.
  const trail = useBreadcrumbTrail(pathname);
  const segments = pathname.split("/").filter(Boolean);

  // Bitta segment — bu allaqachon ildiz sahifa, breadcrumb ortiqcha shovqin.
  if (segments.length <= 1) return null;

  /**
   * OCHIB BO'LMAYDIGAN BO'LAK HAVOLA BO'LMAYDI.
   *
   * Bu yo'l chizig'i manzilni faqat URL dan quradi va ruxsatni tekshirmasdi.
   * Natijada bank-klient `/kassa/kirim` da turganda "Kassa" havolasini
   * ko'rardi — holbuki uning `kassa` ekrani YO'Q. Next `<Link>` larni oldindan
   * yuklagani uchun bu jimgina emas edi: har prefetch proxy tomonidan `/403`
   * ga otilardi va har 15 soniyalik yangilanishda takrorlanardi.
   *
   * Endi ruxsat bo'lmasa bo'lak oddiy matn bo'lib qoladi — joyni ko'rsatadi,
   * lekin ololmaydigan joyga taklif qilmaydi.
   */
  const canOpen = (href: string) => {
    if (!allowedViews) return true;
    const view = pathToView(href);
    return view === null || allowedViews.includes(view);
  };

  const derived = segments.map((seg, i) => ({
    key: seg + i,
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: isIdSegment(seg) ? "…" : LABELS[seg] ?? seg.replace(/-/g, " "),
    isLast: i === segments.length - 1,
  }));

  /**
   * Sahifa o'z bo'laklarini bildirgan bo'lsa (`<BreadcrumbTrail>`), bo'lim
   * ildizidan KEYINGI hamma narsa o'shanikiga almashadi: `/organizations/clx…`
   * uchun "…" o'rniga firma nomi va joriy yorliq chiqadi.
   */
  const crumbs = trail
    ? [
        { ...derived[0], isLast: false },
        ...trail.map((c, i) => ({
          key: `trail-${i}`,
          href: c.href ?? "",
          label: c.label,
          isLast: i === trail.length - 1,
        })),
      ]
    : derived;

  const rootHref = `/${segments[0]}`;

  return (
    <nav aria-label="Yo'nalish" className={`flex items-center gap-1 flex-wrap ${className}`}>
      {canOpen(rootHref) ? (
        <Link
          href={rootHref}
          className="flex items-center hover:underline"
          style={{ color: "var(--text-muted)" }}
          aria-label="Bo'lim boshiga"
        >
          <Home size={12} />
        </Link>
      ) : (
        <span className="flex items-center" style={{ color: "var(--text-muted)" }} aria-hidden="true">
          <Home size={12} />
        </span>
      )}

      {crumbs.map((c) => (
        <span key={c.key} className="flex items-center gap-1">
          <ChevronRight size={12} style={{ color: "var(--text-muted)", opacity: 0.5 }} aria-hidden="true" />
          {c.isLast || !c.href || !canOpen(c.href) ? (
            <span
              aria-current={c.isLast ? "page" : undefined}
              className="text-micro font-bold uppercase tracking-widest"
              style={{ color: c.isLast ? "var(--text-secondary)" : "var(--text-muted)" }}
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
