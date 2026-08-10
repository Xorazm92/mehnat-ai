"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { companyRelations, assertCompanyPermission } from "@/lib/access";
import { checkCellWrite, CELL_EMPTY } from "@/lib/reportPermissions";
import { clearCellEvidence, syncCellToObligation } from "@/lib/obligationBridge";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/serialize";
import { FIELD_TO_DB_COLUMN } from "@/lib/operationTemplates";
import type { OperationFieldKey } from "@/types";

// =====================================================
// MONTHLY REPORTS
// =====================================================

export async function getMonthlyReports(companyId: string, period?: string) {
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

export async function upsertMonthlyReport(data: MonthlyReportWriteInput) {
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
    },
  });
  if (!company) throw new Error("Company not found");

  // Obyekt-scope: begona firmaning matritsasiga yozib bo'lmaydi (IDOR).
  await assertCompanyPermission(prisma, { id: userId, role }, data.companyId, "report:write");

  // Shu firmadagi mas'uliyat — nazoratchi o'zi buxgalteri bo'lgan firmada
  // buxgalter huquqi bilan ishlaydi (o'z-o'zini nazorat bloki).
  const relations = companyRelations(company, userId);

  const { companyId, period, ...rawFields } = data;

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

    for (const [dbCol, nextValue] of Object.entries(fields)) {
      const reason = checkCellWrite({
        role,
        relations,
        nextValue,
        currentValue: currentRow ? currentRow[dbCol] : undefined,
      });
      if (reason) throw new Error(reason);
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
    if (isClearedValue(value)) {
      await clearCellEvidence({ companyId, period, colKey: rawKey, actorId: userId });
    } else {
      await syncCellToObligation({ companyId, period, colKey: rawKey, value, actorId: userId });
    }
  }

  revalidateTag("operations", "max");
  return serialize(result);
}

/** Katak "bo'shatildi" deb hisoblanadigan qiymatlar. */
function isClearedValue(value: unknown): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "" || v === CELL_EMPTY;
}

export async function clearColumnForPeriod(period: string, colKey: string) {
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
  const affected = new Set([...withValue, ...withProof].map((r) => r.companyId));
  for (const companyId of affected) {
    await clearCellEvidence({ companyId, period, colKey, actorId: session.user.id });
  }

  revalidateTag("operations", "max");
  return { success: true, cleared: res.count, proofsRemoved: withProof.length };
}
