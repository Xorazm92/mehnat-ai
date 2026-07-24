"use client";

// Oy yopilishi boshqaruvi: 12 oylik jadval + checklist + Close/Reopen/PDF.
// Close tugmasi FAQAT status READY_TO_CLOSE bo'lganda faollashadi (spec:
// checklist yashil bo'lmasa bosilmasin). Yopish/qayta ochish server tomonda
// super_admin bilan qo'riqlangan — bu UI faqat qulaylik qatlami.

import React, { useState } from "react";
import { CalendarCheck2, Lock, LockOpen, RefreshCw, Printer, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { getMonthClosingBoard, validateMonth, closeMonth, reopenMonth } from "@/server/monthClosing";
import { formatNum } from "@/lib/format";

interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  blocking: boolean;
  count?: number;
  detail?: string;
}

interface MonthRow {
  year: number;
  month: number;
  period: string;
  status: string;
  statusNote: string | null;
  openingBalance: number | null;
  closedBy: string | null;
  closedAt: string | null;
  reopenReason: string | null;
  snapshot: {
    id: string;
    isValid: boolean;
    openingBalance: number;
    closingBalance: number;
    income: number;
    outflow: number;
    profit: number;
    loss: number;
    checksumOk: boolean;
  } | null;
}

interface Board {
  year: number;
  months: MonthRow[];
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  OPEN: { label: "OCHIQ", bg: "var(--info-bg)", color: "var(--accent-blue)" },
  READY_TO_CLOSE: { label: "TAYYOR", bg: "var(--success-bg)", color: "var(--success)" },
  CLOSING: { label: "YOPILMOQDA", bg: "var(--warning-bg)", color: "var(--warning)" },
  LOCKED: { label: "YOPILGAN", bg: "var(--card-border)", color: "var(--text-muted)" },
  REOPENED: { label: "QAYTA OCHIQ", bg: "var(--warning-bg)", color: "var(--warning)" },
  FAILED: { label: "XATO", bg: "var(--danger-bg)", color: "var(--danger)" },
};

const MONTH_NAMES = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

