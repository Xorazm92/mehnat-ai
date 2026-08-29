"use client";

// MODDALAR KESIMI — Excel "DASHBOARD" varag'ining o'rnini bosadi.
//
// Kassalar jadvali "pul QAYERDA" ga javob beradi, bu jadval "pul NIMAGA" ga.
// Ikkalasi bir sahifada yonma-yon turadi, chunki buxgalter Excelda ham
// aynan shu ikki savolni birga so'raydi.
//
// SHARTNOMA TO'LOVLARI ALOHIDA QATORDA. Ular kassa moddasi emas — `Payment`
// jadvalida yashaydi va o'z ekraniga ega (/kassa/kirim). Kirim moddalariga
// qo'shib yuborilsa, bitta pul ikki manbadan sanalardi.

import React from "react";
import { formatNum } from "@/lib/platform/format";
import { Money } from "@/components/ui";
import { ArrowDownRight, ArrowUpRight, PieChart } from "lucide-react";

interface Row {
  category: string;
  count: number;
  amount: number;
}

interface Props {
  data: {
    period: string;
    income: Row[];
    expense: Row[];
    incomeTotal: number;
    expenseTotal: number;
    contractPayments: { count: number; amount: number };
    pending: { count: number; amount: number };
  };
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

function Side({
  title,
  rows,
  total,
  tone,
  icon,
}: {
  title: string;
  rows: Row[];
  total: number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-[260px]">
      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ borderBottom: "1px solid var(--card-border)" }}
      >
        <span className="flex items-center gap-1.5 text-meta font-semibold" style={{ color: "var(--text)" }}>
          {icon}
          {title}
        </span>
        <span className="text-meta tabular-nums font-semibold" style={{ color: tone }}>
          {formatNum(total)}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-4 text-micro" style={{ color: "var(--text-muted)" }}>
          Bu oyda yozuv yo&apos;q.
        </p>
      ) : (
        <table className="w-full text-micro">
          <tbody>
            {rows.map((r) => {
              // Ulush chizig'i — eng katta moddaga nisbatan, jamiga emas:
              // jamiga nisbatan olinsa 20 ta modda bo'lganda hammasi
              // ko'rinmas ingichka chiziqqa aylanardi.
              const share = total > 0 ? (r.amount / total) * 100 : 0;
              return (
                <tr key={r.category} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-secondary)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{r.category}</span>
                      <span className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {r.count} ta
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1 rounded-full overflow-hidden"
                      style={{ background: "var(--input-bg)" }}
                    >
                      <div className="h-full rounded-full" style={{ width: `${share}%`, background: tone }} />
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap align-top">
                    <Money value={r.amount} tone={tone === "var(--accent-green)" ? "in" : "out"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function CategoryBreakdown({ data }: Props) {
  const net = data.incomeTotal - data.expenseTotal;

  return (
    <div className="rounded-xl overflow-hidden" style={card}>
      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}
      >
        <div className="flex items-center gap-2">
          <PieChart size={15} style={{ color: "var(--text-muted)" }} />
          <div>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
              Moddalar kesimi — {data.period}
            </h2>
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              Kassa yozuvlari modda bo&apos;yicha · shartnoma to&apos;lovlari alohida
            </p>
          </div>
        </div>
        <span
          className="text-meta tabular-nums font-semibold"
          style={{ color: net >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}
        >
          Sof: {formatNum(net)} so&apos;m
        </span>
      </div>

      <div className="flex flex-wrap" style={{ gap: 0 }}>
        <Side
          title="Kirim"
          rows={data.income}
          total={data.incomeTotal}
          tone="var(--accent-green)"
          icon={<ArrowDownRight size={13} style={{ color: "var(--accent-green)" }} />}
        />
        <div style={{ width: 1, background: "var(--card-border)" }} />
        <Side
          title="Chiqim"
          rows={data.expense}
          total={data.expenseTotal}
          tone="var(--accent-red)"
          icon={<ArrowUpRight size={13} style={{ color: "var(--accent-red)" }} />}
        />
      </div>

      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-micro"
        style={{ borderTop: "1px solid var(--card-border)", color: "var(--text-muted)" }}
      >
        <span>
          Shartnoma to&apos;lovlari (kassa moddasi emas — <b>/kassa/kirim</b>):{" "}
          <b className="tabular-nums" style={{ color: "var(--text)" }}>
            {formatNum(data.contractPayments.amount)}
          </b>{" "}
          so&apos;m · {data.contractPayments.count} ta
        </span>
        {/* Tasdiq kutayotgan chiqim jamiga KIRMAYDI — u hali pul emas.
            Lekin ko'rinmasa, /expenses dagi "3 ta kutmoqda" bilan bu
            ekrandagi raqam farq qilib, qaysi biri to'g'ri degan savol
            tug'ilardi. */}
        {data.pending.count > 0 && (
          <span style={{ color: "var(--warning)" }}>
            Tasdiq kutmoqda: <b className="tabular-nums">{formatNum(data.pending.amount)}</b> so&apos;m ·{" "}
            {data.pending.count} ta (jamiga kirmagan)
          </span>
        )}
      </div>
    </div>
  );
}
