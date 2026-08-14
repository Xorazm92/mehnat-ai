"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Copy, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useDismissable } from "@/hooks/useDismissable";
import { formatNum } from "@/lib/format";
import {
  INSIGHT_DIMENSIONS,
  STATUS_ICON,
  STATUS_LABEL,
  buildInsight,
  pendingAsText,
  type InsightDimension,
  type InsightGroup,
  type InsightSourceRow,
} from "@/lib/reportInsight";
import type { CellStatus } from "@/lib/reportStatus";

/**
 * HISOBOT TAHLILI.
 *
 * Filtr panel savolni TORAYTIRADI, bu oyna esa JAVOB BERADI. Bitta ekranda:
 *   1. qaysi hisobot                (ustun tanlagich, qidiruvli)
 *   2. qaysi kesimda                (buxgalter / nazoratchi / bo'lim / firma…)
 *   3. FOIZ                         (katta raqam + ajratma)
 *   4. KIM TOPSHIRMAGAN             (nomma-nom, sababi bilan)
 *
 * Bungacha buni bilish uchun filtrni qo'lda yig'ib, keyin qatorlarni sanash
 * kerak edi.
 */

export interface InsightRowInput {
  companyId?: string;
  name: string;
  inn: string;
  accountant: string;
  supervisor: string;
  chief: string;
  bank: string;
  department: string;
  /** Ustun kaliti → xom katak qiymati. */
  values: Record<string, unknown>;
}

export interface InsightColumn {
  key: string;
  label: string;
  group: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  period: string;
  columns: InsightColumn[];
  rows: InsightRowInput[];
  /** "Matritsada ochish" — tanlangan kesimni matritsa filtriga o'tkazadi. */
  onApply: (opts: { colKey: string; dimension: InsightDimension; groupKey: string | null }) => void;
}

const ALL_COLUMNS = "__all__";

/** Foizga qarab rang — bitta joyda, butun oyna bo'ylab bir xil. */
const toneOf = (percent: number) =>
  percent >= 90 ? "var(--success)" : percent >= 60 ? "var(--warning)" : "var(--danger)";

const STATUS_TONE: Record<CellStatus, string> = {
  approved: "var(--success)",
  submitted: "var(--info)",
  zero: "var(--brand)",
  blocked: "var(--warning)",
  failed: "var(--danger)",
  error: "var(--danger)",
  note: "var(--info)",
  none: "var(--text-3)",
};

