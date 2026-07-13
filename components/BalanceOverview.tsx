"use client";

import React from "react";
import type { BalanceBreakdown } from "@/types";
import { Wallet, AlertTriangle, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";

const som = (v: number) => Math.round(v).toLocaleString("ru-RU");

interface Props {
  breakdown: BalanceBreakdown;
  /** compact = bitta qatorli banner (masalan Xarajatlar sahifasi tepasi) */
  variant?: "full" | "compact";
  title?: string;
}

/**
 * Yagona kassa balansi ko'rinishi — barcha pul jadvallarini (shartnoma to'lovlari,
 * kassa, xarajatlar, oyliklar) bitta manzarada ko'rsatadi. Kassa, Xarajatlar va
 * Dashboard sahifalarida bir xil ishlatiladi.
 */
export default function BalanceOverview({ breakdown: b, variant = "full", title = "Mavjud kassa balansi" }: Props) {
  const negative = b.balance < 0;
  const accent = negative ? "var(--danger)" : "var(--success)";
  const accentBg = negative ? "var(--danger-bg)" : "var(--success-bg)";
  const accentBd = negative ? "var(--danger-border)" : "var(--success-border)";

  if (variant === "compact") {
    return (
      <div
        className="p-4 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-3"
        style={{ background: accentBg, border: `1px solid ${accentBd}` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: accent }}>
            {negative ? <AlertTriangle size={22} /> : <Wallet size={22} />}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{title}</div>
            <div className="text-2xl font-black tabular-nums leading-tight" style={{ color: accent }}>
              {som(b.balance)} <span className="text-[13px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>so&apos;m</span>
            </div>
            {negative && (
              <div className="text-[11px] font-bold mt-0.5" style={{ color: "var(--danger)" }}>
                Diqqat: chiqim kirimdan oshib ketgan (manfiy balans)
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-5 text-[12px]">
          <div className="flex items-center gap-1.5" title="Kirim: to'langan shartnomalar + kassa kirimlari">
            <TrendingUp size={15} style={{ color: "var(--success)" }} />
            <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>+{som(b.income)}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Chiqim: tasdiqlangan xarajatlar + kassa chiqimlari + oyliklar">
            <TrendingDown size={15} style={{ color: "var(--danger)" }} />
            <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>−{som(b.outflow)}</span>
          </div>
        </div>
      </div>
    );
  }

  const incomeRows = [
    { label: "Shartnoma to'lovlari", value: b.incomePayments },
    { label: "Kassa kirimlari", value: b.incomeKassa },
  ];
  const outflowRows = [
    { label: "Tasdiqlangan xarajatlar", value: b.outflowExpenses },
    { label: "Kassa chiqimlari", value: b.outflowKassa },
    { label: "Oyliklar", value: b.outflowPayroll },
  ];

  return (
    <div className="dashboard-card p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: accent }}>
            {negative ? <AlertTriangle size={24} /> : <Wallet size={24} />}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{title}</div>
            <div className="text-3xl font-black tabular-nums leading-tight" style={{ color: accent }}>
              {som(b.balance)} <span className="text-sm font-bold uppercase" style={{ color: "var(--text-muted)" }}>so&apos;m</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--success)" }}>
              <ArrowUpRight size={13} /> Kirim
            </div>
            <div className="text-lg font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{som(b.income)}</div>
          </div>
          <div className="px-4 py-2 rounded-xl" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--danger)" }}>
              <ArrowDownRight size={13} /> Chiqim
            </div>
            <div className="text-lg font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{som(b.outflow)}</div>
          </div>
        </div>
      </div>

      {negative && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          <AlertTriangle size={15} style={{ color: "var(--danger)" }} />
          <span className="text-[12px] font-bold" style={{ color: "var(--danger)" }}>
            Balans manfiy — chiqim kirimdan oshgan. Yangi chiqimlar faqat Admin ruxsati bilan o&apos;tadi.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--success)" }}>Kirim manbalari</div>
          <div className="space-y-1.5">
            {incomeRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-[13px]">
                <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
                <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{som(r.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--danger)" }}>Chiqim yo&apos;nalishlari</div>
          <div className="space-y-1.5">
            {outflowRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-[13px]">
                <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
                <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{som(r.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
