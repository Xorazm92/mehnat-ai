"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * TABLE STATE — jadval holati URL'da yashaydi.
 *
 * Muammo: loyihada `useSearchParams` mijoz komponentlarida NOL marta ishlatilgan.
 * Ya'ni har bir filtr faqat React state'da, va hech bir ko'rinishni ulashib
 * bo'lmaydi. Nazoratchi "mana bu 12 ta firma kechikkan" deb buxgalterga
 * yuborolmaydi — har bir topshiriq skrinshot yoki og'zaki ko'rsatmaga aylanadi.
 * Brauzerning "orqaga" tugmasi ham ishlamaydi, sahifa yangilansa filtr yo'qoladi.
 *
 * Bu hook holatni URL query'ga bog'laydi:
 *   /staff?q=alisher&sort=name&dir=asc&page=2&d=compact
 *
 * `ns` (namespace) bir sahifada bir nechta jadval bo'lsa kalitlar to'qnashmasligi
 * uchun: `ns="exp"` → `exp_q`, `exp_sort`...
 *
 * Qidiruv ATAYLAB ikki qatlamli: `search` (input uchun, darhol) va
 * `debouncedSearch` (filtrlash uchun, 250ms). Loyihadagi qidiruvlarning
 * faqat BITTASI debounce qilingan edi — `OrganizationModule` har bosilgan
 * harfda 212 qatorni qayta filtrlab, qayta saralaydi.
 */

export type SortDir = "asc" | "desc";
export type Density = "comfortable" | "compact";

export interface TableState {
  search: string;
  debouncedSearch: string;
  setSearch: (v: string) => void;

  sortKey: string | null;
  sortDir: SortDir;
  toggleSort: (key: string) => void;

  page: number;
  setPage: (p: number) => void;

  density: Density;
  setDensity: (d: Density) => void;

  /** Ixtiyoriy nomlangan filtrlar — ular ham URL'ga tushadi */
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;

  /** Barcha holatni tozalash */
  reset: () => void;
  /** URL'da biror holat bormi (Tozalash tugmasini ko'rsatish uchun) */
  isDirty: boolean;
}

export interface UseTableStateOptions {
  ns?: string;
  defaultSortKey?: string | null;
  defaultSortDir?: SortDir;
  defaultDensity?: Density;
  /** Nomlangan filtrlarning boshlang'ich qiymatlari */
  defaultFilters?: Record<string, string>;
  debounceMs?: number;
}

export function useTableState({
  ns = "",
  defaultSortKey = null,
  defaultSortDir = "asc",
  defaultDensity = "comfortable",
  defaultFilters = {},
  debounceMs = 250,
}: UseTableStateOptions = {}): TableState {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const k = useCallback((key: string) => (ns ? `${ns}_${key}` : key), [ns]);

  const search = params.get(k("q")) ?? "";
  const sortKey = params.get(k("sort")) ?? defaultSortKey;
  const sortDir = (params.get(k("dir")) as SortDir) ?? defaultSortDir;
  const page = Math.max(1, Number(params.get(k("page")) ?? 1) || 1);
  const density = (params.get(k("d")) as Density) ?? defaultDensity;

  const filterKeys = useMemo(() => Object.keys(defaultFilters), [defaultFilters]);
  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of filterKeys) out[key] = params.get(k(key)) ?? defaultFilters[key];
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, filterKeys, k]);

  /**
   * URL yozish. `replace` + `scroll: false` — har bosilgan harf tarixga yangi
   * yozuv qo'shmasin va sahifa tepaga sakramasin.
   */
  const write = useCallback(
    (patch: Record<string, string | number | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        const full = k(key);
        if (value === null || value === "") next.delete(full);
        else next.set(full, String(value));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router, k]
  );

  // ── Qidiruv: input darhol, filtrlash kechikib ────────────────
  const [localSearch, setLocalSearch] = useState(search);

  // URL tashqaridan o'zgarsa (orqaga tugmasi, havola) inputni moslash.
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const setSearch = useCallback((v: string) => setLocalSearch(v), []);

  useEffect(() => {
    if (localSearch === search) return;
    const id = setTimeout(() => write({ q: localSearch || null, page: null }), debounceMs);
    return () => clearTimeout(id);
  }, [localSearch, search, debounceMs, write]);

  const toggleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        write({ sort: key, dir: sortDir === "asc" ? "desc" : "asc" });
      } else {
        write({ sort: key, dir: "asc" });
      }
    },
    [sortKey, sortDir, write]
  );

  const setPage = useCallback((p: number) => write({ page: p <= 1 ? null : p }), [write]);
  const setDensity = useCallback(
    (d: Density) => write({ d: d === defaultDensity ? null : d }),
    [write, defaultDensity]
  );
  const setFilter = useCallback(
    (key: string, value: string) =>
      write({ [key]: value === defaultFilters[key] ? null : value, page: null }),
    [write, defaultFilters]
  );

  const reset = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    for (const key of ["q", "sort", "dir", "page", "d", ...filterKeys]) next.delete(k(key));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router, k, filterKeys]);

  const isDirty =
    Boolean(search) ||
    page > 1 ||
    sortKey !== defaultSortKey ||
    filterKeys.some((key) => filters[key] !== defaultFilters[key]);

  return {
    search: localSearch,
    debouncedSearch: search,
    setSearch,
    sortKey,
    sortDir,
    toggleSort,
    page,
    setPage,
    density,
    setDensity,
    filters,
    setFilter,
    reset,
    isDirty,
  };
}

export default useTableState;
