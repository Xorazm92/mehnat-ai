// =====================================================
// VAZIFA WORKFLOW — o'tishlar va timing
// =====================================================
// Sof funksiyalar: qonuniy o'tishlar va o'tishda yoziladigan vaqt belgilari.
// SLA hisoblagichi olib tashlandi — kechikish yagona joyda, majburiyat
// muddati bo'yicha yuritiladi (lib/obligationWorkflow.ts).
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

/** O'tishda yoziladigan timing maydonlari. */
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
