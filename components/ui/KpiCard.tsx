"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * KPI CARD — kabinetlardagi ko'rsatkich plitkasi.
 *
 * Auditdagi holat: oltita kabinetning HAR BIRI o'z plitkasini qo'lda yozgan.
 * Bir xil indigo fon uchta xil usulda yozilgan edi — `var(--accent-blue-light)`,
 * `"var(--accent-indigo)" + "22"`, `"rgba(99,102,241,0.1)"`. Qiymat tipografiyasi
 * ham har xil: `.stat-value` / `text-2xl font-semibold` / `text-2xl font-bold`.
 *
 * Muhimrog'i — plitkalar BOSILMASDI. Direktor "12 ta yuqori risk" ni ko'rardi,
 * lekin qaysi firmalar ekanini bilish uchun boshqa ekranga o'tib, filtrni qo'lda
 * qayta terishi kerak edi. `href` berilgan plitka endi filtri qo'yilgan
 * ro'yxatga olib boradi.
 */

export type KpiTone = "neutral" | "brand" | "success" | "warning" | "danger" | "indigo";

const TONE: Record<KpiTone, { bg: string; border: string; fg: string }> = {
  neutral: { bg: "var(--bg-sunken)", border: "var(--card-border)", fg: "var(--text-primary)" },
  brand: { bg: "var(--brand-ghost)", border: "var(--accent-blue)", fg: "var(--accent-blue)" },
  success: { bg: "var(--success-bg)", border: "var(--success-border)", fg: "var(--success)" },
  warning: { bg: "var(--warning-bg)", border: "var(--warning-border)", fg: "var(--warning)" },
  danger: { bg: "var(--danger-bg)", border: "var(--danger-border)", fg: "var(--danger)" },
  indigo: { bg: "var(--accent-indigo-light)", border: "var(--accent-indigo-border)", fg: "var(--accent-indigo)" },
};

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  /** Qiymat ostidagi izoh */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: KpiTone;
  /** Berilsa — plitka bosiladigan havolaga aylanadi (filtri qo'yilgan ro'yxat) */
  href?: string;
  /** Qiymat rangi ton bilan bir xil bo'lsinmi (masalan "yuqori risk" qizil) */
  emphasize?: boolean;
  /**
   * Sahifaning ASOSIY raqami — kattaroq teriladi va rangi tonga o'tadi.
   * Sahifada BITTA plitka olishi kerak: ikkitasi urg'uli bo'lsa ko'z qaysi
   * biriga tushishini bilmaydi va ierarxiya yo'qoladi.
   *
   * Ataylab ustun EGALLAMAYDI (`col-span`): aks holda har chaqiruvchi grid
   * ustunlar sonini urg'u bor-yo'qligiga qarab o'zgartirishi kerak bo'lardi va
   * urg'u nolga tushganda qatorda bo'sh katak qolardi.
   */
  emphasis?: boolean;
  /** Qiymat ostidagi o'zgarish satri — "+14 o'tgan haftadan". */
  trend?: React.ReactNode;
  className?: string;
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
  emphasize = false,
  emphasis = false,
  trend,
  className = "",
}: KpiCardProps) {
  const t = TONE[tone];
  // Urg'uli plitkada qiymat rangi ham tonga o'tadi: katta neytral raqam
  // rangli fon ustida "o'chgan" ko'rinadi.
  const colored = emphasize || emphasis;

  const body = (
    <>
      <div className="flex items-center gap-2 mb-2">
        {icon && <span style={{ color: t.fg }} className="flex-shrink-0">{icon}</span>}
        <span className="text-meta font-bold uppercase tracking-widest truncate" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        {href && (
          <ArrowUpRight
            size={13}
            className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: t.fg }}
            aria-hidden="true"
          />
        )}
      </div>
      <div
        className={`font-mono ${emphasis ? "text-3xl" : "text-2xl"} font-semibold tabular-nums leading-none`}
        style={{ color: colored ? t.fg : "var(--text-primary)", letterSpacing: "-0.03em" }}
      >
        {value}
      </div>
      {trend && (
        <p className="text-micro mt-1.5 tabular-nums" style={{ color: "var(--text-muted)" }}>
          {trend}
        </p>
      )}
      {hint && (
        <p className="text-micro mt-1.5" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </>
  );

  const style: React.CSSProperties = { background: t.bg, border: `1px solid ${t.border}` };
  const base = "rounded-xl p-4 transition-colors";

  if (!href) return <div className={`${base} ${className}`} style={style}>{body}</div>;

  return (
    <Link href={href} className={`${base} group block hover:brightness-[0.98] ${className}`} style={style}>
      {body}
    </Link>
  );
}

export default KpiCard;
