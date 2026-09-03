// =====================================================
// DOUBLE-ENTRY LEDGER yadrosi
// =====================================================
// Har bir moliyaviy harakat ikki tomonlama yoziladi: Σdebit == Σcredit.
// Ledger APPEND-ONLY: update/delete yo'q; tuzatish faqat reversal orqali.
// Bu modul sof validatsiya + tranzaksiya ichida yozish helperlari — chaqiruvchi
// server action o'z auditini (recordAuditLog) o'zi yozadi.
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

/** Hisoblar rejasi (soddalashtirilgan boshqaruv hisobi). */
export const ACCOUNTS = {
  CASH: "CASH", // kassa (aktiv)
  CONTRACT_INCOME: "CONTRACT_INCOME", // firma shartnoma to'lovlari (daromad)
  KASSA_INCOME: "KASSA_INCOME", // boshqa kassa kirimlari (daromad)
  OPERATING_EXPENSE: "OPERATING_EXPENSE", // operatsion xarajatlar
  SALARY_EXPENSE: "SALARY_EXPENSE", // oylik/avans to'lovlari
  /**
   * Ta'sischiga taqsimot — foydadan olingan pul, xarajat EMAS.
   *
   * Nega alohida: 2026-08 da "Otabek akaga" toifasi bilan 321 508 320 so'm
   * chiqqan va u operatsion xarajat bo'lib turardi. Bu foyda tahlirini
   * buzadi — korxona 321 mln zarar ko'rgandek ko'rinadi, holbuki o'sha pul
   * ta'sischiga taqsimlangan foyda. Pul haqiqatan chiqqani uchun CASH oyog'i
   * o'zgarmaydi; faqat qarama-qarshi hisob boshqacha.
   */
  OWNER_DISTRIBUTION: "OWNER_DISTRIBUTION",
  /**
   * Berilgan moliyaviy yordam — AKTIV, xarajat emas.
   *
   * Pul chiqadi, lekin u yo'qolmaydi: kontragent qaytarishi kerak. Uni
   * xarajat deb yozish foydani asossiz kamaytiradi. Qaytganda shu hisob
   * kreditlanadi va nolga qaytadi.
   */
  LOAN_GIVEN: "LOAN_GIVEN",
  /**
   * Olingan moliyaviy yordam — PASSIV (majburiyat), daromad emas.
   *
   * Pul kiradi, lekin u bizniki emas: qaytarishimiz kerak. Uni daromad deb
   * yozish foydani asossiz oshiradi.
   */
  LOAN_RECEIVED: "LOAN_RECEIVED",
  /**
   * OCHILISH QOLDIG'I — kapital tomonidagi qarama-qarshi hisob.
   *
   * Jurnal 2026-08 dan boshlanadi (`clean-start-2026-08`), lekin biznes undan
   * oldin ham ishlagan. Aprelda berilgan moliyaviy yordam avgustda QAYTGANDA
   * jurnalga faqat qaytish oyog'i tushadi va `LOAN_GIVEN` — aktiv hisob —
   * MANFIY qoldiqqa o'tadi. Prodda aynan shunday bo'ldi: Khorezm Golden
   * Building bo'yicha 55 mln berilgan, 125 mln qaytgan, netto -70 mln.
   *
   * Bu xato emas — yozuvlar hujjatga mos. Yetishmagani davr boshidagi
   * qoldiq. Shu hisob o'sha qoldiqni kiritish uchun: u daromad ham, xarajat
   * ham emas, shuning uchun foyda hisobiga tegmaydi.
   */
  OPENING_BALANCE: "OPENING_BALANCE",
  /**
   * HISOBLANGAN OYLIK — PASSIV (xodimlar oldidagi majburiyat).
   *
   * Oylik ilgari SOF KASSA usulida yozilardi: to'lov paytida
   * `SALARY_EXPENSE` debet / `CASH` kredit. Bunda P&L dagi oylik xarajati
   * o'sha oyda QANCHA TO'LANGANIGA teng bo'lardi, qancha HISOBLANGANIGA
   * emas — ya'ni to'lov kechikkan oy arzon, ikki oylik birga to'langan oy
   * qimmat ko'rinardi.
   *
   * Accrual usulida ikki yozuv ajraladi:
   *   hisoblash (oy oxiri) : SALARY_EXPENSE    debet / ACCRUED_SALARIES kredit
   *   to'lov               : ACCRUED_SALARIES  debet / CASH             kredit
   *
   * Qoldiq = to'lanmagan oylik. MANFIY qoldiq ham ma'noli: hisoblangandan
   * ko'p to'langan (avans yoki oldingi oy qoldig'i).
   */
  ACCRUED_SALARIES: "ACCRUED_SALARIES",
} as const;

