import { prisma } from "../../lib/prisma";
import { expireOverdueQuestions } from "../contexts/monitoring/application/expire-questions";
import { recordQuestionKpi } from "../contexts/kpi/application/record-question-kpi";
import { enqueueNotifyJob } from "../queues/notify.queue";
import { autoManageReadiness, gatherChecklist } from "../../lib/monthClose";
import { currentPeriod } from "./chores";

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Protsess ichidagi jadval — FAQAT tez oyna talab qiladigan ishlar uchun.
 *
 * Kunlik ishlar (dalil yig'masi, saqlash muddati, to'lov eslatmalari) bu
 * yerdan olib tashlandi va BullMQ rejalariga o'tkazildi (bot/cron/chores.ts,
 * bot/queues/notify.queue.ts). Sabab: `setTimeout(msUntilHour(9))` har
 * restartda jadvalni siljitardi, ikkinchi instance ishni takrorlardi va
 * kechasi qayta ishga tushish o'sha kunlik yurishni butunlay yo'qotardi.
 *
 * Bu yerda qolgan ikkitasi Redis rejasiga to'g'ri kelmaydi: savol sweepi
 * daqiqalik oynani talab qiladi, oy yopilishi esa 5 daqiqalik tekshiruv
 * darchasi bilan ishlaydi. Ikkalasi ham idempotent → restart xavfsiz.
 */
export function startCron(): () => void {
  const sweepTimer = setInterval(async () => {
    try {
      const expiredIds = await expireOverdueQuestions(prisma, new Date());
      for (const id of expiredIds) {
        await recordQuestionKpi(prisma, id, "late");
      }
      if (expiredIds.length > 0) {
        console.log(`[cron] expired ${expiredIds.length} overdue question(s) → KPI`);
        // Escalate now rather than waiting for the 5-minute scheduler: a
        // supervisor is only useful if they hear about it while it still
        // matters. The sweep itself is idempotent, so an extra run is free.
        await enqueueNotifyJob({ kind: "escalate-questions" });
      }
    } catch (err) {
      console.error(`[cron] sweep failed: ${(err as Error).message}`);
    }
  }, SWEEP_INTERVAL_MS);

  // ── Month-end closing avtomatikasi ────────────────────────────────────────
  // Oy oxirgi kuni 23:55 — checklist (log/ogohlantirish); yangi oy 1-kuni
  // 00:05 — o'tgan oy uchun auto READY_TO_CLOSE (checklist yashil bo'lsa).
  // AUTO-CLOSE ATAYIN YO'Q: yopishni faqat administrator UI'dan bosadi.
  // 5 daqiqalik tekshiruv oynasi restart-safe: statuslar idempotent boshqariladi
  // (OPEN↔READY), shuning uchun qayta ishga tushish hech narsani buzmaydi.
  let lastChecklistRun = "";
  let lastAutoReadyRun = "";
  const monthClosingSweep = async () => {
    const now = new Date();
    const isLastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate();
    const hm = now.getHours() * 60 + now.getMinutes();

    // 23:55+ oy oxirgi kuni: joriy oy checklistini yurgizib natijani log qilamiz.
    if (isLastDayOfMonth && hm >= 23 * 60 + 55) {
      const key = currentPeriod(now);
      if (lastChecklistRun !== key) {
        lastChecklistRun = key;
        try {
          const res = await gatherChecklist(prisma, now.getFullYear(), now.getMonth() + 1);
          console.log(
            `[cron] month-closing checklist ${key}: ${res.ready ? "TAYYOR" : `bloklar: ${res.blockingErrors.join("; ")}`}`
          );
        } catch (err) {
          console.error(`[cron] month-closing checklist failed: ${(err as Error).message}`);
        }
      }
    }

    // 00:05–01:00 yangi oyning 1-kuni: O'TGAN oy uchun auto-ready.
    if (now.getDate() === 1 && hm >= 5 && hm < 60) {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const key = currentPeriod(prev);
      if (lastAutoReadyRun !== key) {
        lastAutoReadyRun = key;
        try {
          const res = await autoManageReadiness(prisma, prev.getFullYear(), prev.getMonth() + 1);
          console.log(`[cron] month-closing auto-ready ${key}: status=${res.status} (auto-close YO'Q — admin yopadi)`);
        } catch (err) {
          console.error(`[cron] month-closing auto-ready failed: ${(err as Error).message}`);
        }
      }
    }
  };
  const monthClosingTimer = setInterval(() => void monthClosingSweep(), 5 * 60_000);
  console.log(`[cron] month-closing: checklist last-day 23:55, auto-ready day-1 00:05 (no auto-close)`);

  return () => {
    clearInterval(sweepTimer);
    clearInterval(monthClosingTimer);
  };
}
