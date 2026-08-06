"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/platform/permissions";
import { companyRelations, assertCompanyPermission } from "@/lib/platform/access";
import { checkCellWrite, CELL_EMPTY } from "@/lib/reportPermissions";
import { applyCellWrite } from "@/lib/domains/accounting/matrixWrite";
import { logger } from "@/lib/platform/logger";
import { updateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/serialize";
import { FIELD_TO_DB_COLUMN } from "@/lib/operationTemplates";
import { normalizePeriodKey, isFuturePeriod, formatPeriodLabel } from "@/lib/periods";
import type { OperationFieldKey } from "@/types";

// =====================================================
// MONTHLY REPORTS
// =====================================================

export async function getMonthlyReports(companyId: string, rawPeriod?: string) {
  const period = rawPeriod ? normalizePeriodKey(rawPeriod) : undefined;
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  // Obyekt-scope: firma portfelda bo'lishi shart (rolga qaramay)
  await assertCompanyPermission(prisma, { id: userId, role }, companyId, "report:read");

  return serialize(
    await prisma.monthlyReport.findMany({
      where: {
        companyId,
        ...(period ? { period } : {}),
      },
      orderBy: { period: "desc" },
    })
  );
}

/**
 * Matritsa katagini yozish uchun kirish.
 *
 * ATAYIN `Prisma.MonthlyReportUncheckedCreateInput` EMAS: chaqiruvchilar
 * matritsa kalitlarini (`snake_case`) yuboradi va bu funksiya ularni ustun
 * nomlariga o'giradi. Prisma tipini e'lon qilish yolg'on shartnoma edi —
 * shuning uchun chaqiruv joylarida uni jimlatuvchi cast paydo bo'lgan.
 */
export type MonthlyReportWriteInput = {
  companyId: string;
  period: string;
} & Partial<Record<OperationFieldKey, string | null>>;

/**
 * Katak bo'shatilganda: skrinshot dalili o'chadi va majburiyat `planned` ga
 * qaytadi.
 *
 * Ilgari bu `lib/obligationBridge.ts:clearCellEvidence` da edi va u ikki xil
 * ishni birlashtirardi — dalil o'chirish (proof masalasi) va holat qaytarish
 * (majburiyat masalasi). Ikkinchisi endi `applyCellWrite` da; birinchisi shu
 * yerda qoladi, chunki u aynan matritsa yozuvining yon ta'siri.
 */
async function clearCellEvidence(companyId: string, period: string, colKey: string) {
  await prisma.reportProof.deleteMany({ where: { companyId, period, colKey } });
  const outcome = await applyCellWrite(prisma, {
    companyId, period, matrixKey: colKey, value: CELL_EMPTY,
  });
  if (!outcome.ok) {
    logger.warn(
      { event: "matrix.obligation_sync_failed", reason: outcome.reason, detail: outcome.detail, companyId, period, colKey },
      "katak tozalandi, majburiyat qaytarilmadi",
    );
  }
}

/**
 * Yozuv natijasi. KUTILGAN qoida rad etishlari (kelajak davr, tasdiqlangan
 * katak, huquq chegarasi) `throw` QILINMAYDI — ular shu yerda qaytariladi.
 *
 * Sababi: Next production'da server amali tashlagan xatoning MATNINI mijozga
 * bermaydi ("The specific message is omitted in production builds…"), ya'ni
 * o'zbekcha tushuntirish yo'qolib, foydalanuvchi inglizcha texnik matnni
 * ko'rardi. Qaytarilgan ma'lumot esa yashirilmaydi.
 *
 * `throw` faqat KUTILMAGAN holatlar uchun qoladi (ruxsat yo'q, baza xatosi) —
 * ular xato jurnaliga tushishi kerak.
 */
export type MonthlyReportWriteResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const rejected = (error: string): MonthlyReportWriteResult => ({ ok: false, error });

export async function upsertMonthlyReport(
  data: MonthlyReportWriteInput
): Promise<MonthlyReportWriteResult> {
  if (!data || !data.companyId || !data.period) {
    throw new Error("companyId va period berilishi shart (upsertMonthlyReport)");
  }

  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  const company = await prisma.company.findUnique({
    where: { id: data.companyId },
    select: {
      accountantId: true,
      supervisorId: true,
      chiefAccountantId: true,
      bankClientId: true,
      departmentRef: { select: { chiefAccountantId: true } },
      // Mas'uliyat slotdan YOKI "Jamoa" biriktiruvidan kelishi mumkin.
      contractAssignments: { where: { isActive: true }, select: { userId: true, role: true } },
    },
  });
  if (!company) throw new Error("Company not found");

  // Obyekt-scope: begona firmaning matritsasiga yozib bo'lmaydi (IDOR).
  await assertCompanyPermission(prisma, { id: userId, role }, data.companyId, "report:write");

  // Shu firmadagi mas'uliyat — nazoratchi o'zi buxgalteri bo'lgan firmada
  // buxgalter huquqi bilan ishlaydi (o'z-o'zini nazorat bloki).
  const relations = companyRelations(company, userId);

  const { companyId, period: rawPeriod, ...rawFields } = data;
  // Kanonik davr kaliti — MonthPicker matnli format yuborsa ham (eski
  // mijoz/deep-link) yozuv ISO bo'lib saqlanadi va matritsa uni topadi.
  const period = normalizePeriodKey(rawPeriod);
  // Kelajak davrga katak yozib bo'lmaydi — dalil yo'liga qo'yilgan chegara
  // bilan bir xil. Ikkalasi ham yopilmasa, xodim matritsadan to'g'ridan-to'g'ri
  // "bajarildi" qo'yib, dalil talabini ham, vaqtni ham chetlab o'tardi.
  if (isFuturePeriod(period)) {
    return rejected(
      `${formatPeriodLabel(period)} — kelajak davr. Bu oy uchun hisobot yozib bo'lmaydi.`,
    );
  }

  // Matritsa ustun kalitlari snake_case (masalan "my_mehnat", "one_c") keladi,
  // Prisma MonthlyReport ustunlari esa camelCase ("myMehnat", "oneC"). Prisma
  // noto'g'ri nomlarda "Unknown field" xatosi beradi, shuning uchun bu yerda
  // kalitlarni haqiqiy ustun nomlariga o'giramiz.
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    const mapped = FIELD_TO_DB_COLUMN[k as OperationFieldKey] ?? k;
    fields[mapped] = v;
  }

  // HUQUQ CHEGARASI — buxgalter o'z ishini o'zi tasdiqlay olmaydi va dalilsiz
  // "topshirildi" qo'ya olmaydi. UI menyuni yashiradi, lekin haqiqiy chegara
  // shu yerda: aks holda bitta so'rov bilan chetlab o'tilardi.
  // Tasdiqlash/topshirish yo'llari alohida: server/proofs.ts.
  //
  // Tekshiruv HAR DOIM ishlaydi (ilgari faqat "senior bo'lmasa"): nazoratchi
  // ham o'zi buxgalteri bo'lgan firmada shu chegaraga tushadi.
  {
    const current = await prisma.monthlyReport.findUnique({
      where: { companyId_period: { companyId, period } },
    });
    const currentRow = current as Record<string, unknown> | null;

    // Dalil holati — "o'z topshirig'ini qaytarib olish" qoidasi uchun.
    // Matritsa kalitlari bo'yicha (snake_case), chunki `ReportProof.colKey`
    // ham shu shaklda saqlanadi; `fields` esa DB ustun nomlarida.
    const proofs = await prisma.reportProof.findMany({
      where: { companyId, period, colKey: { in: Object.keys(rawFields) } },
      select: { colKey: true, status: true, submittedById: true },
    });
    const proofByCol = new Map(proofs.map((p) => [p.colKey, p]));

    for (const [rawKey, nextValue] of Object.entries(rawFields)) {
      const dbCol = FIELD_TO_DB_COLUMN[rawKey as OperationFieldKey] ?? rawKey;
      const p = proofByCol.get(rawKey);
      const reason = checkCellWrite({
        role,
        relations,
        nextValue,
        currentValue: currentRow ? currentRow[dbCol] : undefined,
        evidence: p ? { status: p.status, isMine: p.submittedById === userId } : null,
      });
      if (reason) return rejected(reason);
    }
  }

  const result = await prisma.monthlyReport.upsert({
    where: { companyId_period: { companyId, period } },
    create: { companyId, period, ...fields } as Prisma.MonthlyReportUncheckedCreateInput,
    update: fields as Prisma.MonthlyReportUncheckedUpdateInput,
  });

  // MANBA — majburiyat. Katak yozuvi shu yerda `Obligation` ga o'tadi, aks
  // holda matritsada "topshirildi" turgan ish `/deadlines` da "kechikdi" bo'lib
  // qolaverardi (buxgalter bir ishni ikki joyda belgilashga majbur edi).
  // Tozalash alohida yo'l: u dalilni ham olib tashlaydi.
  for (const [rawKey, value] of Object.entries(rawFields)) {
    if (!isClearedValue(value)) continue;
    await clearCellEvidence(companyId, period, rawKey);
  }

  /**
   * `revalidateTag(tag, "max")` EMAS, `updateTag(tag)`.
   *
   * Bu farq matritsadagi eng og'riqli xatoning sababi edi: nazoratchi katakni
   * tasdiqlardi, ✅ chiqardi, keyin bir necha soniyadan so'ng belgi YO'QOLARDI
   * ("nol hisobot" ham xuddi shunday uchib ketardi).
   *
   * Sababi Next 16 hujjatida yozilgan: `revalidateTag(tag, "max")` keshni
   * O'CHIRMAYDI — uni "eskirgan" deb belgilaydi va keyingi so'rovga
   * stale-while-revalidate qoidasi bo'yicha ESKI ma'lumotni beradi, yangisini
   * esa fonda oladi. `getCachedOperations` 5 daqiqalik keshda turadi, sahifa
   * esa har 15 soniyada `router.refresh()` qiladi — ya'ni yozuvdan keyingi
   * birinchi yangilanish katakni tasdiqlashdan OLDINGI holatiga qaytarardi.
   *
   * `updateTag` esa "read-your-own-writes" uchun mo'ljallangan: keshni darhol
   * muddati o'tgan deb belgilaydi va keyingi so'rov yangi ma'lumotni kutadi.
   */
  updateTag("operations");
  return { ok: true, data: serialize(result) };
}

