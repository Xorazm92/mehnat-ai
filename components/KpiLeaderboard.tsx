"use client";
import React, { useState, useEffect } from "react";
import { Language } from "@/types";
import { getKpiLeaderboard } from "@/server/kpi";
import { Trophy, TrendingUp, Award, AlertTriangle, Wallet, Activity } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { MONTHS_UZ } from "@/lib/periods";
import { formatNum } from "@/lib/format";

interface Props { lang: Language; }

interface LeaderRow {
  employeeId: string; name: string; role: string; ball: number;
  daraja: "excellent" | "good" | "fair" | "poor"; green: number; red: number; entries: number; bonus: number;
}
interface Data {
  leaderboard: LeaderRow[];
  stats: { avgBall: number; excellent: number; poor: number; bonusFund: number; total: number };
  criteria: { category: string; passPercent: number; scored: number }[];
  monthlyTrend?: { month: string; avgBall: number }[];
}

const DARAJA: Record<LeaderRow["daraja"], { label: string; fg: string; bg: string; bd: string }> = {
  excellent: { label: "A'lo", fg: "var(--success)", bg: "var(--success-bg)", bd: "var(--success-border)" },
  good: { label: "Yaxshi", fg: "var(--accent-blue)", bg: "var(--accent-blue-light)", bd: "var(--accent-blue)" },
  fair: { label: "Qoniqarli", fg: "var(--warning)", bg: "var(--warning-bg)", bd: "var(--warning-border)" },
  poor: { label: "Qoniqarsiz", fg: "var(--danger)", bg: "var(--danger-bg)", bd: "var(--danger-border)" },
};

const ROLE_UZ: Record<string, string> = {
  accountant: "Buxgalter", bank_manager: "Bank-klient", supervisor: "Nazoratchi", chief_accountant: "Bosh Buxgalter",
};
const CAT_UZ: Record<string, string> = {
  attendance: "Ishga kelish", communication: "Javob tezligi", automation: "Avtomatlashtirish",
  reports: "Hisobotlar o'z vaqtida", penalty_only: "Jiddiy xatolar", bonus_only: "Shaxsiy mas'uliyat",
};

const fmt = (v: number) => formatNum(Math.round(v));
const barColor = (b: number) => (b >= 85 ? "var(--success)" : b >= 70 ? "var(--accent-blue)" : b >= 60 ? "var(--warning)" : "var(--danger)");

