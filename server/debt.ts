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
import { isAdminRole } from "@/lib/platform/permissions";
import { auth } from "@/lib/auth";
import { requireSenior } from "@/server/guards";
import { companyScopeWhere } from "@/lib/platform/access";
import { serialize } from "@/lib/serialize";
import { computeContractDebt, expectedByCompany, listDebtors, periodKeyOf } from "@/lib/debt";
import { contractNumberOf } from "@/lib/debtReport";
import { runReconciliation } from "@/lib/reconciliation";
import { recordAuditLog } from "@/lib/platform/auditTrail";
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

/**
 * MATRITSA "TO'LOV" USTUNI UCHUN — firma bo'yicha 1C QARZI.
 *
 * NEGA KERAK. Matritsadagi ustun "tushgan pul / kutilgan summa" ni
 * ko'rsatardi va tushgan pul ASRO bazasidan olinadi
 * (`PaymentAllocation` → `getPeriodPaymentStatus`). Amalda to'lovlar hali
 * tizimga kiritilmagan — bazada 16 ta taqsimot bor, 1C kesimida esa 249
 * qator (1,29 mlrd). Natijada ustun deyarli har qatorda "0 / 500,000" deb
 * turardi va ekranga qarab "kim to'lagan?" degan savolga javob topib
 * bo'lmasdi.
 *
 * Shuning uchun kesimdagi QARZ shu yerdan qo'shiladi. U to'lovni
 * ALMASHTIRMAYDI — ikkalasi turli savol:
 *   tushgan pul — shu oyda bizga kelgan summa (ASRO yozuvi);
 *   1C qarzi    — o'tgan oylar bilan birga jamg'arilgan qoldiq (fayl).
 *
 * KESIM TANLASH: davr oxiridan keyingi kunga eng yaqin kesim, ya'ni
 * `asOf <= keyingi oyning 1-kuni`. 2026-07 uchun bu 01.08 fayli — 1C shu
 * kunda iyul xizmat haqini yozib bo'lgan (qarang `31.07` va `01.08`
 * juftligi, `getDebtStatement` izohi).
 *
 * YARIM QAMROVLI KESIM O'TKAZIB YUBORILADI. Bazada 07.08 kesimi bor va u
 * eski importerdan kelgan — 249 qator o'rniga 131, ya'ni mijozlarning
 * yarmi. "Eng yangisini ol" qoidasi avgust ekranida aynan shuni tanlardi
 * va 194 firmadan 60 tasigina qarz bilan chiqardi; qolganlari "kesimda
 * yo'q" bo'lib ko'rinardi — holbuki qarzi bor edi. Shuning uchun eng
 * yangisi emas, TO'LIQLARNING eng yangisi olinadi (eng katta qamrovning
 * 80% idan kam bo'lmagani). Xuddi shu muammo `getDebtStatement` da ham
 * bor va u ham qamrov bo'yicha tanlaydi.
 *
 * QAMROV: HAR BIR XODIM, lekin FAQAT O'Z BIRIKTIRILGAN FIRMALARI bo'yicha
 * (`companyScopeWhere`) — matritsada u allaqachon shu firmalarni ko'radi.
 *
 * Nega senior emas (2026-09-07 da ataylab o'zgartirildi): xodim o'zi
 * yuritayotgan firma to'lovni qilmagan bo'lsa ham oyligini oladi va buni
 * KO'RIB TURISHI kerak — shunda u pulni undirishga o'zi ham harakat qiladi.
 * Bu qarzdorlik ekranini ochish EMAS: xodim boshqa firmaning qarzini ham,
 * umumiy jamini ham ko'rmaydi, faqat o'z qatoridagi raqamni ko'radi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SHU OYDA TUSHGAN PUL — IKKI KESIMDAN CHIQARILADI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1C kesim hisoboti to'lovni KO'RSATMAYDI (2026-09-07 da 01.09 fayli
 * o'lchandi: "Продано/Оплачено" ustunlari bor, lekin hammasi NOL). ASRO
 * bazasida esa to'lovlar deyarli kiritilmagan — 16 ta taqsimot. Shuning
 * uchun matritsadagi ustun har qatorda "0 / 5,000,000" deb turardi va
 * "kim to'ladi?" savoliga javob bermasdi.
 *
 * Javob ikki kesim orasidagi harakatdan chiqadi:
 *
 *     tushgan pul = ochilish qoldig'i + shu oy hisoblanmasi − yopilish qoldig'i
 *
 * Qoldiq SOF olinadi (qarz − avans): ortiqcha to'lov keyingi oyga avans
 * bo'lib o'tadi va identifikatsiya o'z-o'zidan to'g'ri ishlaydi.
 * Hisoblanma sifatida shartnoma oylik summasi olinadi
 * (`expectedByCompany` — ustundagi "kutilgan" bilan AYNAN bir raqam).
 *
 * TAXMIN QILINMAYDIGAN HOLATLAR `null` qaytaradi:
 *   - firma ikkala kesimning birida yo'q (qamrov to'liq emas);
 *   - natija manfiy — demak 1C dagi hisoblanma shartnoma summasidan katta
 *     (bir martalik РК ishi, tuzatma). Prodda 176 firmadan 12 tasi shunday.
 * Ular ekranda "—" bo'lib turadi.
 */
