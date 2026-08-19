"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Search, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { formatNum, formatUzDate } from "@/lib/format";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import CollectionQueue from "./CollectionQueue";

interface DebtRow {
  key: string;
  customer: string;
  contract: string | null;
  ownFirm: string | null;
  debt1C: number;
  debtAsro: number | null;
  diff: number | null;
  linked: boolean;
}

interface PlanFactRow {
  period: string;
  metric: string;
  plan: string | number | null;
  fact: string | number | null;
}

interface ReconCheck {
  key: string;
  title: string;
  status: "ok" | "warn" | "error";
  value: number;
  detail: string;
  action?: string;
}

/** To'lamagan firma — `lib/debt.ts` `DebtorRow` ning serializatsiyalangan shakli. */
interface DebtorRow {
  companyId: string;
  name: string;
  inn: string;
  contractAmount: number;
  charged: number;
  paid: number;
  outstanding: number;
  overdue: number;
  dueNow: number;
  monthsOverdue: number;
  lastPaidPeriod: string | null;
  accountantName: string | null;
  supervisorName: string | null;
  contactedAt?: string | null;
  nextContactAt?: string | null;
  contactNote?: string | null;
}

interface Props {
  debt: {
    asOf: string | null;
    rows: DebtRow[];
    totals: { debt1C: number; debtAsro: number; diff: number };
    unlinked: number;
  };
  /** To'lamagan firmalar — direktorning kunlik hisoboti bilan bir manbadan. */
  debtors: {
    rows: DebtorRow[];
    totals: {
      companies: number;
      overdue: number;
      dueNow: number;
      outstanding: number;
      overdueCompanies: number;
      neverPaid: number;
    };
  };
  /** "Bugun gaplashish kerak" navbati — `getCollectionQueue`. */
  queue: {
    rows: DebtorRow[];
    totals: { companies: number; overdue: number; dueNow: number; neverContacted: number };
  };
  planFact: PlanFactRow[];
  /** Sverka — moliyaviy invariantlar. Faqat adminda to'ladi. */
  recon?: ReconCheck[];
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

export default function QarzdorlikClient({ debt, debtors, queue, planFact, recon = [] }: Props) {
  useAutoRefresh();
  const [query, setQuery] = useState("");
  // Farqi bor qatorlar tepada — aynan ular e'tibor talab qiladi.
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [debtorQuery, setDebtorQuery] = useState("");

  const debtorRows = useMemo(() => {
    const q = debtorQuery.trim().toLowerCase();
    if (!q) return debtors.rows;
    return debtors.rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.inn.includes(q) ||
        (r.accountantName ?? "").toLowerCase().includes(q)
    );
  }, [debtors.rows, debtorQuery]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return debt.rows
      .filter((r) => (onlyDiff ? r.diff !== null && Math.abs(r.diff) > 1 : true))
      .filter(
        (r) =>
          !q ||
          r.customer.toLowerCase().includes(q) ||
          (r.contract ?? "").toLowerCase().includes(q) ||
          (r.ownFirm ?? "").toLowerCase().includes(q)
      );
  }, [debt.rows, query, onlyDiff]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Qarzdorlik</h1>
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>
            1C hisoboti va ASRO hisobi yonma-yon
            {debt.asOf ? ` · 1C holati: ${formatUzDate(debt.asOf)}` : ""}
          </p>
        </div>
      </div>

      {/* Rahbarga kerak bo'lgan birinchi narsa — raqam emas, HARAKAT ro'yxati.
          Shuning uchun u sahifaning eng tepasida. */}
      <CollectionQueue rows={queue.rows} totals={queue.totals} />

