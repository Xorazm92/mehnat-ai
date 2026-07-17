"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Company, Staff, Language } from "@/types";
import { FileText, Plus, X, Calendar, ShieldCheck, Download, Trash2, PenLine, Send, CheckCircle2 } from "lucide-react";
import { getFinancialReports, getReportDeadlines, createFinancialReport, setReportStatus, deleteFinancialReport } from "@/server/reports";
import { REPORT_TYPES } from "@/lib/reportTypes";
import { formatUzDayShort, formatNum } from "@/lib/format";

interface Props { companies: Company[]; staff: Staff[]; lang: Language; }

interface Report {
  id: string; companyId: string; companyName: string; type: string; typeLabel: string;
  period: string; status: string; deadline: string | null; assigneeName: string | null;
  fileFormat: string | null; data: { title?: string; lines?: Line[] }; rejectedReason?: string | null;
}
interface Line { label: string; cur: number; prev: number; bold?: boolean; positive?: boolean; }
interface Deadline { id: string; typeLabel: string; companyName: string; deadline: string | null; daysLeft: number | null; status: string; }

const STATUS: Record<string, { label: string; fg: string; bg: string; bd: string }> = {
  preparing: { label: "Tayyorlanmoqda", fg: "var(--warning)", bg: "var(--warning-bg)", bd: "var(--warning-border)" },
  ready: { label: "Tayyor", fg: "var(--accent-blue)", bg: "var(--accent-blue-light)", bd: "var(--accent-blue)" },
  signing: { label: "Imzoda", fg: "var(--accent-indigo)", bg: "var(--accent-indigo-light)", bd: "var(--accent-indigo)" },
  submitted: { label: "Yuborilgan", fg: "var(--success)", bg: "var(--success-bg)", bd: "var(--success-border)" },
  rejected: { label: "Rad etildi", fg: "var(--danger)", bg: "var(--danger-bg)", bd: "var(--danger-border)" },
};
const som = (v: number) => (v < 0 ? "−" : "") + formatNum(Math.abs(Math.round(v)));
const MONTHS_UZ = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentyabr","Oktyabr","Noyabr","Dekabr"];

