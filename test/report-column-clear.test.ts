/**
 * USTUNNI TOZALASH (amallar matritsasi)
 *
 * Tozalash matritsa kalitini oladi ("pul_oqimlari"), DB ustuni esa boshqacha
 * yoziladi ("pulOqimlari"). Kalit mapping'siz ishlatilsa, nomi tasodifan bir
 * xil bo'lgan ustunlar (didox, xatlar, inps…) tozalanadi, qolganlari esa
 * Prisma xatosi bilan yiqiladi — foydalanuvchi uchun "tozalash ba'zan
 * ishlaydi, ba'zan yo'q" ko'rinishidagi eng chalg'ituvchi nosozlik.
 *
 * Shuning uchun test AYNAN nomi farq qiladigan ustunni tekshiradi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { clearColumnForPeriod, upsertMonthlyReport } = await import("@/server/operations");

const TAG = `vitest-clear-${Date.now()}`;
const PERIOD = "1998-07"; // real ma'lumot bilan to'qnashmaydigan davr
const ids = { company: "", user: "", template: "", obligation: "" };

beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `${TAG} firma`, inn: "9", taxRegime: "vat" },
    select: { id: true },
  });
  ids.company = company.id;
  const user = await prisma.user.create({
    data: {
      email: `${TAG}@v.local`,
      fullName: "Clear Tester",
      passwordHash: "x",
      role: "super_admin",
      isActive: true,
    },
    select: { id: true },
  });
  ids.user = user.id;
  SESSION.user.id = user.id;
});

afterAll(async () => {
  // Tozalash SHU YERDA, `it` ichida EMAS: assertion yiqilsa `it` ning oxiri
  // umuman bajarilmaydi va qolgan `DeadlineTemplate` butun bazani skanerlaydigan
  // qo'riqchini (`test/matrix-template-coverage.test.ts`) keyingi yugurishlarda
  // ham yiqitib turadi — aynan shunday bo'lgan.
  if (ids.obligation) {
    await prisma.obligationStatusEvent.deleteMany({ where: { obligationId: ids.obligation } });
    await prisma.obligation.deleteMany({ where: { id: ids.obligation } });
  }
  if (ids.template) await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.reportProof.deleteMany({ where: { companyId: ids.company } });
  await prisma.monthlyReport.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

/** Katakka biriktirilgan skrinshot dalili. */
async function attachProof(colKey: string) {
  await prisma.reportProof.create({
    data: {
      companyId: ids.company,
      period: PERIOD,
      colKey,
      imageData: "data:image/png;base64,AAAA",
      status: "pending",
      submittedById: ids.user,
      submittedByName: "Clear Tester",
    },
  });
}

