"use client";

/**
 * "Ishlar" jadvalining ustun ta'riflari.
 *
 * Qator IKKI XIL bo'lishi mumkin — majburiyat yoki vazifa — va ular turli
 * narsalarni ko'rsatadi. Ilgari shu sababdan ikkita alohida `<tr>` komponenti
 * bor edi va jadval sarlavhasi uchinchi joyda yozilardi: ustun qo'shish uchun
 * UCH joyni bir vaqtda o'zgartirish kerak edi. Endi ustun bitta joyda
 * ta'riflanadi, tur farqi esa katakning ICHIDA.
 *
 * DIQQAT: `sortValue` — saralash uchun XOM qiymat. Berilmasa ustun
 * saralanmaydi (`DataTable` shunday ishlaydi), va bu ataylab: "Amallar"
 * ustunini saralash ma'nosiz.
 */
import React from "react";
import type { DataColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { formatUzDate } from "@/lib/platform/format";
import { obligationTypeLabel } from "@/lib/engines/obligation/obligations";
import type { DelayReason, ObligationStatus, TaskStatus } from "@prisma/client";
import { updateObligationStatus, setDelayReason, approveDelayReason } from "@/server/obligations";
import { updateTaskStatus, assignTask } from "@/server/tasks";
import {
  DELAY_LABELS,
  OBLIGATION_STATUS,
  PRIORITY_META,
  TASK_STATUS,
  TERMINAL,
  obligationActions,
  taskActions,
  taskLate,
  type ObligationRow,
  type TaskRow,
  type UserLite,
  type WorkRow,
} from "./workInboxTypes";

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

function Chip({ meta }: { meta: { label: string; bg: string; fg: string } }) {
  return (
    <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: meta.bg, color: meta.fg }}>
      {meta.label}
    </span>
  );
}

export interface WorkColumnContext {
  userId: string;
  isSenior: boolean;
  pending: boolean;
  users: UserLite[];
  nameOf: Map<string, string>;
  run: (fn: () => Promise<unknown>, ok: string) => void;
}