export type AccountId = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];

/**
 * Har bir hisob qanday O'LCHOV talab qiladi.
 *
 * Nima uchun spetsifikatsiya, chaqiruvchi bergan qiymat emas: polimorf
 * `subjectType` ning yagona real xavfi — erkin satr, ya'ni bitta yozuv xatosi
 * ("company" o'rniga "Company") ko'rinmas ikkinchi chelak yaratadi va qoldiq
 * jimgina ikkiga bo'linadi. Shuning uchun chaqiruvchi FAQAT `subjectId` beradi,
 * `subjectType` ni `postLedger` shu jadvaldan yozadi.
 *
 *   channel: "required"  — CASH oyog'i qaysi hisobda ekani ko'rsatilishi shart
 *            "forbidden" — kanal ma'nosiz (daromad/xarajat hisoblari)
 *   subject: null        — kontragent yo'q
 *            "company" / "user" — majburiy
 *            "*_optional"       — berilsa yoziladi, berilmasa ham bo'ladi
 */
export const ACCOUNT_SPEC: Record<
  AccountId,
  {
    channel: "required" | "optional" | "forbidden";
    subject: null | "company" | "user" | "company_optional" | "user_optional";
  }
> = {
  // CASH hozircha "optional", "required" EMAS. Sabab: `createPayout` va
  // `upsertPayment` pul qaysi hisobdan chiqqanini hali bilmaydi (ularda faqat
  // `paymentMethod` bor). Uni bugun majburiy qilish o'sha yo'llarni darhol
  // yiqitardi — ya'ni qoidani joriy qilish uchun oldin ma'lumot kerak.
  // Faza 2 da (kanal backfilli tugagach) bu bitta so'z "required" ga o'zgaradi
  // va o'sha paytdan boshlab kanalsiz CASH yozuvi umuman yozilmaydi.
  CASH: { channel: "optional", subject: null },
  // Ochilish qoldig'i - kanal ham, kontragent ham ma'nosiz: u qarama-qarshi
  // oyoq, pul harakati emas.
  OPENING_BALANCE: { channel: "forbidden", subject: null },
  // Kanal yo'q (pul oyog'i emas), xodim esa berilsa yoziladi: oylik
  // majburiyati odatda jami summa bilan kiritiladi, xodim kesimi esa
  // `MonthlyPerformance` da.
  ACCRUED_SALARIES: { channel: "forbidden", subject: "user_optional" },
  CONTRACT_INCOME: { channel: "forbidden", subject: "company_optional" },
  KASSA_INCOME: { channel: "forbidden", subject: null },
  OPERATING_EXPENSE: { channel: "forbidden", subject: null },
  SALARY_EXPENSE: { channel: "forbidden", subject: "user_optional" },
  // Kimga taqsimlangani ko'rsatilsa yoziladi; majburiy emas, chunki
  // Excel daftarida faqat "Otabek akaga" degan matn bor.
  OWNER_DISTRIBUTION: { channel: "forbidden", subject: "user_optional" },
  // Kontragent JUDA KERAK ("kimga berdik / kimdan oldik"), lekin MAJBURIY
  // emas: qarz beriladigan tomon har doim ham `Company` jadvalida bo'lmaydi
  // (masalan "Khorezm Golden Building", STIR 203147569 — vipiskada bor,
  // reyestrda yo'q). Majburiy qilinsa, yozuv umuman yozilmay qolardi va pul
  // jurnaldan tushib qolardi. Kontragent topilmasa, uning nomi va STIRi
  // izohga yoziladi.
  LOAN_GIVEN: { channel: "forbidden", subject: "company_optional" },
  LOAN_RECEIVED: { channel: "forbidden", subject: "company_optional" },
};

