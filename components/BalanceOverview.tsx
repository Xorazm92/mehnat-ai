"use client";

import React from "react";
import type { BalanceBreakdown } from "@/types";
import { Wallet, AlertTriangle, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatNum } from "@/lib/format";

const som = (v: number) => formatNum(Math.round(v));

/** Bitta oyning harakati — manba bo'yicha (lib/balance.ts getMonthBreakdown). */
export interface MonthlyMovement {
  income: number;
  outflow: number;
  incomePayments: number;
  incomeKassa: number;
  outflowKassa: number;
  outflowPayroll: number;
}

interface Props {
  breakdown: BalanceBreakdown;
  /** compact = bitta qatorli banner (masalan Xarajatlar sahifasi tepasi) */
  variant?: "full" | "compact";
  title?: string;
  /**
   * Berilsa, kirim/chiqim SHU OY bo'yicha ko'rsatiladi, yig'ma esa pastda
   * kichik qator bo'lib qoladi.
   *
   * NEGA: `breakdown.income` — BOSHIDAN BERI yig'ilgan tushum (1,25 mlrd).
   * U "Kirim" yorlig'i ostida turgani uchun oylik tushum deb o'qilardi,
   * holbuki korxonaning bir oylik tushumi ~1 mlrd. Ya'ni ekran butun
   * tarixni bitta oy qilib ko'rsatib, rahbarni chalg'itardi.
   *
   * BALANS o'zgarmaydi — u yig'ma bo'lishi shart, chunki bugungi qoldiq
   * butun tarixning natijasi.
   */
  monthly?: MonthlyMovement;
  /** "2026 Avgust" — oylik raqamlar qaysi oyga tegishli ekani. */
  periodLabel?: string;
}

/**
 * Yagona kassa balansi ko'rinishi — barcha pul jadvallarini (shartnoma to'lovlari,
 * kassa, xarajatlar, oyliklar) bitta manzarada ko'rsatadi. Kassa, Xarajatlar va
 * Dashboard sahifalarida bir xil ishlatiladi.
 */