function ObligationActionsCell({ r, ctx }: { r: ObligationRow; ctx: WorkColumnContext }) {
  const acts = obligationActions(r.status).filter((a) => !a.senior || ctx.isSenior);
  const canMarkDelay = !TERMINAL.has(r.status);
  const delayId = `delay-${r.id}`;
  return (
    <div className="flex items-center justify-end gap-1.5 flex-wrap">
      {acts.map((a) => (
        <Button
          key={a.to}
          size="sm"
          variant={a.danger ? "danger" : "secondary"}
          disabled={ctx.pending}
          onClick={() => ctx.run(() => updateObligationStatus(r.id, a.to as ObligationStatus), `${a.label} ✓`)}
        >
          {a.label}
        </Button>
      ))}
      {canMarkDelay && (
        <>
          {/* Tanlagichning ko'rinadigan yorlig'i yo'q (jadvalda joy yo'q), shuning
              uchun ekran o'quvchi uchun nom QATORNI ham aytadi — aks holda 50 ta
              bir xil "Kechikish sababi…" o'qiladi. */}
          <label htmlFor={delayId} className="sr-only">
            {r.companyName} · {r.templateName} — kechikish sababi
          </label>
          <Select
            id={delayId}
            size="sm"
            fullWidth={false}
            disabled={ctx.pending}
            defaultValue=""
            placeholder="Kechikish sababi…"
            onChange={(e) => {
              const v = e.target.value as DelayReason | "";
              // Tanlov QAYD ETILGACH tanlagich bo'sh holatga qaytadi: u
              // qiymatni ko'rsatmaydi, AMAL bajaradi (sabab qatorda alohida
              // chiziladi). Shuning uchun `defaultValue` — boshqarilmaydi.
              e.target.value = "";
              if (v) ctx.run(() => setDelayReason(r.id, v), "Kechikish sababi belgilandi");
            }}
          >
            {Object.entries(DELAY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </>
      )}
      {ctx.isSenior && r.delayMarked && !r.delayApproved && (
        <Button
          size="sm"
          variant="success"
          disabled={ctx.pending}
          onClick={() => ctx.run(() => approveDelayReason(r.id), "Kechikish sababi tasdiqlandi")}
        >
          Sababni tasdiqlash
        </Button>
      )}
    </div>
  );
}

function TaskActionsCell({ r, ctx }: { r: TaskRow; ctx: WorkColumnContext }) {
  const acts = taskActions(r.status);
  const assigneeId = `assignee-${r.id}`;
  return (
    <div className="flex items-center justify-end gap-1.5 flex-wrap">
      <label htmlFor={assigneeId} className="sr-only">{r.title} — mas&apos;ul</label>
      <Select
        id={assigneeId}
        size="sm"
        fullWidth={false}
        disabled={ctx.pending}
        value={r.assigneeUserId ?? ""}
        placeholder="Mas'ul…"
        onChange={(e) => ctx.run(() => assignTask(r.id, e.target.value || null), "Mas'ul yangilandi")}
      >
        {ctx.users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
      </Select>
      {acts.map((a) => (
        <Button
          key={a.to}
          size="sm"
          variant={a.danger ? "danger" : "secondary"}
          disabled={ctx.pending}
          onClick={() => ctx.run(() => updateTaskStatus(r.id, a.to as TaskStatus), `${a.label} ✓`)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

/** Muddat — sana + kechikish nishoni. Ikkala tur uchun bir xil o'qiladi. */
function DueCell({ r }: { r: WorkRow }) {
  const late = r.kind === "obligation" ? r.isOverdue : taskLate(r);
  if (!r.dueAt) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return (
    <span className="whitespace-nowrap">
      <span style={{ color: late ? "var(--danger-dark)" : "var(--text-primary)", fontWeight: late ? 700 : 400 }}>
        {formatUzDate(r.dueAt)}
      </span>
      {late && (
        <span
          className="ml-2 text-micro font-bold px-1.5 py-0.5 rounded-lg"
          style={{ background: "var(--danger-bg)", color: "var(--danger-dark)" }}
        >
          {r.kind === "obligation" ? "Muddati o'tdi" : "kechikdi"}
        </span>
      )}
    </span>
  );
}

export function buildWorkColumns(ctx: WorkColumnContext): DataColumn<WorkRow>[] {
  return [
    {
      key: "company",
      header: "Firma",
      sticky: true,
      mobile: "title",
      sortValue: (r) => (r.kind === "obligation" ? r.companyName : r.companyName ?? ""),
      cell: (r) =>
        r.kind === "obligation" ? (
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            {r.companyName}
            {r.responsibleUserId === ctx.userId && (
              <span
                className="ml-2 text-micro font-bold px-1.5 py-0.5 rounded-lg"
                style={{ background: "var(--success-bg)", color: "var(--success)" }}
              >
                Men
              </span>
            )}
          </span>
        ) : (
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            {r.companyName ?? <span className="italic" style={{ color: "var(--text-muted)" }}>ichki</span>}
          </span>
        ),
    },
    {
      key: "work",
      header: "Ish",
      mobile: "meta",
      sortValue: (r) => (r.kind === "obligation" ? r.templateName : r.title),
      cell: (r) =>
        r.kind === "obligation" ? (
          <>
            <div className="flex items-center gap-2">
              <KindBadge kind="obligation" />
              {r.templateName}
            </div>
            <div className="text-meta" style={{ color: "var(--text-muted)" }}>
              {obligationTypeLabel(r.obligationType)}
              {r.taskCount > 0 && ` · ${r.taskCount} vazifa biriktirilgan`}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <KindBadge kind="task" />
              {r.title}
            </div>
            <div className="text-meta" style={{ color: "var(--text-muted)" }}>
              {r.obligationLabel ? `↳ ${r.obligationLabel}` : r.taskType || "mustaqil"}
              {" · "}
              <span style={{ color: (PRIORITY_META[r.priority] ?? PRIORITY_META.normal).fg }}>
                {(PRIORITY_META[r.priority] ?? PRIORITY_META.normal).label}
              </span>
              {" · "}
              {r.assigneeUserId ? (ctx.nameOf.get(r.assigneeUserId) ?? "?") : "tayinlanmagan"}
            </div>
          </>
        ),
    },
    {
      key: "period",
      header: "Davr",
      sortValue: (r) => (r.kind === "obligation" ? r.periodKey : null),
      cell: (r) => (
        <span style={{ color: "var(--text-muted)" }}>{r.kind === "obligation" ? r.periodKey : "—"}</span>
      ),
    },
    {
      key: "due",
      header: "Muddat",
      // Muddatsiz vazifa `null` qaytaradi — `DataTable` uni yo'nalishdan
      // QAT'I NAZAR oxiriga qo'yadi, ya'ni eski xulq saqlanadi.
      sortValue: (r) => (r.dueAt ? new Date(r.dueAt).getTime() : null),
      cell: (r) => <DueCell r={r} />,
    },
    {
      key: "status",
      header: "Holat",
      mobile: "status",
      sortValue: (r) =>
        r.kind === "obligation"
          ? (OBLIGATION_STATUS[r.status] ?? OBLIGATION_STATUS.planned).label
          : (TASK_STATUS[r.status] ?? TASK_STATUS.open).label,
      cell: (r) =>
        r.kind === "obligation" ? (
          <>
            <Chip meta={OBLIGATION_STATUS[r.status] ?? OBLIGATION_STATUS.planned} />
            {r.delayReason && (
              <div
                className="mt-1 text-meta"
                style={{ color: r.delayApproved ? "var(--success)" : "var(--warning)" }}
              >
                {DELAY_LABELS[r.delayReason] ?? r.delayReason}
                {r.delayApproved ? " ✓ tasdiqlangan" : r.delayMarked ? " (tasdiq kutilmoqda)" : ""}
              </div>
            )}
          </>
        ) : (
          <Chip meta={TASK_STATUS[r.status] ?? TASK_STATUS.open} />
        ),
    },
    {
      key: "actions",
      header: "Amallar",
      align: "right",
      mobile: "actions",
      cell: (r) =>
        r.kind === "obligation" ? (
          <ObligationActionsCell r={r} ctx={ctx} />
        ) : (
          <TaskActionsCell r={r} ctx={ctx} />
        ),
    },
  ];
}