const KpiLeaderboard: React.FC<Props> = ({ lang }) => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getKpiLeaderboard(`${month}-01`)
      .then((d) => setData(d as unknown as Data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [month]);

  const s = data?.stats;

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 rounded-xl"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))" }}>
            <Trophy size={20} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold leading-none" style={{ color: "var(--text-primary)" }}>KPI Reytingi</h2>
            <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--text-muted)" }}>{s?.total ?? 0} xodim baholandi · o&apos;rtacha {s?.avgBall ?? 0} ball</p>
          </div>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg px-3 py-2 text-[13px] font-bold outline-none cursor-pointer"
          style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--accent-blue)" }} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: "O'rtacha ball", value: `${s?.avgBall ?? 0}`, color: "var(--accent-blue)", bg: "var(--accent-blue-light)" },
          { icon: Award, label: "A'lo (85+)", value: `${s?.excellent ?? 0} xodim`, color: "var(--success)", bg: "var(--success-bg)" },
          { icon: AlertTriangle, label: "Qoniqarsiz (<60)", value: `${s?.poor ?? 0} xodim`, color: "var(--danger)", bg: "var(--danger-bg)" },
          { icon: Wallet, label: "Bonus fondi", value: `${fmt(s?.bonusFund ?? 0)} so'm`, color: "var(--warning)", bg: "var(--warning-bg)" },
        ].map((c, i) => (
          <div key={i} className="rounded-2xl p-4" style={{ background: c.bg, border: `1px solid ${c.color}33` }}>
            <div className="flex items-center gap-2 mb-2"><c.icon size={16} style={{ color: c.color }} /><span className="text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>{c.label}</span></div>
            <p className="text-[18px] font-black tabular-nums" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Leaderboard */}
        <div className="lg:col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
          <div className="px-5 py-3 grid grid-cols-[40px_1fr_120px_90px_110px] gap-2 text-[9px] font-bold uppercase tracking-widest" style={{ background: "var(--table-header-bg)", borderBottom: "1px solid var(--card-border)", color: "var(--text-muted)" }}>
            <span>#</span><span>Xodim</span><span>Bajarilish</span><span className="text-center">Ball</span><span className="text-right">Bonus</span>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {loading ? (
              <p className="text-center text-[12px] py-10" style={{ color: "var(--text-muted)" }}>Yuklanmoqda…</p>
            ) : (data?.leaderboard.length ?? 0) === 0 ? (
              <p className="text-center text-[12px] py-10" style={{ color: "var(--text-muted)" }}>Bu oy uchun ma&apos;lumot yo&apos;q</p>
            ) : (
              data!.leaderboard.map((r, i) => {
                const d = DARAJA[r.daraja];
                return (
                  <div key={r.employeeId} className="px-5 py-3 grid grid-cols-[40px_1fr_120px_90px_110px] gap-2 items-center" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <span className="text-[12px] font-bold tabular-nums" style={{ color: i < 3 ? "var(--accent-blue)" : "var(--text-muted)" }}>{i === 0 ? "🏆" : i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>{r.name}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{ROLE_UZ[r.role] || r.role}</p>
                    </div>
                    <div className="rounded-full h-2" style={{ background: "var(--input-bg)" }}>
                      <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${r.ball}%`, background: barColor(r.ball) }} />
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{r.ball}</span>
                      <span className="text-2xs font-bold px-1.5 py-0.5 rounded" style={{ background: d.bg, color: d.fg, border: `1px solid ${d.bd}` }}>{d.label}</span>
                    </div>
                    <span className="text-[12px] font-bold tabular-nums text-right" style={{ color: r.bonus > 0 ? "var(--success)" : "var(--text-muted)" }}>{r.bonus > 0 ? "+" + fmt(r.bonus) : "—"}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-5">
        {/* Jamoa dinamikasi (6 oy) */}
        {(() => {
          const trend = (data?.monthlyTrend || []).filter((t) => t.avgBall > 0);
          if (trend.length < 2) return null;
          const chartData = trend.map((t) => ({ name: MONTHS_UZ[Number(t.month.split("-")[1]) - 1]?.slice(0, 3) || t.month, ball: t.avgBall }));
          return (
            <div className="rounded-xl p-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
              <div className="flex items-center gap-2 mb-3"><Activity size={15} style={{ color: "var(--accent-blue)" }} /><h3 className="text-[12px] font-bold uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>Jamoa dinamikasi · 6 oy</h3></div>
              <div style={{ width: "100%", height: 140 }}>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: "var(--text-muted)" }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "var(--text-muted)" }} width={28} />
                    <Tooltip contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 10, fontSize: 12 }} formatter={(v) => `${v} ball`} />
                    <Line type="monotone" dataKey="ball" stroke="var(--accent-blue)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent-blue)" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })()}

        {/* Criteria breakdown */}
        <div className="rounded-xl p-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
          <h3 className="text-[12px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-primary)" }}>Mezonlar kesimi · jamoa</h3>
          {(data?.criteria.length ?? 0) === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Ma&apos;lumot yo&apos;q</p>
          ) : (
            <div className="space-y-4">
              {data!.criteria.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-[11px] font-bold mb-1.5">
                    <span style={{ color: "var(--text-secondary)" }}>{CAT_UZ[c.category] || c.category}</span>
                    <span style={{ color: barColor(c.passPercent) }}>{c.passPercent}%</span>
                  </div>
                  <div className="rounded-full h-2" style={{ background: "var(--input-bg)" }}>
                    <div className="h-2 rounded-full" style={{ width: `${c.passPercent}%`, background: barColor(c.passPercent) }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default KpiLeaderboard;
