"use client";

import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { MONTHS_UZ } from "@/lib/periods";
import { TrendingUp } from "lucide-react";
import { formatNum } from "@/lib/format";

interface Point {
  month: string; // "2026-07"
  income: number;
  expense: number;
}

const fmt = (v: number) => formatNum(Math.round(v));

function monthLabel(m: string) {
  const mm = Number(m.split("-")[1]);
  return MONTHS_UZ[mm - 1]?.slice(0, 3) || m;
}

export function CashFlowChart({ data }: { data: Point[] }) {
  const hasData = data.some((d) => d.income || d.expense);
  const cur = data[data.length - 1] || { month: "", income: 0, expense: 0 };
  const net = cur.income - cur.expense;
  const curLabel = cur.month ? MONTHS_UZ[Number(cur.month.split("-")[1]) - 1] : "";

  const chartData = data.map((d) => ({ name: monthLabel(d.month), Kirim: d.income, Chiqim: d.expense }));

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} style={{ color: "var(--accent-blue)" }} />
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Pul oqimi</h2>
        </div>
        <div className="flex items-center gap-4 text-meta font-bold">
          <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <span className="w-2.5 h-2.5 rounded-lg inline-block" style={{ background: "var(--accent-blue)" }} /> Kirim
          </span>
          <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <span className="w-2.5 h-2.5 rounded-lg inline-block" style={{ background: "var(--text-muted)" }} /> Chiqim
          </span>
        </div>
      </div>

      {hasData ? (
        <>
          <div style={{ width: "100%", height: 210 }}>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} barGap={4} barCategoryGap="25%">
                <CartesianGrid vertical={false} stroke="var(--card-border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: "var(--text-muted)" }} />
                <Tooltip
                  cursor={{ fill: "var(--table-row-hover)" }}
                  contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v) => `${fmt(Number(v))} so'm`}
                />
                <Bar dataKey="Kirim" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="Chiqim" fill="var(--text-muted)" radius={[4, 4, 0, 0]} maxBarSize={22} opacity={0.55} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--card-border)" }}>
            <div>
              <p className="text-micro font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{curLabel} kirim</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--success)" }}>+{fmt(cur.income)}</p>
            </div>
            <div>
              <p className="text-micro font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{curLabel} chiqim</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--danger)" }}>−{fmt(cur.expense)}</p>
            </div>
            <div>
              <p className="text-micro font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Sof oqim</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: net >= 0 ? "var(--accent-blue)" : "var(--danger)" }}>
                {net >= 0 ? "+" : "−"}{fmt(Math.abs(net))}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center" style={{ color: "var(--text-muted)" }}>
          <TrendingUp size={32} className="mb-2 opacity-30" />
          <p className="text-sm font-medium">Pul oqimi ma&apos;lumoti yo&apos;q</p>
          <p className="text-meta mt-1">Kassa to&apos;lovlari va xarajatlar kiritilgach shu yerda aks etadi</p>
        </div>
      )}
    </div>
  );
}
