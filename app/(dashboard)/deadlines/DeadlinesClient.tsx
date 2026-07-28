"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ObligationStatus, DelayReason } from "@prisma/client";
import { formatUzDate } from "@/lib/format";
import { updateObligationStatus, setDelayReason, approveDelayReason } from "@/server/obligations";

interface Row {
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
}

const SENIOR = new Set(["super_admin", "admin", "chief_accountant", "supervisor"]);

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  planned: { label: "Rejalashtirilgan", bg: "var(--rule)", fg: "var(--text-secondary)" },
  in_progress: { label: "Jarayonda", bg: "var(--info-bg)", fg: "var(--brand-deep)" },
  ready: { label: "Tayyor", bg: "var(--accent-indigo-light)", fg: "var(--accent-indigo)" },
  sent: { label: "Yuborilgan", bg: "var(--warning-bg)", fg: "var(--warning)" },
  accepted: { label: "Qabul qilingan", bg: "var(--success-bg)", fg: "var(--success)" },
  rejected: { label: "Rad etilgan", bg: "var(--danger-bg)", fg: "var(--danger-dark)" },
  cancelled: { label: "Bekor qilingan", bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
};

const DELAY_LABELS: Record<string, string> = {
  accountant_delay: "Buxgalter kechikishi",
  client_delay: "Mijoz kechikishi",
  system_failure: "Tizim nosozligi",
  external_authority: "Tashqi organ",
  management_decision: "Rahbariyat qarori",
  other: "Boshqa",
};

interface Action {
  label: string;
  to: ObligationStatus;
  senior?: boolean;
  danger?: boolean;
}

function actionsFor(status: string): Action[] {
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

const TERMINAL = new Set(["accepted", "cancelled"]);
type Tab = "all" | "mine" | "overdue";

interface Counts {
  all: number;
  mine: number;
  overdue: number;
}

/** Bir marta chiziladigan qatorlar soni. */
const RENDER_STEP = 50;

export default function DeadlinesClient({
  rows,
  role,
  userId,
  counts,
  pageSize,
}: {
  rows: Row[];
  role: string;
  userId: string;
  counts: Counts;
  pageSize: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<Tab>("all");
  const [visible, setVisible] = useState(RENDER_STEP);
  const isSenior = SENIOR.has(role);

  // Sanoqlar serverdan keladi: `rows` eng yaqin `pageSize` ta bilan
  // chegaralangan, shuning uchun ularni bu yerda sanash "hammasi (300)" degan
  // yolg'on raqam berardi.
  const filtered = useMemo(() => {
    if (tab === "mine") return rows.filter((r) => r.responsibleUserId === userId);
    if (tab === "overdue") return rows.filter((r) => r.isOverdue);
    return rows;
  }, [rows, tab, userId]);

  // Yorliq almashganda qaytadan boshidan chizamiz.
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const truncated = counts.all > rows.length;

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

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "all", label: "Hammasi", n: counts.all },
    { key: "mine", label: "Mening", n: counts.mine },
    { key: "overdue", label: "Muddati o'tgan", n: counts.overdue },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Muddatlar
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Majburiyatlar, muddatlar va holati — hech biri yo'qolmaydi
          </p>
        </div>
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setVisible(RENDER_STEP); }}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: tab === t.key ? "var(--sidebar-item-active-bg, var(--brand))" : "var(--bg-hover, var(--bg-sunken))",
                color: tab === t.key ? "#fff" : "var(--text-primary)",
              }}
            >
              {t.label} <span className="opacity-70">({t.n})</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-xl border p-10 text-center text-sm"
          style={{ borderColor: "var(--border, var(--rule))", color: "var(--text-muted)" }}
        >
          {counts.all === 0
            ? "Hozircha majburiyatlar yo'q. Admin DeadlineTemplate qo'shib, generatsiya ishga tushgach paydo bo'ladi."
            : "Bu filtrga mos majburiyat yo'q."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, var(--rule))" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold px-3 py-2.5">Firma</th>
                <th className="text-left font-semibold px-3 py-2.5">Majburiyat</th>
                <th className="text-left font-semibold px-3 py-2.5">Davr</th>
                <th className="text-left font-semibold px-3 py-2.5">Muddat</th>
                <th className="text-left font-semibold px-3 py-2.5">Holat</th>
                <th className="text-right font-semibold px-3 py-2.5">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.planned;
                const acts = actionsFor(r.status).filter((a) => !a.senior || isSenior);
                const canMarkDelay = !TERMINAL.has(r.status);
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border, var(--bg-sunken))" }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                      {r.companyName}
                      {r.responsibleUserId === userId && (
                        <span className="ml-2 text-micro font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                          Men
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-primary)" }}>
                      {r.templateName}
                      <div className="text-meta" style={{ color: "var(--text-muted)" }}>{r.obligationType}</div>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{r.periodKey}</td>
                    <td className="px-3 py-2.5">
                      <span style={{ color: r.isOverdue ? "var(--danger-dark)" : "var(--text-primary)", fontWeight: r.isOverdue ? 700 : 400 }}>
                        {formatUzDate(r.dueAt)}
                      </span>
                      {r.isOverdue && (
                        <span className="ml-2 text-micro font-bold px-1.5 py-0.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger-dark)" }}>
                          Muddati o'tdi
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
              })}
            </tbody>
          </table>
        </div>
      )}

      {(shown.length < filtered.length || truncated) && (
        <div className="flex flex-wrap items-center justify-center gap-3 py-3 text-sm">
          <span style={{ color: "var(--text-muted)" }}>
            {shown.length} / {filtered.length} ko&apos;rsatilmoqda
            {truncated && ` — jami ${counts.all} ta, eng yaqin ${pageSize} tasi yuklandi`}
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
