"use client";

import React from "react";
import Link from "next/link";

/**
 * METRIC RAIL — moliyaviy ekranning asbob paneli.
 *
 * NEGA YANGI PRIMITIV KERAK BO'LDI. `KpiCard` bitta ko'rsatkich uchun to'g'ri
 * ishlaydi, lekin uni `grid gap-3` ichida 3-4 marta takrorlaganda ekran
 * "to'rtta alohida quti" bo'lib ko'rinadi: har qutining o'z chegarasi, o'z
 * radiusi, orasida bo'shliq. Buxgalterlik tizimida bu ko'rsatkichlar BIR
 * O'LCHOVNING kesimlari — bitta asbobning shkalalari, to'rtta mustaqil
 * kartochka emas.
 *
 * DUBLIKAT EMAS. Tipografiya `globals.css` dagi `.stat-label` / `.stat-value`
 * dan olinadi — aynan shu naqsh Boshqaruv paneli (`dashboard/page.tsx`) va
 * Oylik (`PayrollTable`) ekranlarida `.stat-strip` sifatida ishlatiladi.
 * Kassa moduli undan bexabar qolgan yagona joy edi. Bu komponent o'sha
 * tasmani o'raladigan (ko'p qatorli) gridga aylantiradi va unga ikonka, ton,
 * delta hamda havola qo'shadi.
 *
 * Ton FON bilan emas, katakning TEPA chizig'i bilan beriladi: to'ldirilgan
 * rangli fon zich panelda qo'shni raqamni bosib qo'yadi va ko'z avval rangni,
 * keyin raqamni o'qiydi.
 *
 * Ustunlar soni `--rail-cols` orqali (grid shabloni `.metric-rail` da):
 * Tailwind ning `grid-cols-N` klasslari dinamik son bilan ishlamaydi — JIT
 * ularni manbadan ko'rmaydi va klass umuman yasalmaydi.
 */

export type MetricTone = "neutral" | "brand" | "success" | "warning" | "danger";

