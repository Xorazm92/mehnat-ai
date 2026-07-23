"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatUzDate } from "@/lib/format";
import { createClientUser, setClientUserActive, respondClientRequest } from "@/server/clientUsers";

interface Client { id: string; email: string; fullName: string; isActive: boolean; company: { name: string }; createdAt: string }
interface Req { id: string; subject: string; message: string; status: string; responseText: string | null; company: { name: string }; createdAt: string }
interface Company { id: string; name: string; inn: string }

export default function ClientUsersClient({ clients, requests, companies }: { clients: Client[]; requests: Req[]; companies: Company[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ companyId: "", email: "", fullName: "" });
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null);
  const [resp, setResp] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try { await fn(); toast.success(ok); router.refresh(); }
      catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });

  const submit = () => {
    if (!f.companyId || !f.email.trim() || !f.fullName.trim()) return toast.error("Firma, email, ism majburiy");
    start(async () => {
      try {
        const res = await createClientUser(f.companyId, f.email, f.fullName);
        setCred({ email: res.email, password: res.password });
        setF({ companyId: "", email: "", fullName: "" });
        toast.success("Mijoz hisobi yaratildi");
        router.refresh();
      } catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });
  };

  const input = "px-2.5 py-1.5 rounded-md border text-sm";
  const inputStyle = { borderColor: "var(--border, #e5e7eb)", background: "transparent", color: "var(--text-primary)" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Mijoz kabineti</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Mijoz portal hisoblari va murojaatlar</p>
      </div>

      {/* Create client */}
      <div className="rounded-xl border p-4 flex flex-wrap items-end gap-3" style={inputStyle}>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Firma
          <select className={`block ${input} min-w-[180px]`} style={inputStyle} value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.inn})</option>)}
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Email
          <input className={`block ${input}`} style={inputStyle} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Ism
          <input className={`block ${input}`} style={inputStyle} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        </label>
        <button disabled={pending} onClick={submit} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#16a34a" }}>+ Hisob yaratish</button>
      </div>

      {cred && (
        <div className="rounded-xl border-2 p-4" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
          <div className="text-sm font-bold" style={{ color: "#b45309" }}>⚠️ Parol faqat HOZIR ko'rsatiladi — mijozga bering</div>
          <div className="mt-1 text-sm" style={{ color: "#92400e" }}>Login: <code>{cred.email}</code> · Parol: <code className="font-bold">{cred.password}</code></div>
          <button onClick={() => { navigator.clipboard?.writeText(`Login: ${cred.email}\nParol: ${cred.password}`); toast.success("Nusxalandi"); }} className="mt-2 px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: "#f59e0b" }}>Nusxalash</button>
          <button onClick={() => setCred(null)} className="mt-2 ml-2 px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: "#e5e7eb" }}>Yashirish</button>
        </div>
      )}

      {/* Client accounts */}
      <section>
        <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>Hisoblar</h2>
        <div className="overflow-x-auto rounded-xl border" style={inputStyle}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: "var(--bg-hover, #f9fafb)", color: "var(--text-muted)" }}>
              <th className="text-left font-semibold px-3 py-2">Firma</th><th className="text-left font-semibold px-3 py-2">Login</th><th className="text-left font-semibold px-3 py-2">Ism</th><th className="text-left font-semibold px-3 py-2">Holat</th><th className="text-right font-semibold px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {clients.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center" style={{ color: "var(--text-muted)" }}>Hisob yo'q.</td></tr>}
              {clients.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border, #f1f5f9)" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text-primary)" }}>{c.company.name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{c.email}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{c.fullName}</td>
                  <td className="px-3 py-2"><span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: c.isActive ? "#dcfce7" : "#f3f4f6", color: c.isActive ? "#15803d" : "#9ca3af" }}>{c.isActive ? "faol" : "o'chiq"}</span></td>
                  <td className="px-3 py-2 text-right"><button disabled={pending} onClick={() => run(() => setClientUserActive(c.id, !c.isActive), "Yangilandi")} className="text-xs font-semibold px-2 py-1 rounded-md disabled:opacity-50" style={{ background: "var(--bg-hover, #f3f4f6)", color: "var(--text-primary)" }}>{c.isActive ? "O'chirish" : "Faollashtirish"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Requests */}
      <section>
        <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>Murojaatlar</h2>
        <div className="space-y-2">
          {requests.length === 0 && <div className="text-sm" style={{ color: "var(--text-muted)" }}>Murojaat yo'q.</div>}
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl border p-4" style={inputStyle}>
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{r.company.name} — {r.subject}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: r.status === "answered" ? "#dcfce7" : "#fef3c7", color: r.status === "answered" ? "#15803d" : "#b45309" }}>{r.status}</span>
              </div>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{r.message}</p>
              {r.responseText ? (
                <p className="text-sm mt-2 pl-3 border-l-2" style={{ borderColor: "#16a34a", color: "var(--text-primary)" }}>{r.responseText}</p>
              ) : (
                <div className="flex gap-2 mt-2">
                  <input value={resp[r.id] ?? ""} onChange={(e) => setResp({ ...resp, [r.id]: e.target.value })} placeholder="Javob..." className={`flex-1 ${input}`} style={inputStyle} />
                  <button disabled={pending} onClick={() => { const t = resp[r.id]; if (!t?.trim()) return toast.error("Javob kiriting"); run(() => respondClientRequest(r.id, t), "Javob yuborildi"); }} className="px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-50" style={{ background: "#2563eb" }}>Javob berish</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
