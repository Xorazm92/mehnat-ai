/**
 * YETAKCHI KO'RSATKICH — arifmetika va chegaralar (M5.2).
 *
 * Twin (M3) "nima BO'LDI" ni o'lchaydi. Bu modul "nima BO'LADI" ga qaraydi:
 * muddat hali o'tmagan, lekin besh kun ichida uchta ish tugaydi.
 *
 * Testlar ikki narsani qulflaydi:
 *   1. CHEGARA — 3/7, 110/150, 20/40, 10/25, 30/60. Chegara siljisa ekran
 *      "xavf yo'q" deb turgan holatda ogohlantirish kelardi (yoki teskarisi).
 *   2. O'LCHANMAGAN ≠ XAVFSIZ. Ma'lumot yo'q bo'lsa ko'rsatkich RO'YXATGA
 *      TUSHMAYDI — 0 bilan qo'shish "hammasi joyida" degan yolg'on bo'lardi
 *      (`twin.ts` dagi `null` qoidasi bilan bir xil sabab).
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { computeLeadingIndicators, severityOf, aggregateSeverity } = await import(
  "@/lib/domains/accounting/leadingIndicator"
);
import type { LeadingIndicator } from "@/lib/domains/accounting/leadingIndicator";

const TAG = `vitest-lead-${Date.now()}`;
/** 2091 — boshqa testlar band qilmagan yil. */
const NOW = new Date(Date.UTC(2091, 5, 15));
const DAY = 86_400_000;

const ids = { admin: "", acc: "", company: "" };
let templateSeq = 0;

const actor = () => ({ id: ids.admin, role: "super_admin" });

/** Har majburiyat o'z template'i bilan — `@@unique` bitta davrga bittasini beradi. */
async function mkObligation(o: { dueInDays: number; status: string; periodKey?: string }) {
  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T${++templateSeq}`, name: `Lead ${templateSeq}`,
      obligationType: "tax_declaration", periodicity: "monthly",
      anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2091, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  return prisma.obligation.create({
    data: {
      companyId: ids.company, templateId: t.id, templateVersion: 1,
      periodStart: new Date(Date.UTC(2091, 5, 1)),
      periodEnd: new Date(Date.UTC(2091, 6, 1)),
      periodKey: o.periodKey ?? "2091-M06",
      dueAt: new Date(NOW.getTime() + o.dueInDays * DAY),
      status: o.status as never,
      responsibleUserId: ids.acc,
    },
    select: { id: true },
  });
}

async function mkSubmission(obligationId: string, status: string, attemptNo: number) {
  const row = await prisma.obligationSubmission.create({
    data: { obligationId, attemptNo, status: status as never },
    select: { id: true },
  });
  // `createdAt` `@default(now())` — oynaga tushishi uchun qo'lda qo'yiladi.
  await prisma.obligationSubmission.update({
    where: { id: row.id },
    data: { createdAt: new Date(NOW.getTime() - 5 * DAY) },
  });
  return row.id;
}

const byCode = (list: LeadingIndicator[], code: string) => list.find((i) => i.code === code);
const run = () => computeLeadingIndicators(prisma, { companyId: ids.company, actor: actor(), now: NOW });

beforeAll(async () => {
  const [admin, acc] = await Promise.all([
    prisma.user.create({
      data: { email: `${TAG}-a@v.local`, fullName: `${TAG} admin`, passwordHash: "x", role: "super_admin" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: `${TAG}-c@v.local`, fullName: `${TAG} acc`, passwordHash: "x", role: "accountant" },
      select: { id: true },
    }),
  ]);
  ids.admin = admin.id;
  ids.acc = acc.id;

  const co = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`, inn: String(Date.now()).slice(-9), taxRegime: "vat",
      isActive: true, companyStatus: "active",
      contractDate: new Date(Date.UTC(2091, 0, 1)),
      complexity: "standard", accountantId: acc.id,
    },
    select: { id: true },
  });
  ids.company = co.id;
});

afterEach(async () => {
  await prisma.obligationSubmission.deleteMany({ where: { obligation: { companyId: ids.company } } });
  await prisma.obligation.deleteMany({ where: { companyId: ids.company } });
  await prisma.deadlineTemplate.deleteMany({ where: { code: { startsWith: TAG } } });
});

afterAll(async () => {
  await prisma.obligationSubmission.deleteMany({ where: { obligation: { companyId: ids.company } } });
  await prisma.obligation.deleteMany({ where: { companyId: ids.company } });
  await prisma.deadlineTemplate.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.acc] } } });
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────
// SOF ARIFMETIKA
// ─────────────────────────────────────────────────────────

