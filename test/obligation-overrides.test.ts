/**
 * COMPANY OBLIGATION OVERRIDE — xavfsizlik klapani.
 *
 * Generator bu jadvalni boshidan o'qiydi, lekin uni to'ldiradigan hech narsa
 * yo'q edi. Bu testlar ikki narsani tasdiqlaydi: ruxsat/validatsiya, va eng
 * muhimi — `disable` HAQIQATAN majburiyat yaratilishini to'xtatadi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { getTemplateOverrides, setObligationOverride, removeObligationOverride } = await import(
  "@/server/obligationOverrides"
);
const { generateObligations } = await import("@/lib/engines/obligation/obligations");
const { toSubject } = await import("@/lib/domains/accounting/subjects");

/**
 * Generatsiyani FAQAT sinov firmasiga cheklaydi.
 *
 * Birinchi tahririda bu `loadCompanySubjects` edi — u BARCHA faol firmalarni
 * yuklaydi, ya'ni test umumiy dev bazasida 213 firma × 15 template × 3 davr =
 * ~7 900 majburiyat yaratdi va `obligation-sweep` testini timeout'ga olib
 * keldi. `generateObligations` ning `loadSubjects` injection nuqtasi aynan
 * shuning uchun bor (A3): testda ham, ishlab chiqarishda ham subyektlar
 * to'plamini chaqiruvchi belgilaydi.
 */
const onlyTestCompany = async () => {
  const c = await prisma.company.findUniqueOrThrow({
    where: { id: ids.company },
    select: {
      id: true, isActive: true, companyStatus: true, contractDate: true,
      taxRegime: true, statsType: true, activeServices: true,
      accountantId: true, supervisorId: true, chiefAccountantId: true,
    },
  });
  return [toSubject(c)];
};

const TAG = `vitest-ovr-${Date.now()}`;
const ids = { company: "", other: "", template: "", sup: "", acc: "", admin: "" };

const actor = (id: string, role: string) => {
  SESSION.user.id = id;
  SESSION.user.role = role;
};

