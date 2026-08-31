"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useDismissable } from "@/hooks/useDismissable";

/**
 * COMPANY SELECT — qidiriladigan firma tanlagichi.
 *
 * NEGA KERAK (o'lchov, 2026-08-31): bazada **269 ta firma**, va ilovadagi
 * O'N BIR joyda ular tekis native `<select>` ga to'kiladi — qo'lda kirim,
 * vipiska navbatida bog'lash, hisobot, hujjat, kabinet…
 *
 * Native `<select>` ning klaviatura qidiruvi faqat variant matnining
 * BOSHIDAN mos keladi. Ro'yxat esa `{nom} — {STIR}` ko'rinishida, ya'ni
 * **STIR bo'yicha umuman qidirib bo'lmaydi**. Bu shunchaki noqulaylik emas:
 * bank-klient xodimi har kuni kechqurun vipiskani yuklaydi va u yerda
 * firmani AYNAN STIR bo'yicha taniydi — ya'ni tizim uni eng kerak
 * bo'lgan paytda qidiruvsiz qoldirardi.
 *
 * NIMA QAYTA ISHLATILDI: o'zaro ta'sir naqshi `components/GlobalSearch.tsx`
 * dagi ⌘K palitrasidan (`role="combobox"` + `role="listbox"` +
 * `aria-activedescendant`, ↑↓/Enter/Escape) — u ishlaydi va sinovdan
 * o'tgan; yopilish `hooks/useDismissable` da; ko'rinish `.erp-input`
 * (dizayn tizimining maydon uslubi), ya'ni yangi vizual til YO'Q.
 *
 * NEGA PORTAL: tanlagich jadval katagida yoki `overflow: auto` kartada
 * turishi mumkin — ro'yxat o'sha joyda absolyut chizilsa KESILADI. Shu
 * sababdan `document.body` ga portal + tetik koordinatasi (aynan
 * `OperationModule` dagi katak menyusi ishlatadigan naqsh).
 */

export interface CompanyOption {
  id: string;
  name: string;
  inn?: string | null;
}

export interface CompanySelectProps {
  companies: CompanyOption[];
  /** Tanlangan firma id'si. Bo'sh satr — tanlanmagan. */
  value: string;
  onChange: (companyId: string) => void;
  /**
   * Ro'yxat TEPASIDA alohida guruh bilan chiqadigan firmalar (id'lar).
   *
   * Vipiska navbatida STIR mos kelgan firma allaqachon hisoblanadi, lekin u
   * 269 talik `optgroup` ichida ko'milgan edi — ya'ni tizim javobni bilardi
   * va uni ko'rsatmasdi. Endi u birinchi qator.
   */
  suggestions?: string[];
  /** Taklif guruhining sarlavhasi. */
  suggestionsLabel?: string;
  /** Yopiq holatdagi va bo'sh qidiruvdagi ko'rsatma matni. */
  placeholder?: string;
  /**
   * Berilsa — ro'yxatda qiymatni TOZALAYDIGAN qator paydo bo'ladi.
   * Masalan qo'lda kirimda: "Nomsiz tushum (firmaga bog'lanmagan)".
   */
  emptyLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** `Field` primitivi bilan bog'lash uchun. */
  id?: string;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
  className?: string;
  /** Zich joy (jadval katagi) uchun. */
  size?: "sm" | "md";
  /**
   * Standart — butun kenglik (forma maydoni). Filtr qatorida `false` bering,
   * aks holda o'ram `w-full` bo'lib yonidagi filtrlarni keyingi qatorga
   * surib yuboradi. `ui/Select` da xuddi shu prop bor — ikkalasi bir xil
   * ishlashi kerak.
   */
  fullWidth?: boolean;
}

const SIZE: Record<"sm" | "md", string> = {
  sm: "text-xs py-1 pl-2 pr-7",
  md: "text-body py-2 pl-3 pr-9",
};

/** Ro'yxatda bir vaqtda chiziladigan maksimal qator — 269 tasi shart emas. */
const MAX_VISIBLE = 60;

/** Panelning eng kichik kengligi — firma nomi + STIR sig'ishi uchun. */
const PANEL_MIN_WIDTH = 280;
/** Ekran chetidan qoldiriladigan bo'shliq. */
const VIEWPORT_GAP = 8;

function norm(v: string): string {
  return v.trim().toLowerCase();
}