      {/* TO'LAMAGAN FIRMALAR — sahifaning eng amaliy bloki, shuning uchun
          eng tepada. Direktorning kunlik Telegram hisoboti aynan shu
          ro'yxatning birinchi 5 tasini ko'rsatadi (lib/debt.ts listDebtors),
          ya'ni ikkovi hech qachon ajralmaydi. */}
      <div className="rounded-xl overflow-hidden" style={card}>
        <div
          className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}
        >
          <div>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
              To&apos;lov kutilayotgan firmalar
            </h2>
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              Ish oyi tugagach mijoz keyingi oy davomida to&apos;laydi — shuning uchun
              &quot;bu oy yig&apos;iladi&quot; va &quot;muddati o&apos;tgan&quot; alohida
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-meta tabular-nums font-semibold" style={{ color: "var(--accent-blue)" }}>
              Bu oy: {formatNum(debtors.totals.dueNow)} so&apos;m
            </span>
            {debtors.totals.overdue > 0 && (
              <span className="text-meta tabular-nums font-semibold" style={{ color: "var(--danger)" }}>
                Muddati o&apos;tgan: {debtors.totals.overdueCompanies} ta ·{" "}
                {formatNum(debtors.totals.overdue)} so&apos;m
              </span>
            )}
            {debtors.totals.neverPaid > 0 && (
              <span className="text-micro tabular-nums" style={{ color: "var(--warning)" }}>
                {debtors.totals.neverPaid} tasi bir marta ham to&apos;lamagan
              </span>
            )}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                value={debtorQuery}
                onChange={(e) => setDebtorQuery(e.target.value)}
                placeholder="Firma, STIR yoki buxgalter"
                className="pl-7 pr-2 py-1 rounded-lg text-meta w-56"
                style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
              />
            </div>
          </div>
        </div>

        {debtorRows.length === 0 ? (
          <div className="px-3 py-8 text-center text-meta" style={{ color: "var(--text-muted)" }}>
            {debtors.rows.length === 0
              ? "To'lov kutilayotgan firma yo'q"
              : "Qidiruvga mos firma topilmadi"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-meta">
              <thead>
                <tr style={{ background: "var(--table-header-bg)" }}>
                  {["Firma", "Shartnoma", "Bu oy yig'iladi", "Muddati o'tgan", "Oy", "Oxirgi to'lov", "Mas'ul"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-micro font-semibold uppercase tracking-wider whitespace-nowrap ${i >= 1 && i <= 4 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {debtorRows.map((r) => (
                  <tr key={r.companyId} style={{ borderTop: "1px solid var(--card-border)" }}>
                    <td className="px-3 py-2">
                      <div className="font-semibold" style={{ color: "var(--text)" }}>{r.name}</div>
                      <div className="text-micro" style={{ color: "var(--text-muted)" }}>STIR {r.inn}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatNum(r.contractAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--accent-blue)" }}>
                      {r.dueNow > 0 ? formatNum(r.dueNow) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--danger)" }}>
                      {r.overdue > 0 ? formatNum(r.overdue) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {r.monthsOverdue > 0 ? r.monthsOverdue : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.lastPaidPeriod ? (
                        <span style={{ color: "var(--text-muted)" }}>{r.lastPaidPeriod}</span>
                      ) : (
                        <span className="font-semibold" style={{ color: "var(--warning)" }}>
                          hech qachon
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                      {r.accountantName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SVERKA — import nomuvofiqliklari ilgari faqat terminalda ko'rinardi
          va terminal yopilgach yo'qolardi. Endi doimiy ekranda. */}
      {recon.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={card}>
          <div className="px-3 py-2" style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>Sverka — moliyaviy tekshiruvlar</h2>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
            {recon.map((c) => {
              const color =
                c.status === "ok" ? "var(--success)" : c.status === "warn" ? "var(--warning)" : "var(--danger)";
              const Icon = c.status === "ok" ? CheckCircle2 : c.status === "warn" ? AlertTriangle : XCircle;
              return (
                <div key={c.key} className="flex items-start gap-3 px-3 py-2">
                  <Icon size={16} style={{ color }} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-meta font-semibold" style={{ color: "var(--text)" }}>{c.title}</div>
                    <div className="text-micro" style={{ color: "var(--text-muted)" }}>{c.detail}</div>
                    {c.action && (
                      <div className="text-micro mt-0.5" style={{ color }}>→ {c.action}</div>
                    )}
                  </div>
                  {c.value !== 0 && (
                    <div className="text-meta tabular-nums font-semibold whitespace-nowrap" style={{ color }}>
                      {formatNum(c.value)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Uchta raqam */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl" style={card}>
          <div className="text-meta" style={{ color: "var(--text-muted)" }}>1C bo&apos;yicha (jamg&apos;arilgan)</div>
          <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: "var(--text)" }}>
            {formatNum(debt.totals.debt1C)} <span className="text-meta">so&apos;m</span>
          </div>
          <div className="text-micro" style={{ color: "var(--text-muted)" }}>{debt.rows.length} shartnoma</div>
        </div>
        <div className="p-4 rounded-xl" style={card}>
          <div className="text-meta" style={{ color: "var(--text-muted)" }}>ASRO hisobi (jamg&apos;arilgan)</div>
          <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: "var(--text)" }}>
            {formatNum(debt.totals.debtAsro)} <span className="text-meta">so&apos;m</span>
          </div>
        </div>
        <div className="p-4 rounded-xl" style={card}>
          <div className="text-meta" style={{ color: "var(--text-muted)" }}>Farq</div>
          <div
            className="text-xl font-semibold tabular-nums mt-1"
            style={{ color: Math.abs(debt.totals.diff) > 1 ? "var(--warning)" : "var(--success)" }}
          >
            {debt.totals.diff > 0 ? "+" : ""}{formatNum(debt.totals.diff)} <span className="text-meta">so&apos;m</span>
          </div>
          <div className="text-micro" style={{ color: "var(--text-muted)" }}>
            ikkalasi jamg&apos;arilgan — farq nomuvofiqlik belgisi
          </div>
        </div>
      </div>

      {debt.unlinked > 0 && (
        <div className="p-3 rounded-xl flex items-start gap-3" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
          <AlertTriangle size={17} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
          <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
            <b>{debt.unlinked}</b> ta 1C qatorining mijozi ASRO bazasida topilmadi — ular
            faqat 1C nomi bilan ko&apos;rsatilgan. Firmani qo&apos;shgach qayta import qiling.
          </p>
        </div>
      )}

      {/* Reja / fakt */}
      {planFact.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={card}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}>
            <TrendingUp size={15} style={{ color: "var(--accent-blue)" }} />
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>Tushum: reja va fakt</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-meta">
              <thead>
                <tr style={{ background: "var(--input-bg)" }}>
                  <th className="text-left p-2">Davr</th>
                  <th className="text-right p-2">Reja</th>
                  <th className="text-right p-2">Fakt</th>
                  <th className="text-right p-2">Bajarilishi</th>
                </tr>
              </thead>
              <tbody>
                {planFact.map((p) => {
                  const plan = Number(p.plan ?? 0);
                  const fact = Number(p.fact ?? 0);
                  const pct = plan > 0 ? Math.round((fact / plan) * 100) : null;
                  const color = pct == null ? "var(--text-muted)" : pct >= 100 ? "var(--success)" : pct >= 90 ? "var(--warning)" : "var(--danger)";
                  return (
                    <tr key={p.period} style={{ borderTop: "1px solid var(--card-border)" }}>
                      <td className="p-2 whitespace-nowrap">{p.period}</td>
                      <td className="p-2 text-right tabular-nums">{plan ? formatNum(plan) : "—"}</td>
                      <td className="p-2 text-right tabular-nums">{fact ? formatNum(fact) : "—"}</td>
                      <td className="p-2 text-right tabular-nums font-semibold" style={{ color }}>
                        {pct == null ? "—" : `${pct}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Qatorlar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg text-meta outline-none"
            style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
            placeholder="Mijoz, shartnoma yoki firma bo'yicha qidirish…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-meta cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          Faqat farqi borlar
        </label>
        <span className="text-meta" style={{ color: "var(--text-muted)" }}>{rows.length} qator</span>
      </div>

      <div className="overflow-x-auto rounded-xl" style={card}>
        <table className="w-full text-meta">
          <thead>
            <tr style={{ background: "var(--input-bg)" }}>
              <th className="text-left p-2">Mijoz</th>
              <th className="text-left p-2">Shartnoma</th>
              <th className="text-left p-2">Bizning firma</th>
              <th className="text-right p-2">1C</th>
              <th className="text-right p-2">ASRO</th>
              <th className="text-right p-2">Farq</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: "1px solid var(--card-border)" }}>
                <td className="p-2 max-w-[260px] truncate">
                  {r.customer}
                  {!r.linked && (
                    <span className="ml-2 text-micro px-1.5 py-0.5 rounded" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                      bazada yo&apos;q
                    </span>
                  )}
                </td>
                <td className="p-2 whitespace-nowrap">{r.contract ?? "—"}</td>
                <td className="p-2 max-w-[180px] truncate">{r.ownFirm ?? "—"}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{formatNum(r.debt1C)}</td>
                <td className="p-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.debtAsro == null ? "—" : formatNum(r.debtAsro)}
                </td>
                <td
                  className="p-2 text-right tabular-nums font-semibold"
                  style={{ color: r.diff == null ? "var(--text-muted)" : Math.abs(r.diff) > 1 ? "var(--warning)" : "var(--success)" }}
                >
                  {r.diff == null ? "—" : `${r.diff > 0 ? "+" : ""}${formatNum(r.diff)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
