/**
 * DALIL IZI — skrinshot topshirilganda `ObligationSubmission` yoziladimi.
 *
 * Bu yozuv birlashtirishda tushib qolgan edi: majburiyat "yuborilgan" bo'lib
 * turardi-yu, ortida bitta ham urinish bo'lmasdi va audit/KPI dalilni topa
 * olmasdi. Test shu zanjirni qulflaydi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" as string, name: "Nazoratchi" } };
vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { saveReportProof, reviewReportProof } = await import("@/server/proofs");

const TAG = `vitest-trail-${Date.now()}`;
const PERIOD = "2024-06";
const COL = "didox";
const ids = { user: "", company: "", template: "", obligation: "" };

// 1x1 shaffof PNG — server rasm formatini tekshiradi.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `${TAG}@v.local`, fullName: TAG, passwordHash: "x", role: "super_admin" },
    select: { id: true },
  });
  ids.user = u.id;
  SESSION.user.id = u.id;

  const c = await prisma.company.create({
    data: {
      name: `${TAG} co`, inn: "000000010", taxRegime: "vat", isActive: true,
      companyStatus: "active", contractDate: new Date(Date.UTC(2023, 0, 1)),
    },
    select: { id: true },
  });
  ids.company = c.id;

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, matrixKey: COL, name: "Dalil sinovi",
      obligationType: "internal", periodicity: "monthly",
      anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2023, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;

  const o = await prisma.obligation.create({
    data: {
      companyId: ids.company, templateId: ids.template, templateVersion: 1,
      periodKey: "2024-M06",
      periodStart: new Date(Date.UTC(2024, 5, 1)),
      periodEnd: new Date(Date.UTC(2024, 6, 1)),
      dueAt: new Date(Date.UTC(2024, 6, 20)),
      status: "planned",
    },
    select: { id: true },
  });
  ids.obligation = o.id;
});

afterAll(async () => {
  const subs = await prisma.obligationSubmission.findMany({
    where: { obligationId: ids.obligation }, select: { id: true },
  });
  await prisma.submissionEvidence.deleteMany({
    where: { submissionId: { in: subs.map((s) => s.id) } },
  });
  await prisma.obligationSubmission.deleteMany({ where: { obligationId: ids.obligation } });
  await prisma.obligationStatusEvent.deleteMany({ where: { obligationId: ids.obligation } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.reportProof.deleteMany({ where: { companyId: ids.company } });
  await prisma.monthlyReport.deleteMany({ where: { companyId: ids.company } });
  await prisma.notification.deleteMany({ where: { userId: ids.user } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("dalil izi", () => {
  it("skrinshot topshirilganda urinish va dalil yoziladi", async () => {
    await saveReportProof({
      companyId: ids.company, period: PERIOD, colKey: COL, imageData: PNG,
    });

    const subs = await prisma.obligationSubmission.findMany({
      where: { obligationId: ids.obligation },
      select: { id: true, attemptNo: true, status: true },
    });
    expect(subs).toHaveLength(1);
    expect(subs[0].attemptNo).toBe(1);
    expect(subs[0].status).toBe("sent");

    const ev = await prisma.submissionEvidence.findMany({
      where: { submissionId: subs[0].id }, select: { type: true, storageRef: true },
    });
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe("screenshot");
    expect(ev[0].storageRef).toMatch(/^reportProof:/);
  });

  it("nazoratchi tasdiqlasa urinish yopiladi", async () => {
    await reviewReportProof({
      companyId: ids.company, period: PERIOD, colKey: COL, decision: "approved",
    });

    const sub = await prisma.obligationSubmission.findFirstOrThrow({
      where: { obligationId: ids.obligation },
      orderBy: { attemptNo: "desc" },
      select: { status: true, acceptedAt: true },
    });
    expect(sub.status).toBe("accepted");
    expect(sub.acceptedAt).not.toBeNull();
  });
});