const HisobotlarModule: React.FC<Props> = ({ companies, staff }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Report | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ companyId: "", type: "profit_loss", period: "2026-H1", deadline: "", assignedTo: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([getFinancialReports(), getReportDeadlines()]);
      setReports(r as unknown as Report[]);
      setDeadlines(d as unknown as Deadline[]);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const advance = async (r: Report) => {
    const next = r.status === "preparing" ? "ready" : r.status === "ready" ? "signing" : r.status === "signing" ? "submitted" : null;
    if (!next) return;
    await setReportStatus(r.id, next);
    await load();
    setViewing((v) => (v && v.id === r.id ? { ...v, status: next } : v));
  };
  const reject = async (r: Report) => {
    const reason = window.prompt("Rad etish sababi:") || "";
    if (!reason) return;
    await setReportStatus(r.id, "rejected", { rejectedReason: reason });
    await load(); setViewing(null);
  };
  const remove = async (id: string) => { if (confirm("Hisobotni o'chirasizmi?")) { await deleteFinancialReport(id); await load(); } };
  const submitCreate = async () => {
    if (!form.companyId) { alert("Firmani tanlang"); return; }
    await createFinancialReport({ companyId: form.companyId, type: form.type, period: form.period, deadline: form.deadline || null, assignedTo: form.assignedTo || null });
    setCreating(false); setForm({ companyId: "", type: "profit_loss", period: "2026-H1", deadline: "", assignedTo: "" });
    await load();
  };

  // calendar (current month) with deadline markers
  const cal = useMemo(() => {
    const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
    const first = new Date(y, m, 1); const startDow = (first.getDay() + 6) % 7; // Mon=0
    const days = new Date(y, m + 1, 0).getDate();
    const marks = new Map<number, string>();
    for (const d of deadlines) { if (!d.deadline) continue; const dd = new Date(d.deadline); if (dd.getMonth() === m && dd.getFullYear() === y) marks.set(dd.getDate(), d.status); }
    return { y, m, startDow, days, marks, today: now.getDate() };
  }, [deadlines]);

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 rounded-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))" }}><FileText size={20} /></div>
          <div>
            <h2 className="text-[15px] font-bold leading-none" style={{ color: "var(--text-primary)" }}>Moliyaviy hisobotlar</h2>
            <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--text-muted)" }}>{reports.length} ta hisobot · {reports.filter(r => r.status !== "submitted").length} tasi jarayonda</p>
          </div>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2"><Plus size={15} /> Yangi hisobot</button>
      </div>

      {/* Deadline cards */}
      {deadlines.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {deadlines.slice(0, 3).map((d) => {
            const done = d.status === "submitted";
            const urgent = (d.daysLeft ?? 99) <= 5;
            const c = done ? STATUS.submitted : urgent ? STATUS.rejected : STATUS.ready;
            return (
              <div key={d.id} className="p-4 rounded-xl" style={{ background: c.bg, border: `1px solid ${c.bd}` }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: c.fg }}>{done ? "Bajarildi" : d.daysLeft == null ? "Muddat" : d.daysLeft < 0 ? `${Math.abs(d.daysLeft)} kun kechikdi` : d.daysLeft === 0 ? "Bugun oxirgi kun" : `${d.daysLeft} kun qoldi`}</p>
                <p className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{d.typeLabel}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{d.companyName}{d.deadline ? ` · ${formatUzDayShort(d.deadline)}` : ""}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Report list */}
        <div className="xl:col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: 640 }}>
              <thead>
                <tr className="text-[9px] font-bold uppercase tracking-widest" style={{ background: "var(--table-header-bg)", color: "var(--text-muted)", borderBottom: "1px solid var(--card-border)" }}>
                  {["Hisobot", "Davr", "Mas'ul", "Holat", "Muddat", "Fayl"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Yuklanmoqda…</td></tr>
                ) : reports.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center"><FileText size={30} className="mx-auto mb-2 opacity-30" style={{ color: "var(--text-muted)" }} /><p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Hisobot yo&apos;q — &quot;Yangi hisobot&quot; bilan qo&apos;shing</p></td></tr>
                ) : reports.map((r) => {
                  const s = STATUS[r.status] ?? STATUS.preparing;
                  const days = r.deadline ? Math.ceil((new Date(r.deadline).getTime() - Date.now()) / 86400000) : null;
                  return (
                    <tr key={r.id} className="transition-colors cursor-pointer" style={{ borderBottom: "1px solid var(--card-border)" }} onClick={() => setViewing(r)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--table-row-hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td className="px-4 py-3"><p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{r.typeLabel}</p><p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{r.companyName}</p></td>
                      <td className="px-4 py-3 text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>{r.period}</td>
                      <td className="px-4 py-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>{r.assigneeName || "—"}</td>
                      <td className="px-4 py-3"><span className="text-[9px] font-bold px-2 py-1 rounded uppercase" style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}` }}>{s.label}</span></td>
                      <td className="px-4 py-3 text-[11px] font-bold" style={{ color: days != null && days <= 5 && r.status !== "submitted" ? "var(--danger)" : "var(--text-muted)" }}>{r.deadline ? formatUzDayShort(r.deadline) : "—"}{days != null && days >= 0 && r.status !== "submitted" ? ` · ${days} kun` : ""}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: "var(--accent-blue)" }}><Download size={11} /> {r.fileFormat || "PDF"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deadline calendar */}
        <div className="rounded-xl p-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center gap-2 mb-4"><Calendar size={16} style={{ color: "var(--accent-blue)" }} /><h3 className="text-[12px] font-bold uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>{MONTHS_UZ[cal.m]} {cal.y}</h3></div>
          <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold mb-1" style={{ color: "var(--text-muted)" }}>{["Du","Se","Ch","Pa","Ju","Sh","Ya"].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: cal.startDow }).map((_, i) => <span key={"e" + i} />)}
            {Array.from({ length: cal.days }).map((_, i) => {
              const day = i + 1; const mark = cal.marks.get(day); const isToday = day === cal.today;
              const col = mark === "submitted" ? "var(--success)" : mark ? "var(--danger)" : null;
              return (
                <div key={day} className="aspect-square flex items-center justify-center rounded-lg text-[11px] font-bold relative"
                  style={{ background: isToday ? "var(--accent-blue)" : mark ? (col + "22") : "transparent", color: isToday ? "#fff" : mark ? col! : "var(--text-secondary)", border: mark && !isToday ? `1px solid ${col}` : "1px solid transparent" }}>
                  {day}
                  {mark && !isToday && <span className="absolute bottom-1 w-1 h-1 rounded-full" style={{ background: col! }} />}
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 space-y-1.5" style={{ borderTop: "1px solid var(--card-border)" }}>
            {deadlines.slice(0, 4).map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-[10px]"><span className="w-1.5 h-1.5 rounded-full" style={{ background: d.status === "submitted" ? "var(--success)" : "var(--danger)" }} /><span className="font-bold" style={{ color: "var(--text-secondary)" }}>{d.deadline ? formatUzDayShort(d.deadline) : "—"}</span><span style={{ color: "var(--text-muted)" }}>— {d.typeLabel}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* Viewer modal */}
      {viewing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setViewing(null)}>
          <div className="w-full max-w-xl rounded-2xl overflow-hidden animate-scale-in max-h-[90vh] flex flex-col" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-start justify-between" style={{ borderBottom: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
              <div>
                <h3 className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>{viewing.data?.title || viewing.typeLabel}</h3>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{viewing.companyName} · {viewing.period}</p>
              </div>
              <button onClick={() => setViewing(null)} style={{ color: "var(--text-muted)" }}><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {(viewing.data?.lines || []).length === 0 && (
                <div className="text-center py-10">
                  <FileText size={28} className="mx-auto mb-2 opacity-30" style={{ color: "var(--text-muted)" }} />
                  <p className="text-[12px] font-bold" style={{ color: "var(--text-secondary)" }}>Hisobot satrlari hali kiritilmagan</p>
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Raqamlar buxgalteriya tizimidan yuklanadi yoki mas&apos;ul xodim tomonidan kiritiladi.</p>
                </div>
              )}
              {(viewing.data?.lines || []).length > 0 && (
              <table className="w-full text-[12px]">
                <thead><tr className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}><th className="text-left pb-2">Ko&apos;rsatkich</th><th className="text-right pb-2">{viewing.period}</th><th className="text-right pb-2">O&apos;tgan</th><th className="text-right pb-2">Δ</th></tr></thead>
                <tbody>
                  {(viewing.data?.lines || []).map((l, i) => {
                    const delta = l.prev ? Math.round(((l.cur - l.prev) / Math.abs(l.prev)) * 1000) / 10 : null;
                    return (
                      <tr key={i} style={{ borderTop: "1px solid var(--card-border)" }}>
                        <td className={`py-2 ${l.bold ? "font-bold" : ""}`} style={{ color: l.bold ? "var(--text-primary)" : "var(--text-secondary)" }}>{l.label}</td>
                        <td className={`py-2 text-right tabular-nums ${l.bold ? "font-bold" : ""}`} style={{ color: l.positive ? "var(--success)" : "var(--text-primary)" }}>{som(l.cur)}</td>
                        <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{som(l.prev)}</td>
                        <td className="py-2 text-right tabular-nums font-bold" style={{ color: delta == null ? "var(--text-muted)" : delta >= 0 ? "var(--success)" : "var(--danger)" }}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
              {viewing.status === "signing" && (
                <div className="mt-5 p-4 rounded-xl" style={{ background: "var(--accent-blue-light)", border: "1px solid var(--accent-blue)" }}>
                  <div className="flex items-center gap-2"><ShieldCheck size={16} style={{ color: "var(--accent-blue)" }} /><p className="text-[12px] font-bold" style={{ color: "var(--accent-blue)" }}>Imzolash bosqichida</p></div>
                  <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>E-imzo integratsiyasi hali ulanmagan — hujjat Soliq.uz kabinetida imzolanadi, so&apos;ng bu yerda &quot;yuborilgan&quot; deb belgilanadi.</p>
                </div>
              )}
              {viewing.rejectedReason && <p className="mt-4 text-[11px] font-bold" style={{ color: "var(--danger)" }}>Rad sababi: {viewing.rejectedReason}</p>}
            </div>
            <div className="p-4 flex gap-3 flex-wrap" style={{ borderTop: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
              {viewing.status !== "submitted" && viewing.status !== "rejected" && (
                <button onClick={() => advance(viewing)} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {viewing.status === "preparing" ? <><CheckCircle2 size={15} /> Tayyor deb belgilash</> : viewing.status === "ready" ? <><PenLine size={15} /> Imzolashga yuborish</> : <><Send size={15} /> Imzolash va yuborish</>}
                </button>
              )}
              {viewing.status !== "submitted" && <button onClick={() => reject(viewing)} className="btn-secondary" style={{ color: "var(--danger)" }}>Rad etish</button>}
              <button onClick={() => remove(viewing.id)} className="btn-secondary"><Trash2 size={14} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setCreating(false)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden animate-scale-in" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
              <h3 className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>Yangi hisobot · shablondan</h3>
              <button onClick={() => setCreating(false)} style={{ color: "var(--text-muted)" }}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(REPORT_TYPES).map(([k, v]) => (
                  <button key={k} onClick={() => setForm((f) => ({ ...f, type: k }))} className="text-left p-3 rounded-xl transition-all" style={{ background: form.type === k ? "var(--accent-blue-light)" : "var(--input-bg)", border: `1px solid ${form.type === k ? "var(--accent-blue)" : "var(--card-border)"}` }}>
                    <p className="text-[12px] font-bold" style={{ color: form.type === k ? "var(--accent-blue)" : "var(--text-primary)" }}>{v.label}</p>
                    <p className="text-[9px] uppercase font-bold" style={{ color: "var(--text-muted)" }}>{v.format}</p>
                  </button>
                ))}
              </div>
              <div><label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: "var(--text-muted)" }}>Firma</label>
                <select className="erp-input font-bold" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                  <option value="">Tanlang…</option>{companies.slice(0, 300).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: "var(--text-muted)" }}>Davr</label>
                  <input className="erp-input font-bold" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="2026-H1" /></div>
                <div><label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: "var(--text-muted)" }}>Muddat</label>
                  <input type="date" className="erp-input font-bold" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
              </div>
              <div><label className="text-[9px] font-bold uppercase tracking-widest mb-1 block" style={{ color: "var(--text-muted)" }}>Mas&apos;ul</label>
                <select className="erp-input font-bold" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
                  <option value="">—</option>{staff.slice(0, 200).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="p-4 flex gap-3" style={{ borderTop: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
              <button onClick={() => setCreating(false)} className="btn-secondary flex-1">Bekor qilish</button>
              <button onClick={submitCreate} className="btn-primary flex-1">Yaratish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HisobotlarModule;
