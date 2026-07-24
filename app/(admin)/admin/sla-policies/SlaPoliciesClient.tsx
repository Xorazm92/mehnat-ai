"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSlaPolicy, setSlaPolicyActive } from "@/server/slaPolicies";

interface Policy {
  id: string;
  name: string;
  taskType: string | null;
  responseMinutes: number | null;
  resolutionMinutes: number | null;
  businessHoursOnly: boolean;
  active: boolean;
  _count: { tasks: number; breaches: number };
}

const EMPTY = { name: "", taskType: "", responseMinutes: "", resolutionMinutes: "", businessHoursOnly: false };
const fmtMin = (m: number | null) => (m == null ? "—" : m % 60 === 0 ? `${m / 60}s` : `${m}daq`);

export default function SlaPoliciesClient({ initial }: { initial: Policy[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ ...EMPTY });

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try { await fn(); toast.success(ok); router.refresh(); }
      catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });

  const submit = () => {
    if (!f.name.trim()) return toast.error("Nom majburiy");
    run(() => createSlaPolicy({
      name: f.name,
      taskType: f.taskType || null,
      responseMinutes: f.responseMinutes ? Number(f.responseMinutes) : null,
      resolutionMinutes: f.resolutionMinutes ? Number(f.resolutionMinutes) : null,
      businessHoursOnly: f.businessHoursOnly,
    }), "SLA siyosati yaratildi");
    setF({ ...EMPTY });
  };

  const input = "px-2.5 py-1.5 rounded-lg border text-sm w-full";
  const inputStyle = { borderColor: "var(--border, var(--rule))", background: "transparent", color: "var(--text-primary)" };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>SLA siyosatlari</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Vazifa javob (response) va yechim (resolution) muddatlari. taskType bo'yicha (bo'sh = default).</p>
      </div>

      <div className="rounded-xl border p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end" style={{ borderColor: "var(--border, var(--rule))" }}>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Nom
          <input className={input} style={inputStyle} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Task turi (ixt.)
          <input className={input} style={inputStyle} value={f.taskType} onChange={(e) => setF({ ...f, taskType: e.target.value })} placeholder="default" />
        </label>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Javob (daqiqa)
          <input type="number" className={input} style={inputStyle} value={f.responseMinutes} onChange={(e) => setF({ ...f, responseMinutes: e.target.value })} />
        </label>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Yechim (daqiqa)
          <input type="number" className={input} style={inputStyle} value={f.resolutionMinutes} onChange={(e) => setF({ ...f, resolutionMinutes: e.target.value })} />
        </label>
        <button disabled={pending} onClick={submit} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--success)" }}>+ Yaratish</button>
      </div>

      {initial.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: "var(--border, var(--rule))", color: "var(--text-muted)" }}>SLA siyosati yo'q. Yarating — yangi vazifalar taskType bo'yicha avtomatik muddat oladi.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, var(--rule))" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold px-3 py-2.5">Nom</th>
                <th className="text-left font-semibold px-3 py-2.5">Task turi</th>
                <th className="text-left font-semibold px-3 py-2.5">Javob</th>
                <th className="text-left font-semibold px-3 py-2.5">Yechim</th>
                <th className="text-left font-semibold px-3 py-2.5">Holat</th>
                <th className="text-right font-semibold px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {initial.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border, var(--bg-sunken))" }}>
                  <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{p.name}<div className="text-meta" style={{ color: "var(--text-muted)" }}>{p._count.tasks} vazifa · {p._count.breaches} buzilish</div></td>
                  <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{p.taskType ?? "default"}</td>
                  <td className="px-3 py-2.5" style={{ color: "var(--text-primary)" }}>{fmtMin(p.responseMinutes)}</td>
                  <td className="px-3 py-2.5" style={{ color: "var(--text-primary)" }}>{fmtMin(p.resolutionMinutes)}</td>
                  <td className="px-3 py-2.5"><span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: p.active ? "var(--success-bg)" : "var(--bg-sunken)", color: p.active ? "var(--success)" : "var(--text-muted)" }}>{p.active ? "faol" : "o'chiq"}</span></td>
                  <td className="px-3 py-2.5 text-right">
                    <button disabled={pending} onClick={() => run(() => setSlaPolicyActive(p.id, !p.active), p.active ? "O'chirildi" : "Faollashtirildi")} className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-primary)" }}>{p.active ? "O'chirish" : "Faollashtirish"}</button>
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