export interface LedgerLeg {
  accountId: AccountId;
  debit?: number;
  credit?: number;
  description?: string;
  /** CASH oyoqlari uchun MAJBURIY: pul qaysi hisobda/kartada. */
  channelId?: string | null;
  /** Kontragent id. Turi `ACCOUNT_SPEC` dan olinadi, chaqiruvchidan emas. */
  subjectId?: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sof validatsiya: har oyoq faqat debit YOKI credit (musbat), va jami
 * Σdebit == Σcredit (2 kasr aniqlikda). Buzilsa — xato, hech narsa yozilmaydi.
 */
export function assertBalancedLegs(legs: LedgerLeg[]): void {
  if (legs.length < 2) throw new Error("Ledger tranzaksiyasi kamida 2 oyoqdan iborat bo'lishi kerak");
  let debit = 0;
  let credit = 0;
  for (const leg of legs) {
    const d = leg.debit ?? 0;
    const c = leg.credit ?? 0;
    if (d < 0 || c < 0) throw new Error("Ledger oyog'ida manfiy summa bo'lishi mumkin emas");
    if ((d > 0) === (c > 0)) {
      throw new Error("Har bir ledger oyog'i faqat debit YOKI credit bo'lishi kerak");
    }
    debit += d;
    credit += c;
  }
  if (r2(debit) !== r2(credit)) {
    throw new Error(`Ledger balanslashmagan: debit ${r2(debit)} != credit ${r2(credit)}`);
  }
}

/**
 * O'lchov qoidalari (`ACCOUNT_SPEC`) bajarilganini tekshiradi. SOF — CI uni
 * `lib/ledger.spec.ts` orqali DB'siz yuritadi (CI integratsiya testlarini
 * umuman yuritmaydi, shuning uchun sof bo'la oladigan qoida sof bo'lishi kerak).
 */
export function assertLegDimensions(legs: LedgerLeg[]): void {
  for (const leg of legs) {
    const spec = ACCOUNT_SPEC[leg.accountId];
    if (!spec) throw new Error(`Noma'lum hisob: ${leg.accountId}`);

    const channel = leg.channelId ?? null;
    if (spec.channel === "required" && !channel) {
      throw new Error(
        `${leg.accountId} oyog'ida kanal ko'rsatilishi shart — pul qaysi hisobda/kartada ekani aniq bo'lsin`
      );
    }
    if (spec.channel === "forbidden" && channel) {
      throw new Error(`${leg.accountId} hisobida kanal bo'lmaydi`);
    }

    const subject = leg.subjectId ?? null;
    if (spec.subject === null && subject) {
      throw new Error(`${leg.accountId} hisobida kontragent bo'lmaydi`);
    }
    if ((spec.subject === "company" || spec.subject === "user") && !subject) {
      throw new Error(`${leg.accountId} oyog'ida kontragent ko'rsatilishi shart`);
    }
  }
}

/** `ACCOUNT_SPEC` bo'yicha kontragent turi — chaqiruvchi bera olmaydi. */
function subjectTypeOf(accountId: AccountId, subjectId: string | null): string | null {
  if (!subjectId) return null;
  const spec = ACCOUNT_SPEC[accountId];
  if (!spec || spec.subject === null) return null;
  return spec.subject.startsWith("company") ? "company" : "user";
}

export interface PostLedgerInput {
  legs: LedgerLeg[];
  period: string; // "YYYY-MM"
  sourceTable: string; // Expense | KassaEntry | Payment | Payout
  sourceId: string;
  createdBy?: string | null;
  description?: string;
}

type Db = Prisma.TransactionClient;

/**
 * Ikki tomonlama yozuvni bitta transactionId ostida yozadi.
 * Tranzaksiya (tx) ichida chaqirilsin — asosiy yozuv bilan atomar bo'lsin.
 *
 * DUBLIKAT POSTNI IMKONSIZ QILADI: yozishdan oldin shu manba bo'yicha netto
 * nolligini tekshiradi. Ilgari ikki marta post qilingan qator faqat oy
 * yopishda (`checkLedgerSourceIntegrity`) TOPILARDI; endi u umuman yozilmaydi.
 * Mavjud qayta-post oqimi buzilmaydi: `upsertPayment` avval `reverseLedger`
 * chaqiradi, ya'ni netto nolga tushgan bo'ladi.
 */
export async function postLedger(db: Db, input: PostLedgerInput): Promise<string> {
  assertBalancedLegs(input.legs);
  assertLegDimensions(input.legs);
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new Error("Ledger davri YYYY-MM formatida bo'lishi kerak");
  }