export default function MonthClosingClient({
  initialBoard,
  isSuperAdmin,
}: {
  initialBoard: Board;
  isSuperAdmin: boolean;
}) {
  const [board, setBoard] = useState<Board>(initialBoard);
  const [year, setYear] = useState(initialBoard.year);
  const [checklist, setChecklist] = useState<{ period: string; items: ChecklistItem[]; ready: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<MonthRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const reload = async (y: number) => {
    const b = await getMonthClosingBoard(y);
    setBoard(b as unknown as Board);
  };

  const changeYear = async (y: number) => {
    setYear(y);
    setChecklist(null);
    await reload(y);
  };

  const handleValidate = async (m: MonthRow) => {
    setBusy(`validate-${m.period}`);
    try {
      const res = (await validateMonth(m.year, m.month)) as unknown as {
        checklist: { items: ChecklistItem[]; ready: boolean };
      };
      setChecklist({ period: m.period, items: res.checklist.items, ready: res.checklist.ready });
      await reload(year);
    } catch (e) {
      alert((e as Error).message);
    }
    setBusy(null);
  };

  const handleClose = async (m: MonthRow) => {
    if (!confirm(`${m.period} oyini yopasizmi? Yopilgandan keyin davr qulflanadi (LOCKED).`)) return;
    setBusy(`close-${m.period}`);
    try {
      await closeMonth({ year: m.year, month: m.month });
      setChecklist(null);
      await reload(year);
    } catch (e) {
      alert((e as Error).message);
      await reload(year);
    }
    setBusy(null);
  };

  const handleReopen = async () => {
    if (!reopenTarget || !reopenReason.trim()) return;
    setBusy(`reopen-${reopenTarget.period}`);
    try {
      await reopenMonth(reopenTarget.year, reopenTarget.month, reopenReason.trim());
      setReopenTarget(null);
      setReopenReason("");
      await reload(year);
    } catch (e) {
      alert((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg, var(--success), var(--success))" }}>
            <CalendarCheck2 size={20} />
          </div>
          <div>
            <h1 className="text-base font-black" style={{ color: "var(--text-primary)" }}>Oy yopilishi (Month-End Closing)</h1>
            <p className="text-meta" style={{ color: "var(--text-muted)" }}>
              Checklist yashil → TAYYOR → Yopish. Yopilgan oyga yozib bo&apos;lmaydi; qayta ochish faqat Superadmin, sabab bilan.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[year - 1, year, year + 1].map((y) => (
            <button key={y} onClick={() => changeYear(y)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{
                background: y === board.year ? "var(--accent-blue)" : "var(--input-bg)",
                color: y === board.year ? "#fff" : "var(--text-primary)",
                border: "1px solid var(--input-border)",
              }}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Months table */}
      <div className="rounded-xl overflow-x-auto" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
              {["Oy", "Holat", "Ochilish", "Kirim", "Chiqim", "Yopilish", "Foyda/Zarar", "Amallar"].map((h, i) => (
                <th key={h} className={`px-4 py-3 text-micro font-black uppercase tracking-widest ${i >= 2 && i <= 6 ? "text-right" : "text-left"}`} style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.months.map((m) => {
              const st = STATUS_STYLE[m.status] ?? STATUS_STYLE.OPEN;
              const s = m.snapshot;
              return (
                <tr key={m.period} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3 font-bold" style={{ color: "var(--text-primary)" }}>
                    {MONTH_NAMES[m.month - 1]} <span style={{ color: "var(--text-muted)" }}>({m.period})</span>
                    {s && !s.isValid && (
                      <span className="ml-2 text-micro font-black" style={{ color: "var(--danger)" }} title="Snapshot reopen tufayli invalid">INVALID</span>
                    )}
                    {s && !s.checksumOk && (
                      <span className="ml-2 text-micro font-black" style={{ color: "var(--danger)" }} title="Checksum mos emas — ma'lumot o'zgartirilgan!">CHECKSUM!</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-1 rounded-lg text-micro font-black tracking-wider" style={{ background: st.bg, color: st.color }} title={m.statusNote ?? undefined}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s ? formatNum(s.openingBalance) : m.openingBalance != null ? formatNum(m.openingBalance) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--success)" }}>{s ? "+" + formatNum(s.income) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--danger)" }}>{s ? "−" + formatNum(s.outflow) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-black" style={{ color: "var(--text-primary)" }}>{s ? formatNum(s.closingBalance) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s ? (
                      s.profit > 0
                        ? <span style={{ color: "var(--success)" }}>+{formatNum(s.profit)}</span>
                        : <span style={{ color: "var(--danger)" }}>−{formatNum(s.loss)}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {m.status !== "LOCKED" && m.status !== "CLOSING" && (
                        <button onClick={() => handleValidate(m)} disabled={busy !== null}
                          className="px-2.5 py-1.5 rounded-lg text-meta font-bold inline-flex items-center gap-1"
                          style={{ background: "var(--info-bg)", color: "var(--accent-blue)", border: "1px solid var(--input-border)" }}>
                          <RefreshCw size={11} className={busy === `validate-${m.period}` ? "animate-spin" : ""} /> Tekshirish
                        </button>
                      )}
                      {isSuperAdmin && m.status !== "LOCKED" && m.status !== "CLOSING" && (
                        <button onClick={() => handleClose(m)}
                          disabled={busy !== null || m.status !== "READY_TO_CLOSE"}
                          title={m.status !== "READY_TO_CLOSE" ? "Avval checklist yashil bo'lishi kerak (Tekshirish)" : "Oyni yopish"}
                          className="px-2.5 py-1.5 rounded-lg text-meta font-bold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>
                          <Lock size={11} /> Yopish
                        </button>
                      )}
                      {isSuperAdmin && m.status === "LOCKED" && (
                        <button onClick={() => { setReopenTarget(m); setReopenReason(""); }} disabled={busy !== null}
                          className="px-2.5 py-1.5 rounded-lg text-meta font-bold inline-flex items-center gap-1"
                          style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>
                          <LockOpen size={11} /> Qayta ochish
                        </button>
                      )}
                      {s && (
                        <a href={`/api/accounting/month-summary?year=${m.year}&month=${m.month}&format=html`} target="_blank" rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-lg text-meta font-bold inline-flex items-center gap-1"
                          style={{ background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--input-border)" }}>
                          <Printer size={11} /> PDF
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Checklist panel */}
      {checklist && (
        <div className="rounded-xl p-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black" style={{ color: "var(--text-primary)" }}>
              Yopish checklisti — {checklist.period}
            </h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-meta font-black"
              style={{
                background: checklist.ready ? "var(--success-bg)" : "var(--danger-bg)",
                color: checklist.ready ? "var(--success)" : "var(--danger)",
              }}>
              {checklist.ready ? <><CheckCircle2 size={13} /> YOPISHGA TAYYOR</> : <><XCircle size={13} /> TAYYOR EMAS</>}
            </span>
          </div>
          <div className="space-y-1.5">
            {checklist.items.map((item) => (
              <div key={item.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: "var(--input-bg)" }}>
                {item.ok
                  ? <CheckCircle2 size={15} style={{ color: "var(--success)" }} />
                  : item.blocking
                    ? <XCircle size={15} style={{ color: "var(--danger)" }} />
                    : <AlertTriangle size={15} style={{ color: "var(--warning)" }} />}
                <span className="text-xs font-semibold flex-1" style={{ color: "var(--text-primary)" }}>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="text-meta font-black tabular-nums" style={{ color: item.blocking ? "var(--danger)" : "var(--warning)" }}>{item.count} ta</span>
                )}
                {item.detail && <span className="text-micro" style={{ color: "var(--text-muted)" }}>{item.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reopen modal */}
      {reopenTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="rounded-xl p-5 w-[420px] max-w-[92vw]" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <h3 className="text-sm font-black mb-1" style={{ color: "var(--text-primary)" }}>
              {reopenTarget.period} oyini qayta ochish
            </h3>
            <p className="text-meta mb-3" style={{ color: "var(--text-muted)" }}>
              Diqqat: shu oy va undan keyingi barcha snapshotlar INVALID bo&apos;ladi — ular qayta yopishda qaytadan hisoblanadi. Sabab majburiy.
            </p>
            <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3}
              placeholder="Qayta ochish sababi..."
              className="w-full rounded-lg p-2.5 text-xs outline-none"
              style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }} />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setReopenTarget(null)} className="px-3.5 py-2 rounded-lg text-xs font-bold" style={{ background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--input-border)" }}>
                Bekor qilish
              </button>
              <button onClick={handleReopen} disabled={!reopenReason.trim() || busy !== null}
                className="px-3.5 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                style={{ background: "var(--warning)", color: "#fff" }}>
                Qayta ochish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
