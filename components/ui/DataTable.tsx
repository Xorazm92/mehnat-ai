"use client";

import React, { useMemo } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Density, SortDir } from "@/hooks/useTableState";
import { EmptyState } from "./EmptyState";
import { SkeletonTable } from "./Skeleton";

/**
 * DATA TABLE — jadval platformasi.
 *
 * Loyihada 26 ta jadval bor va 26 xil implementatsiya: 24 tasida saralash yo'q,
 * hech birida qator tanlash yo'q, hech birida URL holati yo'q, `scope="col"`,
 * `aria-sort` va `<caption>` — nol marta. Zebra chiziq uch joyda inline
 * JavaScript bilan chizilgan, holbuki `globals.css:890` "zebra ishlatilmaydi"
 * deb ATAYLAB qaror qilgan.
 *
 * Bu komponent `.erp-table` uslubi ustiga quriladi (u dizayn tizimining eng
 * yaxshi qismi: ustun chiziqlari, yopishqoq sarlavha, zebrasiz zichlik), va
 * ustiga yetishmayotganini qo'shadi: saralash, tanlash, ommaviy amallar,
 * zichlik, sahifalash, semantik belgilash.
 */

export interface DataColumn<T> {
  key: string;
  header: string;
  /** Katakda ko'rinadigan narsa */
  cell: (row: T) => React.ReactNode;
  /** Saralash/eksport uchun xom qiymat. Berilmasa ustun saralanmaydi. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Eksportda `sortValue` dan farq qilsa */
  exportValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  /** Raqamli ustun — mono shrift + tabular raqamlar + o'ngga tekislash */
  numeric?: boolean;
  width?: string;
  /** Chapga yopishtirish (identifikator ustuni uchun) */
  sticky?: boolean;
  /**
   * Ustunni yashirish. DIQQAT: yashirish BITTA joyda hal qilinadi — sarlavha
   * ham, kataklar ham, eksport ham shu ro'yxatdan kelib chiqadi. `PayrollTable`
   * da avval ikkita turli mexanizm ishlatilardi (thead `.filter()` qilardi,
   * tbody esa har katakda `!hiddenCols.has(...)` tekshirardi) va bo'sh holat
   * qatori `colSpan={9}` ni qotirib qo'ygan edi — ustun yashirilsa jadval
   * qiyshayardi.
   */
  hidden?: boolean;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;

  sortKey?: string | null;
  sortDir?: SortDir;
  onToggleSort?: (key: string) => void;

  density?: Density;

  /** Tanlash yoqilsa — tanlangan id'lar to'plami */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /** Tanlov mavjud bo'lganda pastda chiqadigan panel */
  bulkActions?: (selected: string[]) => React.ReactNode;

  onRowClick?: (row: T) => void;

