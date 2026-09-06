/**
 * DIREKTOR KOKPITI — MOLIYAVIY PROYEKSIYA.
 *
 * `getDirectorCockpitFinance` yangi hisob QILMAYDI — u `buildDirectorReport`
 * ustidan proyeksiya. Shuning uchun bu testlar arifmetikani emas, PROYEKSIYANI
 * tekshiradi: to'g'ri maydon to'g'ri joyga tushdimi, 30+ kun ulushi qaysi
 * maxrajga bo'linadi, va bo'lish mumkin bo'lmaganda `null` qaytadimi.
 *
 * ENG MUHIM DA'VO — `over30Share` maxraji. U `overdueTotal` ga bo'linadi,
 * `total` ga EMAS: qarilik matritsasi faqat muddati o'tgan qarzni bosqichlarga
 * ajratadi, joriy oy ishi unda umuman yo'q. `total` ga bo'lish ulushni
 * jimgina kichraytirib, direktorga "30+ kunlik qarz kam" degan yolg'on
 * xotirjamlik berardi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { getDirectorCockpitFinance } = await import("@/lib/domains/accounting/directorCockpitFinance");

const TAG = `vitest-dcf-${Date.now()}`;
/** 2093 — pul testlari 2095 da, majburiyat testlari 2097 da. */
const NOW = new Date(Date.UTC(2093, 5, 15));

const ids = { user: "", company: "", channel: "" };

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${TAG}@v.local`, fullName: `${TAG} admin`, passwordHash: "x", role: "admin" },
    select: { id: true },
  });
  ids.user = user.id;

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
      accountantId: user.id,
    },
    select: { id: true },
  });
  ids.company = company.id;
});

afterAll(async () => {
  await prisma.kassaEntry.deleteMany({ where: { description: { contains: TAG } } });
  await prisma.kassaEntry.deleteMany({ where: { channelId: ids.channel } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.disbursementChannel.deleteMany({ where: { id: ids.channel } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("getDirectorCockpitFinance", () => {
  it("hisobotning har bir maydoni proyeksiyaga tushadi", async () => {
    const f = await getDirectorCockpitFinance(prisma, { now: NOW });

    // Shakl to'liq bo'lishi shart — ekran har oltita ko'rsatkichni chizadi va
    // `undefined` bo'lsa "NaN so'm" chiqarardi.
    expect(typeof f.balance).toBe("number");
    expect(typeof f.yesterday.income).toBe("number");
    expect(typeof f.yesterday.outflow).toBe("number");
    expect(typeof f.debt.total).toBe("number");
    expect(typeof f.debt.overdueTotal).toBe("number");
    expect(typeof f.debt.over30Amount).toBe("number");
    expect(typeof f.pending.expenses).toBe("number");
    expect(typeof f.pending.proofs).toBe("number");
    expect(typeof f.unmatchedBank.income).toBe("number");
    expect(typeof f.unmatchedBank.expense).toBe("number");
    expect(Array.isArray(f.pendingExpenses)).toBe(true);
    // Reja qo'yilmagan bo'lishi MUMKIN — u holda `null`, 0 emas.
    expect(f.plan === null || typeof f.plan.percent === "number").toBe(true);
  });

  it("30+ kun ulushi muddati o'tgan qarzga bo'linadi, bo'linma yo'q bo'lsa null", async () => {
    const f = await getDirectorCockpitFinance(prisma, { now: NOW });

    if (f.debt.overdueTotal > 0) {
      expect(f.debt.over30Share).not.toBeNull();
      // Ulush — `over30Amount / overdueTotal`, `total` ga EMAS.
      expect(f.debt.over30Share).toBe(Math.round((f.debt.over30Amount / f.debt.overdueTotal) * 100));
      // 30+ kunlik qarz muddati o'tgan qarzning bir qismi, undan katta emas.
      expect(f.debt.over30Amount).toBeLessThanOrEqual(f.debt.overdueTotal + 0.01);
    } else {
      // Nolga bo'lish yo'q: "0%" yolg'on bo'lardi, bo'linma mavjud emas.
      expect(f.debt.over30Share).toBeNull();
    }
  });

  it("kutayotgan xarajat ro'yxatga tushadi va eng yirigi tepada turadi", async () => {
    const before = await getDirectorCockpitFinance(prisma, { now: NOW });

    // `pending` — jurnalga tushmaydi (pul hali chiqmagan), shuning uchun
    // to'g'ridan-to'g'ri yoziladi: darvoza tasdiq paytida ishlaydi.
    await prisma.kassaEntry.createMany({
      data: [
        {
          type: "expense", status: "pending", category: "boshqa", amount: 4_000_000,
          date: NOW, description: `${TAG} kichik`, channelId: ids.channel,
          companyId: ids.company, createdBy: ids.user,
        },
        {
          type: "expense", status: "pending", category: "boshqa", amount: 9_000_000,
          date: NOW, description: `${TAG} yirik`, channelId: ids.channel,
          companyId: ids.company, createdBy: ids.user,
        },
      ],
    });

    const after = await getDirectorCockpitFinance(prisma, { now: NOW });

    expect(after.pending.expenses - before.pending.expenses).toBe(2);

    const mine = after.pendingExpenses.filter((e) => e.description?.includes(TAG));
    expect(mine).toHaveLength(2);
    // `orderBy: amount desc` — direktorning e'tibori yirigiga kerak.
    expect(mine[0].amount).toBe(9_000_000);
    expect(mine[1].amount).toBe(4_000_000);
    // Firma nomi alohida so'rovdan keladi (`companyId` bog'lanish emas).
    expect(mine[0].companyName).toContain(TAG);
  });
});
