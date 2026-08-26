"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, useId } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Search, Command, Building2, Users, Loader2, CornerDownLeft, X } from "lucide-react";
import { globalSearch, type SearchResults } from "@/server/search";
import { ROLE_LABELS, canSeeView, type UserRole, type AppView } from "@/lib/permissions";
import { NAV_ITEMS, NAV_SECTIONS } from "@/lib/navigation";
import { useModalA11y } from "@/hooks/useModalA11y";

/**
 * COMMAND PALETTE (⌘K).
 *
 * Bungacha bu "command palette" emas edi: topbardagi oddiy `<input>` bo'lib,
 * ⌘K bosilganda faqat SHU inputni fokuslardi. Muammolar:
 *
 *   • `hidden md:flex` — mobil qurilmada qidiruv UMUMAN yo'q edi;
 *   • ArrowUp/ArrowDown/Enter ishlamasdi, holbuki har qatorda ⏎ ikonkasi
 *     turib, Enter ishlaydi deb va'da berardi;
 *   • sahifalar ro'yxati alohida, 10 talik va yon paneldan ajralib ketgan
 *     (yon panel 21 tasini bilardi);
 *   • `canSeeView` (override'ni bilmaydigan) ishlatilardi — admin bergan
 *     ruxsat yon panelda ko'rinsa ham, qidiruvda chiqmasdi;
 *   • natija yozuvga emas, RO'YXAT sahifasiga olib borardi.
 *
 * Endi haqiqiy palitra: overlay, klaviatura navigatsiyasi, combobox
 * semantikasi, yagona navigatsiya reyestri va yozuvga chuqur havola.
 */

interface Item {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: React.ElementType;
  group: string;
}

