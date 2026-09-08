import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";

export interface KpiJob {
  kind: "project";
  /** "YYYY-MM". Bo'sh bo'lsa — o'tgan oy (kunlik jadval shu oyni qayta baholaydi). */
  month?: string;
}

let queue: Queue<KpiJob> | null = null;

export function getKpiQueue(): Queue<KpiJob> {
  if (!queue) {
    queue = new Queue<KpiJob>(QUEUE.KPI, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
  }
  return queue;
}

export const KPI_SCHEDULER_ID = "kpi-project-daily";

/**
 * Bir marta oyda yuradigan ESKI jadval. BullMQ jadvallari Redis'da saqlanadi,
 * ya'ni kodni o'zgartirish bilan o'z-o'zidan yo'qolmaydi — ataylab olib
 * tashlanadi, aks holda ikkala jadval yonma-yon ishlab turaveradi.
 */
export const LEGACY_KPI_SCHEDULER_ID = "kpi-project-monthly";

/**
 * HAR KUNI 03:00 (Tashkent) — o'tgan oy uchun KPI takliflarini qayta hisoblaydi.
 *
 * NEGA HAR KUNI, oyning 2-sanasi EMAS. Eski jadval (`0 3 2 * *`) o'tgan oyni
 * yangi oyning 2-sanasida BIR MARTA baholardi va boshqa hech qachon qaytib
 * kelmasdi. Lekin ASROda o'tgan oyning majburiyatlari aynan yangi oyning
 * 7–25-sanalarida bitadi (CASHFLOW/ONEC_BASE — 7, TAX_SCHEDULE — 9, LETTERS —
 * 10, INPS/DAROMAD/MATERIALS — 15, QQS — 21, AR_AP/PNL — 25). 2-sanada ularning
 * BARCHASI hali `planned` va muddati kelmagan, `verdictForObligation` esa bunday
 * majburiyatga ataylab `null` qaytaradi ("hukm erta"). Natijada oyning
 * hisobot/soliq KPI'si HECH QACHON hisoblanmasdi.
 *
 * Buning izi PRODDA o'lchandi (2026-09-08). 2026-08 davrida mas'uli bor 4 435 ta
 * majburiyat bor; 2-sanadagi yurish (`2026-09-01 22:00 UTC` = 03:00 Toshkent)
 * ulardan atigi 777 ta qator chiqargan va faqat 4 ta qoidadan: o'sha kunga
 * muddati o'tganlaridan. Muddati 7–25-sanalarga tushadigan `acc_1c_base`,
 * `acc_debitor`, `acc_materials`, `acc_pnl_report`, `acc_letters` — bittasi ham
 * yozilmagan va boshqa hech qachon yozilmasdi ham.
 *
 * Kunlik yurish xavfsiz: `flushProposals` upsert qiladi (dublikat yo'q) va
 * `approved` yoki `source='supervisor'` qatorga tegmaydi (ADR-0001), ya'ni
 * nazoratchining qarori hech qachon ustidan yozilmaydi. Naqsh
 * `obligation-generate-daily` bilan bir xil.
 */
export async function registerKpiSchedulers(): Promise<void> {
  const q = getKpiQueue();
  await q.upsertJobScheduler(
    KPI_SCHEDULER_ID,
    { pattern: "0 3 * * *", tz: "Asia/Tashkent" },
    { name: "project", data: { kind: "project" } }
  );
  await q.removeJobScheduler(LEGACY_KPI_SCHEDULER_ID);
}

export async function enqueueKpiJob(job: KpiJob): Promise<void> {
  await getKpiQueue().add(job.kind, job);
}
