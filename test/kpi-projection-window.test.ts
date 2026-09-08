/**
 * KPI PROYEKSIYASI QACHON YURADI — jadval oynasi.
 *
 * Topilgan nuqson: `registerKpiSchedulers` o'tgan oyni yangi oyning 2-sanasida
 * BIR MARTA baholardi (`0 3 2 * *`). ASROda esa o'tgan oyning majburiyatlari
 * yangi oyning 7–25-sanalarida bitadi, ya'ni 2-sanada ularning hammasi hali
 * `planned` va muddati kelmagan. `verdictForObligation` bunday majburiyatga
 * ataylab `null` qaytaradi ("hukm erta"), job esa o'sha oyga boshqa qaytib
 * kelmasdi — natijada hisobot/soliq KPI'si HECH QACHON hisoblanmasdi.
 *
 * Prodda izi: 2026-08 uchun yozilgan 1 204 qatorning hammasi
 * `2026-09-02 08:49:49` da yaratilgan va hammasi DAVOMAT qoidalari; o'sha
 * oyning 3 573 ta majburiyatidan bittasi ham tushmagan.
 *
 * Ikki blok: (A) jadval kunlik bo'lib qoldimi va eski oylik jadval Redis'dan
 * olib tashlanadimi, (B) o'sha oynaning O'ZI — 2-sanada hukm yo'q, 26-sanada bor.
 *
 * DB kerak emas: BullMQ mocklanadi, verdikt esa sof funksiya.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

/** Mock fabrikasi tepaga ko'chgani uchun hoist qilinadi. */
const captured = vi.hoisted(() => ({
  schedulers: [] as { id: string; repeat: { pattern?: string; tz?: string }; job: { name: string; data: unknown } }[],
  removed: [] as string[],
}));

vi.mock("bullmq", () => ({
  Queue: class {
    async upsertJobScheduler(
      id: string,
      repeat: { pattern?: string; tz?: string },
      job: { name: string; data: unknown },
    ) {
      captured.schedulers.push({ id, repeat, job });
    }
    async removeJobScheduler(id: string) {
      captured.removed.push(id);
      return true;
    }
    async add() {}
  },
}));
// Redis'ga haqiqiy ulanish ochilmasin — `getKpiQueue` uni chaqiradi.
vi.mock("@/bot/queues/connection", () => ({ createRedisConnection: () => ({}) }));

const { registerKpiSchedulers, KPI_SCHEDULER_ID, LEGACY_KPI_SCHEDULER_ID } = await import(
  "@/bot/queues/kpi.queue"
);
const { verdictForObligation } = await import("@/lib/kpiEvidence");

// ─────────────────────────────────────────────────────────
// A. JADVAL
// ─────────────────────────────────────────────────────────

describe("KPI jadvali — o'tgan oy kunlik qayta baholanadi", () => {
  beforeAll(async () => {
    captured.schedulers.length = 0;
    captured.removed.length = 0;
    await registerKpiSchedulers();
  });

  const daily = () => captured.schedulers.find((s) => s.id === KPI_SCHEDULER_ID);

  it("har kuni 03:00 Asia/Tashkent da yuradi", () => {
    expect(daily()).toBeDefined();
    expect(daily()!.repeat.pattern).toBe("0 3 * * *");
    expect(daily()!.repeat.tz).toBe("Asia/Tashkent");
    expect(daily()!.job.name).toBe("project");
  });

  it("oyning bitta sanasiga QOTIRILMAGAN", () => {
    // `0 3 2 * *` — aynan shu naqsh oyning hisobot KPI'sini yo'q qilgandi.
    for (const s of captured.schedulers) {
      expect(s.repeat.pattern).not.toMatch(/^\d+\s+\d+\s+\d/);
    }
  });

  it("eski oylik jadval Redis'dan olib tashlanadi", () => {
    // BullMQ jadvallari Redis'da yashaydi: kodni o'zgartirish uni o'chirmaydi,
    // shuning uchun ikkalasi yonma-yon ishlab qolmasin.
    expect(captured.removed).toContain(LEGACY_KPI_SCHEDULER_ID);
    expect(captured.schedulers.map((s) => s.id)).not.toContain(LEGACY_KPI_SCHEDULER_ID);
  });
});

// ─────────────────────────────────────────────────────────
// B. OYNANING O'ZI
// ─────────────────────────────────────────────────────────

describe("o'tgan oy majburiyati yangi oy ichida bitadi", () => {
  // 2026-08 davrining haqiqiy muddatlari (prod DeadlineTemplate):
  //   CASHFLOW / ONEC_BASE — 09-07, TAX_SCHEDULE — 09-09, LETTERS — 09-10,
  //   INPS / DAROMAD_AGENT / MATERIALS — 09-15, QQS — 09-21, AR_AP / PNL — 09-25.
  const augustObligation = (dueAt: string) => ({
    status: "planned",
    dueAt: new Date(dueAt),
    completedAt: null,
    delayReason: null,
    delayApprovedById: null,
  });

  const OLD_CRON_DAY = new Date("2026-09-02T03:00:00Z"); // eski `0 3 2 * *`
  const LATER_DAILY_RUN = new Date("2026-09-26T03:00:00Z"); // kunlik jadval

  it("2-sanada hukm yo'q — o'sha kuni hech narsa yozilmasdi", () => {
    for (const due of ["2026-09-07", "2026-09-09", "2026-09-15", "2026-09-25"]) {
      expect(verdictForObligation(augustObligation(due), OLD_CRON_DAY)).toBeNull();
    }
  });

  it("muddat o'tgach hukm chiqadi — kunlik yurish uni ushlaydi", () => {
    for (const due of ["2026-09-07", "2026-09-09", "2026-09-15", "2026-09-25"]) {
      expect(verdictForObligation(augustObligation(due), LATER_DAILY_RUN)).toBe("red");
    }
  });

  it("oxirgi muddat (25) ham o'sha oy ichida ushlanadi", () => {
    // Kunlik jadval 1-oktabrda keyingi davrga o'tadi, shuning uchun 25-sanadagi
    // muddat 26–30 oralig'ida albatta baholanishi SHART.
    expect(verdictForObligation(augustObligation("2026-09-25"), new Date("2026-09-30T03:00:00Z"))).toBe("red");
  });
});
