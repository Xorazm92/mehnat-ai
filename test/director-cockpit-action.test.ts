/**
 * DIREKTOR KOKPITI — TEZ HARAKAT DARVOZASI.
 *
 * Kokpitdagi ikki tugma (tasdiqlash, qayta tayinlash) ish oqimini chetlab
 * o'tadi, shuning uchun ular ikkita to'siq ortida turadi:
 *
 *   1. ROL — faqat `super_admin | admin`. `cockpit` RBAC ko'rinishi bugun
 *      TO'RT rolga berilgan (nazoratchi va bosh buxgalter ham kiradi), ya'ni
 *      ekranda ko'rinish darvoza EMAS. Bosh buxgalter action'ni to'g'ridan
 *      chaqira olsa, u direktor huquqini olgan bo'lardi.
 *   2. SABAB — bo'sh sabab serverda rad etiladi. Modaldagi `disabled` tugma
 *      faqat qulaylik; qaror "nega" siz audit izida o'qib bo'lmaydigan
 *      bo'lib qolardi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const {
  getCockpitFinance,
  approveExpenseFromCockpit,
  reassignObligationFromCockpit,
  getReassignCandidates,
} = await import("@/server/directorCockpit");

const TAG = `vitest-dca-${Date.now()}`;
const ids = { admin: "", chief: "", acc: "", company: "", channel: "", expense: "", obligation: "", template: "" };

const actor = (id: string, role: string) => {
  SESSION.user.id = id;
  SESSION.user.role = role;
};

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

  const channel = await prisma.disbursementChannel.create({
    data: { type: "cash", label: `${TAG} kassa`, isActive: true },
    select: { id: true },
  });
  ids.channel = channel.id;

  const company = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`,
      inn: String(Date.now()).slice(-9),
      taxRegime: "vat",
      isActive: true,
      companyStatus: "active",
      contractDate: new Date(Date.UTC(2093, 0, 1)),
      accountantId: ids.acc,
    },
    select: { id: true },
  });
  ids.company = company.id;

  // 1 mln dan katta ⇒ `pending` bo'lib qoladi, tasdiq talab qiladi.
  const expense = await prisma.kassaEntry.create({
    data: {
      type: "expense", status: "pending", category: "boshqa", amount: 2_000_000,
      date: new Date(), description: `${TAG} tasdiq kutmoqda`,
      channelId: ids.channel, createdBy: ids.admin,
    },
    select: { id: true },
  });
  ids.expense = expense.id;

  const template = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, name: "Kokpit test", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2093, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = template.id;

  const obligation = await prisma.obligation.create({
    data: {
      companyId: ids.company, templateId: ids.template, templateVersion: 1,
      periodStart: new Date(Date.UTC(2093, 4, 1)),
      periodEnd: new Date(Date.UTC(2093, 5, 1)),
      periodKey: "2093-M05",
      dueAt: new Date(Date.UTC(2093, 4, 20)),
      status: "planned",
      responsibleUserId: ids.acc,
    },
    select: { id: true },
  });
  ids.obligation = obligation.id;
});

afterAll(async () => {
  await prisma.obligationAssignmentEvent.deleteMany({ where: { obligationId: ids.obligation } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.ledgerEntry.deleteMany({ where: { sourceId: ids.expense } });
  await prisma.kassaEntry.deleteMany({ where: { channelId: ids.channel } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.admin, ids.chief, ids.acc] } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.disbursementChannel.deleteMany({ where: { id: ids.channel } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.chief, ids.acc] } } });
  await prisma.$disconnect();
});

describe("rol darvozasi — faqat direktor", () => {
  it("bosh buxgalter tasdiqlay olmaydi", async () => {
    actor(ids.chief, "chief_accountant");
    await expect(approveExpenseFromCockpit(ids.expense, "sabab")).rejects.toThrow(/Ruxsat yo'q/);
  });

  it("bosh buxgalter qayta tayinlay olmaydi", async () => {
    actor(ids.chief, "chief_accountant");
    await expect(
      reassignObligationFromCockpit(ids.obligation, ids.chief, "sabab"),
    ).rejects.toThrow(/Ruxsat yo'q/);
  });

  it("bosh buxgalter nomzodlar ro'yxatini ham ololmaydi", async () => {
    actor(ids.chief, "chief_accountant");
    await expect(getReassignCandidates()).rejects.toThrow(/Ruxsat yo'q/);
  });

  it("bosh buxgalterga moliyaviy blok NULL — xato emas, boshqa ekran", async () => {
    // Xato tashlash ekranni buzardi: nazoratchi ham shu yorliqni ko'radi.
    actor(ids.chief, "chief_accountant");
    expect(await getCockpitFinance()).toBeNull();
  });

  it("kirmagan foydalanuvchi rad etiladi", async () => {
    actor("", "");
    await expect(approveExpenseFromCockpit(ids.expense, "sabab")).rejects.toThrow(/Unauthorized/);
  });
});

describe("sabab majburiy", () => {
  it("bo'sh sabab bilan tasdiqlash rad etiladi", async () => {
    actor(ids.admin, "super_admin");
    await expect(approveExpenseFromCockpit(ids.expense, "   ")).rejects.toThrow(/Sabab majburiy/);
  });

  it("bo'sh sabab bilan qayta tayinlash rad etiladi", async () => {
    actor(ids.admin, "super_admin");
    await expect(reassignObligationFromCockpit(ids.obligation, ids.chief, "")).rejects.toThrow(/Sabab majburiy/);
  });

  it("rad etilgandan keyin xarajat HAMON pending — hech narsa o'zgarmagan", async () => {
    const row = await prisma.kassaEntry.findUniqueOrThrow({
      where: { id: ids.expense },
      select: { status: true },
    });
    expect(row.status).toBe("pending");
  });
});

describe("direktor amalni bajaradi", () => {
  it("qayta tayinlash — mas'ul o'zgaradi va SABAB hodisaga yoziladi", async () => {
    actor(ids.admin, "super_admin");
    await reassignObligationFromCockpit(ids.obligation, ids.chief, "buxgalter ta'tilda");

    const o = await prisma.obligation.findUniqueOrThrow({
      where: { id: ids.obligation },
      select: { responsibleUserId: true },
    });
    expect(o.responsibleUserId).toBe(ids.chief);

    // Sabab `ObligationAssignmentEvent` da — `reassignObligationTo` yozadi.
    const ev = await prisma.obligationAssignmentEvent.findFirst({
      where: { obligationId: ids.obligation },
      select: { fromUserId: true, toUserId: true, byUserId: true, reason: true },
      orderBy: { at: "desc" },
    });
    expect(ev?.fromUserId).toBe(ids.acc);
    expect(ev?.toUserId).toBe(ids.chief);
    expect(ev?.byUserId).toBe(ids.admin);
    expect(ev?.reason).toBe("buxgalter ta'tilda");
  });

  it("tasdiqlash — xarajat approved bo'ladi va sabab audit iziga tushadi", async () => {
    actor(ids.admin, "super_admin");
    await approveExpenseFromCockpit(ids.expense, "direktor qarori");

    const row = await prisma.kassaEntry.findUniqueOrThrow({
      where: { id: ids.expense },
      select: { status: true },
    });
    expect(row.status).toBe("approved");

    // `approveExpense` ning o'z izi sababni bilmaydi — u shu yerda qo'shiladi.
    const audit = await prisma.auditLog.findFirst({
      where: { tableName: "KassaEntry", recordId: ids.expense, userId: ids.admin },
      select: { newData: true },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(audit?.newData)).toContain("direktor qarori");
    expect(JSON.stringify(audit?.newData)).toContain("director-cockpit");
  });

  it("direktor nomzodlar ro'yxatini oladi", async () => {
    actor(ids.admin, "super_admin");
    const list = await getReassignCandidates();
    // Faqat ish bajaradigan rollar — direktorning o'zi ro'yxatda yo'q.
    expect(list.some((u) => u.id === ids.acc)).toBe(true);
    expect(list.some((u) => u.id === ids.admin)).toBe(false);
  });
});
