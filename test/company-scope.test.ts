/**
 * Portfel scope'i — firma ko'rinishi ROL emas, BIRIKTIRUV bo'yicha.
 *
 * Bitta odam bir firmada nazoratchi, boshqasida buxgalter, uchinchisida
 * bank-klient bo'lishi mumkin (bazadagi haqiqiy holat) — uchalasi ham uning
 * portfeliga kirishi shart, begonalari esa ko'rinmasligi.
 * Live Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { companyScopeWhere, companyRelations, isReviewerOn, scopedStaffIds } = await import(
  "@/lib/access"
);

const TAG = `vitest-scope-${Date.now()}`;
const ids = {
  /** Nazoratchi: 1 ta nazorat firmasi + 1 ta buxgalteriya firmasi */
  mixed: "",
  /** Boshqa buxgalter — uning firmasi `mixed` ga ko'rinmasligi kerak */
  other: "",
  admin: "",
  supervised: "",
  bookkept: "",
  foreign: "",
};

const mkUser = async (name: string, role: string) =>
  (
    await prisma.user.create({
      data: {
        email: `${TAG}-${name}@test.local`,
        fullName: `${TAG} ${name}`,
        passwordHash: "x",
        role: role as never,
      },
      select: { id: true },
    })
  ).id;

const mkCompany = async (name: string, slots: Record<string, string | null>) =>
  (
    await prisma.company.create({
      data: { name: `${TAG} ${name}`, inn: "000000000", isActive: true, ...slots },
      select: { id: true },
    })
  ).id;

const countFor = (actor: { id: string; role: string }) =>
  prisma.company.count({ where: { isActive: true, ...companyScopeWhere(actor) } });

const inScope = async (actor: { id: string; role: string }, companyId: string) =>
  (await prisma.company.count({ where: { id: companyId, ...companyScopeWhere(actor) } })) === 1;

beforeAll(async () => {
  ids.mixed = await mkUser("mixed", "supervisor");
  ids.other = await mkUser("other", "accountant");
  ids.admin = await mkUser("admin", "admin");

  ids.supervised = await mkCompany("supervised", { supervisorId: ids.mixed });
  ids.bookkept = await mkCompany("bookkept", { accountantId: ids.mixed });
  ids.foreign = await mkCompany("foreign", { accountantId: ids.other });
});

afterAll(async () => {
  // ContractAssignment avval — u Company'ga FK bilan bog'langan.
  await prisma.contractAssignment.deleteMany({
    where: { company: { name: { startsWith: TAG } } },
  });
  await prisma.company.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { fullName: { startsWith: TAG } } });
});

describe("companyScopeWhere — biriktiruv birlashmasi", () => {
  it("nazoratchi nazorat qiladigan firmasini ko'radi", async () => {
    expect(await inScope({ id: ids.mixed, role: "supervisor" }, ids.supervised)).toBe(true);
  });

  it("nazoratchi BUXGALTERIYASINI yuritadigan firmasini ham ko'radi", async () => {
    expect(await inScope({ id: ids.mixed, role: "supervisor" }, ids.bookkept)).toBe(true);
  });

  it("nazoratchi BEGONA firmani ko'rmaydi", async () => {
    expect(await inScope({ id: ids.mixed, role: "supervisor" }, ids.foreign)).toBe(false);
  });

  it("buxgalter faqat o'z firmasini ko'radi", async () => {
    const actor = { id: ids.other, role: "accountant" };
    expect(await inScope(actor, ids.foreign)).toBe(true);
    expect(await inScope(actor, ids.supervised)).toBe(false);
    expect(await inScope(actor, ids.bookkept)).toBe(false);
  });

  it("admin hamma firmani ko'radi", async () => {
    const actor = { id: ids.admin, role: "admin" };
    expect(companyScopeWhere(actor)).toEqual({});
    expect(await inScope(actor, ids.foreign)).toBe(true);
    expect(await countFor(actor)).toBeGreaterThanOrEqual(3);
  });

  it("hech qanday biriktiruvi bo'lmagan nazoratchi 0 ta firma ko'radi", async () => {
    const lonely = await mkUser("lonely", "supervisor");
    expect(await countFor({ id: lonely, role: "supervisor" })).toBe(0);
  });

  it("JAMOA biriktiruvi (ContractAssignment) ham portfelga qo'shadi", async () => {
    await prisma.contractAssignment.create({
      data: {
        companyId: ids.foreign,
        userId: ids.mixed,
        // Bazada imlo bir xil emas ("controller" ham uchraydi) — scope `role`
        // bo'yicha filtrlamasligi shu test bilan qulflanadi.
        role: "controller",
        salaryType: "percent",
        salaryValue: 10,
        startDate: new Date(),
        isActive: true,
      },
    });
    expect(await inScope({ id: ids.mixed, role: "supervisor" }, ids.foreign)).toBe(true);
  });
});

describe("companyRelations — bir firmada bir nechta mas'uliyat", () => {
  it("har bir slot o'z rolini qaytaradi", () => {
    const rels = companyRelations(
      { accountantId: "u1", supervisorId: "u1", bankClientId: "u2" },
      "u1"
    );
    expect([...rels].sort()).toEqual(["accountant", "supervisor"]);
  });

  it("departament orqali bosh buxgalter ham hisobga olinadi", () => {
    const rels = companyRelations({ departmentRef: { chiefAccountantId: "u9" } }, "u9");
    expect([...rels]).toEqual(["chief_accountant"]);
  });

  it("biriktirilmagan odam uchun bo'sh", () => {
    expect([...companyRelations({ accountantId: "u1" }, "u2")]).toEqual([]);
  });
});

describe("isReviewerOn — o'z-o'zini nazorat bloki", () => {
  const sup = { id: "u1", role: "supervisor" };

  it("nazorat qiladigan firmada — nazoratchi", () => {
    expect(isReviewerOn({ supervisorId: "u1" }, sup)).toBe(true);
  });

  it("o'zi buxgalteri bo'lgan firmada — nazoratchi EMAS", () => {
    expect(isReviewerOn({ supervisorId: "u1", accountantId: "u1" }, sup)).toBe(false);
  });

  it("admin uchun har doim true", () => {
    expect(isReviewerOn({ accountantId: "u1" }, { id: "u1", role: "admin" })).toBe(true);
  });
});

describe("scopedStaffIds", () => {
  it("admin uchun null (filtrsiz)", async () => {
    expect(await scopedStaffIds(prisma, { id: ids.admin, role: "admin" })).toBeNull();
  });

  it("portfeldagi firmalarga biriktirilgan xodimlarni qaytaradi", async () => {
    const staff = await scopedStaffIds(prisma, { id: ids.mixed, role: "supervisor" });
    expect(staff).not.toBeNull();
    // o'zi + `foreign` firmasi orqali `other`
    expect(staff).toContain(ids.mixed);
    expect(staff).toContain(ids.other);
  });

  it("biriktiruvsiz xodim faqat o'zini ko'radi", async () => {
    const lonely = await mkUser("lonely2", "accountant");
    expect(await scopedStaffIds(prisma, { id: lonely, role: "accountant" })).toEqual([lonely]);
  });
});
