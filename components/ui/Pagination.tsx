"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "@/hooks/usePageSize";

/**
 * PAGINATION — sahifalar chizig'i.
 *
 * `DataTable` ichida yashab turgan edi, ya'ni undan foydalanmaydigan
 * jadvallar sahifalanmasdi: operatsiyalar jurnali 1165 qatorni, audit
 * jurnali 1007 tasini bitta uzun sahifada chizardi. Endi bu mustaqil
 * komponent va `DataTable` ham, qo'lda terilgan `<table>` lar ham shuni
 * chaqiradi.
 *
 * Holatni O'ZI saqlamaydi: sahifa raqami `useTableState` da yashaydi va u
 * URL bilan sinxron — ya'ni "3-sahifa" havolasini yuborsa bo'ladi va
 * orqaga tugmasi ishlaydi.
 */

/**
 * Sahifa raqamlari oynasi: joriy sahifa atrofidagi qo'shnilar + chekkalar,
 * orasi `null` (uchnuqta) bilan. `[1, null, 7, 8, 9, null, 47]`.
 *
 * Hammasini chizib bo'lmaydi — 489 sahifali ro'yxat (bu real hajm) butun
 * ekranni egallagan bo'lardi. Chekkalar doim qoladi: "boshiga qaytish" va
 * "oxirini ko'rish" eng ko'p so'raladigan ikki sakrash.
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

export interface PaginationProps {
  /** Joriy sahifa (1 dan boshlanadi). */
  page: number;
  pageSize: number;
  /** Filtrlardan KEYINGI jami qatorlar soni. */
  total: number;
  onPageChange: (page: number) => void;
  /** Nima sanalayotgani — "firma", "yozuv", "xodim". */
  unit?: string;
  /**
   * Berilsa — hajm tanlagichi chiziladi. Qiymatlar `PAGE_SIZE_OPTIONS` dan
   * olinadi va tanlov `usePageSize` orqali brauzerda saqlanadi.
   */
  onPageSizeChange?: (n: number) => void;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  unit,
  onPageSizeChange,
  className = "",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Filtr qatorlar sonini kamaytirsa joriy sahifa mavjud bo'lmay qolishi
  // mumkin — o'shanda oxirgi mavjud sahifa ko'rsatiladi, bo'sh ekran emas.
  const safePage = Math.min(Math.max(1, page), totalPages);

  if (totalPages <= 1 && !onPageSizeChange) return null;

  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${className}`}
      style={{ borderTop: "1px solid var(--rule)" }}
    >
      {/* "1–15 / 22" o'rniga to'liq jumla: qisqartma o'qilishi uchun
          foydalanuvchi tirenani "dan" deb tarjima qilishi kerak edi. */}
      <span className="text-meta" style={{ color: "var(--text-muted)" }}>
        {/* Bo'sh ro'yxatda "0 tadan 1–0 ko'rsatilmoqda" degan bema'ni jumla
            chiqardi — oraliq faqat qator bo'lganda ma'noga ega. */}
        {total === 0 ? (
          `Hech narsa topilmadi`
        ) : (
          <>
            <b className="tabular-nums" style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
              {total}
            </b>{" "}
            {unit ? `${unit}dan` : "tadan"}{" "}
            <b className="tabular-nums" style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
              {from}–{to}
            </b>{" "}
            ko&apos;rsatilmoqda
          </>
        )}
      </span>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-meta" style={{ color: "var(--text-muted)" }}>
            Sahifada
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                // Hajm oshsa joriy sahifa mavjud bo'lmay qolishi mumkin
                // (100 tadan 3-sahifa → 100 tadan 1 sahifa), shuning uchun
                // boshiga qaytamiz.
                onPageChange(1);
              }}
              className="rounded-lg px-1.5 py-1 text-meta tabular-nums outline-none"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--card-border)",
                color: "var(--text-secondary)",
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}

        {totalPages > 1 && (
      <nav className="flex items-center gap-1" aria-label="Sahifalar">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          aria-label="Oldingi sahifa"
          className="icon-btn-sm rounded-lg disabled:opacity-35 disabled:cursor-not-allowed"
          style={{ color: "var(--text-secondary)" }}
        >
          <ChevronLeft size={15} />
        </button>
        {/* Raqamli sahifalar: "3 / 47" faqat QAYERDA ekanini aytardi,
            4-sahifaga o'tish uchun esa "keyingi" ni bosish kerak edi.
            Endi qo'shni sahifalar va chekkalar bir bosishda. */}
        {pageWindow(safePage, totalPages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-meta" style={{ color: "var(--text-muted)" }}>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === safePage ? "page" : undefined}
              aria-label={`${p}-sahifa`}
              className="min-w-[28px] h-7 px-1.5 rounded-lg text-meta tabular-nums transition-colors"
              style={
                p === safePage
                  ? { background: "var(--brand)", color: "var(--on-brand)", fontWeight: 500 }
                  : { color: "var(--text-secondary)" }
              }
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          aria-label="Keyingi sahifa"
          className="icon-btn-sm rounded-lg disabled:opacity-35 disabled:cursor-not-allowed"
          style={{ color: "var(--text-secondary)" }}
        >
          <ChevronRight size={15} />
        </button>
      </nav>
        )}
      </div>
    </div>
  );
}

/**
 * Ro'yxatning joriy sahifasini kesib beradi.
 *
 * Alohida funksiya, chunki har chaqiruvchi `slice((page-1)*size, page*size)`
 * ni qo'lda yozsa, biri `page` ni 0 dan boshlab hisoblab, jimgina birinchi
 * sahifani tashlab ketardi.
 */
export function pageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return rows.slice((safePage - 1) * pageSize, safePage * pageSize);
}

export default Pagination;
