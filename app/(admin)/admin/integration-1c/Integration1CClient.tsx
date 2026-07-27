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
import { Button } from "@/components/ui/Button";

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
  received: { label: "Qabul qilingan", bg: "var(--rule)", fg: "var(--text-secondary)" },
  processing: { label: "Ishlanmoqda", bg: "var(--info-bg)", fg: "var(--brand-deep)" },
  processed: { label: "Ishlangan", bg: "var(--success-bg)", fg: "var(--success)" },
  failed: { label: "Xato", bg: "var(--warning-bg)", fg: "var(--warning)" },
  dead: { label: "DLQ (o'lik)", bg: "var(--danger-bg)", fg: "var(--danger-dark)" },
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

  const inputStyle = { borderColor: "var(--border, var(--rule))", background: "transparent", color: "var(--text-primary)" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>1C integratsiya</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Agent ulanishlari, firma mapping va sync holati (1C→ASRO, bir yo'nalish)</p>
      </div>

      {/* Sync overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STATUS_ORDER.map((s) => {
          const m = STATUS_META[s];
          return (
            <div key={s} className="rounded-xl border p-3" style={{ borderColor: "var(--border, var(--rule))" }}>
              <div className="text-2xl font-semibold" style={{ color: m.fg }}>{statusCount(s)}</div>
              <div className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* Recent errors (DLQ) */}
      {overview.recentErrors.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border, var(--rule))" }}>
          <div className="text-sm font-bold mb-2" style={{ color: "var(--danger-dark)" }}>Oxirgi sync xatolar</div>
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
      <div className="rounded-xl border p-4 flex flex-wrap items-end gap-3" style={{ borderColor: "var(--border, var(--rule))" }}>
        <label className="text-xs flex-1 min-w-[200px]" style={{ color: "var(--text-muted)" }}>Yangi agent ulanishi nomi
          <input className="block px-2.5 py-1.5 rounded-lg border text-sm w-full" style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ASRO agent — 1-baza" />
        </label>
        <Button variant="success" size="md" disabled={pending} onClick={addConnection}>+ Ulanish yaratish</Button>
      </div>

      {/* Token reveal — bir marta */}
      {newToken && (
        <div className="rounded-xl border-2 p-4" style={{ borderColor: "var(--warning)", background: "var(--warning-bg)" }}>
          <div className="text-sm font-bold" style={{ color: "var(--warning)" }}>⚠️ Token faqat HOZIR ko'rsatiladi — nusxalab saqlang (qayta ko'rsatilmaydi)</div>
          <div className="text-xs mt-1" style={{ color: "var(--warning)" }}>{newToken.name} · agent uni <code>X-ASRO-Agent-Token</code> sarlavhasida yuboradi</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--card-bg)] border text-xs break-all" style={{ borderColor: "var(--warning)" }}>{newToken.token}</code>
            <button onClick={() => { navigator.clipboard?.writeText(newToken.token); toast.success("Nusxalandi"); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "var(--warning)" }}>Nusxalash</button>
            <button onClick={() => setNewToken(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--rule)" }}>Yashirish</button>
          </div>
        </div>
      )}

      {/* Connections + mappings */}
      {connections.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: "var(--border, var(--rule))", color: "var(--text-muted)" }}>
          Hozircha ulanish yo'q. Agent uchun ulanish yarating, so'ng 1C tashkilotlarini firmalarga bog'lang.
        </div>
      ) : (
        connections.map((c) => {
          const mf = mapForm[c.id] ?? { org: "", companyId: "" };
          return (
            <div key={c.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border, var(--rule))" }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-bold" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                  <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: c.active ? "var(--success-bg)" : "var(--bg-sunken)", color: c.active ? "var(--success)" : "var(--text-muted)" }}>{c.active ? "faol" : "o'chiq"}</span>
                  <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>{c._count.events} hodisa · {c._count.syncRuns} sync · {c.lastSeenAt ? `oxirgi: ${formatUzDateTime(c.lastSeenAt)}` : "hech qachon"}</span>
                </div>
                <button disabled={pending} onClick={() => run(() => setOneCConnectionActive(c.id, !c.active), c.active ? "O'chirildi" : "Faollashtirildi")} className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-primary)" }}>
                  {c.active ? "O'chirish" : "Faollashtirish"}
                </button>
              </div>

              {/* Mappings */}
              <div className="mt-3">
                <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>1C tashkilot → ASRO firma</div>
                <div className="space-y-1">
                  {c.mappings.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm">
                      <code className="px-1.5 py-0.5 rounded-lg text-xs" style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-primary)" }}>{m.externalOrgId}</code>
                      <span style={{ color: "var(--text-muted)" }}>→</span>
                      <span style={{ color: "var(--text-primary)" }}>{m.company.name}</span>
                      <button disabled={pending} onClick={() => run(() => removeOneCMapping(m.id), "O'chirildi")} className="ml-1 text-[var(--danger)] text-xs font-bold">×</button>
                    </div>
                  ))}
                  {c.mappings.length === 0 && <div className="text-xs italic" style={{ color: "var(--text-muted)" }}>mapping yo'q</div>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input value={mf.org} onChange={(e) => setMapForm({ ...mapForm, [c.id]: { ...mf, org: e.target.value } })} placeholder="1C tashkilot ID (INN/GUID)" className="px-2 py-1 rounded-lg border text-xs" style={inputStyle} />
                  <select value={mf.companyId} onChange={(e) => setMapForm({ ...mapForm, [c.id]: { ...mf, companyId: e.target.value } })} className="px-2 py-1 rounded-lg border text-xs" style={inputStyle}>
                    <option value="">Firma tanlang…</option>
                    {companies.map((co) => <option key={co.id} value={co.id}>{co.name} ({co.inn})</option>)}
                  </select>
                  <Button variant="primary" size="sm" disabled={pending || !mf.org.trim() || !mf.companyId} onClick={() => { run(() => createOneCMapping(c.id, mf.org, mf.companyId), "Mapping qo'shildi"); setMapForm({ ...mapForm, [c.id]: { org: "", companyId: "" } }); }}>+ Mapping</Button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