export default function GlobalSearch({
  userRole,
  allowedViews,
}: {
  userRole: string;
  allowedViews?: AppView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [remote, setRemote] = useState<SearchResults>({ companies: [], staff: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const panelRef = useModalA11y<HTMLDivElement>({ open, onClose: () => setOpen(false) });

  useEffect(() => setMounted(true), []);

  /**
   * Ruxsat. `allowedViews` — layout'da `effectiveViewsForRole()` orqali
   * ALLAQACHON hisoblangan ro'yxat, ya'ni admin override'lari qo'llangan.
   * Avval bu yerda override'ni bilmaydigan `canSeeView` ishlatilardi va
   * admin bergan ruxsat yon panelda ko'rinsa ham, qidiruvda chiqmasdi.
   */
  const canSee = useCallback(
    (view: AppView) =>
      allowedViews ? allowedViews.includes(view) : canSeeView(userRole as UserRole, view),
    [userRole, allowedViews]
  );

  const pages = useMemo(() => NAV_ITEMS.filter((n) => canSee(n.view)), [canSee]);
  const normalizedRole = (userRole || "").toLowerCase();

  // ⌘K / Ctrl+K — istalgan joydan.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebounced("");
    setActive(0);
    // Modal fokusni panelga ko'chirgach, uni inputga o'tkazamiz.
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setRemote({ companies: [], staff: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    globalSearch(debounced.trim())
      .then((r) => { if (!cancelled) setRemote(r); })
      .catch(() => { if (!cancelled) setRemote({ companies: [], staff: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  const items = useMemo<Item[]>(() => {
    const q = debounced.trim().toLowerCase();
    const out: Item[] = [];

    const matched = q
      ? pages.filter((p) =>
          p.label.toLowerCase().includes(q) || (p.keywords ?? "").toLowerCase().includes(q))
      : pages;

    for (const p of matched.slice(0, q ? 6 : 8)) {
      out.push({ id: `page:${p.href}`, label: p.label, href: p.href, icon: p.icon, group: "Sahifalar" });
    }

    /**
     * SAHIFA ICHIDAGI BO'LIMLAR. Yorliqlar endi manzilga ega (`?tab=`), ya'ni
     * "matritsa" deb qidirgan odam to'g'ridan-to'g'ri matritsaga tushadi —
     * ilgari u "Hisobotlar" sahifasini topib, yorliqni qo'lda izlardi.
     *
     * Faqat qidiruv bilan chiqadi: bo'sh palitrada asosiy sahifalar ro'yxati
     * ko'rinishi kerak, yigirmata yorliq emas.
     */
    if (q) {
      const sections = NAV_SECTIONS.filter(
        (s) =>
          canSee(s.view) &&
          (!s.roles || s.roles.includes(normalizedRole)) &&
          (s.label.toLowerCase().includes(q) ||
            (s.keywords ?? "").toLowerCase().includes(q))
      );
      for (const s of sections.slice(0, 6)) {
        out.push({
          id: `section:${s.href}`,
          label: s.label,
          hint: s.parentLabel,
          href: s.href,
          icon: s.icon,
          group: "Bo'limlar",
        });
      }
    }

    // Yozuvga CHUQUR havola — ro'yxat sahifasiga emas. `?org_q=` va `?userId=`
    // ni mos ekranlar allaqachon o'qiydi.
    for (const c of remote.companies) {
      out.push({
        id: `company:${c.id}`,
        label: c.name,
        hint: `STIR ${c.inn}`,
        href: canSee("organizations") ? `/organizations?org_q=${encodeURIComponent(c.inn)}` : "/cabinet",
        icon: Building2,
        group: "Firmalar",
      });
    }

    for (const s of remote.staff) {
      out.push({
        id: `staff:${s.id}`,
        label: s.name,
        hint: ROLE_LABELS[s.role as UserRole] ?? s.role,
        href: `/staff?userId=${s.id}`,
        icon: Users,
        group: "Xodimlar",
      });
    }

    return out;
  }, [pages, remote, debounced, canSee, normalizedRole]);

  useEffect(() => { setActive(0); }, [items.length]);

  const go = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[active];
      if (it) go(it.href);
    }
  };

  // Faol element ko'rinib tursin.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      // Mobilda ham ko'rinadi — avval butun qidiruv `hidden md:flex` edi.
      className="flex items-center gap-2 h-10 px-3 rounded-lg transition-colors md:w-64"
      style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-muted)" }}
      aria-label="Qidirish (Ctrl+K)"
    >
      <Search size={15} className="flex-shrink-0" />
      <span className="hidden md:inline text-body">Qidirish…</span>
      <kbd
        className="hidden md:flex ml-auto items-center gap-0.5 font-mono text-micro px-1.5 py-0.5 rounded"
        style={{ background: "var(--bg-sunken)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        <Command size={9} />K
      </kbd>
    </button>
  );

  if (!mounted) return trigger;

  let lastGroup = "";

  return (
    <>
      {trigger}

      {open &&
        createPortal(
          <div
            // Panel `useModalA11y` bilan o'ralgan (role/aria-modal/panelRef quyida).
            // eslint-disable-next-line no-restricted-syntax
            className="fixed inset-0 flex items-start justify-center p-4 pt-[12vh] animate-fade-in"
            style={{ zIndex: "var(--z-popover, 200)", background: "rgba(6,10,15,0.55)", backdropFilter: "blur(4px)" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Qidiruv"
              tabIndex={-1}
              className="w-full max-w-xl rounded-xl overflow-hidden flex flex-col animate-scale-in outline-none"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                boxShadow: "var(--shadow-overlay, var(--card-shadow-hover))",
                maxHeight: "70vh",
              }}
            >
              <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--rule)" }}>
                <Search size={16} style={{ color: "var(--text-muted)" }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Firma, xodim yoki sahifa…"
                  className="flex-1 bg-transparent outline-none text-body"
                  style={{ color: "var(--text-primary)" }}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
                />
                {loading && <Loader2 size={15} className="animate-spin" style={{ color: "var(--text-muted)" }} />}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Yopish"
                  className="icon-btn-sm rounded-lg"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={15} />
                </button>
              </div>

              <div ref={listRef} id={listId} role="listbox" aria-label="Natijalar" className="flex-1 overflow-y-auto py-2">
                {items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-body" style={{ color: "var(--text-muted)" }}>
                    {debounced.trim().length >= 2
                      ? <>&laquo;{debounced}&raquo; bo&apos;yicha hech narsa topilmadi</>
                      : "Qidirish uchun yozing"}
                  </p>
                ) : (
                  items.map((it, i) => {
                    const Icon = it.icon;
                    const header = it.group !== lastGroup ? ((lastGroup = it.group), it.group) : null;
                    const isActive = i === active;
                    return (
                      <React.Fragment key={it.id}>
                        {header && (
                          <div
                            className="px-4 pt-3 pb-1.5 text-micro font-bold uppercase tracking-widest"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {header}
                          </div>
                        )}
                        <div
                          id={`${listId}-${i}`}
                          data-idx={i}
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(it.href)}
                          className="mx-2 px-3 py-2 rounded-lg flex items-center gap-3 cursor-pointer"
                          style={isActive ? { background: "var(--brand-ghost)" } : undefined}
                        >
                          <Icon size={15} style={{ color: isActive ? "var(--brand)" : "var(--text-muted)" }} className="flex-shrink-0" />
                          <span className="text-body truncate" style={{ color: "var(--text-primary)" }}>{it.label}</span>
                          {it.hint && (
                            <span className="text-micro font-mono truncate" style={{ color: "var(--text-muted)" }}>{it.hint}</span>
                          )}
                          {isActive && <CornerDownLeft size={13} className="ml-auto flex-shrink-0" style={{ color: "var(--brand)" }} />}
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              <div
                className="flex items-center gap-4 px-4 py-2 text-micro font-mono"
                style={{ borderTop: "1px solid var(--rule)", background: "var(--bg-sunken)", color: "var(--text-muted)" }}
              >
                <span>↑↓ tanlash</span>
                <span>⏎ ochish</span>
                <span>esc yopish</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