export interface PeriodDebtByCompany {
  /** Yopilish kesimi (ISO) — ekranda ko'rsatiladi, taxmin qolmasin. */
  asOf: string | null;
  /** Ochilish kesimi — shu oyda tushgan pulni chiqarish uchun ishlatilgani. */
  openingAsOf: string | null;
  byCompany: Record<
    string,
    {
      debt: number;
      advance: number;
      /**
       * SHU OYDA TUSHGAN PUL — ikki kesim va oylik summadan chiqarilgan
       * (pastdagi izohga qarang). `null` = chiqarib bo'lmadi (firma ikkala
       * kesimda ham yo'q yoki natija manfiy) — ekranda "—" bo'lib turadi,
       * NOL EMAS: "to'lamadi" bilan "bilmayman" bir xil ko'rinmasin.
       */
      collected: number | null;
    }
  >;
}

export async function getPeriodDebtByCompany(period: string): Promise<PeriodDebtByCompany> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const actor = { userId: session.user.id as string, role: session.user.role as string };
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Davr formati noto'g'ri (YYYY-MM)");

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

  // Davrdan KEYINGI oyning 1-kuni — shu sanagacha bo'lgan eng yangi kesim.
  const [y, m] = period.split("-").map(Number);
  const nextMonthStart = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));

  // Nomzod kesimlar va ularning qamrovi (nechta firma bog'langan).
  const coverage = await prisma.debtSnapshot.groupBy({
    by: ["asOf"],
    where: { asOf: { lte: nextMonthStart }, companyId: { not: null }, ...scopeWhere },
    _count: { companyId: true },
  });
  if (coverage.length === 0) return { asOf: null, openingAsOf: null, byCompany: {} };

  const maxCount = Math.max(...coverage.map((c) => c._count.companyId));
  const full = coverage
    .filter((c) => c._count.companyId >= maxCount * 0.8)
    .sort((a, b) => b.asOf.getTime() - a.asOf.getTime());
  const chosen = full[0];

  // ── TO'LOV UCHUN JUFTLIK — DAVRGA QAT'IY BOG'LANGAN ────────────────────
  //
  // Yopilish kesimi SHU OYNING oxiriga tegishli bo'lishi shart
  // (oy boshidan keyin, keyingi oy boshigacha), ochilish esa oy boshigacha.
  // Busiz sentabr matritsasida AVGUST to'lovi ko'rinardi: sentabr uchun
  // eng yangi kesim 01.09 edi va u aslida avgustning yopilishi.
  //
  // Juftlik topilmasa `collected` NULL bo'lib qoladi — joriy oy uchun
  // shunday bo'ladi va bo'lishi ham kerak: oy tugamagan, 1C keyingi kesimni
  // hali bermagan. "Bilmayman" ni nol qilib ko'rsatish har firmani
  // "to'lamadi" deb ayblardi.
  //
  // Yarim qamrovli kesim ikkala tomonda ham ishlatilmaydi (`full` ro'yxati).
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  // Chegara kesimi oy CHETIDA turishi kerak. 1C ni odatda keyingi oyning
  // 1-kunida oladi, lekin 31-sanada olingan fayl ham uchraydi — shuning
  // uchun ikki kunlik bag'rikenglik. Oy O'RTASIDAGI kesim (07.08 kabi)
  // chegara bo'la olmaydi: undan chiqarilgan raqam "oy bo'yicha tushgan
  // pul" emas, yarim oyniki bo'lardi.
  const EDGE_MS = 2 * 24 * 60 * 60 * 1000;
  const nearEdge = (asOf: Date, edge: Date) =>
    asOf <= edge && edge.getTime() - asOf.getTime() <= EDGE_MS;
  const closingForPeriod = full.find((c) => nearEdge(c.asOf, nextMonthStart)) ?? null;
  const openingSnapshot = closingForPeriod
    ? (full.find((c) => nearEdge(c.asOf, monthStart)) ?? null)
    : null;

  const [rows, openingRows, expected] = await Promise.all([
    prisma.debtSnapshot.findMany({
      where: { asOf: chosen.asOf, companyId: { not: null }, ...scopeWhere },
      select: { companyId: true, debt: true, advance: true },
    }),
    openingSnapshot && closingForPeriod
      ? prisma.debtSnapshot.findMany({
          where: {
            asOf: { in: [openingSnapshot.asOf, closingForPeriod.asOf] },
            companyId: { not: null },
            ...scopeWhere,
          },
          select: { companyId: true, asOf: true, debt: true, advance: true },
        })
      : Promise.resolve([]),
    expectedByCompany(prisma, period),
  ]);

  // Bitta firmada bir necha shartnoma qatori bo'ladi — ular QO'SHILADI.
  // Qarz va avans ALOHIDA yig'iladi: bitta mijozda bir shartnomada qarz,
  // boshqasida avans bo'lishi mumkin va ularni bitta raqamga qo'shish
  // ikkalasini ham yashirardi.
  const byCompany: Record<string, { debt: number; advance: number; collected: number | null }> = {};
  for (const r of rows) {
    const cid = r.companyId as string;
    const prev = byCompany[cid] ?? { debt: 0, advance: 0, collected: null };
    byCompany[cid] = {
      debt: prev.debt + Number(r.debt),
      advance: prev.advance + Number(r.advance),
      collected: null,
    };
  }

  // SOF qoldiq (qarz − avans) — ochilish va yopilish bo'yicha alohida.
  // Yopilish `byCompany` dan OLINMAYDI: u eng yangi kesimdan chizilgan va
  // davr yopilishi bilan bir xil bo'lmasligi mumkin.
  const netAt = (when: Date) => {
    const out = new Map<string, number>();
    for (const r of openingRows) {
      if (r.asOf.getTime() !== when.getTime()) continue;
      const cid = r.companyId as string;
      out.set(cid, (out.get(cid) ?? 0) + Number(r.debt) - Number(r.advance));
    }
    return out;
  };

  if (openingSnapshot && closingForPeriod) {
    const opening = netAt(openingSnapshot.asOf);
    const closing = netAt(closingForPeriod.asOf);
    for (const [cid, v] of Object.entries(byCompany)) {
      const o = opening.get(cid);
      const c = closing.get(cid);
      if (o === undefined || c === undefined) continue; // qamrovda yo'q — taxmin qilinmaydi
      const collected = o + (expected.get(cid) ?? 0) - c;
      // Manfiy = 1C dagi hisoblanma shartnoma summasidan katta (РК ishi,
      // tuzatma). Nolga yaxlitlash SOXTA "to'lamadi" bo'lardi — `null` qoladi.
      v.collected = collected < -1 ? null : Math.max(0, collected);
    }
  }

  return serialize({
    asOf: chosen.asOf.toISOString(),
    openingAsOf: openingSnapshot ? openingSnapshot.asOf.toISOString() : null,
    byCompany,
  });
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

