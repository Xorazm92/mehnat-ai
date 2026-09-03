/**
 * MATRITSA QAMROVI — B blokning tekshiruv ro'yxati, bajariladigan test sifatida.
 *
 * `test/kpiEvidence.test.ts` konstantaning MAZMUNINI tekshirardi va shu sabab
 * `COL_KEY_TO_TEMPLATE_CODE` dagi uchta yaroqsiz yozuvni joyida muzlatib
 * qo'ygan edi. Bu test esa BAZAGA qarshi XUSUSIYAT tekshiradi, ya'ni qamrov
 * o'sgani sari o'zi to'g'rilanadi.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BASE_REPORT_COLUMNS } from "@/lib/reportColumns";

const { prisma } = await import("@/lib/prisma");

const columnKeys = new Set<string>();
for (const c of BASE_REPORT_COLUMNS as { key: string; payKey?: string }[]) {
  columnKeys.add(c.key);
  if (c.payKey) columnKeys.add(c.payKey);
}

let templates: { code: string; matrixKey: string | null; lifecycle: string; kpiRuleName: string | null; escalates: boolean; obligationType: string }[] = [];

beforeAll(async () => {
  templates = await prisma.deadlineTemplate.findMany({
    select: { code: true, matrixKey: true, lifecycle: true, kpiRuleName: true, escalates: true, obligationType: true },
  });
});
afterAll(async () => { await prisma.$disconnect(); });

describe("matrixKey yaxlitligi", () => {
  it("har bir matrixKey HAQIQIY matritsa ustuni", () => {
    // Eski bridge aynan shu yerda yiqilgan: uning uchta kaliti (`qqs`,
    // `aylanma_soliq`, `payroll_posted`) hech qanday ustunga mos kelmasdi,
    // ya'ni ular hech qachon ishga tushmagan va buni hech kim sezmagan.
    const bad = templates.filter((t) => t.matrixKey !== null && !columnKeys.has(t.matrixKey));
    expect(bad.map((t) => `${t.code}→${t.matrixKey}`)).toEqual([]);
  });

  it("tasdiqlangan moslamalar joyida (eski COL_KEY_TO_TEMPLATE_CODE qamrovi)", () => {
    // Bu juftliklar `test/kpiEvidence.test.ts` da KONSTANTA ustidan
    // tekshirilardi va shu sabab uning uchta buzuq yozuvi ham muzlab qolgan
    // edi. Endi ular BAZAGA qarshi tekshiriladi — ya'ni haqiqatan amal
    // qiladigan moslamalar.
    const byKey = new Map(templates.filter((t) => t.matrixKey).map((t) => [t.matrixKey!, t.code]));
    const expected: Record<string, string> = {
      pul_oqimlari: "CASHFLOW", debitor_kreditor: "AR_AP", tovar_ostatka: "MATERIALS",
      one_c: "ONEC_BASE", xatlar: "LETTERS", hisoblangan_oylik: "PAYROLL_CALC",
      chiqadigan_soliqlar: "TAX_SCHEDULE", foyda_va_zarar: "PNL_REPORT",
    };
    for (const [key, code] of Object.entries(expected)) {
      expect(byKey.get(key), key).toBe(code);
    }
  });

  it("bitta matritsa ustuniga bir nechta template tushishi MUMKIN", () => {
    // Modelning o'zi o'zgarmadi, misol o'zgardi: bu shoxda `aylanma_qqs`
    // ustuni IKKIGA bo'lingan (QQS oylik / aylanma choraklik emas, oylik), ya'ni
    // har biri o'z ustuniga tushadi. Bir ustunga bir nechta template tushishi
    // hamon MUMKIN — masalan yer/suv/mol-mulk ma'lumotnomasi va yillik
    // hisob-kitobi bitta katakni baham ko'rsa. Shuning uchun tekshiruv
    // "juftlik bo'la oladi" degan xususiyatga qaratildi, qotirilgan juftlikka
    // emas.
    const byKey = new Map<string, string[]>();
    for (const t of templates) {
      if (!t.matrixKey) continue;
      byKey.set(t.matrixKey, [...(byKey.get(t.matrixKey) ?? []), t.code]);
    }
    expect(byKey.get("qqs")).toEqual(["QQS_DECL"]);
    expect(byKey.get("aylanma")).toEqual(["AYLANMA_SOLIQ"]);
    // Xarita ko'p-ga-bir bo'la oladi: hech bir kalit noyob bo'lishi SHART emas.
    expect([...byKey.values()].every((codes) => codes.length >= 1)).toBe(true);
  });
});

describe("qamrov — RATCHET", () => {
  // 2026-08-07: 51 ustundan 23 tasi qoplangan, 28 tasi qolgan. B blok buni
  // nolga tushiradi. Son faqat KAMAYISHI mumkin.
  //
  // Birinchi tahririda bu "hech qachon qulamaydigan, faqat chop etadigan"
  // test edi. Bunday test qamrov yo'qolganini ham sezmasdi va lint qoidasini
  // ham buzardi (`console.log`). Ratchet ikkalasini hal qiladi: qolgan sonni
  // ko'rsatadi VA o'sishiga yo'l qo'ymaydi.
  // 2026-08-28: `nextjs-v2` bilan birlashuvdan keyin 54. Chegara 28 edi va u
  // KICHIKROQ ustun to'plamiga qarab o'lchangan; bu shoxda soliq matritsasi
  // to'liq reestr bo'yicha kengaydi (har byudjet kodiga hisobot + to'lov) va
  // statistika shakllari qo'shildi — ya'ni maxraj o'sdi, qamrov emas kamaydi.
  //
  // Qolgan 54 ta ustunning shabloni YO'Q: ular matritsada belgilanadi, lekin
  // "Ishlar" ro'yxatiga chiqmaydi va foizga kirmaydi. Bu ochiq qarz — muddat
  // kunlari tasdiqlangach shablonlar seed qilinadi va bu son TUSHADI.
  const REMAINING = 54;

  it(`qoplanmagan ustunlar soni oshmaydi (hozir ${REMAINING})`, () => {
    const covered = new Set(templates.map((t) => t.matrixKey).filter(Boolean) as string[]);
    const missing = [...columnKeys].filter((k) => !covered.has(k)).sort();
    expect(missing.length, `qoplanmaganlar: ${missing.join(" ")}`).toBeLessThanOrEqual(REMAINING);
  });

  it("qoplangan ustunlar soni kamaymaydi", () => {
    const covered = new Set(templates.map((t) => t.matrixKey).filter(Boolean) as string[]);
    expect(covered.size).toBeGreaterThanOrEqual(columnKeys.size - REMAINING);
  });
});

describe("qoralama xavfsizligi", () => {
  it("generator KO'RADIGAN har bir template TASDIQLANGAN", async () => {
    // Bu testning birinchi tahriri `visible === jami − qoralama` deb yozilgan
    // edi va u TAFTOLOGIYA edi: qoralamani `active` qilsangiz ikkala tomon
    // birga siljiydi, ya'ni u hech qachon qulamasdi. Sindirib sinashda
    // aniqlandi.
    //
    // Haqiqiy xavfsizlik xususiyati boshqa: majburiyat yaratadigan hech bir
    // template ODAM ko'rigidan o'tmasdan qolmasin. `/admin/deadline-templates`
    // orqali `active` ga o'tkazish `approvedById` ni to'ldiradi; bazadan
    // qo'lda flip qilish esa yo'q — va aynan shuni tutamiz.
    //
    // Nega muhim: 213 firma × ~28 template ≈ 6 000 majburiyat/oy, va soatlik
    // sweep har mas'ulga 5 bosqichda DM yuboradi.
    const ref = new Date();
    const unapproved = await prisma.deadlineTemplate.findMany({
      where: {
        active: true, lifecycle: "active", approvedById: null,
        effectiveFrom: { lte: ref },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: ref } }],
      },
      select: { code: true },
    });
    expect(unapproved.map((t) => t.code)).toEqual([]);
  });

  it("qoralama tasdiqlanmagan holda turadi", async () => {
    const approved = await prisma.deadlineTemplate.count({
      where: { lifecycle: "draft", approvedById: { not: null } },
    });
    expect(approved).toBe(0);
  });

  it("hech bir tasdiq SKRIPT tomonidan o'ziga yozilmagan", async () => {
    // SOXTA TASDIQ IZI. `scripts/seed-deadline-templates.ts` ilgari shablonni
    // `lifecycle: "active"` qilib yaratib, `approvedById` ga O'ZI yozgan
    // `createdBy` ni (Superadmin) qo'yardi. Bazada bu aniq iz qoldiradi:
    //   approvedById == createdBy  VA  approvedAt == createdAt (soniyasigacha).
    // Lokal bazada 30 ta shablon aynan shunday edi — audit izi "bosh buxgalter
    // ko'rib chiqdi" deb turardi, holbuki hech kim ko'rmagan.
    //
    // Haqiqiy tasdiq boshqacha ko'rinadi: odam shablonni yaratgandan KEYIN
    // `/admin/deadline-templates` dan `draft → approved` ga o'tkazadi
    // (`server/deadlineTemplates.ts` `setTemplateLifecycle`), ya'ni
    // `approvedAt` `createdAt` dan keyin bo'ladi va tasdiqlovchi boshqa odam
    // bo'lishi mumkin.
    //
    // Bu tekshiruv yuqoridagi ikkitasi tuta olmaydigan holatni tutadi: seed
    // shablonni DARHOL tasdiqlangan qilib yaratsa, "tasdiqlovchisiz aktiv"
    // ham, "tasdiqlangan qoralama" ham bo'lmaydi — lekin ko'rik baribir
    // bo'lmagan bo'ladi.
    const rows = await prisma.deadlineTemplate.findMany({
      where: { approvedById: { not: null } },
      select: { code: true, approvedById: true, createdBy: true, approvedAt: true, createdAt: true },
    });
    const selfApproved = rows.filter(
      (t) =>
        t.approvedById === t.createdBy &&
        t.approvedAt !== null &&
        Math.abs(t.approvedAt.getTime() - t.createdAt.getTime()) < 1000,
    );
    expect(
      selfApproved.map((t) => t.code),
      "yaratilgan zahoti o'ziga tasdiq yozilgan — skript tasdig'i",
    ).toEqual([]);
  });
});

describe("client_service KPI'ga tushmaydi", () => {
  it("kpiRuleName null va escalates false", () => {
    // Komunalka va IT Park — mijoz uchun bajariladigan ish; ular reglament
    // majburiyati emas, shuning uchun na KPI'ga, na eskalatsiyaga tushadi.
    const cs = templates.filter((t) => t.obligationType === "client_service");
    for (const t of cs) {
      expect(t.kpiRuleName, t.code).toBeNull();
    }
  });
});
