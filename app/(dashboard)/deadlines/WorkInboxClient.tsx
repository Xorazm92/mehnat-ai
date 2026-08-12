"use client";

// =====================================================
// ISHLAR — birlashgan ish qutisi (majburiyat + vazifa)
// =====================================================
// Ilgari xodim ikki sahifani kuzatardi: `/deadlines` (shablondan hosil bo'lgan
// majburiyat) va `/tasks` (rahbar topshirig'i). Ular bir-birini bilmagani uchun
// bitta ish ikki joyda belgilanardi. Bu yerda ikkalasi BITTA muddat bo'yicha
// saralangan ro'yxat: qator turi (majburiyat/vazifa) ustunda ko'rinadi, amallar
// esa o'z manbasiga yozadi.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ObligationStatus, DelayReason, TaskStatus, TaskPriority } from "@prisma/client";
import { formatUzDate } from "@/lib/format";
import { updateObligationStatus, setDelayReason, approveDelayReason } from "@/server/obligations";
import { createTask, updateTaskStatus, assignTask } from "@/server/tasks";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { useTabParam } from "@/hooks/useTabParam";
import { WORK_TAB_IDS, type WorkTab } from "@/lib/workTabs";
import { CalendarClock, Inbox, UserCheck, AlarmClock, CheckSquare } from "lucide-react";

export interface ObligationRow {
  kind: "obligation";
  id: string;
  companyName: string;
  templateName: string;
  obligationType: string;
  periodKey: string;
  dueAt: string;
  status: string;
  isOverdue: boolean;
  responsibleUserId: string | null;
  delayReason: string | null;
  delayMarked: boolean;
  delayApproved: boolean;
  taskCount: number;
}

export interface TaskRow {
  kind: "task";
  id: string;
  title: string;
  companyId: string | null;
  companyName: string | null;
  taskType: string | null;
  priority: string;
  status: string;
  assigneeUserId: string | null;
  dueAt: string | null;
  /** Bog'langan majburiyat nomi — vazifa qaysi muddat ustida ochilgani. */
  obligationLabel: string | null;
}

export type WorkRow = ObligationRow | TaskRow;

interface UserLite { id: string; fullName: string }
interface CompanyLite { id: string; name: string }
interface Counts { all: number; mine: number; overdue: number }

const SENIOR = new Set(["super_admin", "admin", "chief_accountant", "supervisor"]);

const OBLIGATION_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  planned: { label: "Rejalashtirilgan", bg: "var(--rule)", fg: "var(--text-secondary)" },
  in_progress: { label: "Jarayonda", bg: "var(--info-bg)", fg: "var(--brand-deep)" },
  ready: { label: "Tayyor", bg: "var(--accent-indigo-light)", fg: "var(--accent-indigo)" },
  sent: { label: "Yuborilgan", bg: "var(--warning-bg)", fg: "var(--warning)" },
  accepted: { label: "Qabul qilingan", bg: "var(--success-bg)", fg: "var(--success)" },
  rejected: { label: "Rad etilgan", bg: "var(--danger-bg)", fg: "var(--danger-dark)" },
  cancelled: { label: "Bekor qilingan", bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
};

const TASK_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
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

const DELAY_LABELS: Record<string, string> = {
  accountant_delay: "Buxgalter kechikishi",
  client_delay: "Mijoz kechikishi",
  system_failure: "Tizim nosozligi",
  external_authority: "Tashqi organ",
  management_decision: "Rahbariyat qarori",
  other: "Boshqa",
};

interface ObligationAction { label: string; to: ObligationStatus; senior?: boolean; danger?: boolean }
function obligationActions(status: string): ObligationAction[] {
  switch (status) {
    case "planned":
      return [{ label: "Boshlash", to: "in_progress" }, { label: "Bekor", to: "cancelled", senior: true, danger: true }];
    case "in_progress":
      return [{ label: "Tayyor", to: "ready" }, { label: "Bekor", to: "cancelled", senior: true, danger: true }];
    case "ready":
      return [{ label: "Yuborildi", to: "sent" }, { label: "Ortga", to: "in_progress" }];
    case "sent":
      return [
        { label: "Qabul qilindi", to: "accepted", senior: true },
        { label: "Rad etildi", to: "rejected", senior: true, danger: true },
      ];
    case "rejected":
      return [{ label: "Qayta tayyor", to: "ready" }];
    default:
      return []; // accepted / cancelled — terminal
  }
}

