"use client";

// =====================================================
// KIRIM REYESTRI — barcha tushum bitta jadvalda
// =====================================================
//
// Ilgari bu o'rinda faqat "Plastik va naqd tushumlari" turardi: BANK tushumi
// ko'rinmasdi, sana filtri yo'q edi va eksport ham yo'q edi. Ya'ni "1–19
// avgust holatini ko'rsat" degan savolga ekran javob bera olmasdi.
//
// Yuqoridagi bank kartochkalari va vipiska yuklash bloki O'ZGARMAYDI — bu
// bo'lim ularning ostiga qo'shiladi.

import React, { useEffect, useState, useTransition, useMemo } from "react";
import { Search, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui";
import { formatNum, formatUzDate } from "@/lib/format";
import { friendlyError } from "@/lib/actionError";
import { exportRowsToExcel, type ExportColumn } from "@/lib/exportTable";
import { RANGE_LABELS, type RangePreset } from "@/lib/dateRange";
import { getIncomeRegister } from "@/server/incomeRegister";

type Row = Awaited<ReturnType<typeof getIncomeRegister>>["rows"][number];
type Totals = Awaited<ReturnType<typeof getIncomeRegister>>["totals"];

interface Props {
  companies: { id: string; name: string; inn: string }[];
}

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--input-bg)",
  border: "1px solid var(--card-border)",
  color: "var(--text)",
};

// Foydalanuvchi eng ko'p so'ragan ikkitasi oldinda.
const PRESETS: RangePreset[] = [
  "month_to_date",
  "year_to_date",
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_month",
  "custom",
];

const SOURCE_LABELS: Record<string, string> = {
  bank: "Bank o'tkazmasi",
  plastik: "Plastik",
  naqd: "Naqd",
};

const SOURCE_COLORS: Record<string, { bg: string; fg: string }> = {
  bank: { bg: "var(--accent-blue-light)", fg: "var(--accent-blue)" },
  plastik: { bg: "var(--accent-blue-light)", fg: "var(--accent-blue)" },
  naqd: { bg: "var(--success-bg)", fg: "var(--success)" },
};

const columns: ExportColumn<Row>[] = [
  { key: "date", header: "Sana", exportValue: (r) => (r.receivedAt ? formatUzDate(r.receivedAt) : "") },
  { key: "company", header: "Firma", exportValue: (r) => r.companyName ?? "Nomsiz tushum" },
  { key: "inn", header: "STIR", exportValue: (r) => r.companyInn ?? "" },
  { key: "contract", header: "Shartnoma", exportValue: (r) => r.contractNumber ?? "" },
  { key: "source", header: "To'lov turi", exportValue: (r) => SOURCE_LABELS[r.source] ?? r.source },
  { key: "channel", header: "Kassa", exportValue: (r) => r.channelLabel ?? "" },
  { key: "amount", header: "Summa", exportValue: (r) => r.amount },
  { key: "doc", header: "Hujjat", exportValue: (r) => r.docRef ?? "" },
  { key: "note", header: "Izoh", exportValue: (r) => r.note ?? "" },
];

