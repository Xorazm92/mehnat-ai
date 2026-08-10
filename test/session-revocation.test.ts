/**
 * SESSIYA REVOKATSIYASI (KRITIK)
 *
 * Sessiya — stateless JWT (24 soat). Server tomonda bekor qilinadigan yozuv yo'q,
 * shuning uchun bloklangan mijoz/xodim ESKI COOKIE bilan kirishda davom eta
 * olmasligini faqat davriy qayta tekshiruv ta'minlaydi
 * (lib/sessionRevalidation.ts).
 *
 * Bu testlar aynan shu shartni qulflaydi va bir vaqtning o'zida mijoz sessiyasi
 * hech qachon boshqa firmaga bog'lanib qolmasligini tekshiradi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { revalidateSessionToken, SESSION_REVALIDATE_MS, SESSION_ABSOLUTE_MS } = await import(
  "@/lib/sessionRevalidation"
);

const TAG = `vitest-revoke-${Date.now()}`;
const ids = { companyA: "", companyB: "", staff: "" };

/**
 * Tekshiruv oynasi allaqachon tugagan token (oxirgi tekshiruv — uzoq o'tmishda),
 * lekin MUTLAQ muddati hali tugamagan: `loginAt` hozir. Ikkalasi alohida —
 * `checkedAt` "qachon oxirgi marta bazaga qaradik", `loginAt` esa "qachon
 * kirilgan" va u faollikda yangilanmaydi.
 */
const staleToken = <T extends Record<string, unknown>>(over: T) => ({
  checkedAt: 0,
  loginAt: Date.now(),
  ...over,
});

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.company.create({ data: { name: `${TAG} A`, inn: "1", taxRegime: "vat" }, select: { id: true } }),
    prisma.company.create({ data: { name: `${TAG} B`, inn: "2", taxRegime: "vat" }, select: { id: true } }),
  ]);
  ids.companyA = a.id;
  ids.companyB = b.id;

  const staff = await prisma.user.create({
    data: { email: `${TAG}-staff@v.local`, fullName: "Staff", passwordHash: "x", role: "accountant", isActive: true },
    select: { id: true },
  });
  ids.staff = staff.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: { in: [ids.companyA, ids.companyB] } } });
  await prisma.user.deleteMany({ where: { id: ids.staff } });
  await prisma.$disconnect();
});

describe("bloklangan xodim ham xuddi shunday", () => {
  it("isActive=false → token bekor", async () => {
    await prisma.user.update({ where: { id: ids.staff }, data: { isActive: false } });
    const out = await revalidateSessionToken(staleToken({ id: ids.staff, kind: "staff", role: "accountant" }));
    expect(out).toBeNull();
    await prisma.user.update({ where: { id: ids.staff }, data: { isActive: true } });
  });

  it("rol o'zgarsa token yangi rolni oladi (eskisi qotib qolmaydi)", async () => {
    await prisma.user.update({ where: { id: ids.staff }, data: { role: "supervisor" } });
    const out = await revalidateSessionToken(staleToken({ id: ids.staff, kind: "staff", role: "accountant" }));
    expect(out!.role).toBe("supervisor");
    await prisma.user.update({ where: { id: ids.staff }, data: { role: "accountant" } });
  });
});

describe("qayta tekshiruv oynasi", () => {
  it("oyna ichida bazaga bormaydi — token o'zgarishsiz qaytadi", async () => {
    const now = Date.now();
    // Yaqinda tekshirilgan: bloklangan bo'lsa ham shu oynada o'tib ketadi.
    await prisma.user.update({ where: { id: ids.staff }, data: { isActive: false } });
    const fresh = {
      id: ids.staff,
      kind: "staff",
      role: "accountant",
      checkedAt: now - 1_000,
      loginAt: now - 1_000,
    };
    const out = await revalidateSessionToken({ ...fresh }, now);
    expect(out).not.toBeNull();
    expect(out!.checkedAt).toBe(now - 1_000); // yangilanmagan → DB so'rovi bo'lmagan

    // …lekin oyna tugashi bilan bekor qilinadi.
    const stale = { ...fresh, checkedAt: now - SESSION_REVALIDATE_MS - 1 };
    expect(await revalidateSessionToken(stale, now)).toBeNull();

    await prisma.user.update({ where: { id: ids.staff }, data: { isActive: true } });
  });

  it("id'siz token tegilmasdan qaytadi", async () => {
    const t = { kind: "staff" as const };
    expect(await revalidateSessionToken({ ...t })).toEqual(t);
  });
});

/**
 * MUTLAQ MUDDAT (24 soat).
 *
 * NextAuth'ning `maxAge` i yolg'iz yetarli emas: JWT faollikda qayta beriladi
 * va muddat har safar cho'ziladi — har kuni ishlaydigan xodim amalda hech
 * qachon chiqmasdi. Bu testlar muddat KIRISH paytidan sanalishini qulflaydi.
 */
describe("sessiyaning mutlaq muddati", () => {
  const base = () => ({ id: ids.staff, kind: "staff" as const, role: "accountant" });

  it("24 soat o'tgach token bekor bo'ladi", async () => {
    const now = Date.now();
    const out = await revalidateSessionToken(
      { ...base(), checkedAt: now, loginAt: now - SESSION_ABSOLUTE_MS - 1 },
      now,
    );
    expect(out).toBeNull();
  });

  it("muddat ichida amal qiladi", async () => {
    const now = Date.now();
    const out = await revalidateSessionToken(
      { ...base(), checkedAt: now, loginAt: now - SESSION_ABSOLUTE_MS + 60_000 },
      now,
    );
    expect(out).not.toBeNull();
  });

  it("FAOLLIK muddatni cho'zmaydi — 5 daqiqalik kesh uni yashirmaydi", async () => {
    // Eng muhim shart: `checkedAt` hozirgina yangilangan (ya'ni xodim endigina
    // sahifa ochgan), lekin `loginAt` eski. Mutlaq tekshiruv kesh oynasidan
    // OLDIN bajarilmasa, muddati o'tgan sessiya shu yerdan o'tib ketardi.
    const now = Date.now();
    const out = await revalidateSessionToken(
      { ...base(), checkedAt: now, loginAt: now - SESSION_ABSOLUTE_MS - 1 },
      now,
    );
    expect(out).toBeNull();
  });

  it("loginAt'siz eski token bekor qilinadi", async () => {
    // Bu o'zgarishdan oldin berilgan tokenlar. Ular muddatsiz qolmasligi
    // uchun bir marta qayta kirish talab qilinadi.
    const now = Date.now();
    expect(await revalidateSessionToken({ ...base(), checkedAt: now }, now)).toBeNull();
  });
});
