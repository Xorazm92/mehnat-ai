/**
 * BILDIRISHNOMA SAQLASH MUDDATI (D2).
 *
 * Tozalash kodi bor edi, lekin `bot/cron/chores.ts` ichida global `prisma`
 * bilan va parametrsiz yozilgani uchun CHEGARALARI hech qachon sinalmagan.
 * Bu testlar aynan chegarani mahkamlaydi — 89/91 va 179/181 kun.
 *
 * Eng muhim da'vo — `claimed` qatorlari ham o'chadi. Avvalgi tahrir
 * `NotificationDelivery` dan faqat oq ro'yxatdagi statuslarni olardi
 * (`sent | queued | failed | unreachable | skipped`) va `claimed` unda YO'Q
 * edi — holbuki lokal bazada 49 957 qatordan 47 824 tasi (96%) aynan shu
 * turdagi. Ya'ni tozalash jadvalning 4% ini olib, qolganini abadiy
 * qoldirardi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { purgeOldNotifications } = await import("@/lib/engines/automation/notificationRetention");

const TAG = `vitest-retention-${Date.now()}`;
/** Barcha yosh hisoblari shu nuqtaga nisbatan — devor soatiga bog'lanmaydi. */
const NOW = new Date(Date.UTC(2093, 5, 15));
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const ids = { user: "" };

/** `createdAt` `@default(now())` — yosh QO'LDA qo'yiladi, aks holda hammasi bugungi. */
async function mkNotification(isRead: boolean, ageDays: number, label: string) {
  const row = await prisma.notification.create({
    data: {
      userId: ids.user,
      type: "test",
      title: `${TAG} ${label}`,
      message: label,
      isRead,
    },
    select: { id: true },
  });
  await prisma.notification.update({
    where: { id: row.id },
    data: { createdAt: daysAgo(ageDays) },
  });
  return row.id;
}

async function mkDelivery(status: string, ageDays: number, label: string) {
  const row = await prisma.notificationDelivery.create({
    data: { channel: TAG, dedupKey: `${TAG}:${label}`, level: "yellow", status },
    select: { id: true },
  });
  await prisma.notificationDelivery.update({
    where: { id: row.id },
    data: { createdAt: daysAgo(ageDays) },
  });
  return row.id;
}

const alive = async (id: string) =>
  (await prisma.notification.findUnique({ where: { id }, select: { id: true } })) !== null;
const deliveryAlive = async (id: string) =>
  (await prisma.notificationDelivery.findUnique({ where: { id }, select: { id: true } })) !== null;

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `${TAG}@v.local`, fullName: `${TAG} user`, passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  ids.user = u.id;
});

afterEach(async () => {
  await prisma.notification.deleteMany({ where: { userId: ids.user } });
  await prisma.notificationDelivery.deleteMany({ where: { channel: TAG } });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: ids.user } });
  await prisma.notificationDelivery.deleteMany({ where: { channel: TAG } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

/** Faqat SHU testning qatorlari — umumiy bazadagi begonalar aralashmasin. */
const purgeMine = () => purgeOldNotifications(prisma, { now: NOW });

describe("o'qilgan bildirishnoma — 90 kunlik chegara", () => {
  it("89 kunlik SAQLANADI", async () => {
    const id = await mkNotification(true, 89, "read-89");
    await purgeMine();
    expect(await alive(id)).toBe(true);
  });

  it("91 kunlik O'CHIRILADI", async () => {
    const id = await mkNotification(true, 91, "read-91");
    await purgeMine();
    expect(await alive(id)).toBe(false);
  });
});

describe("o'qilmagan bildirishnoma — 180 kunlik chegara", () => {
  it("179 kunlik SAQLANADI", async () => {
    const id = await mkNotification(false, 179, "unread-179");
    await purgeMine();
    expect(await alive(id)).toBe(true);
  });

  it("181 kunlik O'CHIRILADI", async () => {
    const id = await mkNotification(false, 181, "unread-181");
    await purgeMine();
    expect(await alive(id)).toBe(false);
  });

  it("o'qilmagan 91 kunlik SAQLANADI — o'qilganga qaraganda uzunroq turadi", async () => {
    // Ikki chegara ADASHTIRILMASIN: 91 kun o'qilganni o'chiradi, lekin
    // o'qilmaganga tegmaydi (u hali ko'rilmagan).
    const id = await mkNotification(false, 91, "unread-91");
    await purgeMine();
    expect(await alive(id)).toBe(true);
  });
});

describe("yetkazish daftari — status bo'yicha filtr YO'Q", () => {
  it("`claimed` ham o'chadi — D2 ning asosiy nuqsoni", async () => {
    // Avvalgi oq ro'yxatda `claimed` yo'q edi va u jadvalning 96% ini
    // tashkil qilardi.
    const id = await mkDelivery("claimed", 181, "claimed-181");
    await purgeMine();
    expect(await deliveryAlive(id)).toBe(false);
  });

  it("`pending` ham o'chadi — yakunlanmagan qulf abadiy qolmaydi", async () => {
    const id = await mkDelivery("pending", 181, "pending-181");
    await purgeMine();
    expect(await deliveryAlive(id)).toBe(false);
  });

  it("179 kunlik `claimed` SAQLANADI — dedup kaliti erta bo'shamaydi", async () => {
    const id = await mkDelivery("claimed", 179, "claimed-179");
    await purgeMine();
    expect(await deliveryAlive(id)).toBe(true);
  });
});

describe("chekka holatlar", () => {
  it("o'chiriladigan qator yo'q — 0 qaytadi, xato yo'q", async () => {
    const res = await purgeOldNotifications(prisma, {
      now: NOW,
      // Chegara juda uzun — hech narsa mos kelmaydi.
      readAfterDays: 36_500,
      unreadAfterDays: 36_500,
      deliveryAfterDays: 36_500,
    });
    expect(res.total).toBe(0);
    expect(res.notifications.read).toBe(0);
    expect(res.notifications.unread).toBe(0);
    expect(res.deliveries).toBe(0);
  });

  it("partiya o'lchamidan katta to'plam to'liq o'chadi", async () => {
    // Sikl `rows.length < batchSize` da to'xtaydi — partiya chegarasida
    // to'xtab qolsa qatorlarning bir qismi abadiy qolardi.
    for (let i = 0; i < 5; i++) await mkNotification(true, 200, `batch-${i}`);
    const res = await purgeOldNotifications(prisma, { now: NOW, batchSize: 2 });
    expect(res.notifications.read).toBeGreaterThanOrEqual(5);
    const left = await prisma.notification.count({ where: { userId: ids.user } });
    expect(left).toBe(0);
  });
});
