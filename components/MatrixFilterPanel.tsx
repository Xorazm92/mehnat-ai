"use client";

import React, { useState } from "react";
import { ChevronDown, Filter, X } from "lucide-react";
import { useDismissable } from "@/hooks/useDismissable";
import {
  COL_STATUS_OPTIONS,
  activeFilterCount,
  regimeLabel,
  type FacetOption,
  type MatrixFilters,
} from "@/lib/matrixFilters";
import { MATRIX_STATUS_FILTERS, type MatrixStatusFilter } from "@/lib/reportStatus";

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
  /** Istalgan o'rindagi xodimlar — o'rni bilan qidirmaydiganlar uchun. */
  people: FacetOption[];
  accountants: FacetOption[];
  supervisors: FacetOption[];
  chiefs: FacetOption[];
  banks: FacetOption[];
  regimes: string[];
  departments: string[];
  columns: { key: string; label: string }[];
}

interface Props {
  filters: MatrixFilters;
  options: MatrixFilterOptions;
  onChange: (key: keyof MatrixFilters, value: string) => void;
  /**
   * Ustun kesimini tozalash — IKKI maydon birga (ustun + holat).
   * Alohida prop, chunki `onChange` ni ketma-ket ikki marta chaqirish
   * ishlamaydi: ikkinchi chaqiruv birinchisini bekor qiladi
   * (qarang: `useTableState.setFilters`).
   */
  onClearColumn: () => void;
  onReset: () => void;
  /**
   * Bajarilish holati — avval ALOHIDA tugma edi. Ikkita qo'shni tugma ham
   * qatorni filtrlab, foydalanuvchini "qaysi biri nima qiladi?" degan savolga
   * qo'yardi. Endi bitta panel, birinchi bo'lim.
   */
  status: MatrixStatusFilter;
  statusCounts: Record<MatrixStatusFilter, number>;
  onStatusChange: (v: MatrixStatusFilter) => void;
  /** Bajarilish foizi bo'yicha saralash — mavzu bo'yicha shu yerga tegishli. */
  sortActive: boolean;
  sortDir: "asc" | "desc";
  onToggleSort: () => void;
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
  onClearColumn,
  onReset,
  shown,
  total,
  status,
  statusCounts,
  onStatusChange,
  sortActive,
  sortDir,
  onToggleSort,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));
  // Bajarilish holati ham hisobga olinadi — tugmadagi raqam YOQILGAN
  // filtrlarning to'liq sonini ko'rsatishi kerak.
  const count = activeFilterCount(filters) + (status !== "all" ? 1 : 0);

  const people: Array<{ key: keyof MatrixFilters; label: string; list: FacetOption[] }> = [
    { key: "accountant", label: "Buxgalter", list: options.accountants },
    { key: "supervisor", label: "Nazoratchi", list: options.supervisors },
    { key: "chief", label: "Bosh buxgalter", list: options.chiefs },
    { key: "bank", label: "Bank-klient", list: options.banks },
  ];

  /**
   * Variant matni — nom yonida firmalar soni.
   *
   * Tanlangan odamda shu o'rinda firma bo'lmasa, jadval bo'sh chiqadi; sanoq
   * buni TANLASHDAN OLDIN aytadi, aks holda bo'sh ekran nosozlik bo'lib
   * ko'rinadi.
   */
  const optionLabel = (o: FacetOption) => `${o.value} — ${o.count}`;

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
            {/* ── Bajarilish holati ────────────────────────────── */}
            {/* Birinchi bo'lim: kundalik savol shu — "kimda ish qolgan?" */}
            <div>
              <span className="block text-micro font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-3)" }}>
                Bajarilish
              </span>
              <div className="grid grid-cols-2 gap-1">
                {MATRIX_STATUS_FILTERS.map((o) => {
                  const on = status === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => onStatusChange(o.value)}
                      aria-pressed={on}
                      title={o.hint}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-colors"
                      style={
                        on
                          ? { background: "var(--primary-ghost)", border: "1px solid var(--primary)", color: "var(--primary)" }
                          : { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }
                      }
                    >
                      <span className="text-micro font-bold w-3 flex-shrink-0" aria-hidden>{o.icon}</span>
                      <span className="flex-1 min-w-0 text-micro font-bold uppercase tracking-widest truncate">
                        {o.label}
                      </span>
                      <span className="text-micro tabular-nums flex-shrink-0" style={{ opacity: 0.7 }}>
                        {statusCounts[o.value]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={onToggleSort}
                aria-pressed={sortActive}
                className="w-full mt-1.5 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg transition-colors"
                style={
                  sortActive
                    ? { background: "var(--primary-ghost)", border: "1px solid var(--primary)", color: "var(--primary)" }
                    : { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-3)" }
                }
              >
                <span className="text-micro font-bold uppercase tracking-widest">Foiz bo&apos;yicha saralash</span>
                <span className="text-micro font-bold">
                  {sortActive ? (sortDir === "asc" ? "kamdan ↑" : "ko'pdan ↓") : "—"}
                </span>
              </button>
            </div>

            {/* ── Mas'ullar ────────────────────────────────────── */}
            <div className="pt-3 space-y-2.5" style={{ borderTop: "1px solid var(--border)" }}>
              {/* Eng ko'p so'raladigan savol — "falonchining firmalari". O'rni
                  bo'yicha emas, ISMI bo'yicha, shuning uchun butun kenglikda
                  va o'rin tanlagichlaridan YUQORIDA turadi. */}
              <Field
                label="Xodim (istalgan o'rin)"
                value={filters.person}
                active={filters.person !== "all"}
                onChange={(v) => onChange("person", v)}
                onClear={() => onChange("person", "all")}
                hint="Buxgalter, nazoratchi, bosh buxgalter yoki bank-klient — qaysi o'rinda bo'lsa ham"
              >
                <option value="all">Barchasi</option>
                {options.people.map((o) => (
                  <option key={o.value} value={o.value}>
                    {optionLabel(o)}
                  </option>
                ))}
              </Field>

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
                    {p.list.map((o) => (
                      <option key={o.value} value={o.value}>
                        {optionLabel(o)}
                      </option>
                    ))}
                  </Field>
                ))}
              </div>
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
                onClear={onClearColumn}
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
                <>
                  {/* Sukut bo'yicha YOQIQ: ustun tanlagan odam o'sha ustunni
                      ko'rmoqchi, 47 ta chiziqchani emas. O'chirilsa qolgan
                      ustunlar ham ko'rinadi (kontekst kerak bo'lganda). */}
                  <label
                    className="flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  >
                    <input
                      type="checkbox"
                      checked={filters.colOnly === "1"}
                      onChange={(e) => onChange("colOnly", e.target.checked ? "1" : "0")}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text)" }}>
                        Faqat shu ustunni ko&apos;rsat
                      </span>
                      <span className="block text-micro mt-0.5" style={{ color: "var(--text-3)" }}>
                        Foiz va sanoqlar ham shu hisobot bo&apos;yicha hisoblanadi
                      </span>
                    </span>
                  </label>

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
                </>
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
