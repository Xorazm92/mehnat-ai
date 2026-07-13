"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Command, Building2, Users, LayoutDashboard, TrendingUp,
  FileText, Wallet, Receipt, CreditCard, Calendar, Loader2, CornerDownLeft,
} from "lucide-react";
import { globalSearch, type SearchResults } from "@/server/search";
import { ROLE_LABELS, canSeeView, type UserRole, type AppView } from "@/lib/permissions";

const PAGES: { label: string; href: string; icon: React.ElementType; keys: string; view: AppView }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keys: "dashboard bosh sahifa", view: "dashboard" },
  { label: "Firmalar", href: "/organizations", icon: Building2, keys: "firmalar korxona kompaniya", view: "organizations" },
  { label: "Xodimlar", href: "/staff", icon: Users, keys: "xodimlar hodim kadr", view: "staff" },
  { label: "KPI", href: "/kpi", icon: TrendingUp, keys: "kpi reyting ball", view: "kpi" },
  { label: "Hisobotlar", href: "/reports", icon: FileText, keys: "hisobot matritsa", view: "reports" },
  { label: "Kassa", href: "/kassa", icon: Wallet, keys: "kassa kirim to'lov", view: "kassa" },
  { label: "Xarajatlar", href: "/expenses", icon: Receipt, keys: "xarajat chiqim", view: "expenses" },
  { label: "Oylik", href: "/payroll", icon: CreditCard, keys: "oylik maosh zarplata", view: "payroll" },
  { label: "Davomat", href: "/attendance", icon: Calendar, keys: "davomat kelish", view: "attendance" },
  { label: "Kabinet", href: "/cabinet", icon: LayoutDashboard, keys: "kabinet profil mening", view: "cabinet" },
];

export default function GlobalSearch({ userRole }: { userRole: string }) {
  const router = useRouter();
  // Faqat foydalanuvchi kira oladigan sahifalar
  const allowedPages = PAGES.filter((p) => canSeeView(userRole as UserRole, p.view));
  // Firma natijasi — rol /organizations'ga kira olsa o'sha yerga, aks holda kabinetga
  const companyHref = canSeeView(userRole as UserRole, "organizations") ? "/organizations" : "/cabinet";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({ companies: [], staff: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Cmd/Ctrl + K → fokus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tashqariga bosilganda yopish
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced server qidiruv
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults({ companies: [], staff: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await globalSearch(q);
        setResults(r);
      } catch {
        setResults({ companies: [], staff: [] });
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const go = useCallback((href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  }, [router]);

  const pageMatches = query.trim().length >= 1
    ? allowedPages.filter((p) => (p.label + " " + p.keys).toLowerCase().includes(query.trim().toLowerCase()))
    : allowedPages.slice(0, 5);

  const hasResults = results.companies.length > 0 || results.staff.length > 0 || pageMatches.length > 0;

  return (
    <div ref={boxRef} className="relative hidden md:flex items-center max-w-xs w-full">
      <Search size={15} className="absolute left-3.5 pointer-events-none z-10" style={{ color: "var(--text-muted)" }} />
      <input
        ref={inputRef}
        type="text"
        placeholder="Qidirish..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.style.borderColor = "var(--input-focus-border)";
          e.currentTarget.style.boxShadow = `0 0 0 3px var(--input-focus-ring)`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--input-border)";
          e.currentTarget.style.boxShadow = "";
        }}
        className="w-full pl-10 pr-10 py-2 text-sm rounded-lg outline-none transition-all"
        style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)", fontSize: "13px" }}
      />
      <div className="absolute right-3 flex items-center gap-0.5 pointer-events-none" style={{ color: "var(--text-muted)" }}>
        {loading ? <Loader2 size={12} className="animate-spin" /> : <><Command size={11} /><span style={{ fontSize: "11px", fontWeight: 600 }}>K</span></>}
      </div>

      {/* Natijalar dropdown */}
      {open && (query.trim().length >= 1) && (
        <div
          className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-[90] max-h-[70vh] overflow-y-auto"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 12px 32px rgba(0,0,0,0.28)", minWidth: 340 }}
        >
          {!hasResults && !loading && (
            <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
              Hech narsa topilmadi
            </div>
          )}

          {pageMatches.length > 0 && (
            <Section title="Sahifalar">
              {pageMatches.map((p) => (
                <Row key={p.href} icon={<p.icon size={15} />} label={p.label} onClick={() => go(p.href)} />
              ))}
            </Section>
          )}

          {results.companies.length > 0 && (
            <Section title="Firmalar">
              {results.companies.map((c) => (
                <Row
                  key={c.id}
                  icon={<Building2 size={15} />}
                  label={c.name}
                  sub={`INN: ${c.inn}`}
                  onClick={() => go(companyHref)}
                />
              ))}
            </Section>
          )}

          {results.staff.length > 0 && (
            <Section title="Xodimlar">
              {results.staff.map((s) => (
                <Row
                  key={s.id}
                  icon={<Users size={15} />}
                  label={s.name}
                  sub={ROLE_LABELS[s.role as UserRole] || s.role}
                  onClick={() => go("/staff")}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="px-4 py-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors group"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--table-row-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <span className="shrink-0" style={{ color: "var(--accent-blue)" }}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{label}</span>
        {sub && <span className="block text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{sub}</span>}
      </span>
      <CornerDownLeft size={13} className="opacity-0 group-hover:opacity-50 shrink-0" style={{ color: "var(--text-muted)" }} />
    </button>
  );
}
