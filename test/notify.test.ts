/**
 * UMUMIY XABARNOMA (lib/notify.ts) + 1C baza xabarnomasi (lib/oneCBase.ts):
 *   - sayt ichidagi Notification har doim yoziladi (Telegram yiqilsa ham);
 *   - dedupKey band bo'lsa ikkinchi chaqiruv hech narsa yubormaydi;
 *   - Telegram porti in'ektsiya qilinadi — bu yerda soxta port bilan tekshiriladi;
 *   - qabul qiluvchi sozlamadan olinadi, bo'sh bo'lsa adminlarga tushadi.
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { notifyUsers } = await import("@/lib/notify");
const { notifyOneCBaseNeeded, resolveOneCRecipients, ONE_C_CHANNEL, ONE_C_SETTING_KEY } =
  await import("@/lib/oneCBase");

const TAG = `vitest-notify-${Date.now()}`;
const ids = { userA: "", userB: "", admin: "" };
/** Sozlamani test o'zgartiradi — oldingi qiymati qaytarilishi shart. */
let savedSetting: unknown = undefined;
let hadSetting = false;

beforeAll(async () => {
  const [a, b, admin] = await Promise.all([
    prisma.user.create({
      data: { email: `${TAG}-a@vitest.local`, fullName: `${TAG} A`, passwordHash: "x", role: "accountant" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: `${TAG}-b@vitest.local`, fullName: `${TAG} B`, passwordHash: "x", role: "accountant" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: `${TAG}-admin@vitest.local`, fullName: `${TAG} admin`, passwordHash: "x", role: "admin" },
      select: { id: true },
    }),
  ]);
  ids.userA = a.id;
  ids.userB = b.id;
  ids.admin = admin.id;

  const existing = await prisma.systemSetting.findUnique({ where: { key: ONE_C_SETTING_KEY } });
  hadSetting = existing != null;
  savedSetting = existing?.value;
});