  const open = await netBySource(db, input.sourceTable, input.sourceId);
  if (open.size > 0) {
    throw new Error(
      `${input.sourceTable}/${input.sourceId} uchun jurnalda yopilmagan yozuv bor — ` +
        `avval reverseLedger chaqirilsin (dublikat post bloklandi)`
    );
  }

  const transactionId = randomUUID();
  await db.ledgerEntry.createMany({
    data: input.legs.map((leg) => ({
      transactionId,
      accountId: leg.accountId,
      debit: new Prisma.Decimal(r2(leg.debit ?? 0)),
      credit: new Prisma.Decimal(r2(leg.credit ?? 0)),
      description: leg.description ?? input.description ?? null,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
      period: input.period,
      createdBy: input.createdBy ?? null,
      channelId: leg.channelId ?? null,
      subjectType: subjectTypeOf(leg.accountId, leg.subjectId ?? null),
      subjectId: leg.subjectId ?? null,
    })),
  });
  return transactionId;
}

/** Netto kaliti — hisob VA uning barcha o'lchovlari. */
interface Dimensions {
  accountId: string;
  channelId: string | null;
  subjectType: string | null;
  subjectId: string | null;
}

// `\u0000` ajratgich: id larda uchramaydi, shuning uchun kalit noaniq bo'lmaydi.
const dimKey = (d: Dimensions) =>
  `${d.accountId}\u0000${d.channelId ?? ""}\u0000${d.subjectType ?? ""}\u0000${d.subjectId ?? ""}`;

