/**
 * POYGA HOLATLARI — #30 auditining qulfi.
 *
 * Auditda aniqlangan xato: balans tekshiruvi yozuvdan alohida turardi.
 *
 *     await assertSufficientFunds(...)          // balansni o'qidi
 *     await prisma.$transaction(...)            // keyin yozdi
 *
 * Oradagi bo'shliqda ikkinchi so'rov ham AYNAN O'SHA balansni o'qib ulgurardi,
 * natijada ikkala chiqim ham o'tib ketardi va kassa balansdan oshib minusga
 * tushardi. Tekshiruv bor edi, lekin u hech nimani kafolatlamas edi.
 *
 * Bu testlar aynan shu holatni qayta ishlab chiqadi: bitta balansga
 * SIG'MAYDIGAN ikkita chiqim BIR VAQTDA yuboriladi. To'g'ri xatti-harakat —
 * bittasi o'tadi, ikkinchisi rad etiladi.
 *
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "", kind: "staff", companyId: null as string | null } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { getAvailableBalance } = await import("@/lib/balance");
const { serializable } = await import("@/lib/tx");
const kassa = await import("@/server/kassa");

const TAG = `vitest-race-${Date.now()}`;
let accountantId = "";

/** Testlar bir-birining pulini ko'rmasligi uchun har biri o'z kirimini yozadi. */
async function topUp(amount: number) {
  if (amount <= 0) return;
  await prisma.kassaEntry.create({
    data: { type: "income", amount, date: new Date(), category: "test", description: TAG },
  });
}

/**
 * Balansni ma'lum bir pastki chegaraga ko'taradi va haqiqiy qiymatni qaytaradi.
 *
 * Bu shart: to'liq to'plam ishga tushganda boshqa test fayllari (oylik, payout,
 * davr qulfi fikstura'lari) balansni MANFIYGA tushirib qoldirishi mumkin —
 * admin roli minus balansga ataylab ruxsat berilgan. O'shanda nisbiy summa
 * manfiy chiqib, ikkala chaqiruv ham "summa musbat emas" deb rad etilardi va
 * test poyga holatini emas, atrof-muhitni o'lchab qolardi.
 */
async function ensureBalance(min: number): Promise<number> {
  const { balance } = await getAvailableBalance();
  await topUp(min - balance);
  return (await getAvailableBalance()).balance;
}

beforeAll(async () => {
  const u = await prisma.user.create({
    data: {
      email: `${TAG}@v.local`,
      fullName: `${TAG} bosh buxgalter`,
      passwordHash: "x",
      // Bosh buxgalter — kassaga yoza oladi, LEKIN admin emas. Bu muhim:
      // admin/superadmin uchun `assertSufficientFunds` ataylab "override"
      // beradi (minus balansga ruxsat + audit izi), ya'ni admin bilan bu
      // testni yozib bo'lmaydi — u hech qachon bloklanmaydi.
      role: "chief_accountant",
    },
    select: { id: true },
  });
  accountantId = u.id;
  SESSION.user = { id: u.id, role: "chief_accountant", kind: "staff", companyId: null };
});

afterAll(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { createdBy: accountantId } }).catch(() => {});
  await prisma.kassaEntry.deleteMany({ where: { description: TAG } });
  await prisma.kassaEntry.deleteMany({ where: { description: { contains: TAG } } });
  await prisma.auditLog.deleteMany({ where: { userId: accountantId } });
  await prisma.user.delete({ where: { id: accountantId } });
  await prisma.$disconnect();
});

