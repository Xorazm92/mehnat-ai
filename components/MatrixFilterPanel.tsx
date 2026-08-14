"use client";

import React, { useState } from "react";
import { ChevronDown, Filter, X } from "lucide-react";
import { useDismissable } from "@/hooks/useDismissable";
import {
  COL_STATUS_OPTIONS,
  activeFilterCount,
  regimeLabel,
  type MatrixFilters,
} from "@/lib/matrixFilters";

/**
 * MATRITSA FILTRLARI PANELI.
 *
 * Nima uchun bitta panel, sakkizta alohida tanlagich emas: asboblar paneli
 * allaqachon to'lgan (qidiruv, bajarilish, ustunlar, davr, eksport) va yana
 * beshta `<select>` qo'shilsa u o'qib bo'lmas holga kelardi. Panel yopiq
 * turganda tugmadagi raqam nechta filtr yoqilganini aytadi, yoqilganlarining
 * o'zi esa asboblar panelining ostidagi chiplarda ko'rinadi.
 */

export interface MatrixFilterOptions {
  accountants: string[];
  supervisors: string[];
  chiefs: string[];
  banks: string[];
  regimes: string[];
  departments: string[];
  columns: { key: string; label: string }[];
}

interface Props {
  filters: MatrixFilters;
  options: MatrixFilterOptions;
  onChange: (key: keyof MatrixFilters, value: string) => void;
  onReset: () => void;
  /** Filtrdan keyin qolgan / jami qator — panel ichida darhol ko'rinadi. */
  shown: number;
  total: number;
}

const selectClass =
  "w-full pl-3 pr-8 py-1.5 rounded-lg text-meta font-bold uppercase tracking-widest outline-none " +
  "appearance-none cursor-pointer transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20";

const selectStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
};

/**
 * Bitta "yorliq + tanlagich" juftligi.
 *
 * Yoqilgan maydonda yorliq yonida nuqta yonadi va tanlagich ramkasi ajralib
 * turadi — panelni ochgan odam qaysi maydon ishlayotganini bir qarashda ko'radi
 * (avval hammasi bir xil kulrang edi).
 */
function Field({
  label,
  value,
  active,
  onChange,
  onClear,
  children,
  hint,
}: {
  label: string;
  value: string;
  active: boolean;
  onChange: (v: string) => void;
  onClear?: () => void;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 mb-1">
        <span
          className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-widest"
          style={{ color: active ? "var(--primary)" : "var(--text-3)" }}
        >
          {active && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--primary)" }} aria-hidden />
          )}
          {label}
        </span>
        {active && onClear && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onClear(); }}
            className="text-micro font-bold uppercase"
            style={{ color: "var(--text-3)" }}
            title={`${label} filtrini olib tashlash`}
          >
            tozalash
          </button>
        )}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={selectClass}
          style={{
            ...selectStyle,
            borderColor: active ? "var(--primary)" : "var(--border)",
            color: active ? "var(--primary)" : "var(--text)",
          }}
        >
          {children}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-3)" }}
        />
      </div>
      {hint && (
        <span className="block text-micro mt-1" style={{ color: "var(--text-3)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export default function MatrixFilterPanel({
  filters,
  options,
  onChange,
  onReset,
  shown,
  total,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));
  const count = activeFilterCount(filters);

  const people: Array<{ key: keyof MatrixFilters; label: string; list: string[] }> = [
    { key: "accountant", label: "Buxgalter", list: options.accountants },
    { key: "supervisor", label: "Nazoratchi", list: options.supervisors },
    { key: "chief", label: "Bosh buxgalter", list: options.chiefs },
    { key: "bank", label: "Bank-klient", list: options.banks },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-meta font-bold uppercase tracking-widest shadow-sm"
        style={
          count > 0
            ? { background: "var(--primary-ghost)", border: "1px solid var(--primary)", color: "var(--primary)" }
            : { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }
        }
        title="Mas'ul, soliq rejimi va ustun kesimi bo'yicha filtrlash"
      >
        <Filter size={14} />
        Filtrlar
        {count > 0 && (
          <span
            className="ml-0.5 px-1.5 rounded-full text-micro tabular-nums"
            style={{ background: "var(--primary)", color: "var(--surface)" }}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Matritsa filtrlari"
          className="absolute right-0 mt-2 z-[200] w-80 rounded-xl layer-overlay overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--rule-strong)" }}
        >
          <div
            className="flex items-center justify-between gap-2 px-3 pt-3 pb-2"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span className="text-meta font-bold uppercase tracking-widest" style={{ color: "var(--text-2)" }}>
              Filtrlar
            </span>
            <span className="text-micro font-bold tabular-nums" style={{ color: "var(--text-3)" }}>
              {shown} / {total} firma
            </span>
          </div>

          <div className="max-h-[65vh] overflow-y-auto scrollbar-styled p-3 space-y-3">
            {/* ── Mas'ullar ────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-2.5">
              {people.map((p) => (
                <Field
                  key={p.key}
                  label={p.label}
                  value={String(filters[p.key])}
                  active={filters[p.key] !== "all"}
                  onChange={(v) => onChange(p.key, v)}
                  onClear={() => onChange(p.key, "all")}
                >
                  <option value="all">Barchasi</option>
                  {p.list.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Field>
              ))}
            </div>

            {/* ── Firma xossalari ──────────────────────────────── */}
            <div className="pt-3 grid grid-cols-2 gap-2.5" style={{ borderTop: "1px solid var(--border)" }}>
              <Field
                label="Soliq rejimi"
                value={filters.regime}
                active={filters.regime !== "all"}
                onChange={(v) => onChange("regime", v)}
                onClear={() => onChange("regime", "all")}
              >
                <option value="all">Barchasi</option>
                {options.regimes.map((r) => (
                  <option key={r} value={r}>
                    {regimeLabel(r)}
                  </option>
                ))}
              </Field>

              {options.departments.length > 0 && (
                <Field
                  label="Bo'lim"
                  value={filters.department}
                  active={filters.department !== "all"}
                  onChange={(v) => onChange("department", v)}
                  onClear={() => onChange("department", "all")}
                >
                  <option value="all">Barchasi</option>
                  {options.departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Field>
              )}
            </div>

            {/* ── Ustun kesimi ─────────────────────────────────── */}
            {/* Eng kerakli savol: "AQh ni kim topshirmagan?" — bungacha
                matritsada bunga javob beradigan vosita umuman yo'q edi. */}
            <div className="pt-3 space-y-2.5" style={{ borderTop: "1px solid var(--border)" }}>
              <Field
                label="Ustun kesimi"
                active={filters.colKey !== "all"}
                onClear={() => { onChange("colKey", "all"); onChange("colStatus", "any"); }}
                value={filters.colKey}
                onChange={(v) => onChange("colKey", v)}
                hint={
                  filters.colKey === "all"
                    ? "Bitta ustunni tanlab, undagi holat bo'yicha firmalarni ajrating"
                    : undefined
                }
              >
                <option value="all">Ustun tanlanmagan</option>
                {options.columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Field>

              {filters.colKey !== "all" && (
                <Field
                  label="Shu ustundagi holat"
                  value={filters.colStatus}
                  active={filters.colStatus !== "any"}
                  onChange={(v) => onChange("colStatus", v)}
                >
                  {COL_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.icon}  {o.label}
                    </option>
                  ))}
                </Field>
              )}
            </div>
          </div>

          <div className="p-2" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={onReset}
              disabled={count === 0}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-meta font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
            >
              <X size={13} />
              Filtrlarni tozalash
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
