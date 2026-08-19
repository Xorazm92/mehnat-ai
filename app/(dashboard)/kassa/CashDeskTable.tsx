"use client";

// KASSALAR JADVALI — auditning markaziy jadvali.
//
// Har kassa bo'yicha: ochilish → kirim → chiqim → yopilish. Manba jurnal
// (server/kassaReport.ts), ya'ni raqamlar balans bilan bir joydan keladi.
//
// "Kanali ko'rsatilmagan" qatori ATAYIN ko'rinadi va ajratib turiladi: uni
// yashirish jadvalni chiroyli, lekin yolg'on qilardi — jami balansga to'g'ri
// kelmasdi.

import { formatNum } from "@/lib/format";
import { Wallet, AlertTriangle } from "lucide-react";

interface Row {
  channelId: string | null;
  label: string;
  typeLabel: string;
  detail: string | null;
  opening: number;
  income: number;
  outflow: number;
  closing: number;
  isActive: boolean;
  transitBalance: number | null;
}

interface Props {
  report: {
    period: string;
    rows: Row[];
    totals: { opening: number; income: number; outflow: number; closing: number };
    unassigned: number;
  };
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

export default function CashDeskTable({ report }: Props) {
  const { rows, totals } = report;

  return (
    <div className="rounded-xl overflow-hidden" style={card}>
      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}
      >
        <div className="flex items-center gap-2">
          <Wallet size={15} style={{ color: "var(--text-muted)" }} />
          <div>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
              Kassalar — {report.period}
            </h2>
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              Har kassa bo&apos;yicha ochilish, harakat va qoldiq · manba: ikki tomonlama jurnal
            </p>
          </div>
        </div>
        <span className="text-meta tabular-nums font-semibold" style={{ color: "var(--text)" }}>
          Jami qoldiq: {formatNum(totals.closing)} so&apos;m
        </span>
      </div>

      {report.unassigned !== 0 && (
        <div
          className="px-3 py-2 flex items-start gap-2 text-micro"
          style={{ background: "var(--warning-bg)", borderBottom: "1px solid var(--card-border)", color: "var(--warning)" }}
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            {formatNum(report.unassigned)} so&apos;m qaysi kassada ekani noma&apos;lum — eski
            yozuvlarda kanal ko&apos;rsatilmagan. Bu raqam nolga intilishi kerak.
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-meta">
          <thead>
            <tr style={{ background: "var(--table-header-bg)" }}>
              {["Kassa", "Turi", "Ochilish", "Kirim", "Chiqim", "Qoldiq"].map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2 text-micro font-semibold uppercase tracking-wider whitespace-nowrap ${i >= 2 ? "text-right" : "text-left"}`}
                  style={{ color: "var(--text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const orphan = r.channelId === null;
              // Karta uchun jurnal va tranzit daftari MUSTAQIL ikki o'lchov.
              // Farq bo'lsa — karta xarajati kassaga bog'lanmagan.
              const mismatch =
                r.transitBalance !== null && Math.abs(r.transitBalance - r.closing) > 1;
              return (
                <tr
                  key={r.channelId ?? "none"}
                  style={{
                    borderTop: "1px solid var(--card-border)",
                    background: orphan ? "var(--warning-bg)" : undefined,
                    opacity: r.isActive || orphan ? 1 : 0.55,
                  }}
                >
                  <td className="px-3 py-2">
                    <div className="font-semibold" style={{ color: "var(--text)" }}>
                      {r.label}
                      {!r.isActive && !orphan && (
                        <span className="ml-1.5 text-micro" style={{ color: "var(--text-muted)" }}>
                          (muzlatilgan)
                        </span>
                      )}
                    </div>
                    {r.detail && (
                      <div className="text-micro" style={{ color: "var(--text-muted)" }}>{r.detail}</div>
                    )}
                    {mismatch && (
                      <div className="text-micro" style={{ color: "var(--danger)" }}>
                        Tranzit daftari: {formatNum(r.transitBalance ?? 0)} — farq{" "}
                        {formatNum((r.transitBalance ?? 0) - r.closing)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{r.typeLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {formatNum(r.opening)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--success)" }}>
                    {r.income ? "+" + formatNum(r.income) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--danger)" }}>
                    {r.outflow ? "−" + formatNum(r.outflow) : "—"}
                  </td>
                  <td
                    className="px-3 py-2 text-right tabular-nums font-semibold"
                    style={{ color: r.closing < 0 ? "var(--danger)" : "var(--text)" }}
                  >
                    {formatNum(r.closing)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--card-border)", background: "var(--table-header-bg)" }}>
              <td className="px-3 py-2 font-semibold" style={{ color: "var(--text)" }} colSpan={2}>
                Jami
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                {formatNum(totals.opening)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--success)" }}>
                +{formatNum(totals.income)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--danger)" }}>
                −{formatNum(totals.outflow)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--text)" }}>
                {formatNum(totals.closing)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