interface TaskAction { label: string; to: TaskStatus; danger?: boolean }
function taskActions(status: string): TaskAction[] {
  switch (status) {
    case "open": return [{ label: "Boshlash", to: "in_progress" }, { label: "Bekor", to: "cancelled", danger: true }];
    case "in_progress": return [{ label: "Bajarildi", to: "done" }, { label: "Bloklandi", to: "blocked" }, { label: "Bekor", to: "cancelled", danger: true }];
    case "blocked": return [{ label: "Davom", to: "in_progress" }, { label: "Bekor", to: "cancelled", danger: true }];
    case "done": return [{ label: "Qayta ochish", to: "in_progress" }];
    default: return [];
  }
}

const TERMINAL = new Set(["accepted", "cancelled"]);
export type { WorkTab };

/** Bir marta chiziladigan qatorlar soni. */
const RENDER_STEP = 50;

const EMPTY_FORM = {
  title: "",
  description: "",
  companyId: "",
  obligationId: "",
  taskType: "",
  priority: "normal" as TaskPriority,
  assigneeUserId: "",
  dueAt: "",
};

/** Vazifa "kechikkan" — muddati o'tgan va hali yopilmagan. */
function taskLate(t: TaskRow): boolean {
  if (t.status === "done" || t.status === "cancelled") return false;
  return !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
}

