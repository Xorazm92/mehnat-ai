"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, Eye, EyeOff, Save, RotateCcw, Search, GripVertical } from "lucide-react";
import { saveOperationColumns } from "@/server/report-columns";
import type { OperationColumnRow } from "@/lib/reportColumns";
import { Button } from "@/components/ui/Button";

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--card-border)",
  color: "var(--text-primary)",
} as const;

export default function OperationMatrixClient({ initialRows }: { initialRows: OperationColumnRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<OperationColumnRow[]>(initialRows);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");

  const enabledCount = useMemo(() => rows.filter((r) => r.enabled).length, [rows]);

  const q = search.trim().toLowerCase();
  const isMatch = (r: OperationColumnRow) =>
    !q || r.label.toLowerCase().includes(q) || r.baseLabel.toLowerCase().includes(q) || r.group.toLowerCase().includes(q) || r.key.includes(q);

  const mutate = (next: OperationColumnRow[]) => {
    setRows(next);
    setDirty(true);
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next.map((r, i) => ({ ...r, order: i })));
  };

  const toggle = (key: string) =>
    mutate(rows.map((r) => (r.key === key ? { ...r, enabled: !r.enabled } : r)));

  const rename = (key: string, label: string) =>
    mutate(rows.map((r) => (r.key === key ? { ...r, label } : r)));

  const regroup = (key: string, group: string) =>
    mutate(rows.map((r) => (r.key === key ? { ...r, group } : r)));

  const setAll = (enabled: boolean) => mutate(rows.map((r) => ({ ...r, enabled })));

  const save = async () => {
    setBusy(true);
    try {
      await saveOperationColumns(rows);
      toast.success("Matritsa saqlandi");
      setDirty(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error)?.message || "Saqlashda xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Amallar matritsasi</h1>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Hisobot ustunlarini yoqish/o&apos;chirish, tartiblash va nomlash. {enabledCount}/{rows.length} yoqilgan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAll(true)} disabled={busy} className="px-3 py-2 rounded-lg text-meta font-bold" style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>Hammasini yoqish</button>
          <button onClick={() => setAll(false)} disabled={busy} className="px-3 py-2 rounded-lg text-meta font-bold" style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>Hammasini o&apos;chirish</button>
          <Button variant="primary" size="md" onClick={save} disabled={busy || !dirty}>
            <Save size={15} /> Saqlash
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
        <input
          className="w-full pl-9 pr-3 py-2 rounded-lg text-body outline-none"
          style={inputStyle}
          placeholder="Ustun qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {dirty && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--warning)" }}>
          <RotateCcw size={13} /> Saqlanmagan o&apos;zgarishlar bor
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={card}>
        {rows.map((r, i) => {
          const matched = isMatch(r);
          return (
            <div
              key={r.key}
              className="flex items-center gap-3 px-3 py-2"
              style={{
                borderBottom: "1px solid var(--card-border)",
                opacity: matched ? (r.enabled ? 1 : 0.55) : 0.25,
                background: r.enabled ? "transparent" : "var(--input-bg)",
              }}
            >
              <div className="flex flex-col shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0 || busy} className="disabled:opacity-30" style={{ color: "var(--text-muted)" }} title="Yuqoriga" aria-label="Yuqoriga"><ChevronUp size={14} /></button>
                <button onClick={() => move(i, 1)} disabled={i === rows.length - 1 || busy} className="disabled:opacity-30" style={{ color: "var(--text-muted)" }} title="Pastga" aria-label="Pastga"><ChevronDown size={14} /></button>
              </div>
              <GripVertical size={14} className="shrink-0" style={{ color: "var(--text-muted)", opacity: 0.4 }} />
              <span className="text-micro font-bold tabular-nums w-6 text-center shrink-0" style={{ color: "var(--text-muted)" }}>{i + 1}</span>

              <span className="text-micro font-bold px-1.5 py-0.5 rounded-lg shrink-0 w-10 text-center" style={{ background: "var(--input-bg)", color: "var(--text-muted)" }}>{r.short}</span>

              <input
                className="flex-1 min-w-[120px] px-2 py-1.5 rounded-lg text-body font-semibold outline-none"
                style={inputStyle}
                value={r.label}
                onChange={(e) => rename(r.key, e.target.value)}
                placeholder={r.baseLabel}
              />
              <input
                className="w-32 px-2 py-1.5 rounded-lg text-xs outline-none shrink-0"
                style={inputStyle}
                value={r.group}
                onChange={(e) => regroup(r.key, e.target.value)}
                title="Guruh"
              />
              {r.isSplit && (
                <span className="text-micro font-bold px-1.5 py-0.5 rounded-lg shrink-0" style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}>+To&apos;lov</span>
              )}
              <button
                onClick={() => toggle(r.key)}
                disabled={busy}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ color: r.enabled ? "var(--success)" : "var(--text-muted)" }}
                title={r.enabled ? "Yoqilgan — o'chirish" : "O'chirilgan — yoqish"}
              >
                {r.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
