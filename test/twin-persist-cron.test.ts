/**
 * `riskLevel` KECHALIK YOZILADI.
 *
 * M3 auditida topilgan yashirin nuqson: `Company.riskLevel` 7 joyda o'qiladi,
 * lekin uni faqat kokpitdagi QO'LDA bosiladigan tugma yangilardi. Ustun
 * jimgina eskirardi va buni hech kim sezmasdi — ekranlardagi "risk" bugungi
 * hisob emas, kimningdir eski bosishi edi.
 *
 * Ikki blok, ikki xil savol:
 *   A. Rejaga qo'yilganmi — `registerNotifySchedulers` haqiqatan
 *      `twin-persist-risk-levels` ni 02:00 Asia/Tashkent bilan yozadimi.
 *      BullMQ mocklanadi: Redis kerak emas, tekshiruv REJA haqida.
 *   B. Yozuvchining o'zi — `runPersistRiskLevels` ustunni yangilaydimi,
 *      audit izini qoldiradimi va ikkinchi yurishda jim turadimi.
 *
 * Nega B da `auditUserId: null`: kechalik yurish ortida ODAM YO'Q. Doira
 * uchun aktyor kerak (`companyScopeWhere`), lekin audit izida uni odamga
 * yozish "falonchi 213 firmani o'zgartirdi" degan yolg'on qoldirardi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL) — faqat B bloki uchun.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/** Mock ichida ko'rinishi uchun hoist qilinadi (vi.mock fabrikasi tepaga ko'chadi). */
const captured = vi.hoisted(() => ({
  schedulers: [] as { id: string; repeat: { pattern?: string; tz?: string }; job: { name: string; data: unknown } }[],
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
    async add() {}
  },
}));
// Redis'ga haqiqiy ulanish ochilmasin — `getNotifyQueue` uni chaqiradi.
vi.mock("@/bot/queues/connection", () => ({ createRedisConnection: () => ({}) }));

const { prisma } = await import("@/lib/prisma");
const { registerNotifySchedulers } = await import("@/bot/queues/notify.queue");
const { runPersistRiskLevels } = await import("@/lib/domains/accounting/twinPersistRun");

// ─────────────────────────────────────────────────────────
// A. REJAGA QO'YILGANMI
// ─────────────────────────────────────────────────────────

describe("notify schedulers — twin persist kechalik rejada", () => {
  beforeAll(async () => {
    captured.schedulers.length = 0;
    // `null` — to'lov eslatmalari o'chirilgan holat (bot/main.ts dagi shakl).
    await registerNotifySchedulers(null);
  });

  const persist = () => captured.schedulers.find((s) => s.id === "twin-persist-risk-levels");

  it("scheduler ro'yxatdan o'tadi", () => {
    expect(persist()).toBeDefined();
  });

  it("har kechasi 02:00 Asia/Tashkent", () => {
    expect(persist()!.repeat.pattern).toBe("0 2 * * *");
    expect(persist()!.repeat.tz).toBe("Asia/Tashkent");
  });

  it("ishchi tanish job turini oladi", () => {
    expect(persist()!.job.data).toEqual({ kind: "twin-persist-risk-levels" });
  });

  it("ogohlantirishdan OLDIN yuradi — alert yangi qiymatga tushsin", () => {
    // 02:00 < 09:10. Tartib buzilsa alert bir kun eski ustunga qarab ishlaydi.
    const alerts = captured.schedulers.find((s) => s.id === "notify-twin-alerts");
    expect(alerts).toBeDefined();
    const minutes = (p: string) => {
      const [m, h] = p.split(" ");
      return Number(h) * 60 + Number(m);
    };
    expect(minutes(persist()!.repeat.pattern!)).toBeLessThan(minutes(alerts!.repeat.pattern!));
  });
});

// ─────────────────────────────────────────────────────────
// B. YOZUVCHINING O'ZI
// ─────────────────────────────────────────────────────────

