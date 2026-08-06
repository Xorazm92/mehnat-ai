/**
 * MATRITSA YOZUVI — katak qiymati → majburiyat holati.
 *
 * `lib/obligationBridge.ts` ning o'rnini bosuvchi. Eng muhim ikki test:
 *
 *   1. YILLIK template topiladi. Eski ko'prik har doim oylik davr kaliti
 *      qurardi, shuning uchun `FOYDA_YILLIK` (`"2026-Y"`) hech qachon mos
 *      kelmasdi va u JIMGINA hech narsa qilmasdi.
 *   2. Majburiyat topilmasa NATIJA qaytariladi. Eski ko'prik `return` qilardi
 *      va chaqiruvchi hech narsa bilmasdi.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { applyCellWrite, meaningOf } = await import("@/lib/domains/accounting/matrixWrite");

const TAG = `vitest-mw-${Date.now()}`;
const ids = { company: "", monthly: "", annual: "", user: "" };

async function makeObligation(templateId: string, periodStart: Date, periodEnd: Date, periodKey: string) {
  return prisma.obligation.create({
    data: {
      companyId: ids.company, templateId, templateVersion: 1,
      periodStart, periodEnd, periodKey, dueAt: periodEnd, status: "planned",
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `${TAG}@v.local`, fullName: "MW", passwordHash: "x", role: "supervisor" },
    select: { id: true },
  });
  ids.user = u.id;

  const c = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`, inn: "000000000", taxRegime: "vat", isActive: true,
      companyStatus: "active", contractDate: new Date(Date.UTC(2090, 0, 1)),
    },
    select: { id: true },
  });
  ids.company = c.id;

  const monthly = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-M`, name: "Oylik", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2090, 0, 1)), lifecycle: "active",
      matrixKey: `${TAG}_oylik`,
    },
    select: { id: true },
  });
  ids.monthly = monthly.id;

  // YILLIK — eski ko'prik aynan shuni topa olmasdi.
  const annual = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-Y`, name: "Yillik", obligationType: "financial_statement",
      periodicity: "annual", anchorType: "fixed_day_of_month", dueDay: 20, dueMonth: 3,
      effectiveFrom: new Date(Date.UTC(2090, 0, 1)), lifecycle: "active",
      matrixKey: `${TAG}_yillik`,
    },
    select: { id: true },
  });
  ids.annual = annual.id;

  await makeObligation(monthly.id, new Date(Date.UTC(2093, 6, 1)), new Date(Date.UTC(2093, 7, 1)), "2093-M07");
  await makeObligation(annual.id, new Date(Date.UTC(2093, 0, 1)), new Date(Date.UTC(2094, 0, 1)), "2093-Y");
});

afterAll(async () => {
  await prisma.obligation.deleteMany({ where: { companyId: ids.company } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: { in: [ids.monthly, ids.annual] } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

const write = (matrixKey: string, value: string, period = "2093-07") =>
  applyCellWrite(prisma, { companyId: ids.company, period, matrixKey, value, userId: ids.user });

describe("meaningOf — qiymat jadvali", () => {
  it("maxsus qiymatlar", () => {
    expect(meaningOf("+").status).toBe("accepted");
    expect(meaningOf("topshirildi").status).toBe("sent");
    expect(meaningOf("-").status).toBe("rejected");
    expect(meaningOf("kartoteka")).toEqual({ status: "in_progress", markDelay: true });
    expect(meaningOf("0")).toEqual({ status: "planned", clearTiming: true });
    expect(meaningOf("")).toEqual({ status: "planned", clearTiming: true });
  });

  it("erkin matn holatni O'ZGARTIRMAYDI", () => {
    expect(meaningOf("mijoz hujjat bermadi").status).toBeNull();
  });
});

describe("oylik majburiyat", () => {
  it("topshirildi → sent, sentAt yoziladi", async () => {
    const r = await write(`${TAG}_oylik`, "topshirildi");
    expect(r).toMatchObject({ ok: true, from: "planned", to: "sent" });
    const o = await prisma.obligation.findFirst({ where: { templateId: ids.monthly }, select: { status: true, sentAt: true } });
    expect(o!.status).toBe("sent");
    expect(o!.sentAt).not.toBeNull();
  });

  it("+ → accepted", async () => {
    const r = await write(`${TAG}_oylik`, "+");
    expect(r).toMatchObject({ ok: true, to: "accepted" });
  });

  it("0 → planned va vaqt maydonlari TOZALANADI", async () => {
    const r = await write(`${TAG}_oylik`, "0");
    expect(r).toMatchObject({ ok: true, to: "planned" });
    const o = await prisma.obligation.findFirst({
      where: { templateId: ids.monthly },
      select: { status: true, sentAt: true, acceptedAt: true, completedAt: true },
    });
    expect(o!.status).toBe("planned");
    expect(o!.sentAt).toBeNull();
    expect(o!.acceptedAt).toBeNull();
    expect(o!.completedAt).toBeNull();
  });

  it("kartoteka → in_progress + TASDIQLANMAGAN kechikish sababi", async () => {
    await write(`${TAG}_oylik`, "kartoteka");
    const o = await prisma.obligation.findFirst({
      where: { templateId: ids.monthly },
      select: { status: true, delayReason: true, delayMarkedById: true, delayApprovedById: true },
    });
    expect(o!.status).toBe("in_progress");
    expect(o!.delayReason).toBe("client_delay");
    expect(o!.delayMarkedById).toBe(ids.user);
    // Tasdiqlanmagan — senior imzolamaguncha KPI'dan chiqarmaydi.
    expect(o!.delayApprovedById).toBeNull();
  });

  it("har o'zgarish ObligationStatusEvent qoldiradi", async () => {
    const o = await prisma.obligation.findFirst({ where: { templateId: ids.monthly }, select: { id: true } });
    const events = await prisma.obligationStatusEvent.count({ where: { obligationId: o!.id } });
    expect(events).toBeGreaterThanOrEqual(4);
  });

  it("bir xil qiymat qayta yozilsa — o'zgarish yo'q", async () => {
    await write(`${TAG}_oylik`, "topshirildi");
    const before = await prisma.obligationStatusEvent.count();
    const r = await write(`${TAG}_oylik`, "topshirildi");
    expect(r).toMatchObject({ ok: true, from: "sent", to: "sent" });
    expect(await prisma.obligationStatusEvent.count()).toBe(before);
  });
});

describe("YILLIK majburiyat — eski ko'prik yiqilgan joy", () => {
  it("iyul katagidan yozilgan qiymat YILLIK majburiyatga tushadi", async () => {
    // Eski `syncProofToObligation` bu yerda `"2093-M07"` qurardi va yillik
    // majburiyatning kaliti `"2093-Y"` bo'lgani uchun HECH QACHON topmasdi.
    // Davr oynasi endi template davriyligidan hisoblanadi.
    const r = await write(`${TAG}_yillik`, "topshirildi", "2093-07");
    expect(r).toMatchObject({ ok: true, to: "sent" });

    const o = await prisma.obligation.findFirst({ where: { templateId: ids.annual }, select: { status: true, periodKey: true } });
    expect(o!.periodKey).toBe("2093-Y");
    expect(o!.status).toBe("sent");
  });

  it("o'sha yilning boshqa oyidan yozilsa ham o'sha majburiyatga tushadi", async () => {
    const r = await write(`${TAG}_yillik`, "+", "2093-11");
    expect(r).toMatchObject({ ok: true, to: "accepted" });
    expect(await prisma.obligation.count({ where: { templateId: ids.annual } })).toBe(1);
  });
});

describe("jim emas — nosozlik QAYTARILADI", () => {
  it("matrixKey uchun template yo'q → no_template", async () => {
    const r = await write("bunday_ustun_yoq", "topshirildi");
    expect(r).toEqual({ ok: false, reason: "no_template", detail: "bunday_ustun_yoq" });
  });

  it("template bor, majburiyat yo'q → no_obligation", async () => {
    const r = await write(`${TAG}_oylik`, "topshirildi", "2091-03");
    expect(r).toMatchObject({ ok: false, reason: "no_obligation" });
  });

  it("davr o'qib bo'lmasa → bad_period", async () => {
    const r = await write(`${TAG}_oylik`, "topshirildi", "nimadir");
    expect(r).toEqual({ ok: false, reason: "bad_period", detail: "nimadir" });
  });

  it("izoh yozilganda majburiyat tegilmaydi", async () => {
    const r = await write(`${TAG}_oylik`, "mijoz javob bermadi");
    expect(r).toEqual({ ok: true, skipped: "comment_only" });
  });
});
