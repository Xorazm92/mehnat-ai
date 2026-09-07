/**
 * DALIL SAQLASH VA XABAR QAMROVI.
 *
 * Ikkita regressiya qulflanadi:
 *
 *  1. Skrinshot BAZAGA emas, diskdagi omborga yoziladi. Ilgari u
 *     `ReportProof.imageData` da base64 bo'lib yotardi va jadval prodda
 *     128 MB ga chiqqandi (1 454 qator).
 *
 *  2. Topshirish xabari FAQAT shu firmaning tekshiruvchilariga ketadi.
 *     Ilgari har senior rolga yozilardi — prodda 13 596 ta `approval_request`
 *     qatoridan 13 577 tasi o'qilmagan bo'lib yig'ilgandi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Ombor ildizi modul YUKLANGANDA o'qiladi — import'dan oldin qo'yiladi.
process.env.ASRO_FILES_ROOT = mkdtempSync(join(tmpdir(), "asro-files-"));

const SESSION = { user: { id: "", role: "accountant" as string, name: "Buxgalter" } };
vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { saveReportProof } = await import("@/server/proofs");
const { evidenceStore, readStoredFile } = await import("@/lib/evidenceStore");
const { sha256Of } = await import("@/lib/engines/evidence/store");

const TAG = `vitest-storage-${Date.now()}`;
const PERIOD = "2024-07";
const COL = "didox";

// 1x1 shaffof PNG — server rasm formatini tekshiradi.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_BYTES = Buffer.from(PNG.slice(PNG.indexOf(",") + 1), "base64");

// IKKINCHI skrinshot BOSHQA baytlardan iborat bo'lishi shart: ombor
// mazmun-adresli, ya'ni aynan bir xil rasm aynan bir xil havola berardi va
// "ikki rasm ayri saqlandimi?" degan tekshiruv hech nimani isbotlamasdi.
const PNG2_BYTES = Buffer.concat([PNG_BYTES, Buffer.from([0x0a])]);
const PNG2 = `data:image/png;base64,${PNG2_BYTES.toString("base64")}`;

const ids = { author: "", supervisor: "", outsider: "", company: "" };

async function makeUser(suffix: string, role: "accountant" | "supervisor" | "chief_accountant" | "admin") {
  const u = await prisma.user.create({
    data: { email: `${TAG}-${suffix}@v.local`, fullName: `${TAG} ${suffix}`, passwordHash: "x", role },
    select: { id: true },
  });
  return u.id;
}

beforeAll(async () => {
  ids.author = await makeUser("author", "accountant");
  ids.supervisor = await makeUser("sup", "supervisor");
  // Firmaga BIRIKTIRILMAGAN senior rollar — ular xabar OLMASLIGI kerak.
  ids.outsider = await makeUser("outsider", "chief_accountant");
  await makeUser("outsider2", "supervisor");
  await makeUser("outsider3", "admin");
  SESSION.user.id = ids.author;

  const c = await prisma.company.create({
    data: {
      name: `${TAG} co`, inn: "000000011", taxRegime: "vat", isActive: true,
      companyStatus: "active", contractDate: new Date(Date.UTC(2023, 0, 1)),
      accountantId: ids.author, supervisorId: ids.supervisor,
    },
    select: { id: true },
  });
  ids.company = c.id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { title: { contains: "Tasdiqlash" } , user: { email: { startsWith: TAG } } } });
  await prisma.notificationDelivery.deleteMany({ where: { channel: "proof-approval", recipientId: { in: [ids.supervisor, ids.outsider] } } });
  await prisma.reportProof.deleteMany({ where: { companyId: ids.company } });
  await prisma.monthlyReport.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe("ombor — mazmun-adresli saqlash", () => {
  it("put — sha256 baytlardan hisoblanadi, byteSize mos keladi", async () => {
    const stored = await evidenceStore.put(PNG_BYTES, "image/png");

    expect(stored.sha256).toBe(sha256Of(PNG_BYTES));
    expect(stored.byteSize).toBe(PNG_BYTES.byteLength);
    // Havola ichida AYNAN o'sha sha256 turadi — fayl nomi mazmundan chiqadi,
    // ya'ni dalil almashtirilsa havola ham o'zgaradi (Konstitutsiya, 7-modda).
    expect(stored.storageRef).toContain(stored.sha256);
  });

  it("put ikki marta — bir xil baytlar bir xil havola beradi", async () => {
    const a = await evidenceStore.put(PNG_BYTES, "image/png");
    const b = await evidenceStore.put(PNG_BYTES, "image/png");
    // Mazmun-adresli: takror yuklash joy egallamaydi.
    expect(b.storageRef).toBe(a.storageRef);
  });

  it("get — havola bo'yicha AYNAN o'sha baytlar qaytadi", async () => {
    const stored = await evidenceStore.put(PNG_BYTES, "image/png");
    const back = await evidenceStore.get(stored.storageRef);

    expect(back.bytes.equals(PNG_BYTES)).toBe(true);
    expect(back.byteSize).toBe(PNG_BYTES.byteLength);
  });

  it("head — yo'q fayl uchun null, bor fayl uchun o'lcham", async () => {
    const missing = `disk://2099/01/${"0".repeat(64)}.png`;
    // Yiqilmaydi, `null` qaytaradi: yo'q fayl — kutilgan holat, hodisa emas.
    expect(await evidenceStore.head(missing)).toBeNull();

    const stored = await evidenceStore.put(PNG_BYTES, "image/png");
    const head = await evidenceStore.head(stored.storageRef);
    expect(head?.sha256).toBe(stored.sha256);
    expect(head?.byteSize).toBe(PNG_BYTES.byteLength);
  });
});

describe("dalil saqlash", () => {
  it("skrinshot omborga tushadi, bazada faqat havola qoladi", async () => {
    await saveReportProof({
      companyId: ids.company, period: PERIOD, colKey: COL,
      colLabel: "Didox", imageData: PNG,
    });

    const proof = await prisma.reportProof.findFirstOrThrow({
      where: { companyId: ids.company, period: PERIOD, colKey: COL },
      select: { id: true, imageRef: true, imageData: true },
    });

    expect(proof.imageRef).toMatch(/^disk:\/\/\d{4}\/\d{2}\/[a-f0-9]{64}\.png$/);
    // `null`, bo'sh satr EMAS (D1: ustun nullable qilindi). Bo'sh satr
    // "ma'lumot yo'q" degan joyda soxta qiymat bo'lardi va "ko'chirilganmi?"
    // savoliga `IS NULL` bilan javob berib bo'lmasdi.
    expect(proof.imageData).toBeNull();

    const back = await evidenceStore.get(proof.imageRef!);
    expect(back.bytes.equals(PNG_BYTES)).toBe(true);
  });

  it("o'qish ikki yo'lli — ko'chirilmagan eski qator ham ochiladi", async () => {
    const viaRef = await readStoredFile("disk://0000/00/x", null).catch(() => null);
    expect(viaRef).toBeNull(); // yaroqsiz havola — o'qish yiqilmaydi, null

    const legacy = await readStoredFile(null, PNG);
    expect(legacy?.bytes.equals(PNG_BYTES)).toBe(true);
    expect(legacy?.mime).toBe("image/png");

    expect(await readStoredFile(null, null)).toBeNull();
  });

  it("xabar faqat firma tekshiruvchilariga ketadi, barcha seniorlarga emas", async () => {
    const rows = await prisma.notification.findMany({
      where: { type: "approval_request", user: { email: { startsWith: TAG } } },
      select: { userId: true },
    });

    expect(rows.map((r) => r.userId)).toEqual([ids.supervisor]);
    expect(rows.some((r) => r.userId === ids.outsider)).toBe(false);
  });

  // IKKI EKRANLI USTUN (`lib/reportColumns.ts` → `PROOF_SCREENS`).
  // `my_mehnat` katagi ikki ekran bilan tasdiqlanadi; talab SERVERDA
  // majburlanadi, chunki server action oynadan chetlab ham chaqirilishi
  // mumkin va yarim dalil katakni "topshirildi" ga ochib yuborardi.
  it("ikki ekranli ustun — ikkinchi skrinshotsiz topshirilmaydi", async () => {
    await expect(
      saveReportProof({
        companyId: ids.company, period: PERIOD, colKey: "my_mehnat",
        colLabel: "My Mehnat", imageData: PNG,
      }),
    ).rejects.toThrow(/2 ta skrinshot/);

    // Katak OCHILMAYDI: rad etilgan topshirish hech qanday iz qoldirmaydi.
    const none = await prisma.reportProof.findFirst({
      where: { companyId: ids.company, period: PERIOD, colKey: "my_mehnat" },
      select: { id: true },
    });
    expect(none).toBeNull();
  });

  it("ikki ekranli ustun — ikkala rasm ham ayri havola bilan saqlanadi", async () => {
    await saveReportProof({
      companyId: ids.company, period: PERIOD, colKey: "my_mehnat",
      colLabel: "My Mehnat", imageData: PNG, imageData2: PNG2,
    });

    const proof = await prisma.reportProof.findFirstOrThrow({
      where: { companyId: ids.company, period: PERIOD, colKey: "my_mehnat" },
      select: { imageRef: true, imageRef2: true },
    });

    expect(proof.imageRef2).toMatch(/^disk:\/\/\d{4}\/\d{2}\/[a-f0-9]{64}\.png$/);
    expect(proof.imageRef2).not.toBe(proof.imageRef);

    const back = await evidenceStore.get(proof.imageRef2!);
    expect(back.bytes.equals(PNG2_BYTES)).toBe(true);
  });
});
