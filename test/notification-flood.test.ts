/**
 * SHOVQINGA QARSHI QOIDALAR — bir hodisa, bir mantiqiy xabar.
 *
 * Bu fayl auditda o'lchangan aniq muammolarni qulflaydi:
 *   - sweep 6 255 majburiyat ustidan yurib 44 846 ta bildirishnoma yaratgan;
 *   - `obligation_reminder` va `escalation_obligation` ning 100% i o'qilmagan;
 *   - `NotificationDelivery.status` yolg'on gapirgan (13 592 `failed` / 0 `sent`);
 *   - o'tkinchi xatoda kalit band qolib, xabar butunlay yo'qolgan.
 *
 * Live Postgres kerak (test/setup.ts izolyatsiya qo'riqchisi).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { sweepDeadlines } = await import("@/lib/engines/automation/obligationSweep");
const { runObligationRollup, rollupDedupeKey, buildObligationRollups, ROLLUP_TYPE } = await import(
  "@/lib/engines/automation/obligationRollup"
);
const { claim, settle, claimedKeys } = await import("@/lib/engines/automation/deliveryLedger");

const TAG = `vitest-flood-${Date.now()}`;
/** Sweep D-5..overdue oralig'ini qamrashi uchun sana qat'iy tanlangan. */
const NOW = new Date(Date.UTC(2098, 3, 20, 6, 0, 0));
const OBLIGATION_COUNT = 40;

