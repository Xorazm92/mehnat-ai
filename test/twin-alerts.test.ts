/**
 * BALL OGOHLANTIRISHI — ishga tushirish.
 *
 * Sof tanlov `lib/engines/automation/twinAlerts.spec.ts` da. Bu yerda uchta
 * xossa, va uchalasi ham shovqin haqida:
 *
 *   1. Ikkinchi ishga tushish HECH NIMA yubormaydi (takrorlanish to'sig'i).
 *   2. Nazoratchi faqat O'Z portfeli haqida xabar oladi.
 *   3. Telegrami ulanmagan odam qabul qiluvchi sanalmaydi.
 *
 * Davr — JORIY oy, chunki ogohlantirish shu oy uchun ishlaydi. Shuning uchun
 * tozalash `afterAll` da qat'iy: yaratilgan hamma narsa `TAG` bilan topiladi.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { runTwinAlerts, ALERT_CHANNEL } = await import("@/lib/domains/accounting/twinAlertRun");

/**
 * Run FAQAT shu testning foydalanuvchilari uchun.
 *
 * Chegarasiz u umumiy bazadagi haqiqiy seniorlar uchun ham ishlar va
 * ularning `dedupKey` larini band qilib qo'yardi — keyin haqiqiy
 * ogohlantirish "allaqachon yuborilgan" deb jimgina tashlab ketilardi.
 */
const runScoped = () => runTwinAlerts(prisma, { send, recipientIds: [ids.sup, ids.other, ids.quiet] });

const TAG = `vitest-alert-${Date.now()}`;
const ids = { sup: "", other: "", quiet: "", mine: "", theirs: "", template: "" };
const sent: { chatId: string; text: string }[] = [];
const send = async (chatId: bigint, text: string) => {
  sent.push({ chatId: String(chatId), text });
};

/** Telegram id UNIQUE — to'qnashmaydigan diapazon. */
let tgSeq = 900_000_000_000 + Math.floor(Math.random() * 1_000_000);

beforeAll(async () => {
  const mk = (n: string, role: string, telegram: boolean) =>
    prisma.user.create({
      data: {
        email: `${TAG}-${n}@v.local`, fullName: `${TAG} ${n}`, passwordHash: "x",
        role: role as never, isActive: true,
        telegramUserId: telegram ? BigInt(++tgSeq) : null,
      },
      select: { id: true },
    });
  ids.sup = (await mk("sup", "supervisor", true)).id;
  ids.other = (await mk("other", "supervisor", true)).id;
  // Telegrami yo'q senior — qabul qiluvchi sanalmasligi kerak.
  ids.quiet = (await mk("quiet", "chief_accountant", false)).id;

  const mkCo = (n: string, supervisorId: string) =>
    prisma.company.create({
      data: {
        name: `${TAG} ${n}`, inn: "000000000", taxRegime: "vat", isActive: true,
        companyStatus: "active", contractDate: new Date(Date.UTC(2015, 0, 1)),
        complexity: "standard", supervisorId,
      },
      select: { id: true },
    });
  ids.mine = (await mkCo("mine", ids.sup)).id;
  ids.theirs = (await mkCo("theirs", ids.other)).id;

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, name: "Alert test", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 5,
      effectiveFrom: new Date(Date.UTC(2015, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;

  // Joriy oy oynasi + chuqur kechikkan muddat → xavf chegaradan yuqori.
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const periodKey = `${now.getUTCFullYear()}-M${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  for (const companyId of [ids.mine, ids.theirs]) {
    await prisma.obligation.create({
      data: {
        companyId, templateId: ids.template, templateVersion: 1,
        periodStart: start, periodEnd: end, periodKey,
        dueAt: new Date(Date.now() - 40 * 86_400_000),
        status: "planned",
      },
    });
  }
});

afterAll(async () => {
  const users = [ids.sup, ids.other, ids.quiet];
  await prisma.notificationDelivery.deleteMany({ where: { recipientId: { in: users } } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.mine, ids.theirs] } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe("runTwinAlerts", () => {
  it("chegaradan o'tgan firma haqida xabar yuboradi", async () => {
    const res = await runScoped();
    expect(res.sent).toBeGreaterThan(0);
    expect(sent.some((m) => m.text.includes(`${TAG} mine`))).toBe(true);
  });

  it("nazoratchi BOSHQANING firmasi haqida xabar olmaydi", async () => {
    const mineChat = await prisma.user.findUnique({
      where: { id: ids.sup }, select: { telegramUserId: true },
    });
    const toSup = sent.filter((m) => m.chatId === String(mineChat!.telegramUserId));
    expect(toSup.length).toBeGreaterThan(0);
    expect(toSup.some((m) => m.text.includes(`${TAG} theirs`))).toBe(false);
  });

  it("IKKINCHI ishga tushish hech nima yubormaydi", async () => {
    // Shovqinning eng keng tarqalgan manbai — har tikda takrorlash.
    const before = sent.length;
    const res = await runScoped();
    expect(res.sent).toBe(0);
    expect(res.skippedDuplicate).toBeGreaterThan(0);
    expect(sent.length).toBe(before);
  });

  it("telegrami yo'q senior qabul qiluvchi sanalmaydi", async () => {
    const rows = await prisma.notificationDelivery.findMany({
      where: { channel: ALERT_CHANNEL, recipientId: ids.quiet },
      select: { id: true },
    });
    expect(rows).toHaveLength(0);
  });

  it("yuborilgan qatorlar `sent` deb belgilanadi", async () => {
    const rows = await prisma.notificationDelivery.findMany({
      where: { channel: ALERT_CHANNEL, recipientId: ids.sup },
      select: { status: true, targetChatId: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
    expect(rows.every((r) => r.targetChatId !== null)).toBe(true);
  });
});
