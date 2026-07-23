// =====================================================
// TASK WORKFLOW — transitions + timing + SLA due (Faza C1)
// =====================================================
// Sof funksiyalar: qonuniy o'tishlar, o'tishda yoziladigan timing, va SLA
// muddatlarini (response/resolution) siyosatdan hisoblash. server/tasks.ts
// shularni qo'llaydi.
import type { TaskStatus } from "@prisma/client";

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["blocked", "done", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  done: ["in_progress"], // qayta ochish (rework)
  cancelled: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** O'tishda yoziladigan timing maydonlari (firstResponseAt alohida — service qo'shadi). */
export function taskTimingPatch(to: TaskStatus, now: Date): Record<string, Date> {
  switch (to) {
    case "in_progress":
      return { startedAt: now };
    case "done":
      return { completedAt: now };
    case "cancelled":
      return { completedAt: now };
    default:
      return {};
  }
}

export interface SlaPolicyLite {
  responseMinutes?: number | null;
  resolutionMinutes?: number | null;
}

/** Siyosat + boshlanish vaqtidan SLA muddatlari (wall-clock). businessHoursOnly — TODO. */
export function computeSlaDue(
  policy: SlaPolicyLite | null | undefined,
  from: Date,
): { responseDueAt: Date | null; resolutionDueAt: Date | null } {
  if (!policy) return { responseDueAt: null, resolutionDueAt: null };
  const min = (m?: number | null) => (m != null && m > 0 ? new Date(from.getTime() + m * 60_000) : null);
  return { responseDueAt: min(policy.responseMinutes), resolutionDueAt: min(policy.resolutionMinutes) };
}