export function CompanySelect({
  companies,
  value,
  onChange,
  suggestions,
  suggestionsLabel = "STIR bo'yicha taklif",
  placeholder = "Firmani tanlang…",
  emptyLabel,
  disabled = false,
  invalid = false,
  id,
  className = "",
  size = "md",
  fullWidth = true,
  ...aria
}: CompanySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;

  // `mounted` bayrog'i KERAK EMAS: panel faqat `open` bo'lganda chiziladi,
  // `open` esa serverda har doim `false` — ya'ni `createPortal` SSR paytida
  // umuman chaqirilmaydi.

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Panel PORTALDA — ya'ni tetik uning DOM avlodi emas. Uchinchi argument
  // aynan shu holat uchun: tetik ustidagi bosish "tashqi" deb sanalmasin,
  // aks holda `pointerdown` yopib, keyingi `click` qayta ochib yuboradi va
  // tanlagichni tetik bilan YOPIB BO'LMAYDI.
  const panelRef = useDismissable<HTMLDivElement>(open, close, triggerRef);

  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const selected = value ? byId.get(value) : undefined;

  /**
   * Qidiruv NOM va STIR bo'yicha. Aynan shu ikkinchi qism native
   * `<select>` da yo'q edi.
   */
  const results = useMemo(() => {
    const q = norm(query);
    const match = (c: CompanyOption) =>
      !q || norm(c.name).includes(q) || (c.inn ? c.inn.toLowerCase().includes(q) : false);

    const sugIds = new Set(suggestions ?? []);
    const sug: CompanyOption[] = [];
    const rest: CompanyOption[] = [];
    for (const c of companies) {
      if (!match(c)) continue;
      if (sugIds.has(c.id)) sug.push(c);
      else if (rest.length < MAX_VISIBLE) rest.push(c);
    }
    return { sug, rest, truncated: rest.length >= MAX_VISIBLE };
  }, [companies, query, suggestions]);

  /**
   * Klaviatura uchun tekis ro'yxat: [tozalash?] + takliflar + qolganlar.
   *
   * "Tozalash" qatori FAQAT qidiruv bo'sh bo'lganda ko'rinadi.
   *
   * Nega: brauzer testida aniqlandi — xodim "ALKIM" deb yozganda ro'yxat
   * boshida "Nomsiz tushum (firmaga bog'lanmagan)" turardi va Enter AYNAN
   * o'shani tanlardi. Ya'ni firma nomini yozib Enter bosgan buxgalter
   * FIRMASIZ tushum yozib yuborardi — pul kassaga kiradi, lekin hech
   * kimning qarzini kamaytirmaydi va buni hech kim sezmaydi.
   * "Firmaga bog'lamaslik" — qidiriladigan narsa emas, u ataylab
   * tanlanadigan holat.
   */
  const flat = useMemo(() => {
    const rows: { id: string; label: string; hint?: string; clear?: boolean }[] = [];
    if (emptyLabel && !query.trim()) rows.push({ id: "", label: emptyLabel, clear: true });
    for (const c of results.sug) rows.push({ id: c.id, label: c.name, hint: c.inn ?? undefined });
    for (const c of results.rest) rows.push({ id: c.id, label: c.name, hint: c.inn ?? undefined });
    return rows;
  }, [results, emptyLabel, query]);

  /**
   * Qidiruv o'zgarsa faol qator boshiga qaytadi. Bu effektda EMAS, hodisa
   * ishlovchisida: effekt bo'lsa React qo'shimcha render sikli qiladi va
   * ↓ bosilgan zahoti indeks bir lahza eskirib turadi.
   */
  const changeQuery = useCallback((next: string) => {
    setQuery(next);
    setActive(0);
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((o) => !o);
    setActive(0);
  }, []);

  // Tetik koordinatasi — ochiq turganda sahifa surилса ham panel ergashadi.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Panel tetikdan KENGROQ (minimum 280px, aks holda uzun firma nomi
      // sig'maydi) — ya'ni tor ekranda o'ng chetdan chiqib ketishi mumkin.
      // 375px li telefonda jadval katagidagi tanlagich uchun bu aniq
      // sodir bo'lardi, shuning uchun chapga suriladi.
      const width = Math.min(Math.max(r.width, PANEL_MIN_WIDTH), window.innerWidth - 2 * VIEWPORT_GAP);
      const left = Math.min(
        Math.max(VIEWPORT_GAP, r.left),
        window.innerWidth - width - VIEWPORT_GAP,
      );
      setCoords({ top: r.bottom + window.scrollY, left: left + window.scrollX, width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Faol qator ko'rinib tursin — ↓ bilan pastga tushganda ro'yxat ergashadi.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = useCallback(
    (companyId: string) => {
      onChange(companyId);
      close();
    },
    [onChange, close],
  );

  /**
   * Panel yopilgach fokus TETIKKA qaytadi — klaviatura bilan ishlaydigan odam
   * ro'yxatdan chiqqach sahifa boshiga tashlanmasin.
   *
   * Nega effektda, `pick` ichida emas: `pick` JSX ichidagi ishlovchiga
   * beriladi va React Compiler u orqali ref render fazasida o'qilishi
   * mumkin deb hisoblaydi (`react-hooks/refs` — xato darajasida). Effekt
   * ichida ref o'qish esa to'g'ri yo'l.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = flat[active];
      if (row) pick(row.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  };

  const label = selected
    ? selected.inn
      ? `${selected.name} — ${selected.inn}`
      : selected.name
    : emptyLabel && !value
      ? emptyLabel
      : placeholder;

  // DIQQAT: tetikda `aria-invalid` YO'Q — u `button` roli tomonidan
  // qo'llab-quvvatlanmaydi. Xato holati ramka rangi bilan ko'rsatiladi, xato
  // MATNI esa `Field` primitividan `aria-describedby` orqali keladi.
  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      id={id}
      disabled={disabled}
      onClick={toggleOpen}
      aria-haspopup="listbox"
      aria-expanded={open}
      {...aria}
      className={[
        "erp-input appearance-none cursor-pointer text-left truncate",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        SIZE[size],
        fullWidth ? "w-full" : "w-auto",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        invalid ? { borderColor: "var(--danger)", boxShadow: "0 0 0 3px var(--danger-bg)" } : undefined
      }
    >
      <span style={{ color: selected || (emptyLabel && !value) ? "var(--input-text)" : "var(--text-muted)" }}>
        {label}
      </span>
    </button>
  );

  return (
    <span className={`relative ${fullWidth ? "block w-full" : "inline-block"}`}>
      {trigger}
      <ChevronDown
        size={size === "sm" ? 13 : 15}
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${size === "sm" ? "right-1.5" : "right-2.5"}`}
        style={{ color: disabled ? "var(--text-muted)" : "var(--text-secondary)" }}
      />

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="absolute rounded-xl overflow-hidden flex flex-col animate-scale-in"
            style={{
              top: coords.top + 4,
              left: coords.left,
              width: coords.width,
              maxHeight: "min(60vh, 380px)",
              zIndex: "var(--z-popover, 200)",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              boxShadow: "var(--shadow-overlay, var(--card-shadow-hover))",
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--rule)" }}>
              <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => changeQuery(e.target.value)}
                onKeyDown={onKeyDown}
                // STIR ni ham eslatib turadi: xodim buni bilmasa qidiruvni
                // faqat nom bo'yicha ishlatadi va eski muammo qaytadi.
                placeholder="Nom yoki STIR…"
                className="flex-1 bg-transparent outline-none text-body min-w-0"
                style={{ color: "var(--text-primary)" }}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { changeQuery(""); inputRef.current?.focus(); }}
                  aria-label="Qidiruvni tozalash"
                  className="shrink-0 rounded-lg p-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div ref={listRef} id={listId} role="listbox" aria-label="Firmalar" className="flex-1 overflow-y-auto py-1.5">
              {flat.length === 0 ? (
                <p className="px-4 py-6 text-center text-body" style={{ color: "var(--text-muted)" }}>
                  &laquo;{query}&raquo; bo&apos;yicha firma topilmadi
                </p>
              ) : (
                flat.map((row, i) => {
                  const isActive = i === active;
                  const isPicked = row.id === value;
                  // Taklif guruhi sarlavhasi — birinchi taklif qatoridan oldin.
                  const firstSuggestion =
                    results.sug.length > 0 && row.id === results.sug[0].id && !row.clear;
                  // "Barcha firmalar" sarlavhasi — takliflar bo'lsa va
                  // qolganlar boshlansa.
                  const firstRest =
                    results.sug.length > 0 && results.rest.length > 0 && row.id === results.rest[0].id;
                  return (
                    <React.Fragment key={row.id || "__empty"}>
                      {firstSuggestion && (
                        <div className="px-3 pt-2 pb-1 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--accent-blue)" }}>
                          {suggestionsLabel}
                        </div>
                      )}
                      {firstRest && (
                        <div className="px-3 pt-2 pb-1 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                          Barcha firmalar
                        </div>
                      )}
                      <div
                        id={`${listId}-${i}`}
                        data-idx={i}
                        role="option"
                        aria-selected={isPicked}
                        onMouseEnter={() => setActive(i)}
                        onPointerDown={(e) => { e.preventDefault(); pick(row.id); }}
                        className="mx-1.5 px-2.5 py-2 rounded-lg flex items-center gap-2 cursor-pointer"
                        style={isActive ? { background: "var(--brand-ghost)" } : undefined}
                      >
                        <span className="min-w-0 flex-1 truncate text-body" style={{ color: row.clear ? "var(--text-muted)" : "var(--text-primary)" }}>
                          {row.label}
                        </span>
                        {row.hint && (
                          <span className="shrink-0 font-mono text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                            {row.hint}
                          </span>
                        )}
                        {isPicked && <Check size={13} className="shrink-0" style={{ color: "var(--success)" }} />}
                      </div>
                    </React.Fragment>
                  );
                })
              )}
              {results.truncated && (
                <p className="px-3 py-2 text-micro" style={{ color: "var(--text-muted)" }}>
                  Yana firmalar bor — qidiruvni aniqlashtiring.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}

export default CompanySelect;