const TONE_FG: Record<MetricTone, string> = {
  neutral: "var(--text-primary)",
  brand: "var(--brand)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

export interface MetricItem {
  label: string;
  value: React.ReactNode;
  /** Qiymatdan keyingi kichik birlik — "so'm", "ta", "%". */
  unit?: string;
  /** Qiymat ostidagi bitta qator izoh. */
  hint?: React.ReactNode;
  /** O'zgarish satri; `direction` faqat RANGNI belgilaydi. */
  delta?: { text: string; direction?: "up" | "down" | "flat" };
  icon?: React.ReactNode;
  tone?: MetricTone;
  /** Berilsa katak bosiladigan havolaga aylanadi. */
  href?: string;
  /**
   * Berilsa katak FILTR tugmasiga aylanadi (`href` bilan birga emas).
   * Faol holat FON bilan emas, pastki chiziq bilan belgilanadi — `StatStrip`
   * dagi bilan bir xil sabab: to'ldirilgan fon zich qatorda qo'shni raqamni
   * bosib qo'yadi va ko'z avval rangni, keyin raqamni o'qiydi.
   */
  onClick?: () => void;
  active?: boolean;
  /** Qatorning bosh raqami — kattaroq teriladi. Qatorda BITTA bo'lsin. */
  emphasis?: boolean;
}

export interface MetricRailProps {
  items: MetricItem[];
  /**
   * Keng ekranda nechta ustun. Berilmasa element soniga teng — ya'ni hamma
   * ko'rsatkich bitta qatorda turadi. Tor ekranda har doim 2 ustun.
   */
  columns?: number;
  /** Zich rejim — jadval ustidagi panel uchun (kichikroq tipografiya). */
  dense?: boolean;
  className?: string;
}

export function MetricRail({ items, columns, dense = false, className = "" }: MetricRailProps) {
  const cols = columns ?? items.length;

  return (
    <div
      className={`metric-rail ${className}`}
      style={
        {
          // Uch bosqich: 768px dan 3 ta, 1280px dan 4 ta, 1536px dan to'liq.
          // Grid shabloni `globals.css` dagi `.metric-rail` da — Tailwind ning
          // `grid-cols-N` klasslari dinamik son bilan ishlamaydi (JIT ularni
          // manbadan ko'rmaydi va klass umuman yasalmaydi).
          "--rail-cols": cols,
          "--rail-cols-md": Math.min(cols, 3),
          "--rail-cols-lg": Math.min(cols, 4),
        } as React.CSSProperties
      }
    >
      {items.map((m, i) => {
        const tone = m.tone ?? "neutral";
        const fg = TONE_FG[tone];
        // O'LCHAM `clamp` BILAN. Qat'iy 1.875rem da "2,702,629,695" kabi
        // o'n xonali summa 1280px ekranda to'rt ustunli tasmaga sig'masdi va
        // "2,702,629…" bo'lib kesilardi — moliyaviy ekranda kesilgan summa
        // shunchaki YOLG'ON raqam. `vw` ga bog'lash tasmani ustun kengligi
        // bilan birga kichraytiradi.
        const valueSize = m.emphasis
          ? dense
            ? "clamp(1.125rem, 1.3vw, 1.5rem)"
            : "clamp(1.25rem, 1.65vw, 1.875rem)"
          : dense
            ? "clamp(0.9375rem, 0.95vw, 1.0625rem)"
            : "clamp(1rem, 1.15vw, 1.25rem)";

        const body = (
          <>
            {/* Ton chizig'i — katakning tepasida, 2px. Fon toza qoladi. */}
            {tone !== "neutral" && (
              <span
                aria-hidden
                className="absolute left-0 right-0 top-0"
                style={{ height: 2, background: fg, opacity: 0.85 }}
              />
            )}
            {/* Faol filtr — pastki chiziq. `box-shadow` endi ajratgich uchun
                band, shuning uchun bu ham absolyut element (ton chizig'i
                bilan bir xil naqsh). */}
            {m.active && (
              <span
                aria-hidden
                className="absolute left-0 right-0 bottom-0"
                style={{ height: 2, background: "var(--brand)" }}
              />
            )}

            <div className="flex items-center gap-1.5 min-w-0">
              {m.icon && (
                <span className="flex-shrink-0" style={{ color: fg }}>
                  {m.icon}
                </span>
              )}
              <span className="stat-label truncate">{m.label}</span>
            </div>

            <div className="flex items-baseline gap-1.5 min-w-0">
              <span
                className="stat-value truncate"
                style={{
                  fontSize: valueSize,
                  color: m.emphasis || tone !== "neutral" ? fg : "var(--text-primary)",
                }}
              >
                {m.value}
              </span>
              {m.unit && (
                <span
                  className="text-micro font-semibold flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {m.unit}
                </span>
              )}
            </div>

            {m.delta && (
              <div
                className="text-micro font-semibold tabular-nums mt-1.5 truncate"
                style={{
                  color:
                    m.delta.direction === "up"
                      ? "var(--success)"
                      : m.delta.direction === "down"
                        ? "var(--danger)"
                        : "var(--text-muted)",
                }}
              >
                {m.delta.text}
              </div>
            )}

            {m.hint && (
              <div
                className="text-micro mt-1 truncate"
                style={{ color: "var(--text-muted)" }}
                // Izoh tor ustunda kesiladi — to'liq matn sichqoncha ostida
                // qoladi. Faqat matn bo'lsa: `ReactNode` ni `title` ga
                // berib bo'lmaydi.
                title={typeof m.hint === "string" ? m.hint : undefined}
              >
                {m.hint}
              </div>
            )}
          </>
        );

        const cellClass = `metric-rail-cell relative min-w-0 ${dense ? "px-3 py-2.5" : "px-4 py-3.5"}`;

        if (m.href) {
          return (
            <Link key={`${m.label}-${i}`} href={m.href} className={`${cellClass} block`}>
              {body}
            </Link>
          );
        }
        if (m.onClick) {
          return (
            <button
              key={`${m.label}-${i}`}
              type="button"
              onClick={m.onClick}
              aria-pressed={Boolean(m.active)}
              className={`${cellClass} text-left cursor-pointer`}
            >
              {body}
            </button>
          );
        }
        return (
          <div key={`${m.label}-${i}`} className={cellClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export default MetricRail;