describe("#30 · kassa chiqimi ikki barobar chiqib keta olmaydi", () => {
  // DIQQAT — TEKSHIRUV QATLAMI KO'CHDI. `Expense` jadvali `KassaEntry` ga
  // birlashtirilgandan keyin chiqim TASDIQ OQIMIDAN o'tadi: 1 mln dan katta
  // yozuv `pending` bo'lib yaratiladi va PUL O'SHA PAYTDA CHIQMAYDI.
  // Shuning uchun "ikki chiqim balansni ikki barobar bo'shatmasin" invarianti
  // endi TASDIQ paytida tekshiriladi — invariant o'sha, joyi boshqa.
  const pending = async (amount: number, tag: string) => {
    const row = await prisma.kassaEntry.create({
      data: {
        type: "expense", amount, date: new Date(),
        category: "boshqa", description: `${TAG} ${tag}`,
        status: "pending", createdBy: accountantId,
      },
      select: { id: true },
    });
    return row.id;
  };

  it("balansga BITTA sig'adigan ikki chiqim parallel tasdiqlansa, biri rad etiladi", async () => {
    // Summa balansga NISBATAN olinadi. Qat'iy son yozib bo'lmaydi: bu test
    // haqiqiy bazaga qarshi ishlaydi va u yerda balans yuz millionlab bo'lishi
    // mumkin — 700 000 lik ikki chiqim bemalol sig'ib ketardi va test
    // buzilgan kodni ham "o'tdi" deb ko'rsatardi.
    const before = await ensureBalance(10_000_000);
    // Har biri balansning 60% i ⇒ ikkitasi 120%, ya'ni ikkalasi sig'maydi.
    const amount = Math.floor(before * 0.6) + 1;

    const [a, b] = await Promise.all([pending(amount, "parallel 1"), pending(amount, "parallel 2")]);

    const results = await Promise.allSettled([
      kassa.approveExpense(a),
      kassa.approveExpense(b),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // Asosiy da'vo: IKKALASI HAM o'tmaydi.
    expect(ok).toBe(1);
    expect(failed).toBe(1);

    // Pul ATIGI BIR MARTA chiqdi va balans manfiyga tushmadi.
    const after = (await getAvailableBalance()).balance;
    expect(after).toBeCloseTo(before - amount, 2);
    expect(after).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("balans yetganda ikkala parallel tasdiq ham o'tadi (tekshiruv ortiqcha qattiq emas)", async () => {
    const before = await ensureBalance(10_000_000);
    // Har biri 20% ⇒ ikkitasi 40%, bemalol sig'adi. Serializable qayta
    // urinishlari bilan ikkalasi ham o'tishi shart — aks holda tuzatish
    // haqiqiy ishni ham bloklab qo'ygan bo'lardi.
    const amount = Math.floor(before * 0.2);

    const [a, b] = await Promise.all([pending(amount, "sig'adi 1"), pending(amount, "sig'adi 2")]);
    const results = await Promise.allSettled([kassa.approveExpense(a), kassa.approveExpense(b)]);

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);
    expect((await getAvailableBalance()).balance).toBeCloseTo(before - amount * 2, 2);
  }, 30_000);

  // Kichik chiqim (1 mln dan kam) AVTO-TASDIQLANADI, ya'ni pul darhol chiqadi
  // va tekshiruv `createKassaEntry` ning o'zida bo'ladi. Bu yo'l ham
  // qo'riqlangan bo'lishi kerak.
  it("avto-tasdiqlanadigan kichik chiqimda ham balans qo'riqlanadi", async () => {
    await ensureBalance(1_500_000);
    const before = (await getAvailableBalance()).balance;
    const amount = 900_000;

    const results = await Promise.allSettled([
      kassa.createKassaEntry({
        type: "expense", amount, date: new Date(),
        category: "boshqa", description: `${TAG} kichik 1`,
      }),
      kassa.createKassaEntry({
        type: "expense", amount, date: new Date(),
        category: "boshqa", description: `${TAG} kichik 2`,
      }),
    ]);

    const after = (await getAvailableBalance()).balance;
    // Balans qancha chiqim o'tganiga qarab kamayadi, lekin MANFIYGA tushmaydi.
    expect(after).toBeGreaterThanOrEqual(0);
    expect(after).toBeCloseTo(before - results.filter((r) => r.status === "fulfilled").length * amount, 2);
  }, 30_000);
});

describe("#30 · xarajatni ikki marta tasdiqlab bo'lmaydi", () => {
  it("parallel ikki tasdiq — biri o'tadi, ledger bir marta yoziladi", async () => {
    await ensureBalance(20_000_000);
    SESSION.user = { id: accountantId, role: "super_admin", kind: "staff", companyId: null };

    // 1 mln dan katta ⇒ 'pending' bo'lib yaratiladi, tasdiq talab qiladi.
    const exp = await prisma.kassaEntry.create({
    data: {
      type: "expense",
        amount: 5_000_000,
        date: new Date(),
        category: "boshqa",
        description: `${TAG} ikki marta tasdiq`,
        status: "pending",
        createdBy: accountantId,
      },
      select: { id: true },
    });

    const before = (await getAvailableBalance()).balance;
    const results = await Promise.allSettled([
      kassa.approveExpense(exp.id),
      kassa.approveExpense(exp.id),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    // Pul ATIGI BIR MARTA chiqqan bo'lishi kerak.
    expect((await getAvailableBalance()).balance).toBeCloseTo(before - 5_000_000, 2);

    const legs = await prisma.ledgerEntry.count({
      where: { sourceTable: "KassaEntry", sourceId: exp.id },
    });
    // Bitta tasdiq = bitta juft oyoq (debet + kredit). Ikki marta yozilganda 4 bo'lardi.
    expect(legs).toBe(2);
  }, 30_000);
});

describe("lib/tx · serializable()", () => {
  it("natijani qaytaradi va tranzaksiya klientini beradi", async () => {
    const out = await serializable(async (tx) => {
      const c = await tx.user.count({ where: { id: accountantId } });
      return c;
    });
    expect(out).toBe(1);
  });

  it("biznes xatosini QAYTA URINMAYDI — darhol otadi", async () => {
    let calls = 0;
    await expect(
      serializable(async () => {
        calls++;
        throw new Error("biznes qoidasi buzildi");
      })
    ).rejects.toThrow(/biznes qoidasi buzildi/);
    // Konflikt emas ⇒ atigi bitta urinish.
    expect(calls).toBe(1);
  });
});
