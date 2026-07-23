"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatUzDateTime } from "@/lib/format";
import {
  createOneCConnection,
  setOneCConnectionActive,
  createOneCMapping,
  removeOneCMapping,
} from "@/server/oneCConnections";

interface Mapping {
  id: string;
  externalOrgId: string;
  company: { name: string };
  companyId: string;
  active: boolean;
}
interface Connection {
  id: string;
  name: string;
  active: boolean;
  lastSeenAt: string | null;
  _count: { events: number; syncRuns: number };
  mappings: Mapping[];
}
interface Overview {
  byStatus: { status: string; _count: { _all: number } }[];
  recentErrors: { id: string; message: string; createdAt: string; connectionId: string | null }[];
  recentRuns: { id: string; status: string; startedAt: string; eventsReceived: number }[];
}
interface Company {
  id: string;
  name: string;
  inn: string;
}

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  received: { label: "Qabul qilingan", bg: "#e5e7eb", fg: "#374151" },
  processing: { label: "Ishlanmoqda", bg: "#dbeafe", fg: "#1d4ed8" },
  processed: { label: "Ishlangan", bg: "#dcfce7", fg: "#15803d" },
  failed: { label: "Xato", bg: "#fef3c7", fg: "#b45309" },
  dead: { label: "DLQ (o'lik)", bg: "#fee2e2", fg: "#b91c1c" },
};
const STATUS_ORDER = ["received", "processing", "processed", "failed", "dead"];