describe("clearColumnForPeriod", () => {
  it("nomi DB ustunidan FARQ qiladigan ustunni tozalaydi", async () => {
    // pul_oqimlari → pulOqimlari. Aynan shu holat buzilgan edi.
    await prisma.monthlyReport.upsert({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      create: { companyId: ids.company, period: PERIOD, pulOqimlari: "topshirildi", didox: "+" },
      update: { pulOqimlari: "topshirildi", didox: "+" },
    });

    await clearColumnForPeriod(PERIOD, "pul_oqimlari");

    const after = await prisma.monthlyReport.findUnique({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      select: { pulOqimlari: true, didox: true },
    });
    expect(after?.pulOqimlari).toBeNull();
    // Qo'shni ustun tegilmaydi — tozalash faqat so'ralganini o'chiradi.
    expect(after?.didox).toBe("+");
  });

  it("DALILSIZ katakning majburiyati ham ortga qaytadi", async () => {
    // REGRESSIYA. `clearColumnForPeriod` ilgari `clearCellEvidence` ni FAQAT
    // `ReportProof` qatori bor firmalar uchun chaqirardi. Dalilsiz yozilgan
    // katak ham majburiyatni harakatga keltiradi (`applyCellWrite`), ya'ni
    // ustun tozalangach o'sha majburiyat `sent` bo'lib QOLIB KETARDI.
    //
    // Kodda buni tuzatish uchun `withValue` hisoblangan edi, lekin u hech
    // qayerda ishlatilmasdi — eslint uni "ishlatilmagan o'zgaruvchi" deb
    // ko'rsatib turardi va izoh xatoni tuzatilgan deb tasvirlardi.
    const template = await prisma.deadlineTemplate.create({
      data: {
        code: `${TAG}-T`, matrixKey: "didox", name: "Tozalash sinovi",
        obligationType: "internal", periodicity: "monthly",
        anchorType: "fixed_day_of_month", dueDay: 20,
        effectiveFrom: new Date(Date.UTC(1998, 0, 1)), lifecycle: "active",
        // `approvedById` MAJBURIY: `test/matrix-template-coverage.test.ts`
        // "generator ko'radigan har bir template tasdiqlangan" invariantini
        // butun baza bo'yicha tekshiradi va bu qator (testlar parallel
        // yurgani uchun) unga ko'rinadi. Tasdiqsiz qoldirilsa, o'sha
        // qo'riqchi ADOLATLI ravishda yiqiladi.
        approvedById: ids.user, approvedAt: new Date(),
      },
      select: { id: true },
    });
    ids.template = template.id;
    const obligation = await prisma.obligation.create({
      data: {
        companyId: ids.company, templateId: template.id, templateVersion: 1,
        periodKey: "1998-M07",
        periodStart: new Date(Date.UTC(1998, 6, 1)),
        periodEnd: new Date(Date.UTC(1998, 7, 1)),
        dueAt: new Date(Date.UTC(1998, 7, 20)),
        status: "sent",
      },
      select: { id: true },
    });
    ids.obligation = obligation.id;

    // Katakda QIYMAT bor, DALIL yo'q — aynan tushib qolgan holat.
    await prisma.monthlyReport.update({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      data: { didox: "+" },
    });
    expect(await prisma.reportProof.count({ where: { companyId: ids.company, colKey: "didox" } })).toBe(0);

    await clearColumnForPeriod(PERIOD, "didox");

    const after = await prisma.obligation.findUniqueOrThrow({
      where: { id: obligation.id }, select: { status: true },
    });
    expect(after.status, "dalilsiz katak tozalandi, majburiyat qaytmadi").toBe("planned");
  });

  it("nomi bir xil ustunni ham tozalaydi", async () => {
    await prisma.monthlyReport.update({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      data: { didox: "+" },
    });

    await clearColumnForPeriod(PERIOD, "didox");

    const after = await prisma.monthlyReport.findUnique({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      select: { didox: true },
    });
    expect(after?.didox).toBeNull();
  });

  it("noma'lum kalitni rad etadi", async () => {
    // `data` ga kelgan nom to'g'ridan-to'g'ri ustunga aylanadi, shuning uchun
    // tekshiruvsiz qoldirish ixtiyoriy maydonni nolga tenglash imkonini berardi.
    await expect(clearColumnForPeriod(PERIOD, "passwordHash")).rejects.toThrow();
    await expect(clearColumnForPeriod(PERIOD, "yoq_bunday_ustun")).rejects.toThrow();
  });

  it("buxgalter ustunni tozalay olmaydi", async () => {
    SESSION.user.role = "accountant";
    await expect(clearColumnForPeriod(PERIOD, "didox")).rejects.toThrow(/Forbidden/);
    SESSION.user.role = "super_admin";
  });

  it("ustun tozalanganda biriktirilgan DALIL ham ketadi", async () => {
    await attachProof("pul_oqimlari");
    await clearColumnForPeriod(PERIOD, "pul_oqimlari");

    const left = await prisma.reportProof.count({
      where: { companyId: ids.company, period: PERIOD, colKey: "pul_oqimlari" },
    });
    // Dalil qolsa, matritsada bo'sh katak ustida "skrinshot bor" nuqtasi
    // turaverardi — foydalanuvchi buni "tozalash ishlamadi" deb o'qiydi.
    expect(left).toBe(0);
  });
});

describe("katakni tozalash (upsertMonthlyReport)", () => {
  it("katak bo'shatilganda dalil ham o'chadi", async () => {
    await prisma.monthlyReport.upsert({
      where: { companyId_period: { companyId: ids.company, period: PERIOD } },
      create: { companyId: ids.company, period: PERIOD, yerSoligi: "topshirildi" },
      update: { yerSoligi: "topshirildi" },
    });
    await attachProof("yer_soligi");

    // "0" = CELL_EMPTY, ya'ni katak menyusidagi "Tozalash".
    await upsertMonthlyReport({ companyId: ids.company, period: PERIOD, yer_soligi: "0" });

    const left = await prisma.reportProof.count({
      where: { companyId: ids.company, period: PERIOD, colKey: "yer_soligi" },
    });
    expect(left).toBe(0);
  });

  it("oddiy qiymat yozilganda dalilga TEGILMAYDI", async () => {
    await attachProof("suv_soligi");
    await upsertMonthlyReport({ companyId: ids.company, period: PERIOD, suv_soligi: "+" });

    const left = await prisma.reportProof.count({
      where: { companyId: ids.company, period: PERIOD, colKey: "suv_soligi" },
    });
    // Tasdiqlash dalilni saqlab qolishi kerak — u tasdiqning asosi.
    expect(left).toBe(1);
  });
});