afterAll(async () => {
  const userIds = [ids.userA, ids.userB, ids.admin];
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notificationDelivery.deleteMany({ where: { recipientId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  if (hadSetting) {
    await prisma.systemSetting.update({
      where: { key: ONE_C_SETTING_KEY },
      data: { value: savedSetting as never },
    });
  } else {
    await prisma.systemSetting.deleteMany({ where: { key: ONE_C_SETTING_KEY } });
  }
  await prisma.$disconnect();
});

describe("notifyUsers", () => {
  it("bir nechta xodimga sayt ichida yozadi va Telegram portini chaqiradi", async () => {
    const sent: { userIds: string[]; text: string }[] = [];
    const res = await notifyUsers(
      prisma,
      {
        userIds: [ids.userA, ids.userB],
        type: "system",
        title: "Sarlavha",
        message: "Matn",
        link: "/organizations",
        channel: `${TAG}-ch1`,
        dedupKey: `${TAG}-k1`,
      },
      { dispatchTelegram: async (i) => void sent.push(i) }
    );

    expect(res).toEqual({ inapp: 2, telegramQueued: true, skipped: false, budgetSkipped: false });
    expect(sent).toHaveLength(1);
    expect(sent[0].userIds.sort()).toEqual([ids.userA, ids.userB].sort());
    expect(sent[0].text).toContain("Sarlavha");
  });

  it("bir xil dedupKey bilan ikkinchi marta hech narsa yubormaydi", async () => {
    const before = await prisma.notification.count({ where: { userId: ids.userA } });
    const res = await notifyUsers(prisma, {
      userIds: [ids.userA],
      type: "system",
      title: "Takror",
      message: "Takror",
      channel: `${TAG}-ch1`,
      dedupKey: `${TAG}-k1`,
    });

    expect(res.skipped).toBe(true);
    expect(res.inapp).toBe(0);
    expect(await prisma.notification.count({ where: { userId: ids.userA } })).toBe(before);
  });

  it("Telegram porti yiqilsa ham sayt ichidagi xabar qoladi", async () => {
    const res = await notifyUsers(
      prisma,
      {
        userIds: [ids.userA],
        type: "system",
        title: "Telegramsiz",
        message: "Matn",
        channel: `${TAG}-ch2`,
        dedupKey: `${TAG}-k2`,
      },
      {
        dispatchTelegram: async () => {
          throw new Error("Redis yo'q");
        },
      }
    );

    expect(res.inapp).toBe(1);
    expect(res.telegramQueued).toBe(false);
    const delivery = await prisma.notificationDelivery.findUnique({
      where: { channel_dedupKey: { channel: `${TAG}-ch2`, dedupKey: `${TAG}-k2` } },
    });
    // "skipped": urinish bo'ldi-yu yetmadi. Kalit ATAYIN bo'shatilmaydi —
    // in-app qator yozilgan va u vakolatli kanal; kalit bo'shasa qayta
    // chaqiruv o'sha qatorni ikkinchi marta yozardi.
    expect(delivery?.status).toBe("skipped");
    expect(delivery?.sentAt).toBeNull();
  });

  it("navbatga qo'yilganda `queued` yozadi — `sent` EMAS", async () => {
    // Bungacha bu yerda `sent` turardi, holbuki xabar faqat BullMQ navbatiga
    // tushgan bo'lardi: Telegram uni qabul qildimi yoki yo'qmi noma'lum.
    const res = await notifyUsers(
      prisma,
      {
        userIds: [ids.userA],
        type: "system",
        title: "Navbat",
        message: "Matn",
        channel: `${TAG}-ch-q`,
        dedupKey: `${TAG}-kq`,
      },
      { dispatchTelegram: async () => {} }
    );
    expect(res.telegramQueued).toBe(true);
    const row = await prisma.notificationDelivery.findUnique({
      where: { channel_dedupKey: { channel: `${TAG}-ch-q`, dedupKey: `${TAG}-kq` } },
    });
    expect(row?.status).toBe("queued");
  });

  it("`dedupeKey` — parallel chaqiruvda ham bitta in-app qator", async () => {
    // `findFirst` + `create` naqshi (bungacha notify-red.ts da) bu testda
    // ikkita qator yozardi: ikkala so'rov ham "yo'q" deb topardi.
    const dedupeKey = `${TAG}-race`;
    const call = () =>
      notifyUsers(prisma, {
        userIds: [ids.userB],
        type: "system",
        title: "Poyga",
        message: "Matn",
        channel: `${TAG}-ch-race`,
        dedupeKey,
      });
    await Promise.all([call(), call(), call()]);
    const rows = await prisma.notification.count({ where: { userId: ids.userB, dedupeKey } });
    expect(rows).toBe(1);
  });

  it("byudjet: `low` Telegramda to'xtaydi, in-app qolaveradi", async () => {
    const { NOTIFY_DAILY_TELEGRAM_BUDGET } = await import(
      "@/lib/engines/automation/notificationBudget"
    );
    // Byudjetni to'ldiramiz: `queued` qatorlar sanaladi.
    await prisma.notificationDelivery.createMany({
      data: Array.from({ length: NOTIFY_DAILY_TELEGRAM_BUDGET }, (_, i) => ({
        channel: `${TAG}-fill`,
        level: "yellow",
        dedupKey: `${TAG}-fill-${i}`,
        recipientId: ids.admin,
        status: "queued",
        sentAt: new Date(),
      })),
    });

    let dispatched = 0;
    const low = await notifyUsers(
      prisma,
      {
        userIds: [ids.admin],
        type: "system",
        title: "Past",
        message: "Matn",
        channel: `${TAG}-ch-low`,
        priority: "low",
      },
      { dispatchTelegram: async () => void dispatched++ }
    );
    expect(low.inapp).toBe(1); // xabar YO'QOLMAYDI
    expect(low.budgetSkipped).toBe(true);
    expect(dispatched).toBe(0);

    // `critical` byudjetdan o'tib ketadi.
    const critical = await notifyUsers(
      prisma,
      {
        userIds: [ids.admin],
        type: "system",
        title: "Shoshilinch",
        message: "Matn",
        channel: `${TAG}-ch-crit`,
        priority: "critical",
      },
      { dispatchTelegram: async () => void dispatched++ }
    );
    expect(critical.telegramQueued).toBe(true);
    expect(dispatched).toBe(1);

    await prisma.notificationDelivery.deleteMany({ where: { channel: `${TAG}-fill` } });
  });

  it("tashqi havolani rad etadi (ochiq redirect bo'lmasin)", async () => {
    await notifyUsers(prisma, {
      userIds: [ids.userB],
      type: "system",
      title: "Havola",
      message: "Matn",
      link: "//evil.example.com",
      channel: `${TAG}-ch3`,
      dedupKey: `${TAG}-k3`,
    });

    const row = await prisma.notification.findFirst({
      where: { userId: ids.userB, title: "Havola" },
      select: { link: true },
    });
    expect(row?.link).toBeNull();
  });

  it("qabul qiluvchi yo'q bo'lsa hech narsa qilmaydi", async () => {
    const res = await notifyUsers(prisma, {
      userIds: [],
      type: "system",
      title: "Bo'sh",
      message: "Matn",
      channel: `${TAG}-ch4`,
      dedupKey: `${TAG}-k4`,
    });
    expect(res).toEqual({ inapp: 0, telegramQueued: false, skipped: false, budgetSkipped: false });
  });
});

describe("1C baza xabarnomasi", () => {
  it("sozlamada ko'rsatilgan xodimni tanlaydi", async () => {
    await prisma.systemSetting.upsert({
      where: { key: ONE_C_SETTING_KEY },
      update: { value: [ids.userA] },
      create: { key: ONE_C_SETTING_KEY, value: [ids.userA] },
    });
    expect(await resolveOneCRecipients(prisma)).toEqual([ids.userA]);
  });

  it("sozlama bo'sh bo'lsa adminlarga tushadi", async () => {
    await prisma.systemSetting.upsert({
      where: { key: ONE_C_SETTING_KEY },
      update: { value: [] },
      create: { key: ONE_C_SETTING_KEY, value: [] },
    });
    const recipients = await resolveOneCRecipients(prisma);
    expect(recipients).toContain(ids.admin);
  });

  it("nofaol xodim sozlamada qolib ketsa ham xabar yo'qolmaydi", async () => {
    await prisma.user.update({ where: { id: ids.userB }, data: { isActive: false } });
    await prisma.systemSetting.upsert({
      where: { key: ONE_C_SETTING_KEY },
      update: { value: [ids.userB] },
      create: { key: ONE_C_SETTING_KEY, value: [ids.userB] },
    });

    const recipients = await resolveOneCRecipients(prisma);
    expect(recipients).not.toContain(ids.userB);
    expect(recipients).toContain(ids.admin); // zaxira yo'l ishladi

    await prisma.user.update({ where: { id: ids.userB }, data: { isActive: true } });
  });

  it("bitta firma uchun bir marta yuboradi", async () => {
    await prisma.systemSetting.upsert({
      where: { key: ONE_C_SETTING_KEY },
      update: { value: [ids.userA] },
      create: { key: ONE_C_SETTING_KEY, value: [ids.userA] },
    });

    const companyId = `${TAG}-company`;
    const notice = { companyId, companyName: "SINOV MCHJ", inn: "302672452" };

    const first = await notifyOneCBaseNeeded(prisma, notice);
    expect(first.inapp).toBe(1);
    expect(first.skipped).toBe(false);

    const second = await notifyOneCBaseNeeded(prisma, notice);
    expect(second.skipped).toBe(true);
    expect(second.inapp).toBe(0);

    const rows = await prisma.notification.findMany({
      where: { userId: ids.userA, type: "onec_base_request" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain("SINOV MCHJ");
    expect(rows[0].message).toContain("302672452");
    expect(rows[0].link).toBe(`/organizations?company=${companyId}`);

    await prisma.notificationDelivery.deleteMany({ where: { channel: ONE_C_CHANNEL } });
  });
});
