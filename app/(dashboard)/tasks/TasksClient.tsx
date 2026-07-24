"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TaskStatus, TaskPriority } from "@prisma/client";
import { formatUzDate } from "@/lib/format";
import { createTask, updateTaskStatus, assignTask } from "@/server/tasks";
import { logTime } from "@/server/timeEntries";

interface Row {
  id: string;
  title: string;
  companyId: string | null;
  companyName: string | null;
  taskType: string | null;
  priority: string;
  status: string;
  assigneeUserId: string | null;
  dueAt: string | null;
  responseBreached: boolean;
  resolutionBreached: boolean;
}
interface UserLite { id: string; fullName: string }
interface CompanyLite { id: string; name: string }

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  open: { label: "Ochiq", bg: "var(--rule)", fg: "var(--text-secondary)" },
  in_progress: { label: "Jarayonda", bg: "var(--info-bg)", fg: "var(--brand-deep)" },
  blocked: { label: "Bloklangan", bg: "var(--warning-bg)", fg: "var(--warning)" },
  done: { label: "Bajarilgan", bg: "var(--success-bg)", fg: "var(--success)" },
  cancelled: { label: "Bekor", bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
};
const PRIORITY_META: Record<string, { label: string; bg: string; fg: string }> = {
  low: { label: "Past", bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
  normal: { label: "O'rta", bg: "var(--accent-indigo-light)", fg: "var(--accent-indigo)" },
  high: { label: "Yuqori", bg: "var(--warning-bg)", fg: "var(--warning)" },
  urgent: { label: "Shoshilinch", bg: "var(--danger-bg)", fg: "var(--danger-dark)" },
};

interface Action { label: string; to: TaskStatus; danger?: boolean }
function actionsFor(status: string): Action[] {
  switch (status) {
    case "open": return [{ label: "Boshlash", to: "in_progress" }, { label: "Bekor", to: "cancelled", danger: true }];
    case "in_progress": return [{ label: "Bajarildi", to: "done" }, { label: "Bloklandi", to: "blocked" }, { label: "Bekor", to: "cancelled", danger: true }];
    case "blocked": return [{ label: "Davom", to: "in_progress" }, { label: "Bekor", to: "cancelled", danger: true }];
    case "done": return [{ label: "Qayta ochish", to: "in_progress" }];
    default: return [];
  }
}

type Tab = "all" | "mine" | "breach";
const EMPTY = { title: "", description: "", companyId: "", taskType: "", priority: "normal" as TaskPriority, assigneeUserId: "", dueAt: "" };

export default function TasksClient({ rows, users, companies, userId, role }: { rows: Row[]; users: UserLite[]; companies: CompanyLite[]; userId: string; role: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<Tab>("all");
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ ...EMPTY });
  const [timeInput, setTimeInput] = useState<Record<string, string>>({});
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.fullName])), [users]);

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try { await fn(); toast.success(ok); router.refresh(); }
      catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });

  const counts = useMemo(() => ({
    all: rows.length,
    mine: rows.filter((r) => r.assigneeUserId === userId).length,
    breach: rows.filter((r) => r.responseBreached || r.resolutionBreached).length,
  }), [rows, userId]);

  const filtered = useMemo(() => {
    if (tab === "mine") return rows.filter((r) => r.assigneeUserId === userId);
    if (tab === "breach") return rows.filter((r) => r.responseBreached || r.resolutionBreached);
    return rows;
  }, [rows, tab, userId]);

  const submitCreate = () => {
    if (!f.title.trim()) return toast.error("Sarlavha majburiy");
    run(() => createTask({
      title: f.title, description: f.description || undefined, companyId: f.companyId || undefined,
      taskType: f.taskType || undefined, priority: f.priority, assigneeUserId: f.assigneeUserId || undefined,
      dueAt: f.dueAt || undefined,
    }), "Vazifa yaratildi");
    setF({ ...EMPTY }); setShowForm(false);
  };

  const input = "px-2.5 py-1.5 rounded-lg border text-sm w-full";
  const inputStyle = { borderColor: "var(--border, var(--rule))", background: "transparent", color: "var(--text-primary)" };
  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "all", label: "Hammasi", n: counts.all },
    { key: "mine", label: "Mening", n: counts.mine },
    { key: "breach", label: "SLA buzilgan", n: counts.breach },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Vazifalar</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Ish boshqaruvi + SLA (javob/yechim muddati)</p>
        </div>
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: tab === t.key ? "var(--brand)" : "var(--bg-hover, var(--bg-sunken))", color: tab === t.key ? "#fff" : "var(--text-primary)" }}>
              {t.label} <span className="opacity-70">({t.n})</span>
            </button>
          ))}
          <button onClick={() => setShowForm((s) => !s)} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: "var(--success)" }}>{showForm ? "Bekor" : "+ Yangi"}</button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border p-4 grid grid-cols-2 md:grid-cols-3 gap-3" style={{ borderColor: "var(--border, var(--rule))" }}>
          <label className="text-xs col-span-2 md:col-span-1" style={{ color: "var(--text-muted)" }}>Sarlavha
            <input className={input} style={inputStyle} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Firma
            <select className={input} style={inputStyle} value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Tur (SLA uchun)
            <input className={input} style={inputStyle} value={f.taskType} onChange={(e) => setF({ ...f, taskType: e.target.value })} placeholder="masalan: hujjat_korish" />
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Muhimlik
            <select className={input} style={inputStyle} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TaskPriority })}>
              {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Mas'ul
            <select className={input} style={inputStyle} value={f.assigneeUserId} onChange={(e) => setF({ ...f, assigneeUserId: e.target.value })}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Muddat
            <input type="date" className={input} style={inputStyle} value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
          </label>
          <label className="text-xs col-span-2 md:col-span-3" style={{ color: "var(--text-muted)" }}>Izoh
            <input className={input} style={inputStyle} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </label>
          <div className="col-span-2 md:col-span-3">
            <button disabled={pending} onClick={submitCreate} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--success)" }}>Yaratish</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border p-10 text-center text-sm" style={{ borderColor: "var(--border, var(--rule))", color: "var(--text-muted)" }}>Vazifa yo'q.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, var(--rule))" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold px-3 py-2.5">Vazifa</th>
                <th className="text-left font-semibold px-3 py-2.5">Mas'ul</th>
                <th className="text-left font-semibold px-3 py-2.5">Muhimlik</th>
                <th className="text-left font-semibold px-3 py-2.5">Holat / SLA</th>
                <th className="text-right font-semibold px-3 py-2.5">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const sm = STATUS_META[r.status] ?? STATUS_META.open;
                const pm = PRIORITY_META[r.priority] ?? PRIORITY_META.normal;
                const acts = actionsFor(r.status);
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border, var(--bg-sunken))" }}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium" style={{ color: "var(--text-primary)" }}>{r.title}</div>
                      <div className="text-meta" style={{ color: "var(--text-muted)" }}>
                        {r.companyName ?? "ichki"}{r.taskType ? ` · ${r.taskType}` : ""}{r.dueAt ? ` · ${formatUzDate(r.dueAt)}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-primary)" }}>
                      {r.assigneeUserId ? (nameOf.get(r.assigneeUserId) ?? "?") : <span className="italic" style={{ color: "var(--text-muted)" }}>tayinlanmagan</span>}
                    </td>
                    <td className="px-3 py-2.5"><span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: pm.bg, color: pm.fg }}>{pm.label}</span></td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: sm.bg, color: sm.fg }}>{sm.label}</span>
                      {r.responseBreached && <span className="ml-1 text-micro font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger-dark)" }}>javob SLA</span>}
                      {r.resolutionBreached && <span className="ml-1 text-micro font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger-dark)" }}>yechim SLA</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <select disabled={pending} value={r.assigneeUserId ?? ""} onChange={(e) => run(() => assignTask(r.id, e.target.value || null), "Mas'ul yangilandi")} className="text-xs px-1.5 py-1 rounded-lg border disabled:opacity-50" style={inputStyle}>
                          <option value="">Mas'ul…</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                        </select>
                        {acts.map((a) => (
                          <button key={a.to} disabled={pending} onClick={() => run(() => updateTaskStatus(r.id, a.to), `${a.label} ✓`)} className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ background: a.danger ? "var(--danger-bg)" : "var(--bg-hover, var(--accent-indigo-light))", color: a.danger ? "var(--danger-dark)" : "var(--accent-indigo)" }}>{a.label}</button>
                        ))}
                        <input type="number" placeholder="daq" value={timeInput[r.id] ?? ""} onChange={(e) => setTimeInput({ ...timeInput, [r.id]: e.target.value })} className="w-14 text-xs px-1.5 py-1 rounded-lg border" style={inputStyle} title="Vaqt (daqiqa)" />
                        <button disabled={pending} onClick={() => { const m = Number(timeInput[r.id]); if (!(m > 0)) return toast.error("Daqiqa kiriting"); run(() => logTime({ minutes: m, date: new Date().toISOString().slice(0, 10), taskId: r.id, companyId: r.companyId || undefined }), "Vaqt qayd etildi"); setTimeInput({ ...timeInput, [r.id]: "" }); }} className="text-xs font-semibold px-2 py-1 rounded-lg disabled:opacity-50" style={{ background: "var(--bg-hover, var(--accent-indigo-light))", color: "var(--accent-indigo)" }} title="Vaqtni qayd etish">⏱</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
