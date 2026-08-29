/**
 * EVIDENCE LANDING — ziddiyat qoidasi va manbadan mustaqillik.
 *
 * ADR-0008 ning uch xususiyati shu yerda tekshiriladi:
 *   1. Dalil hech qachon tashlanmaydi — status rad etilsa ham yoziladi.
 *   2. Odam qo'ygan status g'olib; import faqat oldinga siljitadi.
 *   3. Rad etilgan da'vo JIMLIK emas — u Task yaratadi.
 *
 * Va Modda 5: bir xil da'vo `excel | 1c | didox` orqali bir xil natija beradi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { landObligationClaim, applyEvidenceEvent } = await import("@/lib/engines/evidence/landing");

const TAG = `vitest-landing-${Date.now()}`;
const ids = { company: "", template: "", connection: "", user: "" };
let seq = 0;

/** Har chaqiruvda YANGI davr — testlar bir-birining holatini buzmasin. */
function claim(over: Record<string, unknown> = {}, month = 1 + seq++) {
  return {
    schemaVersion: 1,
    subject: { kind: "companyId", companyId: ids.company },
    obligation: { kind: "templateCode", code: `${TAG}-T` },
    period: `2095-${String(month).padStart(2, "0")}`,
    claim: "submitted",
    occurredAt: "2095-01-20T09:00:00.000Z",
    confidence: 0.4,
    provenance: { sourceSystem: "excel", rawHash: `h-${month}`, profileId: "p1" },
    ...over,
  };
}