export default function Integration1CClient({ connections, overview, companies }: { connections: Connection[]; overview: Overview; companies: Company[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [mapForm, setMapForm] = useState<Record<string, { org: string; companyId: string }>>({});

  const statusCount = (s: string) => overview.byStatus.find((b) => b.status === s)?._count._all ?? 0;

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message || "Xatolik");
      }
    });

  const addConnection = () => {
    if (!newName.trim()) return toast.error("Nom majburiy");
    start(async () => {
      try {
        const res = await createOneCConnection(newName);
        setNewToken({ name: res.name, token: res.token });
        setNewName("");
        toast.success("Ulanish yaratildi");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message || "Xatolik");
      }
    });
  };

  const inputStyle = { borderColor: "var(--border, #e5e7eb)", background: "transparent", color: "var(--text-primary)" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>1C integratsiya</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Agent ulanishlari, firma mapping va sync holati (1C→ASRO, bir yo'nalish)</p>
      </div>

      {/* Sync overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STATUS_ORDER.map((s) => {
          const m = STATUS_META[s];
          return (
            <div key={s} className="rounded-xl border p-3" style={{ borderColor: "var(--border, #e5e7eb)" }}>
              <div className="text-2xl font-black" style={{ color: m.fg }}>{statusCount(s)}</div>
              <div className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* Recent errors (DLQ) */}
      {overview.recentErrors.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <div className="text-sm font-bold mb-2" style={{ color: "#b91c1c" }}>Oxirgi sync xatolar</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {overview.recentErrors.map((e) => (
              <div key={e.id} className="text-xs flex justify-between gap-3" style={{ color: "var(--text-muted)" }}>
                <span className="truncate">{e.message}</span>
                <span className="shrink-0">{formatUzDateTime(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New connection */}
      <div className="rounded-xl border p-4 flex flex-wrap items-end gap-3" style={{ borderColor: "var(--border, #e5e7eb)" }}>
        <label className="text-xs flex-1 min-w-[200px]" style={{ color: "var(--text-muted)" }}>Yangi agent ulanishi nomi
          <input className="block px-2.5 py-1.5 rounded-md border text-sm w-full" style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ASRO agent — 1-baza" />
        </label>
        <button disabled={pending} onClick={addConnection} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#16a34a" }}>+ Ulanish yaratish</button>
      </div>

      {/* Token reveal — bir marta */}
      {newToken && (
        <div className="rounded-xl border-2 p-4" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
          <div className="text-sm font-bold" style={{ color: "#b45309" }}>⚠️ Token faqat HOZIR ko'rsatiladi — nusxalab saqlang (qayta ko'rsatilmaydi)</div>
          <div className="text-xs mt-1" style={{ color: "#92400e" }}>{newToken.name} · agent uni <code>X-ASRO-Agent-Token</code> sarlavhasida yuboradi</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 px-2 py-1.5 rounded bg-white border text-xs break-all" style={{ borderColor: "#f59e0b" }}>{newToken.token}</code>
            <button onClick={() => { navigator.clipboard?.writeText(newToken.token); toast.success("Nusxalandi"); }} className="px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: "#f59e0b" }}>Nusxalash</button>
            <button onClick={() => setNewToken(null)} className="px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: "#e5e7eb" }}>Yashirish</button>
          </div>
        </div>
      )}

      {/* Connections + mappings */}
      {connections.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--text-muted)" }}>
          Hozircha ulanish yo'q. Agent uchun ulanish yarating, so'ng 1C tashkilotlarini firmalarga bog'lang.
        </div>
      ) : (
        connections.map((c) => {
          const mf = mapForm[c.id] ?? { org: "", companyId: "" };
          return (
            <div key={c.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border, #e5e7eb)" }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-bold" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                  <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded" style={{ background: c.active ? "#dcfce7" : "#f3f4f6", color: c.active ? "#15803d" : "#9ca3af" }}>{c.active ? "faol" : "o'chiq"}</span>
                  <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>{c._count.events} hodisa · {c._count.syncRuns} sync · {c.lastSeenAt ? `oxirgi: ${formatUzDateTime(c.lastSeenAt)}` : "hech qachon"}</span>
                </div>
                <button disabled={pending} onClick={() => run(() => setOneCConnectionActive(c.id, !c.active), c.active ? "O'chirildi" : "Faollashtirildi")} className="text-xs font-semibold px-2.5 py-1 rounded-md disabled:opacity-50" style={{ background: "var(--bg-hover, #f3f4f6)", color: "var(--text-primary)" }}>
                  {c.active ? "O'chirish" : "Faollashtirish"}
                </button>
              </div>

              {/* Mappings */}
              <div className="mt-3">
                <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>1C tashkilot → ASRO firma</div>
                <div className="space-y-1">
                  {c.mappings.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm">
                      <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: "var(--bg-hover, #f3f4f6)", color: "var(--text-primary)" }}>{m.externalOrgId}</code>
                      <span style={{ color: "var(--text-muted)" }}>→</span>
                      <span style={{ color: "var(--text-primary)" }}>{m.company.name}</span>
                      <button disabled={pending} onClick={() => run(() => removeOneCMapping(m.id), "O'chirildi")} className="ml-1 text-red-500 text-xs font-bold">×</button>
                    </div>
                  ))}
                  {c.mappings.length === 0 && <div className="text-xs italic" style={{ color: "var(--text-muted)" }}>mapping yo'q</div>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input value={mf.org} onChange={(e) => setMapForm({ ...mapForm, [c.id]: { ...mf, org: e.target.value } })} placeholder="1C tashkilot ID (INN/GUID)" className="px-2 py-1 rounded-md border text-xs" style={inputStyle} />
                  <select value={mf.companyId} onChange={(e) => setMapForm({ ...mapForm, [c.id]: { ...mf, companyId: e.target.value } })} className="px-2 py-1 rounded-md border text-xs" style={inputStyle}>
                    <option value="">Firma tanlang…</option>
                    {companies.map((co) => <option key={co.id} value={co.id}>{co.name} ({co.inn})</option>)}
                  </select>
                  <button disabled={pending || !mf.org.trim() || !mf.companyId} onClick={() => { run(() => createOneCMapping(c.id, mf.org, mf.companyId), "Mapping qo'shildi"); setMapForm({ ...mapForm, [c.id]: { org: "", companyId: "" } }); }} className="text-xs font-semibold px-2.5 py-1 rounded-md text-white disabled:opacity-50" style={{ background: "#2563eb" }}>+ Mapping</button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
