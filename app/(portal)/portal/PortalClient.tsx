"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatNum, formatUzDate } from "@/lib/format";
import { createClientRequest } from "@/server/portal";

interface Overview { companyName: string; openObligations: number; unpaidInvoices: number; openTickets: number }
interface Obl { id: string; templateName: string; periodKey: string; status: string; dueAt: string; isOverdue: boolean; hasEvidence: boolean }
interface Inv { id: string; period: string; amount: number; paidAmount: number; status: string; dueAt: string | null }
interface Req { id: string; subject: string; message: string; status: string; responseText: string | null; createdAt: string }

const OBL_STATUS: Record<string, string> = { planned: "Rejalashtirilgan", in_progress: "Jarayonda", ready: "Tayyor", sent: "Yuborilgan", accepted: "Qabul qilingan", rejected: "Rad etilgan", cancelled: "Bekor" };
const INV_STATUS: Record<string, string> = { draft: "Qoralama", sent: "Yuborilgan", partial: "Qisman", paid: "To'langan", overdue: "Kechikkan", void: "Bekor" };
const acceptedFg = (s: string) => (s === "accepted" || s === "paid" ? "#15803d" : s === "rejected" || s === "overdue" ? "#b91c1c" : "#1d4ed8");

export default function PortalClient({ overview, obligations, invoices, requests }: { overview: Overview; obligations: Obl[]; invoices: Inv[]; requests: Req[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ subject: "", message: "" });

  const submit = () => {
    if (!form.subject.trim() || !form.message.trim()) return toast.error("Mavzu va matn majburiy");
    start(async () => {
      try { await createClientRequest(form.subject, form.message); toast.success("Murojaat yuborildi"); setForm({ subject: "", message: "" }); router.refresh(); }
      catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });
  };

  const card = "rounded-xl border p-4";
  const border = { borderColor: "var(--border, #e5e7eb)" };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{overview.companyName}</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Xizmat holati, hisob-fakturalar va murojaatlar</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Ochiq majburiyat", val: overview.openObligations },
          { label: "To'lanmagan hisob", val: overview.unpaidInvoices },
          { label: "Ochiq murojaat", val: overview.openTickets },
        ].map((s) => (
          <div key={s.label} className={card} style={border}>
            <div className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>{s.val}</div>
            <div className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Obligations */}
      <section>
        <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>Majburiyatlar</h2>
        <div className="overflow-x-auto rounded-xl border" style={border}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: "var(--bg-hover, #f9fafb)", color: "var(--text-muted)" }}>
              <th className="text-left font-semibold px-3 py-2">Hisobot</th><th className="text-left font-semibold px-3 py-2">Davr</th><th className="text-left font-semibold px-3 py-2">Muddat</th><th className="text-left font-semibold px-3 py-2">Holat</th><th className="text-left font-semibold px-3 py-2">Dalil</th>
            </tr></thead>
            <tbody>
              {obligations.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center" style={{ color: "var(--text-muted)" }}>Majburiyat yo'q.</td></tr>}
              {obligations.map((o) => (
                <tr key={o.id} className="border-t" style={{ borderColor: "var(--border, #f1f5f9)" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text-primary)" }}>{o.templateName}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{o.periodKey}</td>
                  <td className="px-3 py-2" style={{ color: o.isOverdue ? "#b91c1c" : "var(--text-primary)" }}>{formatUzDate(o.dueAt)}</td>
                  <td className="px-3 py-2 font-semibold" style={{ color: acceptedFg(o.status) }}>{OBL_STATUS[o.status] ?? o.status}</td>
                  <td className="px-3 py-2">{o.hasEvidence ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Invoices */}
      <section>
        <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>Hisob-fakturalar</h2>
        <div className="overflow-x-auto rounded-xl border" style={border}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: "var(--bg-hover, #f9fafb)", color: "var(--text-muted)" }}>
              <th className="text-left font-semibold px-3 py-2">Davr</th><th className="text-right font-semibold px-3 py-2">Summa</th><th className="text-right font-semibold px-3 py-2">To'langan</th><th className="text-left font-semibold px-3 py-2">Holat</th>
            </tr></thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={4} className="px-3 py-5 text-center" style={{ color: "var(--text-muted)" }}>Hisob yo'q.</td></tr>}
              {invoices.map((i) => (
                <tr key={i.id} className="border-t" style={{ borderColor: "var(--border, #f1f5f9)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{i.period}</td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-primary)" }}>{formatNum(i.amount)}</td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--text-muted)" }}>{formatNum(i.paidAmount)}</td>
                  <td className="px-3 py-2 font-semibold" style={{ color: acceptedFg(i.status) }}>{INV_STATUS[i.status] ?? i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tickets */}
      <section>
        <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>Murojaatlar</h2>
        <div className={`${card} mb-3 space-y-2`} style={border}>
          <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Mavzu" className="w-full px-2.5 py-1.5 rounded-md border text-sm" style={{ ...border, background: "transparent", color: "var(--text-primary)" }} />
          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Savolingiz..." rows={2} className="w-full px-2.5 py-1.5 rounded-md border text-sm" style={{ ...border, background: "transparent", color: "var(--text-primary)" }} />
          <button disabled={pending} onClick={submit} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#16a34a" }}>Yuborish</button>
        </div>
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className={card} style={border}>
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{r.subject}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: r.status === "answered" ? "#dcfce7" : "#fef3c7", color: r.status === "answered" ? "#15803d" : "#b45309" }}>{r.status === "answered" ? "Javob berilgan" : r.status === "closed" ? "Yopilgan" : "Ochiq"}</span>
              </div>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{r.message}</p>
              {r.responseText && <p className="text-sm mt-2 pl-3 border-l-2" style={{ borderColor: "#16a34a", color: "var(--text-primary)" }}>{r.responseText}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
