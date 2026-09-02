"use client";

import Link from "next/link";
import { CalendarClock, AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
import { formatUzDate } from "@/lib/platform/format";
import { Badge } from "@/components/ui";

export interface DeadlineRow {
  id: string;
  companyName: string;
  templateName: string;
  obligationType: string;
  periodKey: string;
  dueAt: string;
  status: string;
  isOverdue: boolean;
}

export interface DeadlinesWidgetProps {
  overdueCount: number;
  dueSoonCount: number;
  upcoming: DeadlineRow[];
  /** Ko'lam yorlig'i: "Firmalaringiz", "Jamoa", "Butun tizim" — ixtiyoriy. */
  scopeLabel?: string;
}

// Muddatgacha qancha kun (musbat = qoldi, manfiy = kechikdi).
function daysUntil(dueAt: string): number {
  const due = new Date(dueAt);
  const now = new Date();
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startDue.getTime() - startNow.getTime()) / 86_400_000);
}

function relativeLabel(dueAt: string, isOverdue: boolean): string {
  const d = daysUntil(dueAt);
  if (isOverdue || d < 0) return `${Math.abs(d)} kun kechikdi`;
  if (d === 0) return "Bugun";
  if (d === 1) return "Ertaga";
  return `${d} kun qoldi`;
}

export default function DeadlinesWidget({
  overdueCount,
  dueSoonCount,
  upcoming,
  scopeLabel,
}: DeadlinesWidgetProps) {
  const empty = upcoming.length === 0;

  return (
    <div className="glass-card overflow-hidden">
      {/* Sarlavha */}
      <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <div className="flex items-center gap-2">
          <CalendarClock size={18} style={{ color: "var(--warning)" }} />
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Muddatlar</h2>
          {scopeLabel && (
            <span className="text-micro px-1.5 py-0.5 rounded-lg" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>
              {scopeLabel}
            </span>
          )}
        </div>
        <Link href="/deadlines" className="flex items-center gap-1 text-xs font-medium transition-colors" style={{ color: "var(--brand)" }}>
          Barchasi <ChevronRight size={14} />
        </Link>
      </div>

      {/* Ikki hisoblagich: o'tib ketgan / yaqin */}
      <div className="grid grid-cols-2 divide-x" style={{ borderColor: "var(--card-border)" }}>
        <Link
          href="/deadlines"
          className="p-4 flex items-center gap-3 transition-colors hover:bg-[var(--table-row-hover)]"
          style={overdueCount > 0 ? { background: "var(--danger-bg)" } : undefined}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--danger-bg)" }}>
            <AlertTriangle size={16} style={{ color: "var(--danger)" }} />
          </div>
          <div>
            <div
              className={`${overdueCount > 0 ? "text-3xl" : "text-xl"} font-bold tabular leading-none`}
              style={{ color: overdueCount > 0 ? "var(--danger)" : "var(--text-primary)" }}
            >
              {overdueCount}
            </div>
            <div className="text-micro mt-1" style={{ color: "var(--text-muted)" }}>O&apos;tib ketgan</div>
          </div>
        </Link>
        <Link href="/deadlines" className="p-4 flex items-center gap-3 transition-colors hover:bg-[var(--table-row-hover)]">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--warning-bg)" }}>
            <CalendarClock size={16} style={{ color: "var(--warning)" }} />
          </div>
          <div>
            <div className="text-xl font-bold tabular" style={{ color: dueSoonCount > 0 ? "var(--warning)" : "var(--text-primary)" }}>{dueSoonCount}</div>
            <div className="text-micro" style={{ color: "var(--text-muted)" }}>Yaqin 14 kun</div>
          </div>
        </Link>
      </div>

      {/* Ro'yxat */}
      {empty ? (
        <div className="p-8 text-center" style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--card-border)" }}>
          <CheckCircle2 size={28} className="mx-auto mb-2" style={{ color: "var(--success)", opacity: 0.5 }} />
          <p className="text-sm">Yaqin muddatlar yo&apos;q</p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
          {upcoming.map((o) => (
            <Link
              key={o.id}
              href="/deadlines"
              className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--table-row-hover)]"
              style={{ borderTop: "1px solid var(--card-border)" }}
            >
              <div
                className="w-1.5 h-9 rounded-full flex-shrink-0"
                style={{ background: o.isOverdue ? "var(--danger)" : "var(--warning)" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{o.templateName}</p>
                <p className="text-micro truncate" style={{ color: "var(--text-muted)" }}>{o.companyName} · {o.periodKey}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <Badge tone={o.isOverdue ? "danger" : "warning"} dot className="tracking-normal">
                  {relativeLabel(o.dueAt, o.isOverdue)}
                </Badge>
                <p className="text-micro mt-1" style={{ color: "var(--text-muted)" }}>{formatUzDate(o.dueAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
