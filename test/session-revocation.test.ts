/**
 * SESSIYA REVOKATSIYASI (KRITIK)
 *
 * Sessiya — stateless JWT (7 kun). Server tomonda bekor qilinadigan yozuv yo'q,
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
const { revalidateSessionToken, SESSION_REVALIDATE_MS } = await import("@/lib/sessionRevalidation");

const TAG = `vitest-revoke-${Date.now()}`;
const ids = { companyA: "", companyB: "", clientA: "", staff: "" };

/** Tekshiruv oynasi allaqachon tugagan token (oxirgi tekshiruv — uzoq o'tmishda). */
const staleToken = <T extends Record<string, unknown>>(over: T) => ({ checkedAt: 0, ...over });

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.company.create({ data: { name: `${TAG} A`, inn: "1", taxRegime: "vat" }, select: { id: true } }),
    prisma.company.create({ data: { name: `${TAG} B`, inn: "2", taxRegime: "vat" }, select: { id: true } }),
  ]);
  ids.companyA = a.id;
  ids.companyB = b.id;

  const [client, staff] = await Promise.all([
    prisma.clientUser.create({
      data: { companyId: a.id, email: `${TAG}-client@v.local`, fullName: "Client A", passwordHash: "x", isActive: true },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: `${TAG}-staff@v.local`, fullName: "Staff", passwordHash: "x", role: "accountant", isActive: true },
      select: { id: true },
    }),
  ]);
  ids.clientA = client.id;
  ids.staff = staff.id;
});

afterAll(async () => {
  await prisma.clientUser.deleteMany({ where: { companyId: { in: [ids.companyA, ids.companyB] } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.companyA, ids.companyB] } } });
  await prisma.user.deleteMany({ where: { id: ids.staff } });
  await prisma.$disconnect();
});

describe("bloklangan mijoz eski sessiya bilan kira olmaydi (KRITIK)", () => {
  it("faol mijoz tokeni yangilanadi va companyId bazadan qayta o'rnatiladi", async () => {
    const out = await revalidateSessionToken(staleToken({ id: ids.clientA, kind: "client", companyId: null }));
    expect(out).not.toBeNull();
    expect(out!.companyId).toBe(ids.companyA);
    expect(out!.checkedAt).toBeGreaterThan(0);
  });

  it("isActive=false qilingach eski token BEKOR bo'ladi (null)", async () => {
    await prisma.clientUser.update({ where: { id: ids.clientA }, data: { isActive: false } });
    const out = await revalidateSessionToken(staleToken({ id: ids.clientA, kind: "client", companyId: ids.companyA }));
    expect(out).toBeNull();
    await prisma.clientUser.update({ where: { id: ids.clientA }, data: { isActive: true } });
  });

  it("o'chirilgan mijoz tokeni ham bekor bo'ladi", async () => {
    const out = await revalidateSessionToken(staleToken({ id: `${TAG}-yoq`, kind: "client" }));
    expect(out).toBeNull();
  });

  it("token'dagi soxta companyId baza qiymati bilan ALMASHTIRILADI", async () => {
    // Mijoz cookie'ni buzib companyId'ni B ga o'zgartira olsa ham, qayta
    // tekshiruv uni o'z firmasiga qaytaradi (portal action'lari companyId'ni
    // sessiyadan oladi, payload'dan emas).
    const out = await revalidateSessionToken(
      staleToken({ id: ids.clientA, kind: "client", companyId: ids.companyB })
    );
    expect(out!.companyId).toBe(ids.companyA);
    expect(out!.companyId).not.toBe(ids.companyB);
  });
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
    await prisma.clientUser.update({ where: { id: ids.clientA }, data: { isActive: false } });
    const fresh = { id: ids.clientA, kind: "client", companyId: ids.companyA, checkedAt: now - 1_000 };
    const out = await revalidateSessionToken({ ...fresh }, now);
    expect(out).not.toBeNull();
    expect(out!.checkedAt).toBe(now - 1_000); // yangilanmagan → DB so'rovi bo'lmagan

    // …lekin oyna tugashi bilan bekor qilinadi.
    const stale = { ...fresh, checkedAt: now - SESSION_REVALIDATE_MS - 1 };
    expect(await revalidateSessionToken(stale, now)).toBeNull();

    await prisma.clientUser.update({ where: { id: ids.clientA }, data: { isActive: true } });
  });

  it("id'siz token tegilmasdan qaytadi", async () => {
    const t = { kind: "client" as const };
    expect(await revalidateSessionToken({ ...t })).toEqual(t);
  });
});
