/**
 * "Ishlar" ekranining tiplari va domen meta-ma'lumoti.
 *
 * Nega alohida fayl: `loadWorkInbox.ts` (server) qatorlarning shaklini bilishi
 * kerak, lekin u `WorkInboxClient.tsx` dan import qilardi — ya'ni SERVER fayli
 * `"use client"` moduliga bog'langan edi. Tiplar shu yerga chiqarilgach, bu
 * bog'liqlik yo'qoldi.
 *
 * Bu yerda faqat SHAKL va YORLIQ bor. Holat o'tishlari (kim nimani qila oladi)
 * server tomonda — `server/obligations.ts` va `server/tasks.ts` da; bu fayl
 * ularni takrorlamaydi, faqat ko'rsatadi.
 */
import type { ObligationStatus, TaskStatus } from "@prisma/client";

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

export interface UserLite { id: string; fullName: string }
export interface CompanyLite { id: string; name: string }
export interface Counts { all: number; mine: number; overdue: number }

/** Tasdiqlash/bekor qilish huquqi bor rollar. Server ham shu qoidani qo'llaydi. */
export const SENIOR = new Set(["super_admin", "admin", "chief_accountant", "supervisor"]);

/** Boshqa holatga o'tmaydigan (yopilgan) majburiyatlar. */
export const TERMINAL = new Set(["accepted", "cancelled"]);

type StatusMeta = { label: string; bg: string; fg: string };

export const OBLIGATION_STATUS: Record<string, StatusMeta> = {
  planned: { label: "Rejalashtirilgan", bg: "var(--rule)", fg: "var(--text-secondary)" },
  in_progress: { label: "Jarayonda", bg: "var(--info-bg)", fg: "var(--brand-deep)" },
  ready: { label: "Tayyor", bg: "var(--accent-indigo-light)", fg: "var(--accent-indigo)" },
  sent: { label: "Yuborilgan", bg: "var(--warning-bg)", fg: "var(--warning)" },
  accepted: { label: "Qabul qilingan", bg: "var(--success-bg)", fg: "var(--success)" },
  rejected: { label: "Rad etilgan", bg: "var(--danger-bg)", fg: "var(--danger-dark)" },
  cancelled: { label: "Bekor qilingan", bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
};

export const TASK_STATUS: Record<string, StatusMeta> = {
  open: { label: "Ochiq", bg: "var(--rule)", fg: "var(--text-secondary)" },
  in_progress: { label: "Jarayonda", bg: "var(--info-bg)", fg: "var(--brand-deep)" },
  blocked: { label: "Bloklangan", bg: "var(--warning-bg)", fg: "var(--warning)" },
  done: { label: "Bajarilgan", bg: "var(--success-bg)", fg: "var(--success)" },
  cancelled: { label: "Bekor", bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
};

export const PRIORITY_META: Record<string, StatusMeta> = {
  low: { label: "Past", bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
  normal: { label: "O'rta", bg: "var(--accent-indigo-light)", fg: "var(--accent-indigo)" },
  high: { label: "Yuqori", bg: "var(--warning-bg)", fg: "var(--warning)" },
  urgent: { label: "Shoshilinch", bg: "var(--danger-bg)", fg: "var(--danger-dark)" },
};

export const DELAY_LABELS: Record<string, string> = {
  accountant_delay: "Buxgalter kechikishi",
  client_delay: "Mijoz kechikishi",
  system_failure: "Tizim nosozligi",
  external_authority: "Tashqi organ",
  management_decision: "Rahbariyat qarori",
  other: "Boshqa",
};

export interface ObligationAction { label: string; to: ObligationStatus; senior?: boolean; danger?: boolean }

export function obligationActions(status: string): ObligationAction[] {
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

export interface TaskAction { label: string; to: TaskStatus; danger?: boolean }

export function taskActions(status: string): TaskAction[] {
  switch (status) {
    case "open": return [{ label: "Boshlash", to: "in_progress" }, { label: "Bekor", to: "cancelled", danger: true }];
    case "in_progress": return [{ label: "Bajarildi", to: "done" }, { label: "Bloklandi", to: "blocked" }, { label: "Bekor", to: "cancelled", danger: true }];
    case "blocked": return [{ label: "Davom", to: "in_progress" }, { label: "Bekor", to: "cancelled", danger: true }];
    case "done": return [{ label: "Qayta ochish", to: "in_progress" }];
    default: return [];
  }
}

/** Vazifa "kechikkan" — muddati o'tgan va hali yopilmagan. */
export function taskLate(t: TaskRow): boolean {
  if (t.status === "done" || t.status === "cancelled") return false;
  return !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
}

/** Qator qidiruvga qanday matn bilan tushadi. */
export function searchText(r: WorkRow): string {
  return r.kind === "obligation"
    ? `${r.companyName} ${r.templateName} ${r.periodKey}`
    : `${r.companyName ?? ""} ${r.title} ${r.taskType ?? ""} ${r.obligationLabel ?? ""}`;
}