const event = (payload: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  id: `ev-${TAG}-${seq}`,
  connectionId: ids.connection,
  eventType: "obligation.claim",
  schemaVersion: 1,
  payload: payload as never,
  ...over,
});

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `${TAG}@v.local`, fullName: "L", passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  ids.user = u.id;

  const c = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`, inn: `${TAG.slice(-9)}`, taxRegime: "vat",
      isActive: true, companyStatus: "active", contractDate: new Date(Date.UTC(2090, 0, 1)),
    },
    select: { id: true },
  });
  ids.company = c.id;

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, name: "Landing test", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2090, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;

  const conn = await prisma.oneCConnection.create({
    data: { name: `${TAG}-conn`, tokenHash: `${TAG}-hash`, kind: "excel" },
    select: { id: true },
  });
  ids.connection = conn.id;
});

afterAll(async () => {
  await prisma.task.deleteMany({ where: { companyId: ids.company } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.oneCConnection.deleteMany({ where: { id: ids.connection } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.auditLog.deleteMany({ where: { recordId: { not: "" }, tableName: "Obligation", userId: null } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("vakolat shifti", () => {
  it("Excel 'accepted' desa ham majburiyat faqat sent'ga siljiydi", async () => {
    const r = await landObligationClaim(prisma, event(claim({ claim: "accepted", confidence: 0.4 })));
    expect(r.applied).toBe(true);
    expect(r.toStatus).toBe("sent");
  });

  it("vakolatli kvitansiya (1.0) accepted qo'yadi", async () => {
    const r = await landObligationClaim(prisma, event(claim({ claim: "accepted", confidence: 1 })));
    expect(r.applied).toBe(true);
    expect(r.toStatus).toBe("accepted");
  });
});

describe("ziddiyat qoidasi", () => {
  it("terminal holat avtomatik o'zgarmaydi, LEKIN dalil yoziladi", async () => {
    const c = claim({ claim: "accepted", confidence: 1 });
    await landObligationClaim(prisma, event(c));

    const again = await landObligationClaim(
      prisma,
      event({ ...c, claim: "submitted", provenance: { ...c.provenance, rawHash: "h-again" } }),
    );
    expect(again.applied).toBe(false);
    expect(again.conflictReason).toBe("terminal_status");

    // Eng muhim tasdiq: hujjat baribir saqlandi.
    const subs = await prisma.obligationSubmission.count({ where: { obligationId: again.obligationId } });
    expect(subs).toBe(2);
  });

  it("odam qo'ygan statusni import ORQAGA sura olmaydi", async () => {
    const c = claim({ claim: "submitted", confidence: 0.4 });
    const first = await landObligationClaim(prisma, event(c));

    // Odam qo'lda `ready` ga tushirdi (byUserId to'ldirilgan).
    await prisma.obligation.update({ where: { id: first.obligationId }, data: { status: "ready" } });
    await prisma.obligationStatusEvent.create({
      data: { obligationId: first.obligationId, fromStatus: "sent", toStatus: "ready", byUserId: ids.user },
    });

    const back = await landObligationClaim(
      prisma,
      event({ ...c, claim: "prepared", provenance: { ...c.provenance, rawHash: "h-back" } }),
    );
    expect(back.applied).toBe(false);
    expect(back.conflictReason).toBe("human_owns_status");
  });

  it("odam qo'ygan bo'lsa ham import OLDINGA siljita oladi", async () => {
    const c = claim({ claim: "submitted", confidence: 0.4 });
    const first = await landObligationClaim(prisma, event(c));
    await prisma.obligation.update({ where: { id: first.obligationId }, data: { status: "in_progress" } });
    await prisma.obligationStatusEvent.create({
      data: { obligationId: first.obligationId, fromStatus: "sent", toStatus: "in_progress", byUserId: ids.user },
    });

    const fwd = await landObligationClaim(
      prisma,
      event({ ...c, claim: "submitted", provenance: { ...c.provenance, rawHash: "h-fwd" } }),
    );
    expect(fwd.applied).toBe(true);
    expect(fwd.toStatus).toBe("sent");
  });

  it("rad etilgan da'vo JIMLIK emas — Task yaratadi", async () => {
    const c = claim({ claim: "accepted", confidence: 1 });
    const r1 = await landObligationClaim(prisma, event(c));
    await landObligationClaim(
      prisma,
      event({ ...c, claim: "submitted", provenance: { ...c.provenance, rawHash: "h-task" } }),
    );

    const task = await prisma.task.findFirst({
      where: { obligationId: r1.obligationId, taskType: "import_conflict" },
      select: { title: true, status: true, description: true },
    });
    expect(task).not.toBeNull();
    expect(task!.status).toBe("open");
    expect(task!.description).toMatch(/terminal_status/);
  });
});

describe("Modda 5 — manbadan mustaqillik", () => {
  it("excel | 1c | didox bir xil da'voni bir xil natijaga olib keladi", async () => {
    // Bu testning maqsadi: `landing.ts` da `if (source === …)` paydo bo'lsa
    // u DARHOL quladi. Manba farqi faqat `confidence` orqali ifodalanadi.
    const results = [];
    for (const source of ["excel", "1c", "didox"]) {
      const r = await landObligationClaim(
        prisma,
        event(
          claim({
            claim: "submitted",
            confidence: 0.7,
            provenance: { sourceSystem: source, rawHash: `h-${source}`, profileId: "p" },
          }),
        ),
      );
      results.push({ applied: r.applied, to: r.toStatus });
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0].to).toBe("sent");
  });

  it("manba submission'ga yoziladi — kelib chiqish yo'qolmaydi", async () => {
    const r = await landObligationClaim(
      prisma,
      event(claim({ provenance: { sourceSystem: "didox", rawHash: "h-prov", profileId: "p" } })),
    );
    const sub = await prisma.obligationSubmission.findUnique({
      where: { id: r.submissionId },
      select: { sourceSystem: true },
    });
    expect(sub!.sourceSystem).toBe("didox");
  });
});

describe("yechish xatolari", () => {
  it("noma'lum hodisa turi rad etiladi (DLQ oqimiga tushadi)", async () => {
    await expect(
      applyEvidenceEvent(prisma, event(claim(), { eventType: "nimadir", schemaVersion: 9 })),
    ).rejects.toThrow(/Noma'lum hodisa turi/);
  });

  it("topilmagan template — xato, jimgina o'tkazib yuborilmaydi", async () => {
    await expect(
      landObligationClaim(prisma, event(claim({ obligation: { kind: "templateCode", code: "YO-Q" } }))),
    ).rejects.toThrow(/Template topilmadi/);
  });

  it("noaniq INN rad etiladi — noto'g'ri firmaga yozilmaydi", async () => {
    await expect(
      landObligationClaim(prisma, event(claim({ subject: { kind: "inn", inn: "000000000000" } }))),
    ).rejects.toThrow(/AMBIGUOUS_COMPANY/);
  });

  it("buzuq davr formati rad etiladi", async () => {
    await expect(landObligationClaim(prisma, event(claim({ period: "iyul" })))).rejects.toThrow(/Davr formati/);
  });
});