beforeAll(async () => {
  const mk = (n: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${n}@v.local`, fullName: n, passwordHash: "x", role: role as never },
      select: { id: true },
    });
  const [sup, acc, admin] = await Promise.all([mk("sup", "supervisor"), mk("acc", "accountant"), mk("adm", "admin")]);
  ids.sup = sup.id;
  ids.acc = acc.id;
  ids.admin = admin.id;

  const mkCo = (n: string, supervisorId: string | null) =>
    prisma.company.create({
      data: {
        name: `${TAG} ${n}`, inn: "000000000", taxRegime: "vat", isActive: true,
        companyStatus: "active", contractDate: new Date(Date.UTC(2090, 0, 1)),
        accountantId: ids.acc, supervisorId,
      },
      select: { id: true },
    });
  ids.company = (await mkCo("mine", ids.sup)).id;
  ids.other = (await mkCo("theirs", null)).id; // supervisor bunga tegishli emas

  const t = await prisma.deadlineTemplate.create({
    data: {
      code: `${TAG}-T`, name: "Override test", obligationType: "tax_declaration",
      periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20,
      effectiveFrom: new Date(Date.UTC(2090, 0, 1)), lifecycle: "active",
    },
    select: { id: true },
  });
  ids.template = t.id;
});

afterAll(async () => {
  await prisma.companyObligationOverride.deleteMany({ where: { templateId: ids.template } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.company, ids.other] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.sup, ids.acc, ids.admin] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.sup, ids.acc, ids.admin] } } });
  await prisma.$disconnect();
});

describe("ruxsat", () => {
  it("kirmagan foydalanuvchi rad etiladi", async () => {
    actor("", "");
    await expect(getTemplateOverrides(ids.template)).rejects.toThrow(/Unauthorized/);
  });

  it("oddiy buxgalter istisno qo'ya olmaydi", async () => {
    actor(ids.acc, "accountant");
    await expect(
      setObligationOverride({ companyId: ids.company, templateId: ids.template, action: "disable", reason: "x" }),
    ).rejects.toThrow(/senior/i);
  });

  it("nazoratchi O'Z portfelidan tashqariga qo'ya olmaydi", async () => {
    actor(ids.sup, "supervisor");
    await expect(
      setObligationOverride({ companyId: ids.other, templateId: ids.template, action: "disable", reason: "x" }),
    ).rejects.toThrow(/ruxsat/i);
  });

  it("admin har qanday firmaga qo'ya oladi", async () => {
    actor(ids.admin, "admin");
    const r = await setObligationOverride({
      companyId: ids.other, templateId: ids.template, action: "disable", reason: "admin sinovi",
    });
    expect(r.action).toBe("disable");
    await removeObligationOverride(r.id);
  });
});

describe("validatsiya", () => {
  beforeAll(() => actor(ids.sup, "supervisor"));

  it("SABAB majburiy — istisno bu qaror", async () => {
    for (const reason of ["", "   "]) {
      await expect(
        setObligationOverride({ companyId: ids.company, templateId: ids.template, action: "disable", reason }),
      ).rejects.toThrow(/Sabab majburiy/);
    }
  });

  it("noma'lum tur rad etiladi", async () => {
    await expect(
      setObligationOverride({
        companyId: ids.company, templateId: ids.template,
        action: "nimadir" as never, reason: "x",
      }),
    ).rejects.toThrow(/turi noto'g'ri/);
  });

  it("custom_due kun yoki siljishsiz bo'lmaydi", async () => {
    await expect(
      setObligationOverride({ companyId: ids.company, templateId: ids.template, action: "custom_due", reason: "x" }),
    ).rejects.toThrow(/kun yoki siljish/);
  });

  it("custom_due kuni 1-31 oralig'ida", async () => {
    await expect(
      setObligationOverride({
        companyId: ids.company, templateId: ids.template, action: "custom_due",
        customDueDay: 45, reason: "x",
      }),
    ).rejects.toThrow(/1-31/);
  });

  it("reassign mas'ulsiz bo'lmaydi", async () => {
    await expect(
      setObligationOverride({ companyId: ids.company, templateId: ids.template, action: "reassign", reason: "x" }),
    ).rejects.toThrow(/mas'ul tanlanishi/);
  });

  it("tur o'zgarganda ortiqcha maydonlar TOZALANADI", async () => {
    const a = await setObligationOverride({
      companyId: ids.company, templateId: ids.template, action: "custom_due",
      customDueDay: 25, reason: "mijoz kech beradi",
    });
    expect(a.customDueDay).toBe(25);

    const b = await setObligationOverride({
      companyId: ids.company, templateId: ids.template, action: "disable", reason: "endi kerak emas",
    });
    // Eski `customDueDay` qolib ketsa, keyin `custom_due` ga qaytganda eski
    // qiymat jimgina tiklanardi.
    expect(b.customDueDay).toBeNull();
    await removeObligationOverride(b.id);
  });
});

describe("disable HAQIQATAN generatsiyani to'xtatadi", () => {
  const REF = new Date(Date.UTC(2092, 4, 10));

  it("istisnosiz — majburiyat yaratiladi", async () => {
    actor(ids.sup, "supervisor");
    await generateObligations(prisma, { ref: REF, loadSubjects: onlyTestCompany });
    const n = await prisma.obligation.count({ where: { templateId: ids.template, companyId: ids.company } });
    expect(n).toBe(1);
  });

  it("disable qo'yilgach YANGI davrda yaratilmaydi", async () => {
    actor(ids.sup, "supervisor");
    await setObligationOverride({
      companyId: ids.company, templateId: ids.template, action: "disable",
      reason: "bu firma bu hisobotni topshirmaydi",
    });

    const nextRef = new Date(Date.UTC(2092, 5, 10)); // keyingi oy
    await generateObligations(prisma, { ref: nextRef, loadSubjects: onlyTestCompany });

    const n = await prisma.obligation.count({
      where: { templateId: ids.template, companyId: ids.company, periodKey: "2092-M06" },
    });
    expect(n).toBe(0);
  });

  it("o'tgan davrlar TEGILMAYDI — tarix o'zgarmaydi", async () => {
    const past = await prisma.obligation.count({
      where: { templateId: ids.template, companyId: ids.company, periodKey: "2092-M05" },
    });
    expect(past).toBe(1);
  });

  it("istisno olib tashlangach yana yaratiladi", async () => {
    actor(ids.sup, "supervisor");
    const ovr = await prisma.companyObligationOverride.findUnique({
      where: { companyId_templateId: { companyId: ids.company, templateId: ids.template } },
      select: { id: true },
    });
    await removeObligationOverride(ovr!.id);

    const ref3 = new Date(Date.UTC(2092, 6, 10));
    await generateObligations(prisma, { ref: ref3, loadSubjects: onlyTestCompany });
    const n = await prisma.obligation.count({
      where: { templateId: ids.template, companyId: ids.company, periodKey: "2092-M07" },
    });
    expect(n).toBe(1);
  });
});

describe("getTemplateOverrides", () => {
  it("nazoratchi faqat O'Z firmalarini ko'radi", async () => {
    actor(ids.sup, "supervisor");
    const res = await getTemplateOverrides(ids.template);
    const names = res.rows.map((r) => r.id);
    expect(names).toContain(ids.company);
    expect(names).not.toContain(ids.other);
  });

  it("admin hammasini ko'radi", async () => {
    actor(ids.admin, "admin");
    const res = await getTemplateOverrides(ids.template);
    const names = res.rows.map((r) => r.id);
    expect(names).toContain(ids.company);
    expect(names).toContain(ids.other);
  });
});