// ── Ustun tanlagich (qidiruvli) ──────────────────────────────────
// 47 ta ustunni oddiy `<select>` da topish og'riq: ro'yxat guruhlarga
// bo'lingan va yozib qidiriladi.
function ColumnPicker({
  columns,
  value,
  onChange,
}: {
  columns: InsightColumn[];
  value: string;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQ("");
  }, [open]);

  const current =
    value === ALL_COLUMNS
      ? "Barcha hisobotlar"
      : columns.find((c) => c.key === value)?.label ?? "Hisobot tanlang";

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, InsightColumn[]>();
    for (const c of columns) {
      if (needle && !c.label.toLowerCase().includes(needle)) continue;
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return [...map.entries()];
  }, [columns, q]);

  return (
    <div className="relative flex-1 min-w-[200px]" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        <span className="truncate">{current}</span>
        <ChevronDown size={15} style={{ color: "var(--text-3)" }} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-1.5 z-[320] rounded-xl layer-overlay overflow-hidden flex flex-col max-h-[50vh]"
          style={{ background: "var(--surface)", border: "1px solid var(--rule-strong)" }}
        >
          <div className="relative flex-shrink-0 p-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hisobot nomi…"
              className="w-full pl-7 pr-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-styled p-1.5">
            <button
              onClick={() => { onChange(ALL_COLUMNS); setOpen(false); }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-sm font-semibold hover:bg-[var(--surface-2)]"
              style={value === ALL_COLUMNS ? { background: "var(--primary-ghost)", color: "var(--primary)" } : { color: "var(--text)" }}
            >
              Barcha hisobotlar
              {value === ALL_COLUMNS && <Check size={14} />}
            </button>

            {grouped.map(([group, cols]) => (
              <div key={group} className="mt-1.5">
                <div className="px-2.5 py-1 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                  {group}
                </div>
                {cols.map((c) => (
                  <button
                    key={c.key}
                    role="option"
                    aria-selected={value === c.key}
                    onClick={() => { onChange(c.key); setOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm hover:bg-[var(--surface-2)]"
                    style={value === c.key ? { background: "var(--primary-ghost)", color: "var(--primary)" } : { color: "var(--text-2)" }}
                  >
                    <span className="truncate">{c.label}</span>
                    {value === c.key && <Check size={14} />}
                  </button>
                ))}
              </div>
            ))}

            {grouped.length === 0 && (
              <div className="px-2.5 py-4 text-sm text-center" style={{ color: "var(--text-3)" }}>
                Topilmadi
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Guruh qatori ────────────────────────────────────────────────
function GroupRow({
  group,
  expanded,
  onToggle,
  onOpenInMatrix,
}: {
  group: InsightGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenInMatrix: () => void;
}) {
  const tone = toneOf(group.percent);
  const outstanding = group.tally.outstanding;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
      >
        <ChevronDown
          size={14}
          className="flex-shrink-0 transition-transform"
          style={{ color: "var(--text-3)", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
        />

        <span className="flex-1 min-w-0">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
              {group.label}
            </span>
            <span className="flex items-baseline gap-2 flex-shrink-0">
              {outstanding > 0 ? (
                <span className="text-micro font-bold tabular-nums" style={{ color: "var(--danger)" }}>
                  {formatNum(outstanding)} ta qolgan
                </span>
              ) : (
                <span className="text-micro font-bold" style={{ color: "var(--success)" }}>
                  to&apos;liq
                </span>
              )}
              <span className="text-sm font-semibold tabular-nums w-11 text-right" style={{ color: tone }}>
                {group.percent}%
              </span>
            </span>
          </span>

          <span className="flex items-center gap-2 mt-1.5">
            <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
              <span className="block h-full rounded-full transition-all" style={{ width: `${group.percent}%`, background: tone }} />
            </span>
            <span className="text-micro tabular-nums flex-shrink-0" style={{ color: "var(--text-3)" }}>
              {formatNum(group.tally.settled)}/{formatNum(group.tally.required)}
            </span>
          </span>
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
          {group.pending.length === 0 ? (
            <div className="px-3 py-3 text-sm flex items-center gap-2" style={{ color: "var(--success)" }}>
              <Check size={15} /> Hammasi topshirilgan
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {group.pending.map((p) => (
                <li key={(p.companyId ?? p.name) + p.inn} className="flex items-center gap-3 px-3 py-2">
                  <span
                    className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-md text-micro font-bold"
                    style={{ background: "var(--surface)", color: STATUS_TONE[p.worst] }}
                    title={STATUS_LABEL[p.worst]}
                    aria-hidden
                  >
                    {STATUS_ICON[p.worst]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate" style={{ color: "var(--text)" }}>{p.name}</span>
                    <span className="block text-micro" style={{ color: "var(--text-3)" }}>
                      {p.inn} · {p.accountant}
                    </span>
                  </span>
                  <span className="text-micro font-bold flex-shrink-0" style={{ color: STATUS_TONE[p.worst] }}>
                    {p.tally.outstanding > 1 ? `${p.tally.outstanding} ta ish` : STATUS_LABEL[p.worst]}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="px-3 py-2" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={onOpenInMatrix}
              className="text-micro font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg"
              style={{ background: "var(--primary-ghost)", color: "var(--primary)" }}
            >
              Matritsada ochish →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Asosiy oyna ─────────────────────────────────────────────────
export default function ReportInsightModal({ open, onClose, period, columns, rows, onApply }: Props) {
  const [colKey, setColKey] = useState<string>(ALL_COLUMNS);
  const [dimension, setDimension] = useState<InsightDimension>("accountant");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);

  // Escape bilan yopish — oynadagi boshqa ochilmalar o'z Escape'ini
  // `stopPropagation` qilmaydi, shuning uchun oxirgi navbatda bu ishlaydi.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const activeColumns = useMemo(
    () => (colKey === ALL_COLUMNS ? columns.map((c) => c.key) : [colKey]),
    [colKey, columns]
  );

  const sourceRows = useMemo<InsightSourceRow[]>(
    () =>
      rows.map((r) => ({
        companyId: r.companyId,
        name: r.name,
        inn: r.inn,
        accountant: r.accountant,
        supervisor: r.supervisor,
        chief: r.chief,
        bank: r.bank,
        department: r.department,
        cells: activeColumns.map((k) => r.values[k]),
      })),
    [rows, activeColumns]
  );

  const insight = useMemo(() => buildInsight(sourceRows, dimension), [sourceRows, dimension]);

  const visibleGroups = useMemo(
    () => (onlyPending ? insight.groups.filter((g) => g.tally.outstanding > 0) : insight.groups),
    [insight.groups, onlyPending]
  );

  const colLabel = colKey === ALL_COLUMNS ? "Barcha hisobotlar" : columns.find((c) => c.key === colKey)?.label ?? colKey;
  const dimLabel = INSIGHT_DIMENSIONS.find((d) => d.value === dimension)?.label ?? "";

  const copyPending = (title: string, list: InsightGroup["pending"]) => {
    const text = pendingAsText(title, list);
    navigator.clipboard?.writeText(text).then(
      () => toast.success("Ro'yxat nusxalandi"),
      () => toast.error("Nusxalab bo'lmadi")
    );
  };

  if (!open || typeof document === "undefined") return null;

  const overall = insight.overall;
  const tone = toneOf(overall.percent);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      style={{ background: "color-mix(in srgb, #000 55%, transparent)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hisobot tahlili"
        className="w-full max-w-3xl rounded-2xl layer-overlay flex flex-col my-auto"
        style={{ background: "var(--surface)", border: "1px solid var(--rule-strong)" }}
      >
        {/* Sarlavha */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <span
              className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ background: "var(--primary-ghost)", color: "var(--primary)" }}
            >
              <Sparkles size={17} />
            </span>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Hisobot tahlili</h3>
              <p className="text-micro font-bold" style={{ color: "var(--text-3)" }}>
                {period} · {formatNum(rows.length)} ta firma
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--surface-2)]" style={{ color: "var(--text-3)" }} aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-styled px-5 py-4 space-y-4">
          {/* Savol bitta jumla sifatida */}
          <div className="flex flex-wrap items-center gap-2">
            <ColumnPicker columns={columns} value={colKey} onChange={(k) => { setColKey(k); setExpanded(null); }} />
            <span className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              bo&apos;yicha
            </span>
            <div className="flex rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1px solid var(--border)" }}>
              {INSIGHT_DIMENSIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => { setDimension(d.value); setExpanded(null); }}
                  aria-pressed={dimension === d.value}
                  className="px-2.5 py-2 text-micro font-bold uppercase tracking-widest transition-colors"
                  style={
                    dimension === d.value
                      ? { background: "var(--primary)", color: "var(--surface)" }
                      : { background: "var(--surface-2)", color: "var(--text-3)" }
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Javob — katta raqam */}
          <div className="rounded-2xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                  {colLabel}
                </div>
                <div className="text-4xl font-semibold tabular-nums leading-none mt-1" style={{ color: tone }}>
                  {overall.percent}%
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                  Topshirilmagan
                </div>
                <div className="text-2xl font-semibold tabular-nums leading-none mt-1" style={{ color: overall.tally.outstanding ? "var(--danger)" : "var(--success)" }}>
                  {formatNum(overall.tally.outstanding)}
                </div>
              </div>
            </div>

            <div className="w-full h-2 rounded-full overflow-hidden mt-3" style={{ background: "var(--border)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overall.percent}%`, background: tone }} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              {[
                { label: "Yopilgan", value: overall.tally.settled, color: "var(--success)" },
                { label: "Kartoteka", value: overall.tally.blocked, color: "var(--warning)" },
                { label: "Izohli", value: overall.tally.note, color: "var(--info)" },
                { label: "Talab qilingan", value: overall.tally.required, color: "var(--text-2)" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg px-2.5 py-1.5" style={{ background: "var(--surface)" }}>
                  <div className="text-micro font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{s.label}</div>
                  <div className="text-sm font-semibold tabular-nums" style={{ color: s.color }}>{formatNum(s.value)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Kesim */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-2)" }}>
              {dimLabel} kesimida · {formatNum(visibleGroups.length)} ta
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setOnlyPending((v) => !v)}
                aria-pressed={onlyPending}
                className="text-micro font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg transition-colors"
                style={
                  onlyPending
                    ? { background: "var(--primary-ghost)", color: "var(--primary)", border: "1px solid var(--primary)" }
                    : { background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }
                }
              >
                Faqat qolganlari
              </button>
              <button
                onClick={() => copyPending(`${colLabel} — topshirmaganlar`, overall.pending)}
                className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg"
                style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
                title="Topshirmaganlar ro'yxatini nusxalash"
              >
                <Copy size={12} /> Nusxa
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {visibleGroups.map((g) => (
              <GroupRow
                key={g.key}
                group={g}
                expanded={expanded === g.key}
                onToggle={() => setExpanded((e) => (e === g.key ? null : g.key))}
                onOpenInMatrix={() => {
                  onApply({ colKey: colKey === ALL_COLUMNS ? "all" : colKey, dimension, groupKey: g.key });
                  onClose();
                }}
              />
            ))}

            {visibleGroups.length === 0 && (
              <div
                className="rounded-xl px-4 py-8 text-center text-sm flex flex-col items-center gap-2"
                style={{ background: "var(--surface-2)", color: "var(--success)" }}
              >
                <Check size={22} />
                {onlyPending ? "Qolgan ish yo'q — hammasi topshirilgan" : "Ma'lumot yo'q"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
