/**
 * DIGITAL TWIN — haqiqiy ma'lumot ustida.
 *
 * Sof matematika `lib/engines/analytics/twin.spec.ts` da. Bu yerda uch narsa:
 * biriktiruv doirasi, agregatsiyaning to'g'riligi, va `riskLevel` ning
 * qo'ldan hisoblanganga o'tishi.
 *
 * DIQQAT: davr 2019 — ikki sabab. Birinchisi, umumiy dev bazasida u yilda
 * majburiyat yo'q, ya'ni haqiqiy ma'lumotga tegilmaydi. Ikkinchisi muhimroq:
 * "muddati o'tgan" DEVOR SOATIGA nisbatan hisoblanadi, shuning uchun davr
 * O'TMISHDA bo'lishi shart. Birinchi tahririda 2094 edi va kechikish
 * testlarining hammasi jimgina nolga aylandi. Generator BU YERDA CHAQIRILMAYDI.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { getCompanyTwins, getStaffCapacity, persistRiskLevels } = await import("@/server/twin");

const TAG = `vitest-twin-${Date.now()}`;
const PERIOD = "2019-05";
const ids = { mine: "", theirs: "", sup: "", acc: "" };
/**
 * Har majburiyat O'Z template'i bilan.
 *
 * `@@unique([companyId, templateId, periodStart, periodEnd])` — bitta firmaga
 * bitta davrda bitta template bo'yicha faqat bitta majburiyat bo'ladi, va bu
 * to'g'ri: aks holda "shu oyning QQS deklaratsiyasi" ikkita bo'lardi.
 */
let templateSeq = 0;

const day = (d: number) => new Date(Date.UTC(2019, 4, d));

async function mkObligation(o: {
  companyId: string;
  dueDay: number;
  status: string;
  acceptedDay?: number;
  responsibleUserId?: string | null;
}) {
  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T${++templateSeq}`, name: `Twin test ${templateSeq}`,
      obligationType: "tax_declaration", periodicity: "monthly",
      anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2015, 0, 1)), lifecycle: "active",
      // `normativeMinutes` ATAYLAB bo'sh — standartga qaytish tekshiriladi.
    },
    select: { id: true },
  });
  return prisma.obligation.create({
    data: {
      companyId: o.companyId,
      templateId: t.id,
      templateVersion: 1,
      periodStart: day(1),
      periodEnd: new Date(Date.UTC(2019, 5, 1)),
      periodKey: "2019-M05",
      dueAt: day(o.dueDay),
      status: o.status as never,
      acceptedAt: o.acceptedDay ? day(o.acceptedDay) : null,
      responsibleUserId: o.responsibleUserId === undefined ? ids.acc : o.responsibleUserId,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  const mk = (n: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${n}@v.local`, fullName: `${TAG} ${n}`, passwordHash: "x", role: role as never },
      select: { id: true },
    });
  const [sup, acc] = await Promise.all([mk("sup", "supervisor"), mk("acc", "accountant")]);
  ids.sup = sup.id;
  ids.acc = acc.id;

  const mkCo = (n: string, supervisorId: string | null) =>
    prisma.company.create({
      data: {
        name: `${TAG} ${n}`, inn: "000000000", taxRegime: "vat", isActive: true,
        companyStatus: "active", contractDate: new Date(Date.UTC(2015, 0, 1)),
        complexity: "standard", accountantId: ids.acc, supervisorId, riskLevel: "low",
      },
      select: { id: true },
    });
  ids.mine = (await mkCo("mine", ids.sup)).id;
  ids.theirs = (await mkCo("theirs", null)).id;

  await mkObligation({ companyId: ids.mine, dueDay: 10, status: "accepted", acceptedDay: 8 });
  await mkObligation({ companyId: ids.mine, dueDay: 10, status: "accepted", acceptedDay: 15 });
  await mkObligation({ companyId: ids.mine, dueDay: 12, status: "rejected" });
  await mkObligation({ companyId: ids.mine, dueDay: 15, status: "planned" });
  await mkObligation({ companyId: ids.theirs, dueDay: 10, status: "planned" });

  SESSION.user.id = ids.sup;
  SESSION.user.role = "supervisor";
});

