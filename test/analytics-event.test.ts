/**
 * FOYDALANISH O'LCHOVI — AnalyticsEvent.
 *
 * M4 gacha "direktor kokpitga haftada necha kun kiradi?" degan savolga javob
 * beradigan hech narsa yo'q edi. Bu testlar o'lchovning ikki xossasini
 * mahkamlaydi:
 *
 *   1. HODISA TURINI SERVER HAL QILADI. Mijoz `tab: "director"` deb yubora
 *      oladi, lekin direktor bo'lmasa baribir oddiy `cockpit_visit` yoziladi
 *      — aks holda "direktor tashrifi" hisobini mijoz shishira olardi.
 *   2. RUXSATSIZ ROL UMUMAN YOZMAYDI. Buxgalter `?tab=kokpit` deb kirsa,
 *      hodisa ham, hisob ham paydo bo'lmaydi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "", relations: [] as string[] } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { logEvent, ANALYTICS_KINDS } = await import("@/lib/engines/analytics/logEvent");
const { recordCockpitVisit } = await import("@/server/analytics");

const TAG = `vitest-analytics-${Date.now()}`;
const ids = { admin: "", chief: "", acc: "" };

const actor = (id: string, role: string) => {
  SESSION.user.id = id;
  SESSION.user.role = role;
};

/** Shu testda yozilgan hodisalar — begona qatorlar aralashmasin. */
const myEvents = () =>
  prisma.analyticsEvent.findMany({
    where: { actorId: { in: [ids.admin, ids.chief, ids.acc] } },
    select: { kind: true, actorId: true, actorRole: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });

beforeAll(async () => {
  const mk = (n: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${n}@v.local`, fullName: `${TAG} ${n}`, passwordHash: "x", role: role as never },
      select: { id: true },
    });
  const [admin, chief, acc] = await Promise.all([
    mk("adm", "super_admin"),
    mk("chief", "chief_accountant"),
    mk("acc", "accountant"),
  ]);
  ids.admin = admin.id;
  ids.chief = chief.id;
  ids.acc = acc.id;
});

afterAll(async () => {
  await prisma.analyticsEvent.deleteMany({ where: { actorId: { in: [ids.admin, ids.chief, ids.acc] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.chief, ids.acc] } } });
  await prisma.$disconnect();
});

describe("logEvent", () => {
  it("hodisani rol snapshot'i bilan yozadi", async () => {
    await logEvent(prisma, {
      kind: ANALYTICS_KINDS.cockpitVisit,
      actor: { id: ids.acc, role: "accountant" },
      metadata: { tab: "kokpit" },
    });

    const rows = await prisma.analyticsEvent.findMany({ where: { actorId: ids.acc } });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("cockpit_visit");
    // Rol SNAPSHOT — xodim keyin boshqa rolga o'tsa ham o'zgarmaydi.
    expect(rows[0].actorRole).toBe("accountant");
    expect(rows[0].metadata).toEqual({ tab: "kokpit" });

    // Tozalash: keyingi testlar bu qatorni ko'rmasin.
    await prisma.analyticsEvent.deleteMany({ where: { actorId: ids.acc } });
  });
});

describe("recordCockpitVisit", () => {
  it("direktor — `director_cockpit_visit` yoziladi", async () => {
    actor(ids.admin, "super_admin");
    await recordCockpitVisit("director");

    const rows = await myEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe(ANALYTICS_KINDS.directorCockpitVisit);
    expect(rows[0].actorId).toBe(ids.admin);
  });

  it("bosh buxgalter — oddiy `cockpit_visit`, `director` so'ralsa HAM", async () => {
    actor(ids.chief, "chief_accountant");
    // Mijoz "direktor yorlig'i" deb yuboradi — server ishonmaydi.
    await recordCockpitVisit("director");

    const rows = await myEvents();
    const mine = rows.filter((r) => r.actorId === ids.chief);
    expect(mine).toHaveLength(1);
    expect(mine[0].kind).toBe(ANALYTICS_KINDS.cockpitVisit);
    expect(mine[0].actorRole).toBe("chief_accountant");
  });

  it("buxgalter — kokpit ko'rinishi yo'q, hodisa ham yozilmaydi", async () => {
    actor(ids.acc, "accountant");
    await expect(recordCockpitVisit("kokpit")).rejects.toThrow(/Ruxsat yo'q/);

    // Rad etilgan chaqiruv iz qoldirmasligi kerak — aks holda hisob shishardi.
    const rows = await prisma.analyticsEvent.findMany({ where: { actorId: ids.acc } });
    expect(rows).toHaveLength(0);
  });
});
