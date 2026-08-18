/**
 * OBLIGATION server actions — object-level access (IDOR), status transitions,
 * delay-reason 2-bosqichli approval. Live Postgres + mocked auth.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const {
  getObligationById,
  updateObligationStatus,
  setDelayReason,
  approveDelayReason,
  reassignObligation,
} = await import("@/server/obligations");

const TAG = `vitest-oblacc-${Date.now()}`;
const ids = { userA: "", userB: "", userS: "", company: "", template: "", obl1: "", obl2: "" };

const actor = (id: string, role: string) => {
  SESSION.user.id = id;
  SESSION.user.role = role;
};

async function makeObligation(periodMonth: number, key: string): Promise<string> {
  const o = await prisma.obligation.create({
    data: {
      companyId: ids.company,
      templateId: ids.template,
      templateVersion: 1,
      periodStart: new Date(Date.UTC(2097, periodMonth, 1)),
      periodEnd: new Date(Date.UTC(2097, periodMonth + 1, 1)),
      periodKey: key,
      dueAt: new Date(Date.UTC(2097, periodMonth + 1, 20)),
      status: "planned",
      responsibleUserId: ids.userA,
    },
    select: { id: true },
  });
  return o.id;
}

beforeAll(async () => {
  const [a, b, s] = await Promise.all([
    prisma.user.create({ data: { email: `${TAG}-a@v.local`, fullName: "A", passwordHash: "x", role: "accountant" }, select: { id: true } }),
    prisma.user.create({ data: { email: `${TAG}-b@v.local`, fullName: "B", passwordHash: "x", role: "accountant" }, select: { id: true } }),
    prisma.user.create({ data: { email: `${TAG}-s@v.local`, fullName: "S", passwordHash: "x", role: "supervisor" }, select: { id: true } }),
  ]);
  ids.userA = a.id;
  ids.userB = b.id;
  ids.userS = s.id;

  const company = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`,
      inn: "000000000",
      taxRegime: "vat",
      isActive: true,
      companyStatus: "active",
      contractDate: new Date(Date.UTC(2097, 0, 1)),
      accountantId: a.id,
      supervisorId: s.id,
    },
    select: { id: true },
  });
  ids.company = company.id;

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`,
      name: "Acc test",
      obligationType: "tax_declaration",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2097, 0, 1)),
      lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;

  ids.obl1 = await makeObligation(6, "2097-M07");
  ids.obl2 = await makeObligation(7, "2097-M08");
});

afterAll(async () => {
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } }); // events cascade
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.userA, ids.userB, ids.userS] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB, ids.userS] } } });
  await prisma.$disconnect();
});

describe("object-level access (IDOR)", () => {
  it("unrelated accountant cannot view another company's obligation", async () => {
    actor(ids.userB, "accountant");
    await expect(getObligationById(ids.obl1)).rejects.toThrow(/ruxsat/i);
  });
  it("unrelated accountant cannot change status", async () => {
    actor(ids.userB, "accountant");
    await expect(updateObligationStatus(ids.obl1, "in_progress")).rejects.toThrow(/ruxsat/i);
  });
  it("unauthenticated is rejected", async () => {
    actor("", "");
    await expect(getObligationById(ids.obl1)).rejects.toThrow(/Unauthorized/);
  });
});

describe("status transitions", () => {
  it("owner accountant walks planned → in_progress → ready → sent", async () => {
    actor(ids.userA, "accountant");
    await updateObligationStatus(ids.obl1, "in_progress");
    await updateObligationStatus(ids.obl1, "ready");
    await updateObligationStatus(ids.obl1, "sent");
    const o = await prisma.obligation.findUnique({ where: { id: ids.obl1 }, select: { status: true, sentAt: true } });
    expect(o!.status).toBe("sent");
    expect(o!.sentAt).not.toBeNull();
    const events = await prisma.obligationStatusEvent.count({ where: { obligationId: ids.obl1 } });
    expect(events).toBe(3);
  });

  it("accountant cannot accept (senior-only)", async () => {
    actor(ids.userA, "accountant");
    await expect(updateObligationStatus(ids.obl1, "accepted")).rejects.toThrow(/senior/i);
  });

  it("supervisor accepts sent → accepted (with timing)", async () => {
    actor(ids.userS, "supervisor");
    await updateObligationStatus(ids.obl1, "accepted");
    const o = await prisma.obligation.findUnique({ where: { id: ids.obl1 }, select: { status: true, acceptedAt: true, completedAt: true } });
    expect(o!.status).toBe("accepted");
    expect(o!.acceptedAt).not.toBeNull();
    expect(o!.completedAt).not.toBeNull();
  });

  it("illegal transition is blocked (planned → accepted)", async () => {
    actor(ids.userS, "supervisor");
    await expect(updateObligationStatus(ids.obl2, "accepted")).rejects.toThrow(/Noqonuniy/);
  });
});

describe("delay reason (2-stage approval)", () => {
  it("owner marks a delay reason", async () => {
    actor(ids.userA, "accountant");
    await setDelayReason(ids.obl2, "client_delay", "mijoz hujjatni kech berdi");
    const o = await prisma.obligation.findUnique({ where: { id: ids.obl2 }, select: { delayReason: true, delayMarkedById: true, delayApprovedById: true } });
    expect(o!.delayReason).toBe("client_delay");
    expect(o!.delayMarkedById).toBe(ids.userA);
    expect(o!.delayApprovedById).toBeNull();
  });

  it("accountant cannot approve their own delay reason", async () => {
    actor(ids.userA, "accountant");
    await expect(approveDelayReason(ids.obl2)).rejects.toThrow(/senior/i);
  });

  it("supervisor approves the delay reason", async () => {
    actor(ids.userS, "supervisor");
    await approveDelayReason(ids.obl2);
    const o = await prisma.obligation.findUnique({ where: { id: ids.obl2 }, select: { delayApprovedById: true } });
    expect(o!.delayApprovedById).toBe(ids.userS);
  });

  it("cannot approve an unmarked delay reason", async () => {
    actor(ids.userS, "supervisor");
    await expect(approveDelayReason(ids.obl1)).rejects.toThrow(/belgilanishi/);
  });
});

describe("reassignment", () => {
  it("accountant cannot reassign", async () => {
    actor(ids.userA, "accountant");
    await expect(reassignObligation(ids.obl2, ids.userB)).rejects.toThrow(/senior/i);
  });
  it("supervisor reassigns + writes an assignment event", async () => {
    actor(ids.userS, "supervisor");
    await reassignObligation(ids.obl2, ids.userB, "yuk qayta taqsimlandi");
    const o = await prisma.obligation.findUnique({ where: { id: ids.obl2 }, select: { responsibleUserId: true } });
    expect(o!.responsibleUserId).toBe(ids.userB);
    const ev = await prisma.obligationAssignmentEvent.count({ where: { obligationId: ids.obl2 } });
    expect(ev).toBe(1);
  });
});
