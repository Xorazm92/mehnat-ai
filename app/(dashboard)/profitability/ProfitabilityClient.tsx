"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatNum } from "@/lib/format";
import { getMarginOverview, type CompanyMargin } from "@/server/profitability";
import { getInvoices, createInvoice, recordInvoicePayment, voidInvoice } from "@/server/invoices";

interface Invoice {
  id: string;
  companyId: string;
  company: { name: string };
  period: string;
  amount: string;
  paidAmount: string;
  status: string;
  dueAt: string | null;
}

const money = (n: number) => formatNum(Math.round(n));
const INV_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Qoralama", bg: "#e5e7eb", fg: "#374151" },
  sent: { label: "Yuborilgan", bg: "#dbeafe", fg: "#1d4ed8" },
  partial: { label: "Qisman", bg: "#fef3c7", fg: "#b45309" },
  paid: { label: "To'langan", bg: "#dcfce7", fg: "#15803d" },
  overdue: { label: "Kechikkan", bg: "#fee2e2", fg: "#b91c1c" },
  void: { label: "Bekor", bg: "#f3f4f6", fg: "#9ca3af" },
};

export default function ProfitabilityClient({ initialPeriod, initialMargins, initialInvoices }: { initialPeriod: string; initialMargins: CompanyMargin[]; initialInvoices: Invoice[] }) {
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState(initialPeriod);
  const [margins, setMargins] = useState<CompanyMargin[]>(initialMargins);
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [inv, setInv] = useState({ companyId: "", amount: "", dueAt: "", notes: "" });
  const [payInput, setPayInput] = useState<Record<string, string>>({});

  const reload = (p: string) =>
    start(async () => {
      try {
        const [m, i] = await Promise.all([getMarginOverview(p), getInvoices({ period: p })]);
        setMargins(JSON.parse(JSON.stringify(m)));
        setInvoices(JSON.parse(JSON.stringify(i)));
        setPeriod(p);
      } catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try { await fn(); toast.success(ok); const [m, i] = await Promise.all([getMarginOverview(period), getInvoices({ period })]); setMargins(JSON.parse(JSON.stringify(m))); setInvoices(JSON.parse(JSON.stringify(i))); }
      catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });

  const totals = useMemo(() => margins.reduce((a, m) => ({ revenue: a.revenue + m.revenue, laborCost: a.laborCost + m.laborCost, margin: a.margin + m.margin, debt: a.debt + m.debt }), { revenue: 0, laborCost: 0, margin: 0, debt: 0 }), [margins]);

  const submitInvoice = () => {
    if (!inv.companyId) return toast.error("Firma tanlang");
    if (!(Number(inv.amount) > 0)) return toast.error("Summa musbat bo'lishi kerak");
    run(() => createInvoice({ companyId: inv.companyId, period, amount: Number(inv.amount), dueAt: inv.dueAt || undefined, notes: inv.notes || undefined }), "Hisob chiqarildi");
    setInv({ companyId: "", amount: "", dueAt: "", notes: "" });
  };

  const inputStyle = { borderColor: "var(--border, #e5e7eb)", background: "transparent", color: "var(--text-primary)" };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Rentabellik</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Mijoz contribution margin (tushum − mehnat tannarxi) + qarzdorlik</p>
        </div>
        <input type="month" value={period} onChange={(e) => e.target.value && reload(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" style={inputStyle} />
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Tushum", val: totals.revenue, fg: "#15803d" },
          { label: "Mehnat tannarxi", val: totals.laborCost, fg: "#b45309" },
          { label: "Margin", val: totals.margin, fg: totals.margin < 0 ? "#b91c1c" : "#15803d" },
          { label: "Qarzdorlik", val: totals.debt, fg: "#b91c1c" },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border p-3" style={{ borderColor: "var(--border, #e5e7eb)" }}>
            <div className="text-lg font-black" style={{ color: t.fg }}>{money(t.val)}</div>
            <div className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Margin table */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, #e5e7eb)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-hover, #f9fafb)", color: "var(--text-muted)" }}>
              <th className="text-left font-semibold px-3 py-2.5">Firma</th>
              <th className="text-right font-semibold px-3 py-2.5">Tushum</th>
              <th className="text-right font-semibold px-3 py-2.5">Mehnat</th>
              <th className="text-right font-semibold px-3 py-2.5">Margin</th>
              <th className="text-right font-semibold px-3 py-2.5">%</th>
              <th className="text-right font-semibold px-3 py-2.5">Qarz</th>
            </tr>
          </thead>
          <tbody>
            {margins.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>Ma'lumot yo'q.</td></tr>}
            {margins.map((m) => (
              <tr key={m.companyId} className="border-t" style={{ borderColor: "var(--border, #f1f5f9)" }}>
                <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{m.companyName}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: "var(--text-primary)" }}>{money(m.revenue)}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: "var(--text-muted)" }}>{money(m.laborCost)}</td>
                <td className="px-3 py-2.5 text-right font-bold" style={{ color: m.margin < 0 ? "#b91c1c" : "#15803d" }}>{money(m.margin)}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: m.margin < 0 ? "#b91c1c" : "var(--text-muted)" }}>{m.marginPct == null ? "—" : `${Math.round(m.marginPct)}%`}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: m.debt > 0 ? "#b91c1c" : "var(--text-muted)" }}>{money(m.debt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invoices */}
      <div>
        <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>Hisob-fakturalar ({period})</h2>
        <div className="rounded-xl border p-4 flex flex-wrap items-end gap-3 mb-3" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Firma
            <select className="block px-2.5 py-1.5 rounded-md border text-sm" style={inputStyle} value={inv.companyId} onChange={(e) => setInv({ ...inv, companyId: e.target.value })}>
              <option value="">—</option>
              {margins.map((m) => <option key={m.companyId} value={m.companyId}>{m.companyName}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Summa
            <input type="number" className="block px-2.5 py-1.5 rounded-md border text-sm" style={inputStyle} value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} />
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Muddat
            <input type="date" className="block px-2.5 py-1.5 rounded-md border text-sm" style={inputStyle} value={inv.dueAt} onChange={(e) => setInv({ ...inv, dueAt: e.target.value })} />
          </label>
          <button disabled={pending} onClick={submitInvoice} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#16a34a" }}>+ Hisob chiqarish</button>
        </div>

        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, #f9fafb)", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold px-3 py-2.5">Firma</th>
                <th className="text-right font-semibold px-3 py-2.5">Summa</th>
                <th className="text-right font-semibold px-3 py-2.5">To'langan</th>
                <th className="text-left font-semibold px-3 py-2.5">Holat</th>
                <th className="text-right font-semibold px-3 py-2.5">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>Hisob yo'q.</td></tr>}
              {invoices.map((i) => {
                const s = INV_STATUS[i.status] ?? INV_STATUS.sent;
                return (
                  <tr key={i.id} className="border-t" style={{ borderColor: "var(--border, #f1f5f9)" }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{i.company.name}</td>
                    <td className="px-3 py-2.5 text-right" style={{ color: "var(--text-primary)" }}>{money(Number(i.amount))}</td>
                    <td className="px-3 py-2.5 text-right" style={{ color: "var(--text-muted)" }}>{money(Number(i.paidAmount))}</td>
                    <td className="px-3 py-2.5"><span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: s.bg, color: s.fg }}>{s.label}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {i.status !== "paid" && i.status !== "void" && (
                          <>
                            <input type="number" placeholder="to'lov" value={payInput[i.id] ?? ""} onChange={(e) => setPayInput({ ...payInput, [i.id]: e.target.value })} className="w-20 text-xs px-1.5 py-1 rounded-md border" style={inputStyle} />
                            <button disabled={pending} onClick={() => { const a = Number(payInput[i.id]); if (!(a > 0)) return toast.error("Summa kiriting"); run(() => recordInvoicePayment(i.id, a), "To'lov qayd etildi"); setPayInput({ ...payInput, [i.id]: "" }); }} className="text-xs font-semibold px-2 py-1 rounded-md text-white disabled:opacity-50" style={{ background: "#2563eb" }}>To'lov</button>
                            <button disabled={pending} onClick={() => run(() => voidInvoice(i.id, "bekor"), "Bekor qilindi")} className="text-xs font-semibold px-2 py-1 rounded-md disabled:opacity-50" style={{ background: "#fee2e2", color: "#b91c1c" }}>Bekor</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
