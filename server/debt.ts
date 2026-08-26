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
import { contractNumberOf } from "@/lib/debtReport";
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

// =====================================================
// HISOB-KITOB VARAQASI — mijoz bilan hisobning to'liq holati
// =====================================================
//
// Rahbarning savoli: "shu mijoz bilan ahvolimiz qanday?" Javob BESH
// ustundan iborat va ular bir-birini almashtira olmaydi:
//
//   Boshi        — oy boshidagi qoldiq (qarz musbat, avans manfiy)
//   Hisoblandi   — shu oyning xizmat haqi
//   To'landi     — shu oyda kelgan pul
//   Qarz / Avans — oy oxiridagi holat, ALOHIDA ustunlar
//
// NEGA QARZ VA AVANS ALOHIDA: bitta mijozda bir shartnomada qarz, boshqasida
// avans bo'lishi mumkin (masalan Alfraganus: 14/26БК da 8 mln qarz,
// 11/РК da 20 mln avans). Ularni bitta "sof" raqamga qo'shib yuborish
// "bu mijoz bizga 12 mln avans bergan" degan yolg'on xulosa berardi,
// holbuki doimiy xizmat bo'yicha u QARZDOR.
//
// MANBA — 1C kesimlari (`DebtSnapshot`), ASRO ning o'z hisobi EMAS. Sabab
// `lib/debtReport.ts` da: ASRO faqat joriy oyni ko'radi, 1C esa
// jamg'arilgan haqiqiy qarzni beradi.
//
// Hisoblanma ikki kesim FARQIDAN chiqadi: 1C kesim hisoboti aylanmani
// ko'rsatmaydi, shuning uchun oy oxirida ikkita kesim olinadi — xizmat haqi
// yozilgunga qadar va yozilgandan keyin.

import { contractKindOf, CONTRACT_KIND_LABELS, type ContractKind } from "@/lib/debtReport";

export interface StatementLine {
  contractNumber: string | null;
  contractRaw: string | null;
  kind: ContractKind;
  kindLabel: string;
  ownFirmName: string | null;
  opening: number;
  /** Davr ichida hisoblangan xizmat haqi. */
  accrued: number;
  debt: number;
  advance: number;
}

export interface StatementCustomer {
  customerName: string;
  companyId: string | null;
  companyInn: string | null;
  opening: number;
  accrued: number;
  /** Davr ichida kelgan pul — bizning `PaymentAllocation` dan. */
  paid: number;
  debt: number;
  advance: number;
  /** Shartnoma darajasidagi tafsilot. */
  lines: StatementLine[];
}

export interface DebtStatement {
  openingAsOf: string | null;
  closingAsOf: string | null;
  availableDates: string[];
  customers: StatementCustomer[];
  totals: { opening: number; accrued: number; paid: number; debt: number; advance: number };
  byKind: { kind: ContractKind; label: string; count: number; debt: number; advance: number; accrued: number }[];
  /** To'lovlar shu davrda umuman bo'lganmi — ustunni ko'rsatish/yashirish uchun. */
  hasPayments: boolean;
}

/**
 * @param openingAsOf davr boshidagi kesim sanasi
 * @param closingAsOf davr oxiridagi kesim sanasi
 */
