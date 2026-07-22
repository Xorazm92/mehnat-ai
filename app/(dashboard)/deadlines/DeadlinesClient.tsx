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
  planned: { label: "Rejalashtirilgan", bg: "#e5e7eb", fg: "#374151" },
  in_progress: { label: "Jarayonda", bg: "#dbeafe", fg: "#1d4ed8" },
  ready: { label: "Tayyor", bg: "#e0e7ff", fg: "#4338ca" },
  sent: { label: "Yuborilgan", bg: "#fef3c7", fg: "#b45309" },
  accepted: { label: "Qabul qilingan", bg: "#dcfce7", fg: "#15803d" },
  rejected: { label: "Rad etilgan", bg: "#fee2e2", fg: "#b91c1c" },
  cancelled: { label: "Bekor qilingan", bg: "#f3f4f6", fg: "#6b7280" },
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

export default function DeadlinesClient({ rows, role, userId }: { rows: Row[]; role: string; userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<Tab>("all");
  const isSenior = SENIOR.has(role);

  const counts = useMemo(
    () => ({
      all: rows.length,
      mine: rows.filter((r) => r.responsibleUserId === userId).length,
      overdue: rows.filter((r) => r.isOverdue).length,
    }),
    [rows, userId],
  );

  const filtered = useMemo(() => {
    if (tab === "mine") return rows.filter((r) => r.responsibleUserId === userId);
    if (tab === "overdue") return rows.filter((r) => r.isOverdue);
    return rows;
  }, [rows, tab, userId]);

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
          <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>
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
              onClick={() => setTab(t.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: tab === t.key ? "var(--sidebar-item-active-bg, #2563eb)" : "var(--bg-hover, #f3f4f6)",
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
          style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--text-muted)" }}
        >
          {counts.all === 0
            ? "Hozircha majburiyatlar yo'q. Admin DeadlineTemplate qo'shib, generatsiya ishga tushgach paydo bo'ladi."
            : "Bu filtrga mos majburiyat yo'q."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, #f9fafb)", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold px-3 py-2.5">Firma</th>
                <th className="text-left font-semibold px-3 py-2.5">Majburiyat</th>
                <th className="text-left font-semibold px-3 py-2.5">Davr</th>
                <th className="text-left font-semibold px-3 py-2.5">Muddat</th>
                <th className="text-left font-semibold px-3 py-2.5">Holat</th>
                <th className="text-right font-semibold px-3 py-2.5">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.planned;
                const acts = actionsFor(r.status).filter((a) => !a.senior || isSenior);
                const canMarkDelay = !TERMINAL.has(r.status);
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border, #f1f5f9)" }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                      {r.companyName}
                      {r.responsibleUserId === userId && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#dcfce7", color: "#15803d" }}>
                          Men
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-primary)" }}>
                      {r.templateName}
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.obligationType}</div>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{r.periodKey}</td>
                    <td className="px-3 py-2.5">
                      <span style={{ color: r.isOverdue ? "#b91c1c" : "var(--text-primary)", fontWeight: r.isOverdue ? 700 : 400 }}>
                        {formatUzDate(r.dueAt)}
                      </span>
                      {r.isOverdue && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#fee2e2", color: "#b91c1c" }}>
                          Muddati o'tdi
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ background: meta.bg, color: meta.fg }}>
                        {meta.label}
                      </span>
                      {r.delayReason && (
                        <div className="mt-1 text-[11px]" style={{ color: r.delayApproved ? "#15803d" : "#b45309" }}>
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
                            className="text-xs font-semibold px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                            style={{ background: a.danger ? "#fee2e2" : "var(--bg-hover, #eef2ff)", color: a.danger ? "#b91c1c" : "#4338ca" }}
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
                            className="text-xs px-2 py-1 rounded-md border disabled:opacity-50"
                            style={{ borderColor: "var(--border, #e5e7eb)", background: "transparent", color: "var(--text-muted)" }}
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
                            className="text-xs font-semibold px-2.5 py-1 rounded-md disabled:opacity-50"
                            style={{ background: "#dcfce7", color: "#15803d" }}
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
    </div>
  );
}
