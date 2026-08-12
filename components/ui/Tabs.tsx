"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * TABS — sahifa ichidagi bo'limlar uchun YAGONA naqsh.
 *
 * Auditdagi holat: loyihada olti xil "yorliq" bor edi va hech biri boshqasiga
 * o'xshamasdi —
 *   · SalaryKPIModule  — yuqorida 3px chiziqli "papka" yorliqlari, CAPS
 *   · ReportsClient    — o'shaning qo'lda ko'chirilgan nusxasi
 *   · PayrollClient    — brend fonli tabletka (`text-text-primary` kabi
 *                        Tailwind'da MAVJUD BO'LMAGAN sinflar bilan)
 *   · WorkInboxClient  — sonli chip
 *   · SettingsModule   — trek ichidagi segment (ekranning o'zi endi yo'q:
 *                        u `/cabinet` ning nusxasi edi)
 *   · MyCabinet        — `Button variant="primary"` ustiga inline uslub
 * Ularning BIRONTASIDA `role="tablist"` yo'q edi: ekran o'quvchi ularni oddiy
 * tugmalar deb o'qirdi, klaviatura strelkalari ishlamasdi, faol yorliq esa
 * `aria-selected` bilan e'lon qilinmasdi.
 *
 * Bu yerda bitta manba: WAI-ARIA APG "Tabs" naqshi.
 *
 * QO'LDA AKTIVLASHTIRISH (manual activation) ataylab tanlandi: strelka faqat
 * fokusni suradi, panelni Enter/Bo'sh joy ochadi. Avtomatik aktivlashtirishda
 * strelkani bosib o'tish matritsa kabi og'ir panellarni birin-ketin mount
 * qilardi — APG ham panel qimmat bo'lganda shu variantni tavsiya qiladi.
 */

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** Yorliq yonidagi son — masalan muddati o'tgan ishlar soni. */
  count?: number;
  /** Sichqoncha ustiga kelganda ko'rinadigan izoh. */
  hint?: string;
  /**
   * Sozlash yorlig'i: kundalik ish yorliqlaridan ajratib, qatorning o'ng
   * chetiga suriladi. "Qoidalar" kabi kamdan-kam ochiladigan konfiguratsiya
   * ish yorliqlari bilan bir qatorda teng huquqda turmasligi kerak.
   */
  trailing?: boolean;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /**
   * `aria-controls`/`aria-labelledby` uchun id prefiksi. Bir sahifada ikkita
   * Tabs bo'lsa har biriga o'z prefiksi beriladi; berilmasa avtomatik.
   */
  idBase?: string;
  /** `line` — sahifa bo'limlari; `segment` — 2-3 tanlovli ixcham guruh. */
  variant?: "line" | "segment";
  size?: "sm" | "md";
  /** Ekran o'quvchi uchun majburiy: "KPI bo'limlari" kabi. */
  ariaLabel: string;
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  idBase,
  variant = "line",
  size = "md",
  ariaLabel,
  className = "",
}: TabsProps<T>) {
  const autoId = useId();
  const base = idBase ?? `tabs-${autoId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const listRef = useRef<HTMLDivElement>(null);

  const enabled = items.filter((t) => !t.disabled);

  /** Strelka bosilganda fokusni ko'chirish (aktivlashtirmasdan). */
  const focusAt = useCallback(
    (id: string) => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab-id="${CSS.escape(id)}"]`)
        ?.focus();
    },
    []
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const focused = (e.target as HTMLElement).getAttribute?.("data-tab-id");
    if (!focused) return;
    const i = enabled.findIndex((t) => t.id === focused);
    if (i < 0) return;

    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    else return;

    e.preventDefault();
    focusAt(enabled[next].id);
  };

  /**
   * Faol yorliqni ko'rinishga surish. Tor ekranda yorliqlar qatori gorizontal
   * siljiydi va tanlangan yorliq chetdan tashqarida qolishi mumkin edi.
   */
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab-id="${CSS.escape(value)}"]`
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  /**
   * "Yana yorliq bor" belgisi. Qator sig'masa scrollbar yashiringan
   * (`scrollbar-hide`), ya'ni telefonda o'ngda yana yorliqlar borligini hech
   * narsa aytmasdi — foydalanuvchi ularni umuman topmasligi mumkin edi.
   *
   * Fon rangiga bog'liq gradient EMAS, ichki soya: yorliqlar sahifada ham,
   * yon panel ichida ham turadi va u yerlarda fon boshqacha.
   */
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdge({ left: el.scrollLeft > 4, right: max > 4 && el.scrollLeft < max - 4 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [items.length]);

  const edgeShadow = [
    edge.left && "inset 14px 0 10px -12px color-mix(in srgb, var(--text-primary) 30%, transparent)",
    edge.right && "inset -14px 0 10px -12px color-mix(in srgb, var(--text-primary) 30%, transparent)",
  ]
    .filter(Boolean)
    .join(", ");

  const work = items.filter((t) => !t.trailing);
  const config = items.filter((t) => t.trailing);

  const renderTab = (t: TabItem<T>) => {
    const active = t.id === value;
    const Icon = t.icon;
    return (
      <button
        key={t.id}
        type="button"
        role="tab"
        id={`${base}-tab-${t.id}`}
        data-tab-id={t.id}
        aria-selected={active}
        aria-controls={`${base}-panel-${t.id}`}
        // Roving tabindex: Tab tugmasi butun qatorga BIR marta kiradi,
        // ichida esa strelkalar bilan yuriladi.
        tabIndex={active ? 0 : -1}
        disabled={t.disabled}
        title={t.hint}
        onClick={() => !t.disabled && onChange(t.id)}
        className={
          variant === "line"
            ? `group relative flex items-center gap-2 whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                size === "sm" ? "px-3 py-2 text-meta" : "px-4 py-2.5 text-body"
              } ${active ? "font-semibold" : "font-medium"}`
            : `flex items-center gap-1.5 rounded-lg whitespace-nowrap transition-colors disabled:opacity-40 ${
                size === "sm" ? "px-3 py-1.5 text-meta" : "px-4 py-2 text-body"
              } ${active ? "font-semibold" : "font-medium"}`
        }
        style={
          variant === "line"
            ? { color: active ? "var(--text-primary)" : "var(--text-secondary)" }
            : active
              ? { background: "var(--brand)", color: "#fff" }
              : { color: "var(--text-secondary)" }
        }
      >
        {Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" />}
        <span>{t.label}</span>
        {typeof t.count === "number" && (
          <span
            className="rounded-full px-1.5 py-0.5 text-micro font-semibold tabular"
            style={
              active
                ? variant === "segment"
                  ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
                  : { background: "var(--brand-ghost)", color: "var(--brand)" }
                : { background: "var(--bg-sunken)", color: "var(--text-muted)" }
            }
          >
            {t.count}
          </span>
        )}
        {/* Faol chiziq — qator ostidagi 1px hairline ustiga chiziladi. */}
        {variant === "line" && (
          <span
            aria-hidden="true"
            className="absolute left-0 right-0 -bottom-px h-0.5 rounded-t"
            style={{ background: active ? "var(--brand)" : "transparent" }}
          />
        )}
      </button>
    );
  };

  if (variant === "segment") {
    return (
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className={`inline-flex items-center gap-1 rounded-xl p-1 ${className}`}
        style={{ background: "var(--bg-sunken)", border: "1px solid var(--rule)" }}
      >
        {items.map(renderTab)}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={`flex items-stretch gap-1 overflow-x-auto scrollbar-hide ${className}`}
      style={{ borderBottom: "1px solid var(--rule)", boxShadow: edgeShadow || undefined }}
    >
      {work.map(renderTab)}
      {config.length > 0 && (
        <>
          <span className="flex-1" aria-hidden="true" />
          <span
            aria-hidden="true"
            className="my-2 w-px flex-shrink-0"
            style={{ background: "var(--rule)" }}
          />
          {config.map(renderTab)}
        </>
      )}
    </div>
  );
}

export interface TabPanelProps {
  /** Ushbu panel qaysi yorliqqa tegishli. */
  tabId: string;
  idBase: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Faol panel. Faqat bittasi render qilinadi (og'ir jadvallarni fonda tutib
 * turmaslik uchun), shuning uchun `hidden` emas — chiqarilmagan panel umuman
 * yo'q. `tabIndex={0}` kerak: panel ichida fokuslanadigan element bo'lmasa
 * ham klaviatura foydalanuvchisi uning matniga yeta olishi shart.
 */
export function TabPanel({ tabId, idBase, children, className = "" }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${tabId}`}
      aria-labelledby={`${idBase}-tab-${tabId}`}
      tabIndex={0}
      className={`focus:outline-none ${className}`}
    >
      {children}
    </div>
  );
}

export default Tabs;