// ── 1C BO'YICHA TO'LAGAN, ASRODA TAQSIMLANMAGAN (Faza 3.5) ──────────────
//
// Ikki haqiqat yonma-yon:
//   1C   — kesimlar farqidan chiqarilgan "shu oyda tushgan pul" (`collected`)
//   ASRO — o'sha oydagi `PaymentAllocation` yig'indisi
//
// Farq ikki xil sababdan chiqadi va ikkalasi ham harakat talab qiladi:
// to'lov vipiskaga tushgan-u navbatda bog'lanmay qolgan, YOKI umuman
// import qilinmagan. Bu ro'yxatsiz farq faqat umumiy raqamda ko'rinardi
// ("qamrov 62,8%") va qaysi firma ekani noma'lum qolardi.
//
// YANGI EKRAN EMAS: `/kassa/kirim?tab=navbat` ostidagi jadval.

export interface UnallocatedIncomeRow {
  companyId: string;
  companyName: string;
  inn: string;
  /** 1C kesimlaridan chiqarilgan — shu oyda firma to'lagan pul. */
  collected: number;
  /** ASROda shu davrga taqsimlangan (`PaymentAllocation`) yig'indisi. */
  allocated: number;
  /** `collected − allocated` — har doim musbat (faqat kamomad ko'rsatiladi). */
  gap: number;
}

