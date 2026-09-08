/**
 * MATRITSA "TO'LOV" USTUNI UCHUN 1C QARZI (`getPeriodDebtByCompany`).
 *
 * Ikki qoida sinaladi:
 *   1) KESIM TANLASH — davrdan keyingi oyning 1-kunigacha bo'lgan ENG YANGI
 *      kesim. Keyinroq kelgan kesim shu davr ekraniga tushmasligi kerak,
 *      aks holda avgust matritsasi sentabr holatini ko'rsatardi.
 *   2) QARZ VA AVANS ALOHIDA — bitta mijozning bir shartnomasida qarz,
 *      boshqasida avans bo'ladi; ularni bitta raqamga qo'shish ikkalasini
 *      ham yashirardi (`server/debt.ts` izohi).
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" as string } };

vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { getPeriodDebtByCompany } = await import("@/server/debt");

const TAG = `vitest-debt-${Date.now()}`;
// Uzoq kelajak — test bazasidagi boshqa kesimlar tanlovga aralashmasin.
const JUL = new Date(Date.UTC(2099, 6, 1)); // 2099-07-01
const AUG = new Date(Date.UTC(2099, 7, 1)); // 2099-08-01
const SEP = new Date(Date.UTC(2099, 8, 1)); // 2099-09-01 — avgustning yopilishi
const ids = { company: "", user: "" };

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${TAG}@vitest.local`, fullName: TAG, passwordHash: "x", role: "super_admin" },
    select: { id: true },
  });
  ids.user = user.id;
  SESSION.user.id = user.id;

  const company = await prisma.company.create({
    data: { name: `${TAG} mijoz`, inn: "000000002" },
    select: { id: true },
  });
  ids.company = company.id;

  // Oylik shartnoma summasi — "tushgan pul" shu raqamdan chiqariladi
  // (hisoblanma sifatida ishlatiladi, `server/debt.ts` izohiga qarang).
  await prisma.companyServiceTerm.create({
    data: {
      companyId: company.id,
      totalAmount: 1_000_000, bankAmount: 1_000_000, offsetAmount: 0,
      effectiveFrom: new Date(Date.UTC(2099, 0, 1)),
    },
  });

  await prisma.debtSnapshot.createMany({
    data: [
      // Har kesimda IKKI qator — qamrov bir xil bo'lsin, aks holda
      // "yarim qamrovli kesim" qoidasi biriga tegib ketardi.
      { asOf: JUL, companyId: company.id, rawCustomer: `${TAG} mijoz`, rawContract: "1/БК", debt: 500_000, advance: 0 },
      { asOf: JUL, companyId: company.id, rawCustomer: `${TAG} mijoz`, rawContract: "2/РК", debt: 0, advance: 0 },
      // Bitta mijoz, ikki shartnoma: birida qarz, ikkinchisida avans.
      { asOf: AUG, companyId: company.id, rawCustomer: `${TAG} mijoz`, rawContract: "1/БК", debt: 900_000, advance: 0 },
      { asOf: AUG, companyId: company.id, rawCustomer: `${TAG} mijoz`, rawContract: "2/РК", debt: 0, advance: 250_000 },
      // Keyingi oyning kesimi — avgust ekraniga tushmasligi kerak.
      // Qamrovi oldingisi bilan bir xil (ikki qator): "yarim qamrovli kesim"
      // qoidasi uni chetlab o'tmasin — bu yerda sinaladigan narsa SANA.
      { asOf: SEP, companyId: company.id, rawCustomer: `${TAG} mijoz`, rawContract: "1/БК", debt: 400_000, advance: 0 },
      { asOf: SEP, companyId: company.id, rawCustomer: `${TAG} mijoz`, rawContract: "2/РК", debt: 0, advance: 100_000 },
    ],
  });
});

afterAll(async () => {
  await prisma.debtSnapshot.deleteMany({ where: { companyId: ids.company } });
  await prisma.companyServiceTerm.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("getPeriodDebtByCompany", () => {
  it("davr oxiriga eng yaqin kesimni oladi va qarz/avansni ajratadi", async () => {
    // IYUL ning yopilishi — 01.08 kesimi (1C oy haqini shu kunda yozadi).
    const r = await getPeriodDebtByCompany("2099-07");

    expect(r.asOf?.slice(0, 10)).toBe("2099-08-01");
    expect(r.byCompany[ids.company]).toMatchObject({ debt: 900_000, advance: 250_000 });
  });

  it("keyingi oyda yangi kesimga o'tadi", async () => {
    const r = await getPeriodDebtByCompany("2099-09");

    expect(r.asOf?.slice(0, 10)).toBe("2099-09-01");
    expect(r.byCompany[ids.company]).toMatchObject({ debt: 400_000, advance: 100_000 });
  });

  it("avgust: yopilish 01.09 kesimi, tushgan pul chiqariladi", async () => {
    // Ochilish 01.08 (650 000), yopilish 05.09 (400 000 − 100 000 = 300 000),
    // oylik summa 1 000 000 → 650 000 + 1 000 000 − 300 000 = 1 350 000.
    const r = await getPeriodDebtByCompany("2099-08");

    expect(r.openingAsOf?.slice(0, 10)).toBe("2099-08-01");
    expect(r.asOf?.slice(0, 10)).toBe("2099-09-01");
    expect(r.byCompany[ids.company].collected).toBe(1_350_000);
  });

  it("shu oyda tushgan pulni ikki kesimdan chiqaradi", async () => {
    // IYUL: ochilish 01.07 (500 000), yopilish 01.08 (900 000 qarz −
    // 250 000 avans = 650 000), oylik summa 1 000 000.
    // 500 000 + 1 000 000 − 650 000 = 850 000.
    // 1C kesimi to'lovni ko'rsatmaydi, ASRO bazasida esa yozuv yo'q —
    // raqam faqat shu ayirmadan chiqadi.
    const r = await getPeriodDebtByCompany("2099-07");

    expect(r.openingAsOf?.slice(0, 10)).toBe("2099-07-01");
    expect(r.asOf?.slice(0, 10)).toBe("2099-08-01");
    expect(r.byCompany[ids.company].collected).toBe(850_000);
  });

  it("davrga tegishli juftlik bo'lmasa to'lov NOMA'LUM qoladi (nol emas)", async () => {
    // Sentabr: yopilish kesimi 01.10 da keladi, hali yo'q. Eng yangi
    // kesim (01.09) AVGUSTniki — uni sentabr to'lovi deb ko'rsatish
    // noto'g'ri bo'lardi, shuning uchun `null`.
    const r = await getPeriodDebtByCompany("2099-09");

    expect(r.openingAsOf).toBeNull();
    expect(r.byCompany[ids.company].collected).toBeNull();
    // Qarz qatori esa baribir chiziladi — eng yangi kesimdan.
    expect(r.asOf?.slice(0, 10)).toBe("2099-09-01");
  });

  it("oddiy xodim FAQAT o'z firmasining qarzini ko'radi", async () => {
    // 2026-09-07 da ustun ataylab hamma xodimga ochildi: o'zi yuritayotgan
    // firma to'lamagan bo'lsa ham oylik beriladi va xodim buni ko'rib
    // turishi kerak. Lekin bu qarzdorlik ekranini ochish EMAS — biriktiruvi
    // yo'q firma umuman qaytmaydi.
    const outsider = await prisma.user.create({
      data: { email: `${TAG}-out@vitest.local`, fullName: `${TAG} chetdagi`, passwordHash: "x", role: "accountant" },
      select: { id: true },
    });
    const prev = { id: SESSION.user.id, role: SESSION.user.role };
    SESSION.user.id = outsider.id;
    SESSION.user.role = "accountant";
    try {
      const before = await getPeriodDebtByCompany("2099-07");
      expect(before.byCompany[ids.company]).toBeUndefined();

      // Endi shu firmaga buxgalter qilib biriktiramiz.
      await prisma.company.update({ where: { id: ids.company }, data: { accountantId: outsider.id } });
      const after = await getPeriodDebtByCompany("2099-07");
      expect(after.byCompany[ids.company]).toMatchObject({ debt: 900_000, advance: 250_000 });
    } finally {
      await prisma.company.update({ where: { id: ids.company }, data: { accountantId: null } });
      await prisma.user.deleteMany({ where: { id: outsider.id } });
      SESSION.user.id = prev.id;
      SESSION.user.role = prev.role;
    }
  });

  it("yarim qamrovli kesim o'tkazib yuboriladi", async () => {
    // Bazadagi 07.08 kesimi eski importerdan kelgan va mijozlarning yarmini
    // qamramaydi. "Eng yangisini ol" qoidasi aynan shuni tanlab, qarzi bor
    // firmalarni "kesimda yo'q" qilib qo'yardi.
    const partial = new Date(Date.UTC(2099, 9, 7)); // 2099-10-07
    await prisma.debtSnapshot.create({
      data: {
        asOf: partial, companyId: ids.company,
        rawCustomer: `${TAG} mijoz`, rawContract: "1/БК", debt: 111, advance: 0,
      },
    });
    // Yaxshi qamrovli kesim: to'rt firma (yarim qamrov chegarasi 80%).
    for (let i = 0; i < 4; i++) {
      await prisma.debtSnapshot.create({
        data: {
          asOf: new Date(Date.UTC(2099, 9, 1)), companyId: ids.company,
          rawCustomer: `${TAG} mijoz ${i}`, rawContract: "1/БК", debt: 1_000, advance: 0,
        },
      });
    }

    const r = await getPeriodDebtByCompany("2099-10");

    expect(r.asOf?.slice(0, 10)).toBe("2099-10-01");
    expect(r.byCompany[ids.company]).toMatchObject({ debt: 4_000, advance: 0 });
  });

  it("oyning kesimi KEYINGI oy 1-kuni bo'ladi (1C shu kunda oy haqini yozadi)", async () => {
    // 01.08 fayli — IYUL ning yopilish holati (`scripts/import-debt-snapshot.ts`:
    // "31.07 = hisoblanmagacha, 01.08 = hisoblanmadan keyin"). Shuning uchun
    // iyul matritsasi aynan shu kesimni ko'rsatishi KERAK.
    const r = await getPeriodDebtByCompany("2099-07");

    expect(r.asOf?.slice(0, 10)).toBe("2099-08-01");
    expect(r.byCompany[ids.company]).toMatchObject({ debt: 900_000, advance: 250_000 });
  });
});
