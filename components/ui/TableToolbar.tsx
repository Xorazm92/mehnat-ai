"use client";

import React, { useState } from "react";
import { LayoutGrid, List, Download, Filter, Search } from "lucide-react";

export type ViewMode = "grid" | "list";

interface TableToolbarProps {
  /** Grid/List view toggle. Omit both to hide it. */
  view?: ViewMode;
  onViewChange?: (v: ViewMode) => void;

  /** Live search box. Omit onSearchChange to hide it. */
  search?: string;
  onSearchChange?: (s: string) => void;
  searchPlaceholder?: string;

  /** A month/period control slot, e.g. <MonthPicker/>. */
  month?: React.ReactNode;

  /** Excel/CSV export. Omit to hide. */
  onExport?: () => void;
  exportLabel?: string;

  /** Module-specific filter controls, shown inside the funnel popover. */
  filter?: React.ReactNode;
  /** Number of active filters — shows a badge on the funnel. */
  filterCount?: number;

  /** Extra trailing controls. */
  children?: React.ReactNode;
  className?: string;
}

const btnBase =
  "font-bold px-3 py-2 rounded-xl text-meta flex items-center justify-center gap-2 transition-all shadow-sm uppercase tracking-widest";

/**
 * Shared table toolbar: grid/list toggle, live search, a month slot, a
 * filter funnel (opens a popover with module-specific controls), and export.
 * Every control is optional — each table renders only what it needs, so the
 * bar looks and behaves the same everywhere.
 */
export function TableToolbar({
  view,
  onViewChange,
  search,
  onSearchChange,
  searchPlaceholder = "Qidirish...",
  month,
  onExport,
  exportLabel = "Excel",
  filter,
  filterCount = 0,
  children,
  className,
}: TableToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const showView = !!onViewChange && !!view;

  return (
    <div className={`flex items-center gap-2.5 flex-wrap ${className ?? ""}`}>
      {/* View toggle */}
      {showView && (
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {(["grid", "list"] as ViewMode[]).map((v) => {
            const Icon = v === "grid" ? LayoutGrid : List;
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => onViewChange!(v)}
                aria-label={v === "grid" ? "Katak ko'rinishi" : "Ro'yxat ko'rinishi"}
                aria-pressed={active}
                className="p-1.5 rounded-lg transition-all"
                style={{
                  background: active ? "var(--primary)" : "transparent",
                  color: active ? "#fff" : "var(--text-3)",
                }}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      {onSearchChange && (
        <div className="relative">
          <input
            type="text"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-44 pl-9 pr-3 py-2 rounded-xl text-xs font-semibold outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
        </div>
      )}

      {/* Month / period slot */}
      {month}

      {/* Filter funnel */}
      {filter && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            aria-label="Filtrlar"
            aria-expanded={filterOpen}
            className={btnBase + " relative"}
            style={{
              background: filterCount > 0 ? "var(--primary)" : "var(--surface-2)",
              border: "1px solid var(--border)",
              color: filterCount > 0 ? "#fff" : "var(--text-2)",
            }}
          >
            <Filter size={14} />
            {filterCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-micro font-black flex items-center justify-center"
                style={{ background: "var(--danger)", color: "#fff" }}
              >
                {filterCount}
              </span>
            )}
          </button>
          {filterOpen && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setFilterOpen(false)} />
              <div
                className="absolute right-0 mt-2 z-[100] w-72 max-h-[70vh] overflow-y-auto rounded-xl p-4 shadow-2xl"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div className="flex flex-col gap-3">{filter}</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Export */}
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          className={btnBase}
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--success)";
            e.currentTarget.style.borderColor = "var(--success)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-2)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          <Download size={14} /> {exportLabel}
        </button>
      )}

      {children}
    </div>
  );
}

export default TableToolbar;
