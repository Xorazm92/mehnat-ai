import { prisma } from "../../lib/prisma";
import { expireOverdueQuestions } from "../contexts/monitoring/application/expire-questions";
import { recordQuestionKpi } from "../contexts/kpi/application/record-question-kpi";

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Background schedules. The deadline sweep marks overdue pending questions as
 * late every minute. It scans only pending rows (the `(status, deadlineAt)`
 * index) and reads all state from Postgres, so it is restart-safe and never
 * walks chats. Returns a stop function.
 */
export function startCron(): () => void {
  const tick = async () => {
    try {
      const expiredIds = await expireOverdueQuestions(prisma, new Date());
      for (const id of expiredIds) {
        await recordQuestionKpi(prisma, id, "late"); // penalty event per expiry
      }
      if (expiredIds.length > 0) {
        console.log(`[cron] expired ${expiredIds.length} overdue question(s) → KPI`);
      }
    } catch (err) {
      console.error(`[cron] sweep failed: ${(err as Error).message}`);
    }
  };
  const timer = setInterval(tick, SWEEP_INTERVAL_MS);
  return () => clearInterval(timer);
}
