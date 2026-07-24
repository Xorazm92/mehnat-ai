"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatNum } from "@/lib/format";
import { formatUzDate } from "@/lib/format";
import { setCostRate, removeCostRate } from "@/server/costRates";

interface Rate {
  id: string;
  userId: string;
  hourlyRate: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
}
interface UserLite { id: string; fullName: string }

export default function CostRatesClient({ rates, users }: { rates: Rate[]; users: UserLite[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ userId: "", hourlyRate: "", effectiveFrom: new Date().toISOString().slice(0, 10), note: "" });
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.fullName])), [users]);

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try { await fn(); toast.success(ok); router.refresh(); }
      catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });

  const submit = () => {
    if (!f.userId) return toast.error("Xodim tanlang");
    if (!(Number(f.hourlyRate) > 0)) return toast.error("Stavka musbat bo'lishi kerak");
    run(() => setCostRate(f.userId, Number(f.hourlyRate), f.effectiveFrom, f.note || undefined), "Stavka o'rnatildi");
    setF({ ...f, hourlyRate: "", note: "" });
  };

  const input = "px-2.5 py-1.5 rounded-lg border text-sm w-full";
  const inputStyle = { borderColor: "var(--border, var(--rule))", background: "transparent", color: "var(--text-primary)" };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Xodim tannarxi</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>To'liq soatlik qiymat (oylik + soliq + overhead). Effective-dated — yangi stavka avvalgini yopadi. Rentabellik (Faza D) shundan hisoblanadi.</p>
      </div>

      <div className="rounded-xl border p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end" style={{ borderColor: "var(--border, var(--rule))" }}>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Xodim
          <select className={input} style={inputStyle} value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
            <option value="">—</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Soatlik (so'm)
          <input type="number" className={input} style={inputStyle} value={f.hourlyRate} onChange={(e) => setF({ ...f, hourlyRate: e.target.value })} />
        </label>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Kuchga kirish
          <input type="date" className={input} style={inputStyle} value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
        </label>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Izoh (ixt.)
          <input className={input} style={inputStyle} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <button disabled={pending} onClick={submit} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--success)" }}>O'rnatish</button>
      </div>

      {rates.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: "var(--border, var(--rule))", color: "var(--text-muted)" }}>Stavka yo'q. Xodimlarga soatlik qiymat o'rnating.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, var(--rule))" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold px-3 py-2.5">Xodim</th>
                <th className="text-right font-semibold px-3 py-2.5">Soatlik (so'm)</th>
                <th className="text-left font-semibold px-3 py-2.5">Davr</th>
                <th className="text-left font-semibold px-3 py-2.5">Izoh</th>
                <th className="text-right font-semibold px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border, var(--bg-sunken))" }}>
                  <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{nameOf.get(r.userId) ?? "?"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-primary)" }}>{formatNum(Number(r.hourlyRate))}</td>
                  <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                    {formatUzDate(r.effectiveFrom)} – {r.effectiveTo ? formatUzDate(r.effectiveTo) : <span style={{ color: "var(--success)", fontWeight: 700 }}>hozir</span>}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{r.note ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button disabled={pending} onClick={() => run(() => removeCostRate(r.id), "O'chirildi")} className="text-xs font-semibold px-2 py-1 rounded-lg disabled:opacity-50" style={{ background: "var(--danger-bg)", color: "var(--danger-dark)" }}>O'chirish</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