const TAG = `vitest-persist-${Date.now()}`;
const PERIOD = "2019-05";
const ids = { company: "", acc: "" };
let templateSeq = 0;

const day = (d: number) => new Date(Date.UTC(2019, 4, d));

/** Har majburiyat o'z template'i bilan — `@@unique` bitta davrga bittasini beradi. */
async function mkObligation(status: string, dueDay: number) {
  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T${++templateSeq}`,
      name: `Persist test ${templateSeq}`,
      obligationType: "tax_declaration",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2015, 0, 1)),
      lifecycle: "active",
    },
    select: { id: true },
  });
  await prisma.obligation.create({
    data: {
      companyId: ids.company,
      templateId: t.id,
      templateVersion: 1,
      periodStart: day(1),
      periodEnd: new Date(Date.UTC(2019, 5, 1)),
      periodKey: "2019-M05",
      dueAt: day(dueDay),
      status: status as never,
      responsibleUserId: ids.acc,
    },
  });
}

beforeAll(async () => {
  const acc = await prisma.user.create({
    data: { email: `${TAG}@v.local`, fullName: `${TAG} acc`, passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  ids.acc = acc.id;

  const co = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`,
      inn: "000000000",
      taxRegime: "vat",
      isActive: true,
      companyStatus: "active",
      contractDate: new Date(Date.UTC(2015, 0, 1)),
      complexity: "standard",
      accountantId: acc.id,
      // ATAYLAB `low` — yurish uni ko'tarishi kerak.
      riskLevel: "low",
    },
    select: { id: true },
  });
  ids.company = co.id;

  // Muddati o'tgan + rad etilgan ⇒ xavf `low` dan yuqori chiqadi.
  await mkObligation("planned", 5);
  await mkObligation("planned", 8);
  await mkObligation("rejected", 12);
});

afterAll(async () => {
  await prisma.obligation.deleteMany({ where: { template: { code: { startsWith: TAG } } } });
  await prisma.deadlineTemplate.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.auditLog.deleteMany({ where: { recordId: `twin:${PERIOD}`, userId: null } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.acc } });
  await prisma.$disconnect();
});

describe("runPersistRiskLevels — sessiyasiz yurish", () => {
  /** Doira buxgalter biriktiruvi orqali — sinov firmasidan nariga chiqmaydi. */
  const actor = () => ({ id: ids.acc, role: "accountant" });

  it("hisoblangan darajani ustunga yozadi va SABABINI qoldiradi", async () => {
    const res = await runPersistRiskLevels(prisma, { actor: actor(), period: PERIOD, auditUserId: null });
    expect(res.updated).toBeGreaterThanOrEqual(1);

    const co = await prisma.company.findUniqueOrThrow({
      where: { id: ids.company },
      select: { riskLevel: true, riskNotes: true },
    });
    expect(co.riskLevel).not.toBe("low");
    // 7-modda: manbagacha kuzatib bo'lmaydigan raqam ko'rsatilmaydi.
    expect(co.riskNotes).toBeTruthy();
  });

  it("audit izi ODAMSIZ yoziladi — userId null", async () => {
    const rows = await prisma.auditLog.findMany({
      where: { tableName: "Company", recordId: `twin:${PERIOD}` },
      select: { userId: true, action: true },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Kechalik yurish ortida odam yo'q — uni birovga yozish yolg'on bo'lardi.
    expect(rows.every((r) => r.userId === null)).toBe(true);
    expect(rows.every((r) => r.action === "update")).toBe(true);
  });

  it("ikkinchi yurish hech nima yozmaydi (o'zgarganigina yoziladi)", async () => {
    const res = await runPersistRiskLevels(prisma, { actor: actor(), period: PERIOD, auditUserId: null });
    expect(res.updated).toBe(0);
    expect(res.considered).toBeGreaterThanOrEqual(1);
  });
});