export default function IncomeRegister({ companies }: Props) {
  const [preset, setPreset] = useState<RangePreset>("month_to_date");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Qidiruv MIJOZDA filtrlanadi (serverga har harf uchun so'rov yubormaslik
  // uchun); oraliq va kesimlar esa serverda — ular yig'indini o'zgartiradi.
  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      getIncomeRegister({
        preset,
        custom: preset === "custom" ? { from: customFrom, to: customTo } : undefined,
        companyId: companyId || null,
        source: source || null,
      })
        .then((res) => {
          if (cancelled) return;
          setRows(res.rows);
          setTotals(res.totals);
          setError(null);
        })
        .catch((e) => {
          if (!cancelled) setError(friendlyError(e) || "Reyestrni yuklab bo'lmadi");
        });
    });
    return () => {
      cancelled = true;
    };
  }, [preset, customFrom, customTo, companyId, source]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.companyName ?? "").toLowerCase().includes(q) ||
        (r.companyInn ?? "").includes(q) ||
        (r.contractNumber ?? "").toLowerCase().includes(q) ||
        (r.docRef ?? "").toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Ekrandagi jami HAR DOIM ko'rinib turgan qatorlardan hisoblanadi — qidiruv
  // qo'yilganda serverdan kelgan yig'indi noto'g'ri bo'lib qolardi.
  const shown = useMemo(() => {
    const t = { total: 0, naqd: 0, plastik: 0, bank: 0, count: visible.length, anonymousTotal: 0 };
    for (const r of visible) {
      t.total += r.amount;
      if (r.source === "naqd") t.naqd += r.amount;
      else if (r.source === "plastik") t.plastik += r.amount;
      else if (r.source === "bank") t.bank += r.amount;
      if (r.anonymous) t.anonymousTotal += r.amount;
    }
    return t;
  }, [visible]);

  const stats = search.trim() ? shown : (totals ?? shown);

  const kpis: { label: string; value: number; color?: string }[] = [
    // PUL YO'NALISHI — `--accent-green` (`--success` holat rangi emas).
    { label: "Jami kirim", value: stats.total, color: "var(--accent-green)" },
    { label: "Naqd", value: stats.naqd },
    { label: "Plastik", value: stats.plastik },
    { label: "Bank o'tkazmasi", value: stats.bank },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Kirim reyestri ({stats.count})
        </h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={visible.length === 0}
          onClick={() =>
            exportRowsToExcel(visible, columns, `kirim-reyestri-${RANGE_LABELS[preset]}`, "Kirim")
          }
        >
          <Download size={14} /> Excel
        </Button>
      </div>

      {/* Davr tanlagich */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className="px-2.5 py-1.5 rounded-lg text-meta"
            style={
              preset === p
                ? { background: "var(--accent-blue)", color: "#fff", border: "1px solid var(--accent-blue)" }
                : { ...inputStyle }
            }
          >
            {RANGE_LABELS[p]}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            className="px-3 py-1.5 rounded-lg text-meta outline-none"
            style={inputStyle}
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <span className="text-meta" style={{ color: "var(--text-muted)" }}>—</span>
          <input
            type="date"
            className="px-3 py-1.5 rounded-lg text-meta outline-none"
            style={inputStyle}
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
          />
        </div>
      )}

      {/* Kesimlar */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="px-3 py-1.5 rounded-lg text-meta outline-none"
          style={inputStyle}
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">Barcha firmalar</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="px-3 py-1.5 rounded-lg text-meta outline-none"
          style={inputStyle}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">Barcha to&apos;lov turlari</option>
          <option value="naqd">Naqd</option>
          <option value="plastik">Plastik</option>
          <option value="bank">Bank o&apos;tkazmasi</option>
        </select>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Firma, STIR, shartnoma yoki hujjat"
            className="pl-8 pr-3 py-1.5 rounded-lg text-meta outline-none"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Yig'indi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="p-3 rounded-xl" style={card}>
            <div className="text-micro" style={{ color: "var(--text-secondary)" }}>{k.label}</div>
            <div
              className="text-h3 font-bold tabular-nums mt-0.5"
              style={{ color: k.color ?? "var(--text)" }}
            >
              {formatNum(k.value)} <span className="text-meta">so&apos;m</span>
            </div>
          </div>
        ))}
      </div>

      {stats.anonymousTotal > 0 && (
        <div
          className="p-3 rounded-lg flex items-start gap-2"
          style={{ background: "var(--danger-bg)", border: "1px solid var(--card-border)" }}
        >
          <AlertTriangle size={16} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
          <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
            {formatNum(stats.anonymousTotal)} so&apos;m firmaga bog&apos;lanmagan — bu pul hech
            kimning qarzini kamaytirmayapti. Qatorlarni ochib firmani belgilang.
          </p>
        </div>
      )}

      {error ? (
        <p className="p-4 rounded-xl text-meta" style={{ ...card, color: "var(--danger)" }}>{error}</p>
      ) : visible.length === 0 ? (
        <p className="p-4 rounded-xl text-meta" style={{ ...card, color: "var(--text-muted)" }}>
          {pending ? "Yuklanmoqda…" : "Tanlangan davrda kirim yo'q."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ ...card, opacity: pending ? 0.6 : 1 }}>
          <table className="w-full text-meta">
            <thead>
              <tr style={{ background: "var(--input-bg)" }}>
                <th className="text-left p-2">Sana</th>
                <th className="text-left p-2">Firma</th>
                <th className="text-left p-2">Shartnoma</th>
                <th className="text-left p-2">To&apos;lov turi</th>
                <th className="text-left p-2">Kassa</th>
                <th className="text-left p-2">Hujjat</th>
                <th className="text-right p-2">Summa</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const c = SOURCE_COLORS[r.source] ?? SOURCE_COLORS.bank;
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                    <td className="p-2 whitespace-nowrap">
                      {r.receivedAt ? formatUzDate(r.receivedAt) : "—"}
                    </td>
                    <td className="p-2 max-w-[280px] truncate">
                      {r.companyName ?? (
                        <span style={{ color: "var(--text-muted)" }}>Nomsiz tushum</span>
                      )}
                      {r.companyInn && (
                        <span className="text-micro ml-1" style={{ color: "var(--text-muted)" }}>
                          {r.companyInn}
                        </span>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.contractNumber ?? "—"}</td>
                    <td className="p-2">
                      <span
                        className="text-micro font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                        style={{ background: c.bg, color: c.fg }}
                      >
                        {SOURCE_LABELS[r.source] ?? r.source}
                      </span>
                    </td>
                    <td className="p-2 max-w-[200px] truncate">{r.channelLabel ?? "—"}</td>
                    <td className="p-2">{r.docRef ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums font-semibold whitespace-nowrap">
                      <Money value={r.amount} tone="in" showSign bold />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--input-bg)", borderTop: "2px solid var(--card-border)" }}>
                <td className="p-2 font-semibold" colSpan={6}>Jami</td>
                <td className="p-2 text-right tabular-nums font-bold">
                  <Money value={shown.total} tone="in" bold />
                </td>
              </tr>
              {/* Server `limit` ga kesgan qatorlar — aks holda ro'yxat
                  "hammasi shu" degan yolg'on taassurot qoldirardi. */}
              {(totals?.truncated ?? 0) > 0 && (
                <tr style={{ background: "var(--input-bg)" }}>
                  <td className="p-2 text-micro" colSpan={7} style={{ color: "var(--warning)" }}>
                    Davr bo&apos;yicha jami {totals!.count + totals!.truncated} ta qator;{" "}
                    {totals!.truncated} tasi ko&apos;rsatilmagan — davrni qisqartiring yoki
                    firman tanlab toraytiring.
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
