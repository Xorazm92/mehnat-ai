/**
 * createNotification — QABUL QILUVCHI cheklovi.
 *
 * Action eksport qilingan, ya'ni tashqaridan chaqirsa bo'ladi, va `userId`
 * chaqiruvchidan keladi. Kontent tekshiruvi (tur allowlist + ichki havola)
 * bor edi, lekin KIMGA yuborilishi cheklanmagandi: har qanday tizimga kirgan
 * xodim ixtiyoriy foydalanuvchiga "approval_request" yozib, uni ilovaning
 * istalgan sahifasiga yo'naltira olardi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { createNotification } = await import("@/server/audit");

const TAG = `vitest-notifscope-${Date.now()}`;
const ids = { acc: "", mate: "", stranger: "", admin: "", company: "" };

const actor = (id: string, role: string) => {
  SESSION.user.id = id;
  SESSION.user.role = role;
};

beforeAll(async () => {
  const mk = (suffix: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${suffix}@v.local`, fullName: suffix, passwordHash: "x", role: role as never },
      select: { id: true },
    });

  const [acc, mate, stranger, admin] = await Promise.all([
    mk("acc", "accountant"),
    mk("mate", "supervisor"),
    mk("stranger", "accountant"),
    mk("admin", "admin"),
  ]);
  ids.acc = acc.id;
  ids.mate = mate.id;
  ids.stranger = stranger.id;
  ids.admin = admin.id;

  // acc va mate bitta firmada; stranger hech qayerda.
  const c = await prisma.company.create({
    data: {
      name: `${TAG} MChJ`,
      inn: "000000002",
      taxRegime: "vat",
      isActive: true,
      companyStatus: "active",
      contractDate: new Date(Date.UTC(2097, 0, 1)),
      accountantId: acc.id,
      supervisorId: mate.id,
    },
    select: { id: true },
  });
  ids.company = c.id;
});

afterAll(async () => {
  const users = [ids.acc, ids.mate, ids.stranger, ids.admin];
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

const payload = (userId: string) => ({
  userId,
  type: "approval_request",
  title: "Tasdiqlang",
  message: "test",
});

describe("createNotification — recipient scope", () => {
  it("kirmagan foydalanuvchi rad etiladi", async () => {
    actor("", "");
    await expect(createNotification(payload(ids.mate))).rejects.toThrow(/Unauthorized/);
  });

  it("bir firmadagi hamkasbga yuborsa bo'ladi", async () => {
    actor(ids.acc, "accountant");
    const n = await createNotification(payload(ids.mate));
    expect(n.userId).toBe(ids.mate);
  });

  it("o'ziga yuborsa bo'ladi", async () => {
    actor(ids.acc, "accountant");
    const n = await createNotification(payload(ids.acc));
    expect(n.userId).toBe(ids.acc);
  });

  it("BEGONA foydalanuvchiga yubora olmaydi", async () => {
    actor(ids.acc, "accountant");
    await expect(createNotification(payload(ids.stranger))).rejects.toThrow(/Ruxsat yo'q/i);
    const count = await prisma.notification.count({ where: { userId: ids.stranger } });
    expect(count).toBe(0);
  });

  it("admin har kimga yubora oladi", async () => {
    actor(ids.admin, "admin");
    const n = await createNotification(payload(ids.stranger));
    expect(n.userId).toBe(ids.stranger);
  });

  it("noto'g'ri tur hali ham rad etiladi (mavjud himoya buzilmagan)", async () => {
    actor(ids.acc, "accountant");
    await expect(createNotification({ ...payload(ids.mate), type: "phish" })).rejects.toThrow(/turi/i);
  });

  it("tashqi havola hali ham rad etiladi", async () => {
    actor(ids.acc, "accountant");
    await expect(createNotification({ ...payload(ids.mate), link: "https://evil.example" })).rejects.toThrow(/Havola/i);
  });
});