export interface UnallocatedIncomeReport {
  /** Qaysi 1C kesimlari ishlatilgani — ekranda ko'rsatiladi, taxmin qolmasin. */
  asOf: string | null;
  openingAsOf: string | null;
  rows: UnallocatedIncomeRow[];
  totalGap: number;
}

/**
 * MAYDA FARQ CHEGARASI.
 *
 * 1C kesimi butun so'mgacha yaxlitlangan, ASRO esa tiyin bilan ishlaydi;
 * bundan tashqari `collected` ikki kesim AYIRMASIDAN chiqariladi, ya'ni
 * har ikkalasining yaxlitlash xatosi qo'shiladi. Chegarasiz ro'yxat bir
 * necha yuz so'mlik "kamomad" bilan to'lib ketardi va haqiqiy bo'shliqlar
 * ular orasida ko'rinmay qolardi.
 */
const GAP_THRESHOLD = 1000;

export async function getUnallocatedVsDebt(period: string): Promise<UnallocatedIncomeReport> {
  // `getPeriodDebtByCompany` o'zi `auth()` va biriktiruv doirasini qo'llaydi —
  // bu yerda takrorlanmaydi, aks holda ikki xil doira paydo bo'lardi.
  const snapshot = await getPeriodDebtByCompany(period);

  const companyIds = Object.entries(snapshot.byCompany)
    .filter(([, v]) => (v.collected ?? 0) > 0)
    .map(([id]) => id);
  if (companyIds.length === 0) {
    return { asOf: snapshot.asOf, openingAsOf: snapshot.openingAsOf, rows: [], totalGap: 0 };
  }

  const [companies, payments] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true, inn: true },
    }),
    // Soft-delete qilingan to'lov hisobga OLINMAYDI: u bekor qilingan, ya'ni
    // pul taqsimlanmagan holatga qaytgan.
    prisma.payment.findMany({
      where: { period, deletedAt: null, companyId: { in: companyIds } },
      select: { companyId: true, allocations: { select: { amount: true } } },
    }),
  ]);

  const allocatedBy = new Map<string, number>();
  for (const p of payments) {
    const sum = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
    allocatedBy.set(p.companyId, (allocatedBy.get(p.companyId) ?? 0) + sum);
  }
  const nameBy = new Map(companies.map((c) => [c.id, c]));

  const rows: UnallocatedIncomeRow[] = [];
  for (const id of companyIds) {
    const company = nameBy.get(id);
    if (!company) continue; // doiradan tashqaridagi firma — ko'rsatilmaydi
    const collected = snapshot.byCompany[id].collected ?? 0;
    const allocated = allocatedBy.get(id) ?? 0;
    const gap = collected - allocated;
    if (gap < GAP_THRESHOLD) continue;
    rows.push({
      companyId: id,
      companyName: company.name,
      inn: company.inn,
      collected,
      allocated,
      gap,
    });
  }
  rows.sort((a, b) => b.gap - a.gap);

  return {
    asOf: snapshot.asOf,
    openingAsOf: snapshot.openingAsOf,
    rows,
    totalGap: rows.reduce((s, r) => s + r.gap, 0),
  };
}
