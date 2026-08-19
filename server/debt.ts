"use server";

// =====================================================
// QARZDORLIK — 1C kesimi va ASRO hisobi
// =====================================================
//
// Ikki manba yonma-yon ko'rsatiladi:
//   1C   — jamg'arilgan qarz (o'tgan oylardan qolgani bilan), fayldan olingan
//   ASRO — `Company.contractAmount − joriy oy to'lovi`, o'zi hisoblaydi
//
// Farq muhim: u yo eski oylardan qarz qolganini, yo to'lov tizimga
// kiritilmaganini bildiradi. Shuning uchun farqi katta qatorlar TEPADA.

import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import { requireSenior } from "@/server/guards";
import { companyScopeWhere } from "@/lib/access";
import { serialize } from "@/lib/serialize";
import { computeContractDebt, listDebtors, periodKeyOf } from "@/lib/debt";
import { runReconciliation } from "@/lib/reconciliation";
import { recordAuditLog } from "@/lib/auditTrail";
import { revalidatePath } from "next/cache";


export interface DebtRow {
  key: string;
  customer: string;
  contract: string | null;
  ownFirm: string | null;
  /** 1C bo'yicha qarz. */
  debt1C: number;
  /** ASRO hisobi (shu firma bo'yicha, joriy oy). */
  debtAsro: number | null;
  /** 1C − ASRO. */
  diff: number | null;
  companyId: string | null;
  linked: boolean;
}