  page?: number;
  pageSize?: number;
  onPageChange?: (p: number) => void;

  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  /** Ekran o'quvchilar uchun jadval tavsifi */
  caption: string;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  sortKey = null,
  sortDir = "asc",
  onToggleSort,
  density = "comfortable",
  selected,
  onSelectedChange,
  bulkActions,
  onRowClick,
  page = 1,
  pageSize,
  onPageChange,
  loading = false,
  emptyTitle = "Ma'lumot topilmadi",
  emptyDescription,
  emptyIcon,
  caption,
  className = "",
}: DataTableProps<T>) {
  const selectable = Boolean(selected && onSelectedChange);

  // Yashirilgan ustunlar bir marta chiqarib tashlanadi — quyida hamma joy
  // (sarlavha, kataklar, colSpan) shu ro'yxatdan foydalanadi.
  const cols = useMemo(() => columns.filter((c) => !c.hidden), [columns]);

  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;

    // `localeCompare` matn uchun, sonli taqqoslash raqam uchun. Avvalgi kod
    // `a[field] || ''` qilib SONLARNI ham satr sifatida taqqoslardi — natijada
    // 100 < 20 bo'lib chiqardi.
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "uz") * dir;
    });
  }, [rows, cols, sortKey, sortDir]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const visible = pageSize ? sorted.slice((safePage - 1) * pageSize, safePage * pageSize) : sorted;

  const pageIds = visible.map(rowKey);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected?.has(id));

  const toggleAll = () => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    onSelectedChange(next);
  };

  const toggleOne = (id: string) => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  if (loading) {
    return (
      <div className={`dashboard-card !p-0 overflow-hidden ${className}`}>
        <SkeletonTable rows={8} cols={Math.min(cols.length, 6)} />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div className="dashboard-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-left" data-density={density}>
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                {selectable && (
                  <th scope="col" className="w-[44px] text-center">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAll}
                      aria-label={allOnPageSelected ? "Tanlovni bekor qilish" : "Sahifadagi hammasini tanlash"}
                    />
                  </th>
                )}
                {cols.map((col) => {
                  const isSorted = sortKey === col.key;
                  const canSort = Boolean(col.sortValue && onToggleSort);
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      style={{ width: col.width }}
                      // `aria-sort` — ekran o'quvchi ustun saralanganini shu orqali
                      // e'lon qiladi. Loyihada u nol marta ishlatilgan edi.
                      aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : canSort ? "none" : undefined}
                      className={[
                        col.numeric || col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "",
                        col.sticky ? "sticky left-0 z-20" : "",
                        col.headerClassName ?? "",
                      ].filter(Boolean).join(" ")}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={() => onToggleSort!(col.key)}
                          className="inline-flex items-center gap-1.5 uppercase tracking-[0.09em] font-semibold hover:opacity-75 transition-opacity"
                          style={{ color: isSorted ? "var(--brand)" : "inherit" }}
                        >
                          {col.header}
                          {isSorted ? (
                            sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                          ) : (
                            <ChevronsUpDown size={11} className="opacity-35" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {visible.map((row) => {
                const id = rowKey(row);
                const isSelected = selected?.has(id) ?? false;
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={onRowClick ? "cursor-pointer" : undefined}
                    style={isSelected ? { background: "var(--brand-ghost)" } : undefined}
                  >
                    {selectable && (
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(id)}
                          aria-label="Qatorni tanlash"
                        />
                      </td>
                    )}
                    {cols.map((col) => (
                      <td
                        key={col.key}
                        className={[
                          col.numeric ? "text-right tabular-nums font-mono" : "",
                          col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "",
                          col.sticky ? "sticky left-0 z-10" : "",
                        ].filter(Boolean).join(" ")}
                        style={col.sticky ? { background: "var(--card-bg)" } : undefined}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visible.length === 0 && (
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
        )}

        {pageSize && totalPages > 1 && (
          <div
            className="flex items-center justify-between gap-4 px-4 py-3"
            style={{ borderTop: "1px solid var(--rule)" }}
          >
            <span className="text-meta font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} / {sorted.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPageChange?.(safePage - 1)}
                disabled={safePage <= 1}
                aria-label="Oldingi sahifa"
                className="icon-btn-sm rounded-lg disabled:opacity-35 disabled:cursor-not-allowed"
                style={{ color: "var(--text-secondary)" }}
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-meta font-bold tabular-nums px-2" style={{ color: "var(--text-secondary)" }}>
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPageChange?.(safePage + 1)}
                disabled={safePage >= totalPages}
                aria-label="Keyingi sahifa"
                className="icon-btn-sm rounded-lg disabled:opacity-35 disabled:cursor-not-allowed"
                style={{ color: "var(--text-secondary)" }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ommaviy amallar paneli — tanlov bo'lgandagina ko'rinadi. */}
      {selectable && selected!.size > 0 && bulkActions && (
        <div
          role="region"
          aria-label="Tanlanganlar uchun amallar"
          className="sticky bottom-4 mt-3 mx-auto w-fit flex items-center gap-3 px-4 py-2.5 rounded-xl animate-rise-in"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--rule-strong)",
            boxShadow: "var(--shadow-overlay, var(--card-shadow-hover))",
            zIndex: "var(--z-sticky, 10)",
          }}
        >
          <span className="text-meta font-bold uppercase tracking-widest tabular-nums" style={{ color: "var(--text-primary)" }}>
            {selected!.size} ta tanlandi
          </span>
          <span style={{ width: 1, height: 20, background: "var(--rule)" }} />
          {bulkActions(Array.from(selected!))}
          <button
            type="button"
            onClick={() => onSelectedChange!(new Set())}
            aria-label="Tanlovni bekor qilish"
            className="icon-btn-sm rounded-lg"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export default DataTable;