/** Manba bo'yicha hali yopilmagan netto — o'lchovlar kesimida. */
async function netBySource(
  db: Db,
  sourceTable: string,
  sourceId: string
): Promise<Map<string, { dims: Dimensions; net: number; period: string }>> {
  const reversalTable = `${sourceTable}-reversal`;
  const rows = await db.ledgerEntry.findMany({
    where: { sourceId, sourceTable: { in: [sourceTable, reversalTable] } },
    select: {
      accountId: true,
      debit: true,
      credit: true,
      period: true,
      channelId: true,
      subjectType: true,
      subjectId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const net = new Map<string, { dims: Dimensions; net: number; period: string }>();
  for (const e of rows) {
    const dims: Dimensions = {
      accountId: e.accountId,
      channelId: e.channelId,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
    };
    const key = dimKey(dims);
    const prev = net.get(key);
    const value = r2((prev?.net ?? 0) + Number(e.debit) - Number(e.credit));
    net.set(key, { dims, net: value, period: prev?.period ?? e.period });
  }

  // Netto nolga tushgan o'lchovlar qoldirilmaydi.
  for (const [key, v] of net) if (v.net === 0) net.delete(key);
  return net;
}

/**
 * Manba yozuvi bekor qilinganda (soft delete / status orqaga qaytishi) uning
 * ledger izini TESKARI yozuv bilan nolga keltiradi. NETTO bo'yicha ishlaydi:
 * post→reverse→post→reverse sikllari necha marta bo'lsa ham, har chaqiruv
 * faqat hali yopilmagan qoldiqni teskarilaydi (netto nol bo'lsa — hech narsa
 * yozmaydi, null). Reversal ham append-only — asl qatorlar tegilmaydi.
 *
 * NETTO TO'LIQ KORTEJ BO'YICHA. Faqat `accountId` bo'yicha guruhlash yangi
 * model bilan JIMGINA BUZILARDI: kanal o'tkazmasida ikkala oyoq ham `CASH`
 * bo'lgani uchun netto nol chiqar va HECH NARSA teskarilanmasdi — manba
 * o'chirilgan bo'lsa ham pul kanal kesimida abadiy kartada qolib ketardi.
 *
 * Tarixiy qatorlarga TA'SIR QILMAYDI: ularda uchala o'lchov ham NULL, ya'ni
 * kalit `(accountId, null, null, null)` — bugungi `accountId` kaliti bilan
 * aynan bir xil natija beradi.
 */
export async function reverseLedger(
  db: Db,
  params: { sourceTable: string; sourceId: string; createdBy?: string | null; reason?: string }
): Promise<string | null> {
  const net = await netBySource(db, params.sourceTable, params.sourceId);
  if (net.size === 0) return null; // hech narsa yo'q yoki netto allaqachon nol

  // TESKARI YOZUV HAM MUVOZANATLI BO'LISHI SHART.
  //
  // Bu invariant matematik jihatdan o'z-o'zidan kelib chiqadi (barcha
  // o'lchovlar bo'yicha nettolar yig'indisi manbaning netto debit−krediti,
  // ya'ni nol), LEKIN u faqat manbaning O'ZI muvozanatli bo'lganda to'g'ri.
  // Prod jurnalida 95 ta BITTA OYOQLI tranzaksiya topildi — ularning
  // aksariyati `*-reversal`, ya'ni allaqachon nosoz manbani teskarilash
  // nosozlikni KO'PAYTIRIB yuborgan va sinov balansi (Σdebit = Σcredit) 20,5
  // mln so'mga og'ib qolgan. `postLedger` bunday yozuvni yozdirmaydi;
  // `reverseLedger` esa tekshirmasdi — ya'ni ikki yozuv yo'lidan bittasida
  // qo'riqchi yo'q edi.
  //
  // Endi ikkalasida ham bor: muvozanatsiz teskari yozuv YOZILMAYDI, xato
  // esa o'zidan oldingi buzilishni ko'rsatadi.
  const legs: LedgerLeg[] = [...net.values()].map(({ dims, net: value }) => ({
    accountId: dims.accountId as AccountId,
    ...(value < 0 ? { debit: -value } : { credit: value }),
  }));
  try {
    assertBalancedLegs(legs);
  } catch (e) {
    throw new Error(
      `${params.sourceTable}/${params.sourceId} teskarilanmadi: manbaning jurnal izi ` +
        `muvozanatsiz (${(e as Error).message}). Avval o'sha yozuvni tuzating — ` +
        `teskari yozuv nosozlikni ikkilantiradi.`
    );
  }

  const transactionId = randomUUID();
  await db.ledgerEntry.createMany({
    data: [...net.values()].map(({ dims, net: value, period }) => ({
      transactionId,
      accountId: dims.accountId,
      debit: new Prisma.Decimal(value < 0 ? -value : 0),
      credit: new Prisma.Decimal(value > 0 ? value : 0),
      description: `REVERSAL${params.reason ? `: ${params.reason}` : ""}`,
      sourceTable: `${params.sourceTable}-reversal`,
      sourceId: params.sourceId,
      period,
      createdBy: params.createdBy ?? null,
      channelId: dims.channelId,
      subjectType: dims.subjectType,
      subjectId: dims.subjectId,
    })),
  });
  return transactionId;
}

/**
 * Sinov balansi: har bir hisob bo'yicha Σdebit va Σcredit.
 * Σdebit == Σcredit bo'lishi shart (double-entry invariant).
 * period: "YYYY-MM" — aynan shu oy; "YYYY" — butun yil; berilmasa — butun jurnal.
 *
 * O'LCHOVLAR BU YERDA GURUHLANMAYDI — sinov balansi ~9 qatorlik hisobot bo'lib
 * qolishi kerak. Kesimlar uchun `getCashByChannel` / `getSubjectBalances`.
 */
export async function getTrialBalance(db: Db, period?: string) {
  const where =
    period === undefined
      ? {}
      : period.length === 4
        ? { period: { startsWith: `${period}-` } }
        : { period };
  const rows = await db.ledgerEntry.groupBy({
    by: ["accountId"],
    where,
    _sum: { debit: true, credit: true },
  });
  const accounts = rows.map((r) => ({
    accountId: r.accountId,
    debit: Number(r._sum.debit ?? 0),
    credit: Number(r._sum.credit ?? 0),
  }));
  const totalDebit = r2(accounts.reduce((s, a) => s + a.debit, 0));
  const totalCredit = r2(accounts.reduce((s, a) => s + a.credit, 0));
  return { accounts, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

/**
 * CASH hisobining ledger bo'yicha qoldig'i (debit − credit).
 *
 * `throughPeriod` ("YYYY-MM") berilsa — SHU DAVR OXIRIGA bo'lgan qoldiq.
 * Oy yopishda aynan shu kerak: 2026-07 ni yopayotganda 2026-09 dagi xarajat
 * to'sqinlik qilmasligi kerak. Busiz o'tgan oyni yopish keyingi oylardagi
 * harakatlarga bog'lanib qolardi — ya'ni bir marta minusga tushgan kassa
 * butun tarixni qulflab qo'yardi.
 *
 * Davrsiz chaqirilsa — butun tarix bo'yicha (backfill hisobotlari uchun).
 * "YYYY-MM" formatida leksikografik tartib xronologik tartib bilan bir xil,
 * shuning uchun oddiy `lte` yetarli va `@@index([accountId, period])` ishlaydi.
 *
 * `channelId` berilsa — FAQAT o'sha hisob/karta qoldig'i.
 */
/**
 * MANBA ↔ JURNAL TAFOVUTIGA YO'L QO'YILADIGAN CHEGARA.
 *
 * TARIX. Ilgari 2 000 000 edi — ikkita sabab uni yashirib turardi:
 *
 *   1. SHIRIN SUPER TAOM / 2026-07 — bitta to'lovning ikkita allocation'idan
 *      biri (2 mln) `postLedger` kodidan OLDIN kirgan va jurnalga tushmagan
 *      edi (docs/BALANS_ASOSLASH.md, 5-bo'lim). Ma'lumot darajasida
 *      tuzatilgan — bu qator endi mavjud emas (2026-09-03 da lokal va
 *      prodda tasdiqlangan).
 *   2. Moliyaviy yordam (LOAN_GIVEN/LOAN_RECEIVED) CASH harakati
 *      `getAvailableBalance`/`computeCloseFigures` formulalarida umuman
 *      hisobga olinmasdi — prodda doimiy 65 mln farq berardi. Kod
 *      darajasida tuzatildi (`lib/balance.ts` `loanCashMovement`).
 *
 * Ikkalasi ham yopilgach, prodning haqiqiy farqi 0 ga tushdi (tasdiqlangan,
 * 2026-09-03: 391 445 040,81 = 391 445 040,81).
 *
 * BU RAQAM O'SMASLIGI KERAK. O'sdi degani — yangi qisman post, jurnalga
 * tushmagan harakat yoki balans formulasida yana bir bo'shliq paydo bo'ldi.
 * Chegarani kattalashtirmang, sababini toping (ikkitasi yuqorida — namuna).
 *
 * ESLATMA: lokal dev bazasida (`inbola`) mustaqil, past ustuvorlikdagi
 * qoldiq drift bo'lishi mumkin (2026-08 qayta bazalashning izi — R-02,
 * master reja). Bu chegara endi uni ham to'g'ri ko'rsatadi: mahsulot
 * kodining emas, ma'lumot sifatining nuqsoni sifatida.
 */
export const LEDGER_DRIFT_TOLERANCE = 0.01;

export async function getLedgerCashBalance(
  db: Db,
  throughPeriod?: string,
  opts: { channelId?: string; fromPeriod?: string } = {}
): Promise<number> {
  const agg = await db.ledgerEntry.aggregate({
    where: {
      accountId: ACCOUNTS.CASH,
      ...(throughPeriod ? { period: { lte: throughPeriod } } : {}),
      // KASSA START: loyiha ishga tushishidan oldingi harakatlar hisobga
      // kirmaydi (lib/constants.ts KASSA_START_PERIOD).
      ...(opts.fromPeriod ? { period: { gte: opts.fromPeriod } } : {}),
      ...(opts.channelId ? { channelId: opts.channelId } : {}),
    },
    _sum: { debit: true, credit: true },
  });
  return r2(Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));
}

/**
 * Naqd pozitsiya KANAL KESIMIDA — "pul qayerda turibdi".
 *
 * Bu funksiya bir marta qo'shilib, iste'molchisi bo'lmagani uchun o'chirilgan
 * edi. Endi `server/kassaReport.ts` (Kassalar hisoboti) uni o'qiydi —
 * ya'ni yagona iste'molchisi bor va u markaziy jadvalni quradi.
 *
 * `channelId = null` qatori — kanali ko'rsatilmagan tarixiy yozuvlar. U
 * ALOHIDA ko'rsatiladi va nolga intilishi kerak bo'lgan ko'rsatkich: har bir
 * so'm qaysi kassada ekani ma'lum bo'lishi kerak.
 */
/**
 * Kanal qoldig'i hisobga PrismaClient ham, tranzaksiya klienti ham kiradi.
 * Server komponentlar jurnalni xom mijoz bilan o'qiydi (`server/kassaReport.ts`),
 * action'lar esa tx ichida — ikkalasiga ham to'g'ridan-to'g'ri ishlashi uchun
 * ittifoq tip. Ilgari chaqiruvchilar `prisma as never` bilan tipni o'chirardi.
 */
export type LedgerDb = Db | PrismaClient;

export async function getCashByChannel(
  db: LedgerDb,
  throughPeriod?: string,
  opts: { fromPeriod?: string } = {}
): Promise<{ channelId: string | null; balance: number; debit: number; credit: number }[]> {
  const rows = await db.ledgerEntry.groupBy({
    by: ["channelId"],
    where: {
      accountId: ACCOUNTS.CASH,
      ...(throughPeriod ? { period: { lte: throughPeriod } } : {}),
      // KASSA START — eski davr qatlamlari manba qoldiqlarini buzmasin.
      ...(opts.fromPeriod ? { period: { gte: opts.fromPeriod } } : {}),
    },
    _sum: { debit: true, credit: true },
  });
  return rows
    .map((r) => {
      const debit = Number(r._sum.debit ?? 0);
      const credit = Number(r._sum.credit ?? 0);
      return { channelId: r.channelId, debit, credit, balance: r2(debit - credit) };
    })
    .sort((a, b) => b.balance - a.balance);
}