export default function WorkInboxClient({
  obligations,
  tasks,
  users,
  companies,
  role,
  userId,
  counts,
  pageSize,
  initialTab = "all",
}: {
  obligations: ObligationRow[];
  tasks: TaskRow[];
  users: UserLite[];
  companies: CompanyLite[];
  role: string;
  userId: string;
  counts: Counts;
  pageSize: number;
  initialTab?: WorkTab;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Yorliq URL'da: bildirishnoma yoki hamkasb "muddati o'tganlarni ko'r" deb
  // `/deadlines?tab=overdue` yuborishi mumkin.
  const [tab, setTab] = useTabParam<WorkTab>("tab", WORK_TAB_IDS, initialTab);
  const [visible, setVisible] = useState(RENDER_STEP);
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ ...EMPTY_FORM });
  const isSenior = SENIOR.has(role);
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.fullName])), [users]);

  const rows = useMemo<WorkRow[]>(() => {
    const merged: WorkRow[] = [...obligations, ...tasks];
    // Muddatsiz vazifalar oxirida — ular kalendarni band qilmaydi.
    return merged.sort((a, b) => {
      const at = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  }, [obligations, tasks]);

  const filtered = useMemo(() => {
    if (tab === "tasks") return rows.filter((r) => r.kind === "task");
    if (tab === "mine")
      return rows.filter((r) =>
        r.kind === "obligation" ? r.responsibleUserId === userId : r.assigneeUserId === userId,
      );
    if (tab === "overdue")
      return rows.filter((r) => (r.kind === "obligation" ? r.isOverdue : taskLate(r)));
    return rows;
  }, [rows, tab, userId]);

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  // Majburiyat sanoqlari SERVERDAN keladi (`obligations` faqat eng yaqin
  // `pageSize` ta), vazifalar esa to'liq yuklanadi — shuning uchun qo'shiladi.
  const tabCounts = useMemo(
    () => ({
      all: counts.all + tasks.length,
      mine: counts.mine + tasks.filter((t) => t.assigneeUserId === userId).length,
      overdue: counts.overdue + tasks.filter(taskLate).length,
      tasks: tasks.length,
    }),
    [counts, tasks, userId],
  );
  const truncated = counts.all > obligations.length;

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

  const submitCreate = () => {
    if (!f.title.trim()) return toast.error("Sarlavha majburiy");
    run(
      () =>
        createTask({
          title: f.title,
          description: f.description || undefined,
          // Majburiyat tanlansa firma va muddat MANBADAN meros bo'ladi (server).
          companyId: f.obligationId ? undefined : f.companyId || undefined,
          obligationId: f.obligationId || undefined,
          taskType: f.taskType || undefined,
          priority: f.priority,
          assigneeUserId: f.assigneeUserId || undefined,
          dueAt: f.dueAt || undefined,
        }),
      "Vazifa yaratildi",
    );
    setF({ ...EMPTY_FORM });
    setShowForm(false);
  };

  const input = "px-2.5 py-1.5 rounded-lg border text-sm w-full";
  const inputStyle = { borderColor: "var(--border, var(--rule))", background: "transparent", color: "var(--text-primary)" };
  const TABS: TabItem<WorkTab>[] = [
    { id: "all", label: "Hammasi", icon: Inbox, count: tabCounts.all },
    { id: "mine", label: "Mening", icon: UserCheck, count: tabCounts.mine, hint: "Menga biriktirilgan ishlar" },
    { id: "overdue", label: "Muddati o'tgan", icon: AlarmClock, count: tabCounts.overdue },
    { id: "tasks", label: "Vazifalar", icon: CheckSquare, count: tabCounts.tasks, hint: "Faqat qo'lda yaratilgan vazifalar" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<CalendarClock size={20} />}
        title="Ishlar"
        description="Majburiyatlar va vazifalar — bitta ro'yxatda, muddati bo'yicha"
        actions={
          isSenior ? (
            <Button variant="success" size="sm" onClick={() => setShowForm((s) => !s)}>
              {showForm ? "Bekor" : "+ Yangi vazifa"}
            </Button>
          ) : null
        }
      >
        {/* Filtrlar sarlavha ostidagi yorliqlar sifatida: ilgari ular
            sarlavhaning O'NG tomonida "Yangi vazifa" tugmasi bilan bir
            qatorda turardi — ya'ni ko'rinishni almashtiruvchi va ma'lumot
            yaratuvchi boshqaruvlar bir xil og'irlikda ko'rinardi. */}
        <Tabs
          items={TABS}
          value={tab}
          onChange={(next) => { setTab(next); setVisible(RENDER_STEP); }}
          idBase="work"
          ariaLabel="Ishlar filtri"
        />
      </PageHeader>

      {showForm && (
        <div className="rounded-xl border p-4 grid grid-cols-2 md:grid-cols-3 gap-3" style={{ borderColor: "var(--border, var(--rule))" }}>
          <label className="text-xs col-span-2 md:col-span-1" style={{ color: "var(--text-muted)" }}>Sarlavha
            <input className={input} style={inputStyle} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label className="text-xs col-span-2" style={{ color: "var(--text-muted)" }}>Majburiyatga biriktirish
            <select className={input} style={inputStyle} value={f.obligationId} onChange={(e) => setF({ ...f, obligationId: e.target.value })}>
              <option value="">— mustaqil vazifa —</option>
              {obligations.filter((o) => !TERMINAL.has(o.status)).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.companyName} · {o.templateName} · {o.periodKey}
                </option>
              ))}
            </select>
          </label>
          {!f.obligationId && (
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Firma
              <select className={input} style={inputStyle} value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Tur (SLA uchun)
            <input className={input} style={inputStyle} value={f.taskType} onChange={(e) => setF({ ...f, taskType: e.target.value })} placeholder="masalan: hujjat_korish" />
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Muhimlik
            <select className={input} style={inputStyle} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TaskPriority })}>
              {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Mas&apos;ul
            <select className={input} style={inputStyle} value={f.assigneeUserId} onChange={(e) => setF({ ...f, assigneeUserId: e.target.value })}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Muddat
            <input type="date" className={input} style={inputStyle} value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
            {f.obligationId && !f.dueAt && (
              <span className="block text-micro" style={{ color: "var(--text-muted)" }}>bo&apos;sh qolsa — majburiyat muddati</span>
            )}
          </label>
          <label className="text-xs col-span-2 md:col-span-3" style={{ color: "var(--text-muted)" }}>Izoh
            <input className={input} style={inputStyle} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </label>
          <div className="col-span-2 md:col-span-3">
            <Button variant="success" size="md" disabled={pending} onClick={submitCreate}>Yaratish</Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div
          className="rounded-xl border p-10 text-center text-sm"
          style={{ borderColor: "var(--border, var(--rule))", color: "var(--text-muted)" }}
        >
          {tabCounts.all === 0
            ? "Hozircha ish yo'q. Majburiyatlar shablon generatsiyasidan, vazifalar esa qo'lda yaratiladi."
            : "Bu filtrga mos ish yo'q."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, var(--rule))" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold px-3 py-2.5">Firma</th>
                <th className="text-left font-semibold px-3 py-2.5">Ish</th>
                <th className="text-left font-semibold px-3 py-2.5">Davr</th>
                <th className="text-left font-semibold px-3 py-2.5">Muddat</th>
                <th className="text-left font-semibold px-3 py-2.5">Holat</th>
                <th className="text-right font-semibold px-3 py-2.5">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) =>
                r.kind === "obligation" ? (
                  <ObligationTr
                    key={`o-${r.id}`}
                    r={r}
                    userId={userId}
                    isSenior={isSenior}
                    pending={pending}
                    run={run}
                  />
                ) : (
                  <TaskTr
                    key={`t-${r.id}`}
                    r={r}
                    users={users}
                    nameOf={nameOf}
                    pending={pending}
                    run={run}
                    inputStyle={inputStyle}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {(shown.length < filtered.length || truncated) && (
        <div className="flex flex-wrap items-center justify-center gap-3 py-3 text-sm">
          <span style={{ color: "var(--text-muted)" }}>
            {shown.length} / {filtered.length} ko&apos;rsatilmoqda
            {truncated && ` — jami ${tabCounts.all} ta, eng yaqin ${pageSize} majburiyat yuklandi`}
          </span>
          {shown.length < filtered.length && (
            <button
              onClick={() => setVisible((v) => v + RENDER_STEP)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-primary)" }}
            >
              Yana {RENDER_STEP} ta
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const KIND_BADGE = {
  obligation: { label: "Majburiyat", bg: "var(--accent-indigo-light)", fg: "var(--accent-indigo)" },
  task: { label: "Vazifa", bg: "var(--warning-bg)", fg: "var(--warning)" },
} as const;

function KindBadge({ kind }: { kind: "obligation" | "task" }) {
  const m = KIND_BADGE[kind];
  return (
    <span className="text-micro font-bold px-1.5 py-0.5 rounded-lg" style={{ background: m.bg, color: m.fg }}>
      {m.label}
    </span>
  );
}

function ObligationTr({
  r, userId, isSenior, pending, run,
}: {
  r: ObligationRow;
  userId: string;
  isSenior: boolean;
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok: string) => void;
}) {
  const meta = OBLIGATION_STATUS[r.status] ?? OBLIGATION_STATUS.planned;
  const acts = obligationActions(r.status).filter((a) => !a.senior || isSenior);
  const canMarkDelay = !TERMINAL.has(r.status);
  return (
    <tr className="border-t" style={{ borderColor: "var(--border, var(--bg-sunken))" }}>
      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
        {r.companyName}
        {r.responsibleUserId === userId && (
          <span className="ml-2 text-micro font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
            Men
          </span>
        )}
      </td>
      <td className="px-3 py-2.5" style={{ color: "var(--text-primary)" }}>
        <div className="flex items-center gap-2">
          <KindBadge kind="obligation" />
          {r.templateName}
        </div>
        <div className="text-meta" style={{ color: "var(--text-muted)" }}>
          {r.obligationType}
          {r.taskCount > 0 && ` · ${r.taskCount} vazifa biriktirilgan`}
        </div>
      </td>
      <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{r.periodKey}</td>
      <td className="px-3 py-2.5">
        <span style={{ color: r.isOverdue ? "var(--danger-dark)" : "var(--text-primary)", fontWeight: r.isOverdue ? 700 : 400 }}>
          {formatUzDate(r.dueAt)}
        </span>
        {r.isOverdue && (
          <span className="ml-2 text-micro font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger-dark)" }}>
            Muddati o&apos;tdi
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: meta.bg, color: meta.fg }}>
          {meta.label}
        </span>
        {r.delayReason && (
          <div className="mt-1 text-meta" style={{ color: r.delayApproved ? "var(--success)" : "var(--warning)" }}>
            {DELAY_LABELS[r.delayReason] ?? r.delayReason}
            {r.delayApproved ? " ✓ tasdiqlangan" : r.delayMarked ? " (tasdiq kutilmoqda)" : ""}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {acts.map((a) => (
            <button
              key={a.to}
              disabled={pending}
              onClick={() => run(() => updateObligationStatus(r.id, a.to), `${a.label} ✓`)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: a.danger ? "var(--danger-bg)" : "var(--bg-hover, var(--accent-indigo-light))", color: a.danger ? "var(--danger-dark)" : "var(--accent-indigo)" }}
            >
              {a.label}
            </button>
          ))}
          {canMarkDelay && (
            <select
              disabled={pending}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value as DelayReason | "";
                e.target.value = "";
                if (v) run(() => setDelayReason(r.id, v), "Kechikish sababi belgilandi");
              }}
              className="text-xs px-2 py-1 rounded-lg border disabled:opacity-50"
              style={{ borderColor: "var(--border, var(--rule))", background: "transparent", color: "var(--text-muted)" }}
            >
              <option value="">Kechikish sababi…</option>
              {Object.entries(DELAY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          )}
          {isSenior && r.delayMarked && !r.delayApproved && (
            <button
              disabled={pending}
              onClick={() => run(() => approveDelayReason(r.id), "Kechikish sababi tasdiqlandi")}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50"
              style={{ background: "var(--success-bg)", color: "var(--success)" }}
            >
              Sababni tasdiqlash
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function TaskTr({
  r, users, nameOf, pending, run, inputStyle,
}: {
  r: TaskRow;
  users: UserLite[];
  nameOf: Map<string, string>;
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok: string) => void;
  inputStyle: React.CSSProperties;
}) {
  const sm = TASK_STATUS[r.status] ?? TASK_STATUS.open;
  const pm = PRIORITY_META[r.priority] ?? PRIORITY_META.normal;
  const acts = taskActions(r.status);
  const late = taskLate(r);
  return (
    <tr className="border-t" style={{ borderColor: "var(--border, var(--bg-sunken))" }}>
      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
        {r.companyName ?? <span className="italic" style={{ color: "var(--text-muted)" }}>ichki</span>}
      </td>
      <td className="px-3 py-2.5" style={{ color: "var(--text-primary)" }}>
        <div className="flex items-center gap-2">
          <KindBadge kind="task" />
          {r.title}
        </div>
        <div className="text-meta" style={{ color: "var(--text-muted)" }}>
          {r.obligationLabel ? `↳ ${r.obligationLabel}` : r.taskType || "mustaqil"}
          {" · "}
          <span style={{ color: pm.fg }}>{pm.label}</span>
          {" · "}
          {r.assigneeUserId ? (nameOf.get(r.assigneeUserId) ?? "?") : "tayinlanmagan"}
        </div>
      </td>
      <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>—</td>
      <td className="px-3 py-2.5">
        {r.dueAt ? (
          <span style={{ color: late ? "var(--danger-dark)" : "var(--text-primary)", fontWeight: late ? 700 : 400 }}>
            {formatUzDate(r.dueAt)}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: sm.bg, color: sm.fg }}>{sm.label}</span>
        {late && <span className="ml-1 text-micro font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger-dark)" }}>kechikdi</span>}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          <select
            disabled={pending}
            value={r.assigneeUserId ?? ""}
            onChange={(e) => run(() => assignTask(r.id, e.target.value || null), "Mas'ul yangilandi")}
            className="text-xs px-1.5 py-1 rounded-lg border disabled:opacity-50"
            style={inputStyle}
          >
            <option value="">Mas&apos;ul…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
          {acts.map((a) => (
            <button
              key={a.to}
              disabled={pending}
              onClick={() => run(() => updateTaskStatus(r.id, a.to), `${a.label} ✓`)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50"
              style={{ background: a.danger ? "var(--danger-bg)" : "var(--bg-hover, var(--accent-indigo-light))", color: a.danger ? "var(--danger-dark)" : "var(--accent-indigo)" }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}