describe("severityOf — chegara qoidasi", () => {
  it("chegaraning O'ZI keyingi darajaga o'tadi", () => {
    expect(severityOf(2, 3, 7)).toBe("low");
    // 3 — `low` EMAS: shart `value < low`.
    expect(severityOf(3, 3, 7)).toBe("medium");
    expect(severityOf(6, 3, 7)).toBe("medium");
    expect(severityOf(7, 3, 7)).toBe("high");
    expect(severityOf(99, 3, 7)).toBe("high");
  });
});

describe("aggregateSeverity — eng yomoni g'alaba qiladi", () => {
  const mk = (severity: "low" | "medium" | "high") => ({ severity }) as LeadingIndicator;

  it("hammasi past — past", () => {
    expect(aggregateSeverity([mk("low"), mk("low"), mk("low")])).toBe("low");
  });

  it("bittasi yuqori — YUQORI (o'rtacha olinmaydi)", () => {
    // O'rtacha olinsa to'rtta "past" bittasini yashirardi — aynan e'tibor
    // kerak bo'lgan holat ko'rinmay qolardi (ADR-0013 bilan bir xil sabab).
    expect(aggregateSeverity([mk("low"), mk("low"), mk("low"), mk("low"), mk("high")])).toBe("high");
  });

  it("bo'sh ro'yxat — past", () => {
    expect(aggregateSeverity([])).toBe("low");
  });
});

// ─────────────────────────────────────────────────────────
// KO'RSATKICHLAR
// ─────────────────────────────────────────────────────────

describe("near_deadlines — 5 kunlik oyna", () => {
  it("ish yo'q — 0 va past", async () => {
    const i = byCode(await run(), "near_deadlines");
    expect(i?.value).toBe(0);
    expect(i?.severity).toBe("low");
  });

  it("oynadan TASHQARIDAGI muddat sanalmaydi", async () => {
    await mkObligation({ dueInDays: 9, status: "planned" });   // 5 kundan keyin
    await mkObligation({ dueInDays: -2, status: "planned" });  // allaqachon o'tgan
    const i = byCode(await run(), "near_deadlines");
    expect(i?.value).toBe(0);
  });

  it("3 ta yaqin muddat — o'rta daraja", async () => {
    for (const d of [1, 3, 5]) await mkObligation({ dueInDays: d, status: "planned" });
    const i = byCode(await run(), "near_deadlines");
    expect(i?.value).toBe(3);
    expect(i?.severity).toBe("medium");
    expect(i?.detail).toContain("3 muddat");
  });

  it("yopilgan majburiyat sanalmaydi", async () => {
    await mkObligation({ dueInDays: 2, status: "accepted" });
    const i = byCode(await run(), "near_deadlines");
    expect(i?.value).toBe(0);
  });
});

describe("rejection_rate — oxirgi 30 kun", () => {
  it("topshirish bo'lmasa ko'rsatkich UMUMAN yo'q (0% emas)", async () => {
    expect(byCode(await run(), "rejection_rate")).toBeUndefined();
  });

  it("5 tadan 2 tasi rad etilgan — 40%, yuqori", async () => {
    const o = await mkObligation({ dueInDays: 20, status: "sent" });
    await mkSubmission(o.id, "rejected", 1);
    await mkSubmission(o.id, "rejected", 2);
    await mkSubmission(o.id, "accepted", 3);
    await mkSubmission(o.id, "sent", 4);
    await mkSubmission(o.id, "sent", 5);

    const i = byCode(await run(), "rejection_rate");
    expect(i?.value).toBe(40);
    expect(i?.severity).toBe("high"); // 40 >= medium(40)
    expect(i?.detail).toContain("2 tasi rad etilgan");
  });
});

describe("obligation_state — javob kutayotganlar ulushi", () => {
  it("4 tadan 3 tasi `sent` — 75%, yuqori", async () => {
    await mkObligation({ dueInDays: 20, status: "sent" });
    await mkObligation({ dueInDays: 21, status: "sent" });
    await mkObligation({ dueInDays: 22, status: "sent" });
    await mkObligation({ dueInDays: 23, status: "planned" });

    const i = byCode(await run(), "obligation_state");
    expect(i?.value).toBe(75);
    expect(i?.severity).toBe("high");
  });
});

describe("har ko'rsatkich da'vo bilan keladi", () => {
  it("da'voda manba, vaqt va vakolat bor", async () => {
    await mkObligation({ dueInDays: 2, status: "planned" });
    const list = await run();
    expect(list.length).toBeGreaterThan(0);

    for (const i of list) {
      expect(i.claim.sourceTool).toMatch(/^(obligation|twin|submission|debt)$/);
      expect(i.claim.sourceQuery.length).toBeGreaterThan(0);
      expect(i.claim.asOf).toBe(NOW.toISOString());
      expect(i.claim.confidence).toBeGreaterThan(0);
      expect(i.claim.confidence).toBeLessThanOrEqual(1);
      // Raqam da'vodagi bilan bir xil — ikki joyda ikki qiymat bo'lmaydi.
      expect(i.claim.value).toBe(i.value);
    }
  });
});