const ids = { user: "", company: "", template: "", obligations: [] as string[] };

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: `${TAG}@vitest.local`,
      fullName: `${TAG} acc`,
      passwordHash: "x",
      role: "accountant",
    },
    select: { id: true },
  });
  ids.user = user.id;

  const company = await prisma.company.create({
    data: { name: `${TAG} MChJ`, inn: "000000001", taxRegime: "vat" },
    select: { id: true },
  });
  ids.company = company.id;

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`,
      name: "Flood test",
      obligationType: "tax_declaration",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2098, 0, 1)),
      lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;

  // Bitta odamga 40 ta ochiq majburiyat — auditdagi holatning kichik nusxasi
  // (haqiqiy buxgalterda 300 dan ortiq bo'lgan).
  for (let i = 0; i < OBLIGATION_COUNT; i++) {
    const o = await prisma.obligation.create({
      data: {
        companyId: ids.company,
        templateId: ids.template,
        templateVersion: 1,
        // Har biri o'z davri: @@unique([companyId, templateId, periodStart, periodEnd]).
        periodStart: new Date(Date.UTC(2098, 2, 1 + i)),
        periodEnd: new Date(Date.UTC(2098, 2, 2 + i)),
        periodKey: `2098-M03-${i}`,
        // Yarmi muddati o'tgan, yarmi bugun tugaydi.
        dueAt: new Date(Date.UTC(2098, 3, i % 2 === 0 ? 18 : 20)),
        status: "planned",
        responsibleUserId: ids.user,
      },
      select: { id: true },
    });
    ids.obligations.push(o.id);
  }
});

afterAll(async () => {
  await prisma.notificationDelivery.deleteMany({ where: { recipientId: ids.user } });
  await prisma.notificationDelivery.deleteMany({ where: { channel: { startsWith: TAG } } });
  await prisma.notification.deleteMany({ where: { userId: ids.user } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("sweep — xabar soni ish soniga bog'lanmagan", () => {
  it("40 ta majburiyat ustidan yurib BIRONTA ham Notification yozmaydi", async () => {
    await prisma.notification.deleteMany({ where: { userId: ids.user } });
    const res = await sweepDeadlines(prisma, { now: NOW });
    expect(res.remindersCreated).toBeGreaterThan(0); // daftar to'ldi

    // Bungacha shu yerda 40+ qator paydo bo'lardi (har majburiyat uchun bitta,
    // ustiga zanjir bosqichlari).
    const notes = await prisma.notification.count({ where: { userId: ids.user } });
    expect(notes).toBe(0);
  });

  it("takroriy yurish yangi daftar qatori yaratmaydi", async () => {
    const before = await prisma.notificationDelivery.count({ where: { recipientId: ids.user } });
    await sweepDeadlines(prisma, { now: NOW });
    const after = await prisma.notificationDelivery.count({ where: { recipientId: ids.user } });
    expect(after).toBe(before);
  });
});

describe("kunlik yig'ma", () => {
  it("40 ta majburiyat → BITTA xabar, ichida sanoq va eng shoshilinch beshtasi", async () => {
    await prisma.notification.deleteMany({ where: { userId: ids.user } });
    const res = await runObligationRollup(prisma, { now: NOW });
    expect(res.created).toBeGreaterThanOrEqual(1);

    const rows = await prisma.notification.findMany({
      where: { userId: ids.user, type: ROLLUP_TYPE },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toBe(rollupDedupeKey(ids.user, NOW));
    // Kechikkan ish bor — byudjet uni kechiktirmasin.
    expect(rows[0].priority).toBe("high");
    expect(rows[0].message).toContain("kechikkan");
    // Matnda faqat beshtasi nomma-nom, qolgani havola ortida.
    expect(rows[0].message).toContain("va yana");
  });

  it("o'sha kuni ikkinchi marta yurilsa yangi xabar chiqmaydi", async () => {
    const res = await runObligationRollup(prisma, { now: NOW });
    expect(res.created).toBe(0);
    expect(res.skippedAlready).toBeGreaterThanOrEqual(1);
    const rows = await prisma.notification.count({
      where: { userId: ids.user, type: ROLLUP_TYPE },
    });
    expect(rows).toBe(1);
  });

  it("PARALLEL ikkita yurish ham bitta xabar qoldiradi", async () => {
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    await Promise.all([
      runObligationRollup(prisma, { now: tomorrow }),
      runObligationRollup(prisma, { now: tomorrow }),
      runObligationRollup(prisma, { now: tomorrow }),
    ]);
    const rows = await prisma.notification.count({
      where: { userId: ids.user, dedupeKey: rollupDedupeKey(ids.user, tomorrow) },
    });
    expect(rows).toBe(1);
  });

  it("`newlyOverdue` sweep jadvaliga emas, `dueAt` ga tayanadi", async () => {
    // Jonli ma'lumotda topilgan nuqson: `firstOverdueAt` sweep QACHON
    // SEZGANINI yozadi, shuning uchun backfill'dan keyingi birinchi yurish
    // 146 ta eski kechikishni ham "yangi" deb ko'rsatardi.
    const before = await buildObligationRollups(prisma, NOW);
    const mine = before.get(ids.user)!;
    expect(mine.overdue).toBeGreaterThan(0);
    // Fikstura muddatlari 18- va 20-aprel; NOW = 20-aprel, ya'ni "kecha"
    // (19-aprel) muddati tugagan bironta ham yo'q.
    expect(mine.newlyOverdue).toBe(0);

    // Kecha muddati tugagan bittasini qo'shsak — aynan bittasi "yangi".
    const fresh = await prisma.obligation.create({
      data: {
        companyId: ids.company,
        templateId: ids.template,
        templateVersion: 1,
        periodStart: new Date(Date.UTC(2098, 5, 1)),
        periodEnd: new Date(Date.UTC(2098, 5, 2)),
        periodKey: "2098-M05-new",
        dueAt: new Date(Date.UTC(2098, 3, 19)),
        status: "planned",
        responsibleUserId: ids.user,
      },
      select: { id: true },
    });
    const after = await buildObligationRollups(prisma, NOW);
    expect(after.get(ids.user)!.newlyOverdue).toBe(1);
    await prisma.obligation.deleteMany({ where: { id: fresh.id } });
  });

  it("aytadigan gapi bo'lmagan odamga bo'sh yig'ma yozmaydi", async () => {
    const idle = await prisma.user.create({
      data: {
        email: `${TAG}-idle@vitest.local`,
        fullName: `${TAG} idle`,
        passwordHash: "x",
        role: "accountant",
      },
      select: { id: true },
    });
    const map = await buildObligationRollups(prisma, NOW);
    expect(map.has(idle.id)).toBe(false);
    await prisma.user.deleteMany({ where: { id: idle.id } });
  });
});

describe("yetkazish daftari — status haqiqatni aytadi", () => {
  const channel = `${TAG}-ledger`;

  it("`token` rejimi `claimed` yozadi, soxta `sent` emas", async () => {
    const id = await claim(prisma, {
      channel,
      dedupKey: "token-1",
      recipientId: ids.user,
      mode: "token",
    });
    expect(id).not.toBeNull();
    const row = await prisma.notificationDelivery.findUnique({
      where: { channel_dedupKey: { channel, dedupKey: "token-1" } },
    });
    expect(row!.status).toBe("claimed");
    expect(row!.sentAt).toBeNull();
  });

  it("band qilingan kalit ikkinchi marta `null` qaytaradi", async () => {
    const again = await claim(prisma, { channel, dedupKey: "token-1", recipientId: ids.user });
    expect(again).toBeNull();
  });

  it("parallel `claim` — faqat bittasi kalitni oladi", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        claim(prisma, { channel, dedupKey: "token-race", recipientId: ids.user }),
      ),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("o'tkinchi `failed` kalitni BO'SHATADI, doimiy `unreachable` band qoldiradi", async () => {
    const transient = await claim(prisma, { channel, dedupKey: "t-fail", recipientId: ids.user });
    await settle(prisma, transient!, "failed");
    expect(
      await prisma.notificationDelivery.findUnique({
        where: { channel_dedupKey: { channel, dedupKey: "t-fail" } },
      }),
    ).toBeNull();
    // Kalit bo'shadi ⇒ qayta band qilish mumkin ⇒ xabar yo'qolmaydi.
    expect(await claim(prisma, { channel, dedupKey: "t-fail", recipientId: ids.user })).not.toBeNull();

    const permanent = await claim(prisma, { channel, dedupKey: "t-403", recipientId: ids.user });
    await settle(prisma, permanent!, "unreachable");
    const row = await prisma.notificationDelivery.findUnique({
      where: { channel_dedupKey: { channel, dedupKey: "t-403" } },
    });
    expect(row!.status).toBe("unreachable");
    expect(row!.sentAt).toBeNull(); // hech qachon jo'natilmagan
    expect(await claim(prisma, { channel, dedupKey: "t-403", recipientId: ids.user })).toBeNull();
  });

  it("`sentAt` faqat haqiqiy jo'natishda to'ladi", async () => {
    const id = await claim(prisma, { channel, dedupKey: "t-sent", recipientId: ids.user });
    await settle(prisma, id!, "sent");
    const row = await prisma.notificationDelivery.findUnique({
      where: { channel_dedupKey: { channel, dedupKey: "t-sent" } },
    });
    expect(row!.status).toBe("sent");
    expect(row!.sentAt).not.toBeNull();
  });

  it("`claimedKeys` band kalitlarni bitta so'rovda qaytaradi", async () => {
    const found = await claimedKeys(prisma, channel, ["token-1", "t-403", "yo'q-kalit"]);
    expect(found.has("token-1")).toBe(true);
    expect(found.has("t-403")).toBe(true);
    expect(found.has("yo'q-kalit")).toBe(false);
  });
});