export async function getDebtComparison() {
  const actor = await requireSenior();

  // FIRMA SCOPE. `isSeniorRole` yetarli EMAS: bosh buxgalter va nazoratchi
  // ataylab o'z portfeliga cheklangan (lib/permissions.ts `ROLE_PERMISSIONS`
  // da ularga "view_all_companies" berilmagan). Scope'siz ular 197 ta
  // firmaning hammasining qarzini ko'rardi.
  const scope = companyScopeWhere({ id: actor.userId, role: actor.role });
  const isAdmin = isAdminRole(actor.role);
  const scopedIds = isAdmin
    ? null
    : (await prisma.company.findMany({ where: scope, select: { id: true } })).map((c) => c.id);

  const latest = await prisma.debtSnapshot.findFirst({
    orderBy: { asOf: "desc" },
    select: { asOf: true },
  });
  if (!latest) {
    return serialize({ asOf: null, rows: [], totals: { debt1C: 0, debtAsro: 0, diff: 0 }, unlinked: 0 });
  }

  const period = periodKeyOf(new Date());

  const [snapshots, asro] = await Promise.all([
    prisma.debtSnapshot.findMany({
      // Bog'lanmagan qatorlar (companyId = null) faqat adminga ko'rinadi —
      // ular hech kimning portfeliga tegishli emas.
      where: {
        asOf: latest.asOf,
        ...(scopedIds ? { companyId: { in: scopedIds } } : {}),
      },
      select: {
        id: true,
        rawCustomer: true,
        rawContract: true,
        ownFirmName: true,
        debt: true,
        companyId: true,
        contractId: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { debt: "desc" },
    }),
    // ASRO hisobi YAGONA MANBADAN (lib/debt.ts) — direktor hisoboti ham
    // shuni ishlatadi, shuning uchun ikki ekranda bir xil raqam chiqadi.
    computeContractDebt(prisma, period, { companyIds: scopedIds }),
  ]);

  const asroByCompany = asro.byCompany;

  // Bir firmada bir necha shartnoma bo'lsa, ASRO raqami FIRMA darajasida —
  // uni birinchi qatorga qo'yamiz, qolganida bo'sh (ikki marta sanalmasin).
  const asroShown = new Set<string>();
  const rows: DebtRow[] = snapshots.map((s) => {
    const debt1C = Number(s.debt);
    let debtAsro: number | null = null;
    if (s.companyId && !asroShown.has(s.companyId)) {
      debtAsro = asroByCompany.get(s.companyId) ?? 0;
      asroShown.add(s.companyId);
    }
    return {
      key: s.id,
      customer: s.company?.name ?? s.rawCustomer,
      contract: s.rawContract || null,
      ownFirm: s.ownFirmName,
      debt1C,
      debtAsro,
      diff: debtAsro === null ? null : debt1C - debtAsro,
      companyId: s.companyId,
      linked: s.companyId != null,
    };
  });

  const totals = {
    debt1C: rows.reduce((sum, r) => sum + r.debt1C, 0),
    debtAsro: [...asroByCompany.values()].reduce((sum, v) => sum + v, 0),
    diff: 0,
  };
  totals.diff = totals.debt1C - totals.debtAsro;

  return serialize({
    asOf: latest.asOf,
    rows,
    totals,
    unlinked: rows.filter((r) => !r.linked).length,
  });
}

/**
 * TO'LAMAGAN FIRMALAR RO'YXATI.
 *
 * Direktorning kunlik hisoboti bilan AYNAN bir manbadan (`lib/debt.ts`
 * `listDebtors`) — shuning uchun Telegramdagi raqam va ekrandagi ro'yxat
 * hech qachon ajralmaydi.
 *
 * Scope: admin/superadmin hammasini, bosh buxgalter va nazoratchi esa faqat
 * o'z portfelini ko'radi (`companyScopeWhere`) — `getDebtComparison` bilan
 * bir xil qoida.
 *
 * @param scope "collect" standart — muddati o'tgan VA shu oy yig'ilishi kerak
 *   bo'lganlar. Ish oyi tugagach mijoz KEYINGI oy davomida to'laydi
 *   (`PAYMENT_TERM_MONTHS`), shuning uchun "hali to'lamagan" o'z-o'zidan
 *   buzilish emas — u inkasso ish ro'yxati.
 */
export async function getDebtors(opts: { scope?: "overdue" | "collect" | "all" } = {}) {
  const actor = await requireSenior();

  const isAdmin = isAdminRole(actor.role);
  const scopedIds = isAdmin
    ? null
    : (
        await prisma.company.findMany({
          where: companyScopeWhere({ id: actor.userId, role: actor.role }),
          select: { id: true },
        })
      ).map((c) => c.id);

  const rows = await listDebtors(prisma, {
    companyIds: scopedIds,
    period: periodKeyOf(new Date()),
    scope: opts.scope ?? "collect",
  });

  return serialize({
    rows,
    totals: {
      companies: rows.length,
      overdue: rows.reduce((s, r) => s + r.overdue, 0),
      dueNow: rows.reduce((s, r) => s + r.dueNow, 0),
      outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
      overdueCompanies: rows.filter((r) => r.overdue > 0).length,
      neverPaid: rows.filter((r) => r.overdue > 0 && r.paid === 0).length,
    },
  });
}

/**
 * "BUGUN PUL MASALASINI GAPLASHISH KERAK" ro'yxati.
 *
 * `getDebtors` qarz SUMMASINI beradi, bu esa HARAKATNI: kim bilan bugun
 * bog'lanish kerakligini. Ikkalasi bir manbadan (`listDebtors`) oziqlanadi,
 * ya'ni raqamlar hech qachon farq qilmaydi.
 *
 * Ro'yxatga tushish sharti — qarzi bor VA (suhbat belgilanmagan yoki
 * belgilangan muddati kelgan). Bugunga keyinroqqa belgilangan firma
 * ro'yxatdan CHIQADI: shu bilan ro'yxat kundan kunga qisqaradi va o'qiladigan
 * bo'ladi. Ilgari u har kuni bir xil turardi.
 */
export async function getCollectionQueue() {
  const actor = await requireSenior();

  const isAdmin = isAdminRole(actor.role);
  const scopedIds = isAdmin
    ? null
    : (
        await prisma.company.findMany({
          where: companyScopeWhere({ id: actor.userId, role: actor.role }),
          select: { id: true },
        })
      ).map((c) => c.id);

  const rows = await listDebtors(prisma, {
    companyIds: scopedIds,
    period: periodKeyOf(new Date()),
    scope: "collect",
  });

  const queue = rows
    .filter((r) => r.contactDue !== false)
    // Muddati o'tgani tepada, keyin eng uzoq vaqt gaplashilmagani.
    .sort(
      (a, b) =>
        b.overdue - a.overdue ||
        (a.contactedAt ?? "").localeCompare(b.contactedAt ?? "")
    );

  return serialize({
    rows: queue,
    totals: {
      companies: queue.length,
      overdue: queue.reduce((s, r) => s + r.overdue, 0),
      dueNow: queue.reduce((s, r) => s + r.dueNow, 0),
      neverContacted: queue.filter((r) => !r.contactedAt).length,
    },
  });
}

/**
 * "Gaplashildi" — aloqa izini yozadi va keyingi suhbat sanasini belgilaydi.
 *
 * Sana berilmasa 7 kundan keyinga siljiydi: har kuni bir xil firmani qayta
 * ko'rsatmaslik uchun standart kerak, lekin uni butunlay ro'yxatdan
 * chiqarmaslik ham kerak.
 */
export async function setDebtContact(input: {
  companyId: string;
  nextContactAt?: string | null;
  note?: string | null;
}) {
  const actor = await requireSenior();

  const next = input.nextContactAt
    ? new Date(input.nextContactAt)
    : new Date(Date.now() + 7 * 86_400_000);
  if (Number.isNaN(next.getTime())) throw new Error("Sana noto'g'ri");

  await prisma.company.update({
    where: { id: input.companyId },
    data: {
      debtContactedAt: new Date(),
      debtNextContactAt: next,
      debtContactNote: input.note?.trim() || null,
    },
  });

  await recordAuditLog({
    userId: actor.userId,
    action: "update",
    tableName: "Company",
    recordId: input.companyId,
    newData: { debtContactedAt: new Date().toISOString(), debtNextContactAt: next.toISOString() },
  });

  revalidatePath("/kassa/qarzdorlik");
  revalidatePath("/kassa");
}

/**
 * Oylik reja/fakt — BUTUN korxona bo'yicha ko'rsatkich, firma kesimi yo'q.
 * Shuning uchun uni faqat direktor (admin) ko'radi.
 */
export async function getPlanFact(limit = 12) {
  const actor = await requireSenior();
  if (!isAdminRole(actor.role)) return serialize([]);
  const rows = await prisma.monthlyTarget.findMany({
    where: { metric: { contains: "tushum", mode: "insensitive" } },
    orderBy: { period: "desc" },
    take: limit,
    select: { period: true, metric: true, plan: true, fact: true },
  });
  return serialize(rows.reverse());
}

/**
 * Sverka — moliyaviy invariantlar holati.
 *
 * ATAYIN admin-only: bu butun tizim bo'yicha ko'rsatkich (firma kesimi yo'q),
 * va aralashuv talab qiladigan harakatlar ham adminniki.
 */
export async function getReconciliation() {
  const actor = await requireSenior();
  if (!isAdminRole(actor.role)) return serialize([]);
  return serialize(await runReconciliation(prisma));
}
