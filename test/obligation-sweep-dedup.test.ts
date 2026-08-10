/**
 * B4b-E · SWEEP DEDUP SMOKE TESTLARI
 * ===================================
 * Bu testlar aynan B4b buzilishini va uning tuzatilishini qamrab oladi.
 *
 * NIMA BO'LGAN EDI: `sweepDeadlines` bosqichlarni `NotificationDelivery`
 * (channel, dedupKey) unikal indeksi bilan bir martaga "band qiladi". dedupKey
 * da SANA YO'Q, shuning uchun band qilish DOIMIY. Test to'plami sweep'ni
 * 2097-yil bilan ishchi bazaga qarshi yurgizganda barcha real majburiyatlar
 * uchun barcha bosqichlar band qilinib qolgan va bot yoqilganda ular jimgina
 * o'tkazib yuboriladigan bo'lgan.
 *
 * Shuning uchun bu yerda ikki narsa tekshiriladi:
 *   1. dedup TO'G'RI ishlaydi — takroriy sweep dublikat yaratmaydi
 *   2. dedup qatorlari o'chirilsa bosqichlar QAYTA yaratiladi — ya'ni B4b
 *      tozalashi eslatma qobiliyatini haqiqatan tiklaydi
 *
 * DIQQAT: `sweepDeadlines` BUTUN `Obligation` jadvali ustidan yuradi (qamrov
 * parametri yo'q). Shuning uchun har bir tasdiq FAQAT shu faylning o'z
 * majburiyatiga tegishli dedupKey'lar bo'yicha sanaladi va sana kelajakka
 * surilmaydi — boshqa fikstura'larni "kechikkan" holatga tushirmaslik uchun.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { sweepDeadlines } = await import("@/lib/obligationSweep");
const { escalationDedupKey } = await import("@/lib/escalation");

const TAG = `vitest-dedup-${Date.now()}`;

/** Muddat — o'tmishda emas, kelajakda: boshqa fikstura'larga ta'sir qilmaydi. */
const DUE = new Date(Date.UTC(2031, 4, 20)); // 2031-05-20
const dayOffset = (days: number) => new Date(DUE.getTime() + days * 86_400_000);

let companyId = "";
let templateId = "";
let obligationId = "";
let accountantId = "";
let supervisorId = "";
let chiefId = "";

/** Shu majburiyatga tegishli yetkazish qatorlari (kanal bo'yicha). */
async function deliveries(channel: string, suffix?: string): Promise<number> {
  return prisma.notificationDelivery.count({
    where: {
      channel,
      dedupKey: suffix
        ? `obligation:${obligationId}:${suffix}`
        : { startsWith: `obligation:${obligationId}:` },
    },
  });
}

const sweepAt = (now: Date) => sweepDeadlines(prisma, { now });