/** Katak "bo'shatildi" deb hisoblanadigan qiymatlar. */
function isClearedValue(value: unknown): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "" || v === CELL_EMPTY;
}

export async function clearColumnForPeriod(rawPeriod: string, colKey: string) {
  const period = normalizePeriodKey(rawPeriod);
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  // Matritsa kaliti DB ustuni EMAS: UI "pul_oqimlari" yuboradi, ustun esa
  // "pulOqimlari". Kalitni to'g'ridan-to'g'ri berish tozalashni nomi tasodifan
  // bir xil bo'lgan ustunlarda (didox, xatlar, inps…) ishlatib, qolganlarida
  // Prisma xatosiga olib kelardi — "ba'zi ustun tozalanadi, ba'zisi yo'q".
  // Bu — barcha monthlyReport yozuvlari uchun bir xil qoida (server/proofs.ts).
  const dbCol = FIELD_TO_DB_COLUMN[colKey as OperationFieldKey];
  // Noma'lum kalitni rad etamiz: `data` ga kelgan nom to'g'ridan-to'g'ri
  // ustunga aylanadi, ya'ni tekshiruvsiz qoldirish ixtiyoriy maydonni
  // nolga tenglash imkonini berardi.
  if (!dbCol) throw new Error("Noto'g'ri ustun kaliti");

  // Qaysi firmalarning majburiyati ortga qaytishi kerakligini TOZALASHDAN OLDIN
  // aniqlaymiz: qiymat o'chgandan keyin bu ma'lumot yo'qoladi. Dalilsiz yozilgan
  // kataklar ham majburiyatni harakatga keltirgani uchun (syncCellToObligation)
  // faqat `ReportProof` bo'yicha yurish ularni ortda qoldirardi.
  const withValue = await prisma.monthlyReport.findMany({
    where: { period, NOT: { [dbCol]: null } } as Prisma.MonthlyReportWhereInput,
    select: { companyId: true },
  });
  const withProof = await prisma.reportProof.findMany({
    where: { period, colKey },
    select: { companyId: true },
    distinct: ["companyId"],
  });

  const res = await prisma.monthlyReport.updateMany({
    where: { period },
    data: { [dbCol]: null } as Prisma.MonthlyReportUncheckedUpdateManyInput,
  });

  // Katak tozalash bilan bir xil qoida: ustun bo'shatilsa, o'sha ustunga
  // biriktirilgan dalillar ham ketadi va majburiyatlar `planned` ga qaytadi.
  // Aks holda bo'sh ustun ustida dalil nuqtalari qolib ketardi.
  const affected = await prisma.reportProof.findMany({
    where: { period, colKey },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  for (const { companyId } of affected) {
    await clearCellEvidence(companyId, period, colKey);
  }

  updateTag("operations");
  return { success: true, cleared: res.count, proofsRemoved: withProof.length };
}