export default function BalanceOverview({
  breakdown: b,
  variant = "full",
  title = "Mavjud kassa balansi",
  monthly,
  periodLabel,
}: Props) {
  // Oylik kesim berilmasa — eski xatti-harakat (yig'ma raqamlar) saqlanadi:
  // bu komponentni Dashboard va Xarajatlar sahifalari ham ishlatadi.
  const flow = monthly ?? b;
  const flowNote = monthly ? (periodLabel ?? "shu oy") : "boshidan beri";
  const negative = b.balance < 0;
  const accent = negative ? "var(--danger)" : "var(--success)";
  const accentBg = negative ? "var(--danger-bg)" : "var(--success-bg)";
  const accentBd = negative ? "var(--danger-border)" : "var(--success-border)";

  if (variant === "compact") {
    return (
      <div
        className="p-4 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3"
        style={{ background: accentBg, border: `1px solid ${accentBd}` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: accent }}>
            {negative ? <AlertTriangle size={22} /> : <Wallet size={22} />}
          </div>
          <div>
            <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{title}</div>
            <div className="text-2xl font-semibold tabular-nums leading-tight" style={{ color: accent }}>
              {som(b.balance)} <span className="text-body font-bold" style={{ color: "var(--text-muted)" }}>so&apos;m</span>
            </div>
            {negative && (
              <div className="text-meta font-bold mt-0.5" style={{ color: "var(--danger)" }}>
                Diqqat: chiqim kirimdan oshib ketgan (manfiy balans)
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-5 text-xs">
          <div className="flex items-center gap-1.5" title="Kirim: to'langan shartnomalar + kassa kirimlari">
            <TrendingUp size={15} style={{ color: "var(--success)" }} />
            <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>+{som(flow.income)}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Chiqim: tasdiqlangan xarajatlar + kassa chiqimlari + oyliklar">
            <TrendingDown size={15} style={{ color: "var(--danger)" }} />
            <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>−{som(flow.outflow)}</span>
          </div>
        </div>
      </div>
    );
  }

  const incomeRows = [
    { label: "Shartnoma to'lovlari", value: flow.incomePayments },
    { label: "Kassa kirimlari", value: flow.incomeKassa },
  ];
  const outflowRows = [
    { label: "Kassa chiqimlari", value: flow.outflowKassa },
    { label: "Oyliklar", value: flow.outflowPayroll },
  ];

  return (
    <div className="dashboard-card p-5 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: accent }}>
            {negative ? <AlertTriangle size={24} /> : <Wallet size={24} />}
          </div>
          <div>
            <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{title}</div>
            <div className="text-3xl font-semibold tabular-nums leading-tight" style={{ color: accent }}>
              {som(b.balance)} <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>so&apos;m</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
            <div className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--success)" }}>
              <ArrowUpRight size={13} /> Kirim · {flowNote}
            </div>
            <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{som(flow.income)}</div>
          </div>
          <div className="px-4 py-2 rounded-xl" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
            <div className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--danger)" }}>
              <ArrowDownRight size={13} /> Chiqim · {flowNote}
            </div>
            <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{som(flow.outflow)}</div>
          </div>
        </div>
      </div>

      {negative && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          <AlertTriangle size={15} style={{ color: "var(--danger)" }} />
          <span className="text-xs font-bold" style={{ color: "var(--danger)" }}>
            Balans manfiy — chiqim kirimdan oshgan. Yangi chiqimlar faqat Admin ruxsati bilan o&apos;tadi.
          </span>
        </div>
      )}

      {/* QOIDA: umumiy balans musbat bo'lsa ham, uning NAQD qismi manfiy
          bo'lishi mumkin (pul kartalarda tranzitda turadi). Jismonan manfiy
          kassa bo'lmaydi — bu ma'lumot xatosi yoki hisobga olinmagan
          o'tkazma. Ilgari bu holat tinch ko'k satrda oddiy matn sifatida
          chizilardi va e'tibordan chetda qolardi. Endi satr o'zi ogohlantirish
          rangiga o'tadi va nima qilish kerakligini aytadi. */}
      {b.transitBalance !== undefined && b.transitBalance > 0 && (() => {
        const cashOnHand = b.balance - b.transitBalance;
        const cashNegative = cashOnHand < 0;
        return (
        <div className="mb-4 p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
          style={cashNegative
            ? { background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }
            : { background: "var(--accent-bg, rgba(59, 130, 246, 0.08))", border: "1px solid var(--accent-border, rgba(59, 130, 246, 0.2))" }}>
          <span style={{ color: "var(--text-secondary)" }}>
            {cashNegative && <AlertTriangle size={13} className="inline mr-1.5 -mt-0.5" style={{ color: "var(--warning)" }} />}
            Joylashuvi: <strong style={{ color: cashNegative ? "var(--warning)" : "var(--text-primary)" }}>Kassada: {som(cashOnHand)} so&apos;m</strong>
            {cashNegative && (
              <span className="ml-2" style={{ color: "var(--warning)" }}>
                — naqd qoldiq manfiy bo&apos;lishi mumkin emas; tranzit o&apos;tkazmalarini solishtiring
              </span>
            )}
          </span>
          <span className="font-bold" style={{ color: "var(--accent-color, #3b82f6)" }}>
            Kartalarda (Tranzit): {som(b.transitBalance)} so&apos;m
          </span>
        </div>
        );
      })()}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-micro font-bold uppercase tracking-widest mb-2" style={{ color: "var(--success)" }}>Kirim manbalari · {flowNote}</div>
          <div className="space-y-1.5">
            {incomeRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-body">
                <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
                <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{som(r.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-micro font-bold uppercase tracking-widest mb-2" style={{ color: "var(--danger)" }}>Chiqim yo&apos;nalishlari · {flowNote}</div>
          <div className="space-y-1.5">
            {outflowRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-body">
                <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
                <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{som(r.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Yig'ma raqam YASHIRILMAYDI — u shunchaki bosh raqam bo'lishdan
          to'xtaydi. Balans qaysi tarixdan kelib chiqqanini ko'rsatib turadi. */}
      {monthly && (
        <div
          className="mt-4 pt-3 text-micro flex flex-wrap items-center gap-x-4 gap-y-1"
          style={{ borderTop: "1px solid var(--card-border)", color: "var(--text-muted)" }}
        >
          <span>
            Boshidan beri: kirim{" "}
            <b className="tabular-nums" style={{ color: "var(--text-secondary)" }}>{som(b.income)}</b> · chiqim{" "}
            <b className="tabular-nums" style={{ color: "var(--text-secondary)" }}>{som(b.outflow)}</b>
          </span>
          <span>Balans — shu ikkisining ayirmasi, ya'ni butun tarix natijasi.</span>
        </div>
      )}
    </div>
  );
}
