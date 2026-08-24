"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * TABLE STATE — jadval holati URL'da yashaydi.
 *
 * Muammo (asl): loyihada `useSearchParams` mijoz komponentlarida NOL marta
 * ishlatilgan. Ya'ni har bir filtr faqat React state'da, va hech bir
 * ko'rinishni ulashib bo'lmaydi. Nazoratchi "mana bu 12 ta firma kechikkan"
 * deb buxgalterga yuborolmaydi — har bir topshiriq skrinshot yoki og'zaki
 * ko'rsatmaga aylanadi. Brauzerning "orqaga" tugmasi ham ishlamaydi, sahifa
 * yangilansa filtr yo'qoladi.
 *
 * IKKINCHI MUAMMO (bu safar topilgan): URL'ni `router.replace` orqali
 * yozish Next.js'da NAVIGATSIYA — har chaqiruv serverdan yangi RSC payload
 * so'raydi (sahifa server komponent bo'lsa, DB so'rovlari QAYTA ishlaydi).
 * Bu yerdagi jadvallarning HAMMASI qidiruv/saralash/sahifalashni mijoz
 * tomonida (`useMemo` bilan) bajaradi — server hech qachon buni bilishi
 * shart emas edi. Natijada har bosilgan harf (debounce'dan keyin ham)
 * to'liq server round-trip'ni kutardi: 273 firmalik ro'yxat qayta so'ralib,
 * qayta serializatsiya qilinib qaytardi — "sekin va sifatsiz" tuyulishining
 * sababi shu, filtrlash mantig'i emas.
 *
 * Yechim: holatning yagona manbasi endi React state (URL emas). URL faqat
 * ulashish uchun `history.replaceState` bilan "soya"da yangilanadi — bu
 * hech qanday navigatsiya yoki server so'rovini qo'zg'atmaydi. Sahifa birinchi
 * marta ochilganda boshlang'ich qiymatlar URL'dan o'qiladi (share/refresh
 * ishlaydi), shundan keyin esa hamma narsa mijozda, darhol.
 *
 * Qidiruv ikki qatlamli qoladi: `search` (input uchun, darhol) va
 * `debouncedSearch` (filtrlash uchun, debounce'dan keyin) — lekin endi
 * ikkalasi ham faqat React state, tarmoqqa bog'liq emas.
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
  /**
   * Bir NECHTA filtrni BITTA yozuvda o'zgartirish.
   *
   * MAJBURIY: `setFilter` ni ketma-ket chaqirib bo'lmaydi — bir renderda
   * ikkinchi chaqiruv birinchisining state yangilanishini ko'rmasligi mumkin.
   * "Hammasini tozalash" aynan shu sababli bitta filtrni tozalab qo'yardi.
   */
  setFilters: (patch: Record<string, string>) => void;

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
  const pathname = usePathname();
  // Faqat BOSHLANG'ICH qiymatlarni o'qish uchun — shundan keyin bu hook
  // holatni o'zi boshqaradi va URL'ga faqat yozadi, undan o'qimaydi.
  const initialParams = useSearchParams();

  const k = useCallback((key: string) => (ns ? `${ns}_${key}` : key), [ns]);
  const filterKeys = useMemo(() => Object.keys(defaultFilters), [defaultFilters]);

  const [search, setSearchState] = useState(() => initialParams.get(k("q")) ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [sortKey, setSortKey] = useState<string | null>(
    () => initialParams.get(k("sort")) ?? defaultSortKey
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => (initialParams.get(k("dir")) as SortDir) ?? defaultSortDir
  );
  const [page, setPageState] = useState(
    () => Math.max(1, Number(initialParams.get(k("page")) ?? 1) || 1)
  );
  const [density, setDensityState] = useState<Density>(
    () => (initialParams.get(k("d")) as Density) ?? defaultDensity
  );
  const [filters, setFiltersState] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const key of filterKeys) out[key] = initialParams.get(k(key)) ?? defaultFilters[key];
    return out;
  });

  /**
   * URL'ni "soya"da yangilash — `history.replaceState`, `router.replace` EMAS.
   * Bu adres qatorini yangilaydi (ulashish uchun) lekin Next'ni navigatsiya
   * deb hisoblamaydi: server so'rovi yo'q, sahifa qayta render bo'lmaydi.
   */
  const syncUrl = useCallback(
    (patch: Record<string, string | number | null>) => {
      if (typeof window === "undefined") return;
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        const full = k(key);
        if (value === null || value === "") next.delete(full);
        else next.set(full, String(value));
      }
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      window.history.replaceState(window.history.state, "", url);
    },
    [pathname, k]
  );

  const setSearch = useCallback((v: string) => setSearchState(v), []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPageState(1);
      syncUrl({ q: search || null, page: null });
    }, debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, debounceMs]);

  const toggleSort = useCallback(
    (key: string) => {
      setSortKey(prevKey => {
        const nextDir: SortDir = prevKey === key && sortDir === "asc" ? "desc" : "asc";
        setSortDir(nextDir);
        syncUrl({ sort: key, dir: nextDir });
        return key;
      });
    },
    [sortDir, syncUrl]
  );

  const setPage = useCallback(
    (p: number) => {
      setPageState(p);
      syncUrl({ page: p <= 1 ? null : p });
    },
    [syncUrl]
  );

  const setDensity = useCallback(
    (d: Density) => {
      setDensityState(d);
      syncUrl({ d: d === defaultDensity ? null : d });
    },
    [syncUrl, defaultDensity]
  );

  /** Standart qiymat URL'da saqlanmaydi — manzil keraksiz uzaymasin. */
  const normalize = useCallback(
    (key: string, value: string) => (value === defaultFilters[key] ? null : value),
    [defaultFilters]
  );

  const setFilter = useCallback(
    (key: string, value: string) => {
      setFiltersState(prev => ({ ...prev, [key]: value }));
      setPageState(1);
      syncUrl({ [key]: normalize(key, value), page: null });
    },
    [syncUrl, normalize]
  );

  const setFilters = useCallback(
    (patch: Record<string, string>) => {
      setFiltersState(prev => ({ ...prev, ...patch }));
      setPageState(1);
      const out: Record<string, string | null> = { page: null };
      for (const [key, value] of Object.entries(patch)) out[key] = normalize(key, value);
      syncUrl(out);
    },
    [syncUrl, normalize]
  );

  const reset = useCallback(() => {
    setSearchState("");
    setDebouncedSearch("");
    setSortKey(defaultSortKey);
    setSortDir(defaultSortDir);
    setPageState(1);
    setDensityState(defaultDensity);
    setFiltersState({ ...defaultFilters });

    if (typeof window === "undefined") return;
    const next = new URLSearchParams(window.location.search);
    for (const key of ["q", "sort", "dir", "page", "d", ...filterKeys]) next.delete(k(key));
    const qs = next.toString();
    window.history.replaceState(window.history.state, "", qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, k, filterKeys, defaultSortKey, defaultSortDir, defaultDensity, defaultFilters]);

  const isDirty =
    Boolean(search) ||
    page > 1 ||
    sortKey !== defaultSortKey ||
    filterKeys.some((key) => filters[key] !== defaultFilters[key]);

  return {
    search,
    debouncedSearch,
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
    setFilters,
    reset,
    isDirty,
  };
}

export default useTableState;