afterAll(async () => {
  await prisma.obligation.deleteMany({ where: { template: { code: { startsWith: TAG } } } });
  await prisma.deadlineTemplate.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.sup, ids.acc] } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.mine, ids.theirs] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.sup, ids.acc] } } });
  await prisma.$disconnect();
});

describe("biriktiruv doirasi", () => {
  it("nazoratchi O'Z portfelini ko'radi", async () => {
    const twins = await getCompanyTwins(PERIOD);
    const idsOut = twins.map((t) => t.companyId);
    expect(idsOut).toContain(ids.mine);
    expect(idsOut).not.toContain(ids.theirs);
  });

  it("kirmagan foydalanuvchi rad etiladi", async () => {
    const prev = SESSION.user.id;
    SESSION.user.id = "";
    await expect(getCompanyTwins(PERIOD)).rejects.toThrow(/Unauthorized/);
    SESSION.user.id = prev;
  });
});

describe("ballar", () => {
  it("muvofiqlik — 4 tadan 1 tasi o'z vaqtida", async () => {
    // accepted@8 (muddat 10) → o'z vaqtida. accepted@15 (muddat 10) → kech.
    // rejected → yopilgan, o'z vaqtida emas. planned muddat o'tgan → ochiq.
    const t = (await getCompanyTwins(PERIOD)).find((x) => x.companyId === ids.mine)!;
    expect(t.compliance.value).toBe(25);
    expect(t.compliance.level).toBe("high");
  });

  it("xavf — rad etish ham, muddat o'tishi ham hisobda", async () => {
    const t = (await getCompanyTwins(PERIOD)).find((x) => x.companyId === ids.mine)!;
    expect(t.risk.value).toBeGreaterThan(0);
    const codes = t.risk.reasons.map((r) => r.code);
    expect(codes).toContain("rejected");
    expect(codes).toContain("overdue_breadth");
  });

  it("izoh raqamni tushuntiradi", async () => {
    const t = (await getCompanyTwins(PERIOD)).find((x) => x.companyId === ids.mine)!;
    expect(t.explanation).toContain(String(t.risk.value));
    const sum = Math.round(t.risk.reasons.reduce((a, r) => a + r.points, 0) * 10) / 10;
    expect(sum).toBe(t.risk.value);
  });
});

describe("sig'im", () => {
  it("ochiq ishlar yuklamaga kiradi, normativsiz — TAXMINIY", async () => {
    const rows = await getStaffCapacity(PERIOD);
    const acc = rows.find((r) => r.userId === ids.acc);
    expect(acc).toBeDefined();
    expect(acc!.score.value).toBeGreaterThan(0);
    // Template'da `normativeMinutes` yo'q → standart ishlatilgan, va buni
    // foydalanuvchi bilishi kerak.
    expect(acc!.estimated).toBe(true);
  });
});

describe("persistRiskLevels", () => {
  it("hisoblangan darajani yozadi va SABABINI qoldiradi", async () => {
    const res = await persistRiskLevels(PERIOD);
    expect(res.considered).toBeGreaterThan(0);

    const c = await prisma.company.findUnique({
      where: { id: ids.mine },
      select: { riskLevel: true, riskNotes: true },
    });
    const twin = (await getCompanyTwins(PERIOD)).find((x) => x.companyId === ids.mine)!;
    expect(c!.riskLevel).toBe(twin.risk.level);
    // Manbasiz raqam ko'rsatilmaydi (7-modda).
    expect(c!.riskNotes).toContain("chunki");
  });

  it("ikkinchi chaqiruv hech nima yozmaydi", async () => {
    const res = await persistRiskLevels(PERIOD);
    expect(res.updated).toBe(0);
  });
});