beforeAll(async () => {
  const mkUser = async (suffix: string, role: UserRole) =>
    prisma.user.create({
      data: { email: `${TAG}-${suffix}@v.local`, fullName: `${TAG} ${suffix}`, passwordHash: "x", role },
      select: { id: true },
    });

  accountantId = (await mkUser("acc", "accountant")).id;
  supervisorId = (await mkUser("sup", "supervisor")).id;
  chiefId = (await mkUser("chief", "chief_accountant")).id;

  const company = await prisma.company.create({
    data: {
      name: `${TAG} firma`,
      inn: "999999999",
      accountantId,
      supervisorId,
      chiefAccountantId: chiefId,
      contractDate: new Date(Date.UTC(2031, 0, 1)),
    },
    select: { id: true },
  });
  companyId = company.id;

  const tpl = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}_TPL`,
      version: 1,
      name: "Dedup smoke shabloni",
      obligationType: "internal_task",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 20,
      adjustmentPolicy: "none",
      effectiveFrom: new Date(Date.UTC(2031, 0, 1)),
      lifecycle: "active",
      active: true,
    },
    select: { id: true },
  });
  templateId = tpl.id;

  const obl = await prisma.obligation.create({
    data: {
      companyId,
      templateId,
      templateVersion: 1,
      periodStart: new Date(Date.UTC(2031, 3, 1)),
      periodEnd: new Date(Date.UTC(2031, 4, 1)),
      periodKey: "2031-M04",
      dueAt: DUE,
      status: "planned",
      responsibleUserId: accountantId,
      backupUserId: supervisorId,
    },
    select: { id: true },
  });
  obligationId = obl.id;
});

afterAll(async () => {
  await prisma.notificationDelivery.deleteMany({
    where: { dedupKey: { startsWith: `obligation:${obligationId}:` } },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: [accountantId, supervisorId, chiefId] } } });
  await prisma.obligationStatusEvent.deleteMany({ where: { obligationId } });
  await prisma.obligation.deleteMany({ where: { id: obligationId } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: templateId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { id: { in: [accountantId, supervisorId, chiefId] } } });
  await prisma.$disconnect();
});

describe("B4b · sweep dedup", () => {
  it("1-2-3 · D-5 bosqichi bitta eslatma yaratadi", async () => {
    await sweepAt(dayOffset(-5));

    expect(await deliveries("inapp", "reminder:D-5")).toBe(1);
    // Hali yetib kelmagan bosqichlar yaratilmasligi kerak.
    expect(await deliveries("inapp", "reminder:D-3")).toBe(0);
    expect(await deliveries("inapp", "reminder:due")).toBe(0);

    const notif = await prisma.notification.count({
      where: { userId: accountantId, type: "obligation_reminder" },
    });
    expect(notif).toBe(1);
  });

  it("4 · AYNAN o'sha sweep qayta yurgizilsa dublikat 0", async () => {
    const before = await deliveries("inapp");
    const res = await sweepAt(dayOffset(-5));

    expect(await deliveries("inapp")).toBe(before);
    expect(await deliveries("inapp", "reminder:D-5")).toBe(1);
    expect(res.remindersDeduped).toBeGreaterThan(0);
  });

  it("5 · D-3 keyingi bosqichni qo'shadi, oldingisi takrorlanmaydi", async () => {
    await sweepAt(dayOffset(-3));

    expect(await deliveries("inapp", "reminder:D-3")).toBe(1);
    expect(await deliveries("inapp", "reminder:D-5")).toBe(1); // o'zgarmadi
    expect(await deliveries("inapp", "reminder:D-1")).toBe(0);
  });

  it("6 · muddat kuni L1 eskalatsiyasi band qilinadi", async () => {
    await sweepAt(DUE);

    expect(await deliveries("inapp", "reminder:due")).toBe(1);
    const l1 = await prisma.notificationDelivery.count({
      where: { channel: "escalation", dedupKey: escalationDedupKey("obligation", obligationId, 1) },
    });
    expect(l1).toBe(1);
  });

  it("6b · muddat o'tgach L2 eskalatsiyasi va firstOverdueAt", async () => {
    const now = dayOffset(1);
    await sweepAt(now);

    expect(await deliveries("inapp", "reminder:overdue:L1")).toBe(1);
    const l2 = await prisma.notificationDelivery.count({
      where: { channel: "escalation", dedupKey: escalationDedupKey("obligation", obligationId, 2) },
    });
    expect(l2).toBe(1);

    const o = await prisma.obligation.findUnique({
      where: { id: obligationId },
      select: { firstOverdueAt: true },
    });
    // firstOverdueAt — KUZATUV vaqti (sweep qachon ko'rgani), hisoblangan sana emas.
    expect(o!.firstOverdueAt?.toISOString()).toBe(now.toISOString());
  });

  it("7 · worker crash/restart: parallel ikki sweep ham dublikat yaratmaydi", async () => {
    const before = await deliveries("inapp");
    const beforeEsc = await deliveries("escalation");

    // Ikki worker bir vaqtda ko'tarilgan holat — unikal indeks yagona himoya.
    await Promise.all([sweepAt(dayOffset(2)), sweepAt(dayOffset(2))]);

    expect(await deliveries("inapp")).toBe(before);
    expect(await deliveries("escalation")).toBe(beforeEsc);
  });

  it("8 · takroriy sweep hech qanday yangi qator qo'shmaydi", async () => {
    const before = await deliveries("inapp");
    await sweepAt(dayOffset(3));
    await sweepAt(dayOffset(4));
    expect(await deliveries("inapp")).toBe(before);
  });

  it("B4b · dedup qatorlari tozalangach bosqichlar QAYTA yaratiladi", async () => {
    // Aynan B4b tozalashi qiladigan ish: shu majburiyatning dedup daftarini
    // o'chiramiz (Notification va Obligation tegilmaydi).
    const notifBefore = await prisma.notification.count({ where: { userId: accountantId } });
    const oblBefore = await prisma.obligation.count({ where: { id: obligationId } });

    const cleared = await prisma.notificationDelivery.deleteMany({
      where: { dedupKey: { startsWith: `obligation:${obligationId}:` } },
    });
    expect(cleared.count).toBeGreaterThan(0);
    expect(await deliveries("inapp")).toBe(0);

    // Tozalashdan keyin sweep yana ishlashi SHART — B4b'ning butun maqsadi shu.
    const res = await sweepAt(dayOffset(1));

    expect(res.remindersCreated).toBeGreaterThan(0);
    expect(await deliveries("inapp", "reminder:due")).toBe(1);
    expect(await deliveries("inapp", "reminder:overdue:L1")).toBe(1);
    const l2 = await prisma.notificationDelivery.count({
      where: { channel: "escalation", dedupKey: escalationDedupKey("obligation", obligationId, 2) },
    });
    expect(l2).toBe(1);

    // Tegilmasligi kerak bo'lganlar o'zgarmagan.
    expect(await prisma.obligation.count({ where: { id: obligationId } })).toBe(oblBefore);
    expect(
      await prisma.notification.count({ where: { userId: accountantId } }),
    ).toBeGreaterThanOrEqual(notifBefore);
  });
});