export async function getDebtStatement(input?: {
  openingAsOf?: Date;
  closingAsOf?: Date;
}): Promise<DebtStatement> {
  const actor = await requireSenior();

  // FIRMA QAMROVI — bu funksiyada YO'Q edi.
  //
  // Qo'shnilari (`getDebtComparison`, `getDebtors`, `getCollectionQueue`)
  // portfelga cheklangan va yuqorida buning sababi izohlangan: bosh
  // buxgalter va nazoratchiga "view_all_companies" ataylab berilmagan.
  // `getDebtStatement` esa faqat `requireSenior()` bilan cheklanardi va
  // butun bazani o'qirdi. Jonli tekshiruvda BITTA firmaga mas'ul
  // nazoratchi hisob-kitob varaqasida 224 mijozning qarzini — jami
  // 1,29 mlrd so'mni — ko'rdi.
  //
  // `DebtSnapshot.companyId` mavjud (moslashmagan qatorlar uchun `null`),
  // shuning uchun qamrovni qo'shnilar bilan bir xil usulda qo'yamiz.
  // `null` companyId — moslashmagan qator; u qamrovli foydalanuvchiga
  // ko'rinmaydi, chunki uning kimga tegishli ekani noma'lum.
  const isAdmin = isAdminRole(actor.role);
  const scopedIds = isAdmin
    ? null
    : (
        await prisma.company.findMany({
          where: companyScopeWhere({ id: actor.userId, role: actor.role }),
          select: { id: true },
        })
      ).map((c) => c.id);

  const scopeWhere = scopedIds ? { companyId: { in: scopedIds } } : {};

  const dateRows = await prisma.debtSnapshot.findMany({
    where: scopeWhere,
    distinct: ["asOf"],
    select: { asOf: true },
    orderBy: { asOf: "desc" },
  });
  const availableDates = dateRows.map((d) => d.asOf.toISOString());

  // ── STANDART JUFTLIK — SOLISHTIRISH MUMKIN BO'LGANI ────────────────────
  //
  // "Eng oxirgi ikkita kesim" qoidasi noto'g'ri natija berardi. Bazada
  // uch kesim bor: 31.07 (85 qator), 01.08 (249), 07.08 (131). Oxirgi
  // ikkitasi — 01.08 va 07.08 — turli TO'LIQLIKDAGI hisobotlar: 07.08 eski
  // importerdan kelgan va mijozlarning yarmini qamramaydi. Ularni
  // solishtirish "Hisoblandi −420 mln" degan ma'nosiz raqam berardi.
  //
  // Endi qo'shni juftliklar orasidan OCHILISH QATORLARI YOPILISHDA ENG KO'P
  // uchraydigani tanlanadi: solishtirish faqat ustma-ust tushgan qatorlarda
  // ma'noli, qamrov past bo'lsa raqam shunchaki noto'liq.
  let closingAsOf = input?.closingAsOf ?? null;
  let openingAsOf = input?.openingAsOf ?? null;

  if (!closingAsOf && dateRows.length > 0) {
    if (dateRows.length === 1) {
      closingAsOf = dateRows[0].asOf;
    } else {
      const keyOf = (r: { rawCustomer: string; rawContract: string | null; ownFirmName: string | null }) =>
        `${r.rawCustomer}||${r.rawContract ?? ""}||${r.ownFirmName ?? ""}`;
      const keysByDate = new Map<number, Set<string>>();
      for (const d of dateRows) {
        const rows = await prisma.debtSnapshot.findMany({
          where: { asOf: d.asOf, ...scopeWhere },
          select: { rawCustomer: true, rawContract: true, ownFirmName: true },
        });
        keysByDate.set(d.asOf.getTime(), new Set(rows.map(keyOf)));
      }

      let best = { coverage: -1, close: dateRows[0].asOf, open: dateRows[1].asOf };
      // `dateRows` kamayish tartibida — qo'shni juftlik (i) yopilish, (i+1) ochilish.
      for (let i = 0; i + 1 < dateRows.length; i++) {
        const close = dateRows[i].asOf;
        const open = dateRows[i + 1].asOf;
        const ck = keysByDate.get(close.getTime())!;
        const ok = keysByDate.get(open.getTime())!;
        if (ok.size === 0) continue;
        let common = 0;
        for (const k of ok) if (ck.has(k)) common += 1;
        const coverage = common / ok.size;
        if (coverage > best.coverage) best = { coverage, close, open };
      }
      closingAsOf = best.close;
      openingAsOf = openingAsOf ?? best.open;
    }
  }
  if (!openingAsOf) {
    const idx = dateRows.findIndex((d) => closingAsOf && d.asOf.getTime() === closingAsOf.getTime());
    openingAsOf = idx >= 0 ? (dateRows[idx + 1]?.asOf ?? null) : (dateRows[1]?.asOf ?? null);
  }

  const empty: DebtStatement = {
    openingAsOf: null,
    closingAsOf: null,
    availableDates,
    customers: [],
    totals: { opening: 0, accrued: 0, paid: 0, debt: 0, advance: 0 },
    byKind: [],
    hasPayments: false,
  };
  if (!closingAsOf) return empty;

  const [closing, opening] = await Promise.all([
    prisma.debtSnapshot.findMany({
      where: { asOf: closingAsOf, ...scopeWhere },
      select: {
        companyId: true, rawCustomer: true, rawContract: true,
        ownFirmName: true, debt: true, advance: true,
        company: { select: { inn: true } },
      },
    }),
    openingAsOf
      ? prisma.debtSnapshot.findMany({
          where: { asOf: openingAsOf, ...scopeWhere },
          select: { companyId: true, rawCustomer: true, rawContract: true, ownFirmName: true, debt: true, advance: true },
        })
      : Promise.resolve([]),
  ]);

  // ── DAVR ICHIDAGI TO'LOVLAR ────────────────────────────────────────────
  //
  // Ikki kesim FARQI o'z-o'zicha "hisoblanma" EMAS. U ikki narsaning
  // yig'indisi: xizmat haqi yozilgan (qarz oshadi) va pul kelgan (qarz
  // kamayadi). Ekranda faqat farqni ko'rsatish 01.08→07.08 juftligida
  // "Hisoblandi −420 mln" degan ma'nosiz raqam berardi — holbuki o'sha
  // kunlarda hisoblanma umuman bo'lmagan, faqat to'lov kelgan.
  //
  // To'lov o'z bazamizdan olinadi (1C kesimi uni ko'rsatmaydi):
  //   hisoblanma = (yopilish − ochilish) + to'lovlar
  const payments =
    openingAsOf && closingAsOf > openingAsOf
      ? await prisma.paymentAllocation.groupBy({
          by: ["paymentId"],
          where: { receivedAt: { gt: openingAsOf, lte: closingAsOf } },
          _sum: { amount: true },
        })
      : [];

  const paidByCompany = new Map<string, number>();
  if (payments.length > 0) {
    const rows = await prisma.payment.findMany({
      where: { id: { in: payments.map((p) => p.paymentId) } },
      select: { id: true, companyId: true },
    });
    const companyOf = new Map(rows.map((r) => [r.id, r.companyId]));
    for (const p of payments) {
      const cid = companyOf.get(p.paymentId);
      if (!cid) continue;
      paidByCompany.set(cid, (paidByCompany.get(cid) ?? 0) + Number(p._sum.amount ?? 0));
    }
  }

  // FIRMA HAM KALITDA — bazadagi unikal kalit bilan bir xil. Bitta mijozning
  // bir xil "Без договора" qatori har firma uchun alohida keladi va firmasiz
  // kalitda ochilish qoldig'i ikki marta qo'shilardi.
  const key = (r: { rawCustomer: string; rawContract: string | null; ownFirmName: string | null }) =>
    `${r.rawCustomer}||${r.rawContract ?? ""}||${r.ownFirmName ?? ""}`;
  const openBy = new Map(opening.map((r) => [key(r), Number(r.debt) - Number(r.advance)]));
  const closingKeys = new Set(closing.map(key));

  // ── MIJOZ BO'YICHA GURUHLASH ───────────────────────────────────────────
  // Shartnoma darajasi 251 qator beradi va uni bir ekranda o'qib bo'lmaydi.
  // Rahbarning savoli MIJOZ haqida ("bu firma bilan ahvolimiz qanday?"),
  // shartnoma esa tafsilot — u ochib ko'riladi.
  const byCustomer = new Map<string, StatementCustomer>();

  const ensure = (name: string, companyId: string | null, inn: string | null) => {
    const k = companyId ?? `raw:${name}`;
    let c = byCustomer.get(k);
    if (!c) {
      c = {
        customerName: name,
        companyId,
        companyInn: inn,
        opening: 0, accrued: 0, paid: 0, debt: 0, advance: 0,
        lines: [],
      };
      byCustomer.set(k, c);
    }
    return c;
  };

  for (const r of closing) {
    const debt = Number(r.debt);
    const advance = Number(r.advance);
    const open = openBy.get(key(r)) ?? 0;
    const contractNumber = r.rawContract ? contractNumberOf(r.rawContract) : null;
    const kind = contractKindOf(contractNumber);

    const c = ensure(r.rawCustomer, r.companyId, r.company?.inn ?? null);
    c.opening += open;
    c.debt += debt;
    c.advance += advance;
    c.lines.push({
      contractNumber,
      contractRaw: r.rawContract,
      kind,
      kindLabel: CONTRACT_KIND_LABELS[kind],
      ownFirmName: r.ownFirmName,
      opening: open,
      accrued: debt - advance - open,
      debt,
      advance,
    });
  }

  // Ochilishda bor, yopilishda YO'Q qatorlar — hisob shu davrda yopilgan.
  // Tushib qolsa varaqa jim yo'qotadi va "Boshi" jamisi manbaga to'g'ri
  // kelmaydi.
  for (const o of opening) {
    if (closingKeys.has(key(o))) continue;
    const open = Number(o.debt) - Number(o.advance);
    const contractNumber = o.rawContract ? contractNumberOf(o.rawContract) : null;
    const kind = contractKindOf(contractNumber);
    const c = ensure(o.rawCustomer, o.companyId, null);
    c.opening += open;
    c.lines.push({
      contractNumber,
      contractRaw: o.rawContract,
      kind,
      kindLabel: CONTRACT_KIND_LABELS[kind],
      ownFirmName: o.ownFirmName,
      opening: open,
      accrued: -open,
      debt: 0,
      advance: 0,
    });
  }

  // To'lovlarni bog'lab, hisoblanmani yakunlaymiz.
  for (const c of byCustomer.values()) {
    c.paid = c.companyId ? (paidByCompany.get(c.companyId) ?? 0) : 0;
    // hisoblanma = (yopilish − ochilish) + to'langan
    c.accrued = c.debt - c.advance - c.opening + c.paid;
    c.lines.sort((a, b) => b.debt - a.debt || b.opening - a.opening);
  }

  const customers = [...byCustomer.values()].sort(
    (a, b) => b.debt - a.debt || b.accrued - a.accrued
  );

  const totals = customers.reduce(
    (t, c) => ({
      opening: t.opening + c.opening,
      accrued: t.accrued + c.accrued,
      paid: t.paid + c.paid,
      debt: t.debt + c.debt,
      advance: t.advance + c.advance,
    }),
    { opening: 0, accrued: 0, paid: 0, debt: 0, advance: 0 }
  );

  const kinds = new Map<ContractKind, { count: number; debt: number; advance: number; accrued: number }>();
  for (const c of customers) {
    for (const l of c.lines) {
      const cur = kinds.get(l.kind) ?? { count: 0, debt: 0, advance: 0, accrued: 0 };
      cur.count += 1;
      cur.debt += l.debt;
      cur.advance += l.advance;
      cur.accrued += l.accrued;
      kinds.set(l.kind, cur);
    }
  }

  const order: ContractKind[] = ["BK", "RK", "unknown"];
  return serialize({
    openingAsOf: openingAsOf ? openingAsOf.toISOString() : null,
    closingAsOf: closingAsOf.toISOString(),
    availableDates,
    customers,
    totals,
    byKind: order
      .filter((k) => kinds.has(k))
      .map((k) => ({ kind: k, label: CONTRACT_KIND_LABELS[k], ...kinds.get(k)! })),
    hasPayments: totals.paid > 0,
  });
}
