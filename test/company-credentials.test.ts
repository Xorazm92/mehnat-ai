/**
 * COMPANY CREDENTIAL VAULT (KRITIK)
 *
 * `Company.login` / `Company.password` — soliq.uz portalining TASHQI kirish
 * ma'lumoti (ASRO auth paroli emas). Ular ochiq matnda saqlanardi va
 * `getCompanies()` ularni firmalar ro'yxatini ko'ra oladigan har bir
 * foydalanuvchiga yuborardi.
 *
 * Bu test uchta shartni qulflaydi:
 *   1) yangi yozuvda ochiq matn credential BAZAGA TUSHMAYDI;
 *   2) huquqi yo'q xodim boshqa firma credential'ini KO'RMAYDI;
 *   3) hali ko'chirilmagan firmalar uchun eski ustunlar zaxira sifatida ishlaydi
 *      (backfill'gacha ish oqimi buzilmaydi).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "", kind: "staff", companyId: null as string | null } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const companies = await import("@/server/companies");
const credentials = await import("@/server/credentials");
const { PRIMARY_SERVICE } = await import("@/lib/credentials");
const { decryptSecret } = await import("@/lib/crypto");

const TAG = `vitest-cred-${Date.now()}`;
const ids = { admin: "", accA: "", accB: "", companyA: "", companyB: "", legacy: "" };

const PLAIN_LOGIN = `${TAG}-soliq-login`;
const PLAIN_PASSWORD = "S0liq-Parol!2026";

const asUser = (id: string, role: string) => {
  SESSION.user = { id, role, kind: "staff", companyId: null };
};

beforeAll(async () => {
  const [admin, accA, accB] = await Promise.all([
    prisma.user.create({ data: { email: `${TAG}-admin@v.local`, fullName: "Admin", passwordHash: "x", role: "admin" }, select: { id: true } }),
    prisma.user.create({ data: { email: `${TAG}-a@v.local`, fullName: "Acc A", passwordHash: "x", role: "accountant" }, select: { id: true } }),
    prisma.user.create({ data: { email: `${TAG}-b@v.local`, fullName: "Acc B", passwordHash: "x", role: "accountant" }, select: { id: true } }),
  ]);
  ids.admin = admin.id;
  ids.accA = accA.id;
  ids.accB = accB.id;

  const [a, b, legacy] = await Promise.all([
    prisma.company.create({ data: { name: `${TAG} A`, inn: "1", taxRegime: "vat", accountantId: accA.id }, select: { id: true } }),
    prisma.company.create({ data: { name: `${TAG} B`, inn: "2", taxRegime: "vat", accountantId: accB.id }, select: { id: true } }),
    // Hali ko'chirilmagan "eski" firma — ustunlarda ochiq matn.
    prisma.company.create({
      data: { name: `${TAG} Legacy`, inn: "3", taxRegime: "vat", accountantId: accA.id, login: "legacy-login", password: "legacy-parol" },
      select: { id: true },
    }),
  ]);
  ids.companyA = a.id;
  ids.companyB = b.id;
  ids.legacy = legacy.id;
});

afterAll(async () => {
  const all = [ids.companyA, ids.companyB, ids.legacy];
  await prisma.clientCredential.deleteMany({ where: { companyId: { in: all } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.admin, ids.accA, ids.accB] } } });
  await prisma.company.deleteMany({ where: { id: { in: all } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.accA, ids.accB] } } });
  await prisma.$disconnect();
});

describe("ochiq matn hech qachon yangi yozuvda saqlanmaydi (KRITIK)", () => {
  it("updateCompany login/password'ni jimgina tashlaydi — ustunlarga yozmaydi", async () => {
    asUser(ids.admin, "admin");
    await companies.updateCompany(ids.companyA, {
      name: `${TAG} A`,
      login: "hujum-login",
      password: "hujum-parol",
    });

    const row = await prisma.company.findUnique({
      where: { id: ids.companyA },
      select: { login: true, password: true, name: true },
    });
    expect(row!.login).toBeNull();
    expect(row!.password).toBeNull();
    expect(row!.name).toBe(`${TAG} A`); // boshqa maydonlar odatdagidek saqlanadi
  });

  it("createCompany ham ochiq matn credential yozmaydi", async () => {
    asUser(ids.admin, "admin");
    // INN 9 XONALI va BUXGALTER majburiy — `assertNewCompanyComplete`
    // (server/companies.ts) shu ikki qoidani talab qiladi. Test ma'lumoti
    // o'sha qoidalar kiritilgunga qadar yozilgan edi va eskirib qolgandi.
    const created = await companies.createCompany(
      {
        name: `${TAG} Yangi`,
        inn: String(900_000_000 + (Date.now() % 99_999_999)).slice(0, 9),
        taxRegime: "vat",
        login: "yangi-login",
        password: "yangi-parol",
      },
      [{ userId: ids.accA, role: "accountant", salaryType: "percent", salaryValue: 20 }]
    );
    const id = (created as { id: string }).id;
    try {
      const row = await prisma.company.findUnique({ where: { id }, select: { login: true, password: true } });
      expect(row!.login).toBeNull();
      expect(row!.password).toBeNull();
    } finally {
      await prisma.clientCredential.deleteMany({ where: { companyId: id } });
      await prisma.contractAssignment.deleteMany({ where: { companyId: id } });
      await prisma.company.delete({ where: { id } });
    }
  });

  it("setPrimaryCredential parolni AES-GCM shifrmatn sifatida saqlaydi", async () => {
    asUser(ids.admin, "admin");
    await credentials.setPrimaryCredential(ids.companyA, PLAIN_LOGIN, PLAIN_PASSWORD);

    const row = await prisma.clientCredential.findFirst({
      where: { companyId: ids.companyA, serviceName: PRIMARY_SERVICE },
      select: { loginId: true, encryptedPassword: true },
    });
    expect(row).not.toBeNull();
    expect(row!.loginId).toBe(PLAIN_LOGIN);
    // Bazadagi qiymat ochiq matn EMAS…
    expect(row!.encryptedPassword).not.toBe(PLAIN_PASSWORD);
    expect(row!.encryptedPassword).not.toContain(PLAIN_PASSWORD);
    expect(row!.encryptedPassword.startsWith("v1:")).toBe(true);
    // …lekin qaytariladigan bo'lishi kerak.
    expect(decryptSecret(row!.encryptedPassword)).toBe(PLAIN_PASSWORD);
  });

  it("takroriy saqlash yangi qator yaratmaydi (upsert)", async () => {
    asUser(ids.admin, "admin");
    await credentials.setPrimaryCredential(ids.companyA, PLAIN_LOGIN, "boshqa-parol");
    const count = await prisma.clientCredential.count({
      where: { companyId: ids.companyA, serviceName: PRIMARY_SERVICE },
    });
    expect(count).toBe(1);
    // Keyingi testlar uchun asl qiymatni tiklaymiz.
    await credentials.setPrimaryCredential(ids.companyA, PLAIN_LOGIN, PLAIN_PASSWORD);
  });
});

describe("credential ko'rish huquqi (KRITIK)", () => {
  it("senior rol o'z ro'yxatidagi credential'ni ochiq ko'radi", async () => {
    asUser(ids.admin, "admin");
    const list = (await companies.getCompanies()) as Array<Record<string, unknown>>;
    const a = list.find((c) => c.id === ids.companyA)!;
    expect(a.login).toBe(PLAIN_LOGIN);
    expect(a.password).toBe(PLAIN_PASSWORD);
  });

  it("biriktirilgan buxgalter O'Z firmasining credential'ini ko'radi", async () => {
    asUser(ids.accA, "accountant");
    const list = (await companies.getCompanies()) as Array<Record<string, unknown>>;
    const a = list.find((c) => c.id === ids.companyA);
    expect(a).toBeDefined();
    expect(a!.password).toBe(PLAIN_PASSWORD);
  });

  it("boshqa firmaning buxgalteri credential'ni KO'RMAYDI", async () => {
    asUser(ids.admin, "admin");
    await credentials.setPrimaryCredential(ids.companyB, "b-login", "b-parol");

    asUser(ids.accA, "accountant");
    const list = (await companies.getCompanies()) as Array<Record<string, unknown>>;
    // B firmasi umuman ro'yxatga tushmasligi kerak…
    expect(list.find((c) => c.id === ids.companyB)).toBeUndefined();
    // …va hech bir qatorda B ning paroli ko'rinmasligi kerak.
    expect(list.some((c) => c.password === "b-parol")).toBe(false);
  });

  it("getCompanyById xom shifrmatn (credentials qatorlari) qaytarmaydi", async () => {
    asUser(ids.admin, "admin");
    const c = (await companies.getCompanyById(ids.companyA)) as Record<string, unknown>;
    expect(c.credentials).toBeUndefined();
    expect(c.login).toBe(PLAIN_LOGIN);
    expect(JSON.stringify(c)).not.toContain("v1:"); // shifrmatn tashqariga chiqmaydi
  });
});

describe("ko'chirilmagan firmalar uchun zaxira yo'l", () => {
  it("vault bo'sh bo'lsa eski ustunlardan o'qiydi (ish oqimi buzilmaydi)", async () => {
    asUser(ids.accA, "accountant");
    const list = (await companies.getCompanies()) as Array<Record<string, unknown>>;
    const legacy = list.find((c) => c.id === ids.legacy)!;
    expect(legacy.login).toBe("legacy-login");
    expect(legacy.password).toBe("legacy-parol");
  });

  it("huquqi yo'q foydalanuvchiga eski ustunlar ham berilmaydi", async () => {
    asUser(ids.accB, "accountant");
    const list = (await companies.getCompanies()) as Array<Record<string, unknown>>;
    expect(list.some((c) => c.password === "legacy-parol")).toBe(false);
  });
});
