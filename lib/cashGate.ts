// =====================================================
// CASH GATE — pul yozuvlarining YAGONA eshigi
// =====================================================
//
// MUAMMO. Jurnal (`lib/ledger.ts`) mavjud, lekin MAJBURIY emas edi. UI yo'llari
// `postLedger` chaqirardi, import va skript yo'llari esa to'g'ridan-to'g'ri
// `prisma.kassaEntry.create` qilardi:
//
//     server/bankImport.ts        kassaEntry.create   ← jurnalga yozmaydi
//     lib/transit.ts              kassaEntry.create   ← jurnalga yozmaydi
//     scripts/import-kassa-data.ts kassaEntry.create  ← jurnalga yozmaydi
//
// Natijada ikkita "haqiqat" paydo bo'ldi: jadval agregatlari (`lib/balance.ts`)
// va jurnal qoldig'i (`lib/ledger.ts`). Prodda farq 105.6 mln so'm, jurnalga
// umuman tushmagan qatorlar 847 ta (1.45 mlrd so'm). Sverka buni TOPADI
// (`lib/reconciliation.ts` "journal-coverage"), lekin TO'SMAYDI.
//
// YECHIM. Manba qatori ham, ikki tomonlama yozuv ham SHU YERDA, bitta
// tranzaksiyada. Sverka nuqsonni topadi — darvoza uni IMKONSIZ qiladi.
//
// QATLAM CHEGARASI (lib/ledger.ts va lib/monthClose.ts bilan bir xil shartnoma):
// bu modulda `auth()` YO'Q, `revalidatePath` YO'Q, `recordAuditLog` YO'Q.
// Sabab — `lib/` bot cron'idan ham import qilinadi. Auth, audit va cache
// invalidatsiyasi chaqiruvchi `server/*.ts` ning ishi.

import { Prisma } from "@prisma/client";
import { SALARY_CATEGORY_RE } from "@/lib/salaryCategory";
import { serializable } from "@/lib/tx";
import { assertPeriodOpen } from "@/lib/periodLock";
import { assertSufficientFunds, getChannelCashBalance } from "@/lib/balance";
import { ACCOUNTS, postLedger, reverseLedger, type LedgerLeg } from "@/lib/ledger";
import { periodKeyOf } from "@/lib/periods";
import { formatNum } from "@/lib/platform/format";
import { isAdminRole } from "@/lib/platform/permissions";

type Db = Prisma.TransactionClient;

/**
 * Yozuvni KIM boshlagani.
 *
 * Nima uchun bayroq emas (`skipFundsCheck: true`): bayroq inkor nomli,
 * sababsiz, va "ishlashi uchun" hamma joyga qo'yiladi. Balans tekshiruvi esa
 * KIM/NEGA ning xossasi — bugun pul sarflayotgan odam bloklanishi kerak,
 * martdagi vipiska qatori esa bloklanishi MUMKIN EMAS: o'tmish allaqachon
 * sodir bo'lgan va uni "mablag' yetmaydi" deb rad etish ma'nosiz.
 *
 * Maydon MAJBURIY, ya'ni uni unutib bo'lmaydi.
 */
export type CashActor =
  | { kind: "user"; userId: string; role: string }
  | { kind: "import"; source: "bank" | "plastik" | "1c"; userId?: string | null }
  | { kind: "script"; name: string; userId?: string | null };

/** Balans tekshiruvi faqat jonli foydalanuvchi uchun. */
const needsFundsCheck = (actor: CashActor): actor is Extract<CashActor, { kind: "user" }> =>
  actor.kind === "user";

const actorUserId = (actor: CashActor): string | null =>
  actor.kind === "user" ? actor.userId : (actor.userId ?? null);

/**
 * Tranzaksiyasi yo'q chaqiruvchilar uchun (import, skript, cron).
 *
 * Server action allaqachon `serializable()` ichida bo'lsa BUNI CHAQIRMANG —
 * ichkarida ikkinchi tranzaksiya ochish yangi ulanish oladi va deadlock beradi.
 * Shuning uchun quyidagi amallarning hammasi `db` ni BIRINCHI argument sifatida
 * majburiy oladi (`postLedger`/`reverseLedger`/`assertPeriodOpen` bilan bir xil).
 */
export function runCashTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return serializable(fn);
}

/**
 * MANBA BO'YICHA QOLDIQ NAZORATI — chiqimning IKKINCHI darvozasi.
 *
 * Chiqim TANLANGAN manbadan yoziladi: "Naqd" tanlansa faqat Naqd balansidan,
 * aniq firma hisobi tanlansa faqat shu firmanikidan chegiriladi. Umumiy balans
 * yetarli bo'lib, tanlangan manbada pul yo'q bo'lsa — bu MANBA xatosi va
 * bloklanadi (admin chetlab o'tadi, izi jurnal reversal'ida ko'rinadi).
 *
 * NEGA EKSPORT QILINADI. Bu tekshiruv shu faylda, `recordKassaMovement` ichida
 * yopiq turardi — ya'ni u FAQAT import/skript yo'lida ishlardi. Ekrandan
 * yoziladigan chiqim esa (`server/kassa.ts` `createKassaEntry` /
 * `approveExpense` / `updateExpense`) manba qatorini va jurnalni O'ZI yozadi va
 * bu darvozadan umuman o'tmasdi. Natijada qo'riqchi teskari tomonga qarab
 * turardi: mart oyidagi vipiska qatori bloklanardi, bugun jonli foydalanuvchi
 * bo'sh hisobdan yozgan chiqim esa o'tib ketardi va kanal qoldig'ini manfiyga
 * tushirardi ("Kassalar hisoboti" o'sha manfiyni ko'rsatardi).
 *
 * Endi qoida bitta joyda va ikkala yo'l ham shu yerdan o'tadi.
 *
 * @param excludeKassaEntryId Tahrirlashda yozuvning O'Z eski izi qoldiqdan
 *   chiqarib tashlanadi — aks holda summa ikki marta sanalardi.
 */
export async function assertChannelFunds(
  db: Db,
  params: { channelId: string; amount: number; role: string; excludeKassaEntryId?: string }
): Promise<void> {
  // Admin/superadmin ataylab chetlab o'tadi — `assertSufficientFunds` dagi
  // bilan bir xil qoida (minus qoldiqqa ruxsat, izi jurnalda qoladi).
  if (isAdminRole(params.role)) return;

  const channelBalance = await getChannelCashBalance(db, params.channelId, {
    excludeKassaEntryId: params.excludeKassaEntryId,
  });
  if (params.amount <= channelBalance) return;

  const ch = await db.disbursementChannel.findUnique({
    where: { id: params.channelId },
    select: { label: true },
  });
  throw new Error(
    `"${ch?.label ?? "Tanlangan manba"}"da yetarli mablag' yo'q. ` +
      `Manba qoldig'i: ${formatNum(channelBalance)} so'm, so'ralgan: ${formatNum(params.amount)} so'm. ` +
      `Boshqa manbadan yozing yoki avval o'sha manbaga kirim qiling.`
  );
}

interface CommitSpec {
  /** Jurnal davri manbasi. */
  date: Date;
  /** Xato matnida ko'rinadigan nom ("kassa yozuvi", "bank chiqimi"…). */
  label: string;
  /** Pul CHIQSA — balans tekshiruvi uchun. Kirimda berilmaydi. */
  outflow?: { amount: number; context: "expense" | "payroll" };
  sourceTable: string;
  /** Manba qatorini yozadi va id qaytaradi. */
  write: (db: Db) => Promise<{ id: string }>;
  legs: (row: { id: string }) => LedgerLeg[];
  description?: string;
}

/**
 * Umumiy yadro — har bir amal shundan o'tadi. Eksport QILINMAYDI.
 *
 * Tartib muhim: davr qulfi → balans → manba qatori → jurnal. Davr tekshiruvi
 * TRANZAKSIYA ICHIDA: `assertPeriodOpen` nafaqat o'qiydi, balki
 * READY_TO_CLOSE → OPEN yozuvini ham qiladi; tashqarida chaqirilsa amal
 * yiqilganda ham o'sha yozuv qolib ketardi va checklist bekorga eskirardi.
 */
async function commit(
  db: Db,
  actor: CashActor,
  spec: CommitSpec
): Promise<{ id: string; transactionId: string }> {
  await assertPeriodOpen(db, spec.date, spec.label);

  if (spec.outflow && needsFundsCheck(actor)) {
    await assertSufficientFunds({
      amount: spec.outflow.amount,
      role: actor.role,
      userId: actor.userId,
      context: spec.outflow.context,
      db,
    });
  }

  const row = await spec.write(db);
  const transactionId = await postLedger(db, {
    legs: spec.legs(row),
    period: periodKeyOf(spec.date),
    sourceTable: spec.sourceTable,
    sourceId: row.id,
    createdBy: actorUserId(actor),
    description: spec.description,
  });

  return { id: row.id, transactionId };
}

// ─────────────────────────────────────────────────────────
// KASSA HARAKATI
// ─────────────────────────────────────────────────────────

export interface KassaMovementInput {
  type: "income" | "expense";
  category: string;
  amount: number;
  date: Date;
  description?: string | null;
  companyId?: string | null;
  /** Pul qaysi hisobda/kartada. Jurnalning CASH oyog'iga yoziladi. */
  channelId?: string | null;
  /**
   * Import takrorlanmasligi uchun ("bank:<txId>"). Berilsa va shunday yozuv
   * allaqachon bo'lsa — YANGI YOZUV YOZILMAYDI, mavjudi qaytariladi.
   */
  dedupKey?: string | null;
  /**
   * Chiqim QAYSI hisobga tushsin. Standart — operatsion xarajat.
   *
   * Oylik `SALARY_EXPENSE` ga tushishi kerak: aks holda mehnat haqi
   * operatsion xarajat bo'lib ko'rinadi va foyda tahlili buziladi. Prodda
   * bu 269 mln so'mlik farq (tranzit kartalaridan berilgan oylik).
   */
  expenseAccount?:
    | typeof ACCOUNTS.OPERATING_EXPENSE
    | typeof ACCOUNTS.SALARY_EXPENSE
    /** Ta'sischiga taqsimot — pul chiqadi, lekin xarajat emas. */
    | typeof ACCOUNTS.OWNER_DISTRIBUTION;
}

/**
 * MEHNAT HAQI TOIFASINI ANIQLAYDIGAN YAGONA MANBA.
 *
 * Ilgari bu regexp `server/kassa.ts` va shu faylda ikki nusxa bo'lib, birida
 * qoida o'zgarsa ikkinchisi jimgina eski qolardi. Har qanday yangi tekshiruv
 * shu konstantadan olsin — kategoriyalar ro'yxati kengaysa bitta joyda
 * kengayadi.
 */
// Qoida `lib/salaryCategory.ts` da — u bog'liqliksiz va MIJOZ ham import
// qila oladi (bu fayl Prisma tortadi, qila olmaydi). Qayta eksport eski
// import yo'llarini sindirmaslik uchun.
export { SALARY_CATEGORY_RE, isSalaryCategory } from "@/lib/salaryCategory";

export interface CashResult {
  id: string;
  transactionId: string | null;
  /** `dedupKey` bo'yicha allaqachon yozilgan edi — hech narsa o'zgarmadi. */
  alreadyRecorded: boolean;
}

/**
 * Kassa kirimi/chiqimi + uning ikki tomonlama yozuvi.
 *
 * Uchala "jurnalsiz" yo'l shu funksiyaga keladi: bank chiqimi
 * (`server/bankImport.ts`), karta xarajati (`lib/transit.ts`) va tarixiy
 * import (`scripts/import-kassa-data.ts`).
 */
export async function recordKassaMovement(
  db: Db,
  actor: CashActor,
  input: KassaMovementInput
): Promise<CashResult> {
  if (input.type !== "income" && input.type !== "expense") {
    throw new Error("Kassa turi noto'g'ri: 'income' yoki 'expense' bo'lishi kerak");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Summa musbat son bo'lishi kerak");
  }

  const expenseAccount = input.expenseAccount ?? ACCOUNTS.OPERATING_EXPENSE;

  // ── MANBA BO'YICHA QOLDIQ NAZORATI ────────────────────────────────────
  if (input.type === "expense" && input.channelId && needsFundsCheck(actor)) {
    await assertChannelFunds(db, {
      channelId: input.channelId,
      amount: input.amount,
      role: actor.role,
    });
  }

  // OYLIK OPERATSION XARAJAT EMAS. Qoida atayin "kassaga oylik yozilmasin"
  // emas, "oylik operatsion xarajatga yozilmasin" — chunki kartadan berilgan
  // mehnat haqi kassa yozuvi bo'lishi TO'G'RI, faqat u `SALARY_EXPENSE` ga
  // tushishi kerak. Shu ko'rinishda qoida chaqiruvchini to'g'ri hisobga
  // yo'naltiradi, uni butunlay to'sib qo'ymaydi.
  if (
    input.type === "expense" &&
    expenseAccount === ACCOUNTS.OPERATING_EXPENSE &&
    SALARY_CATEGORY_RE.test(input.category)
  ) {
    throw new Error(
      `"${input.category}" mehnat haqiga o'xshaydi — operatsion xarajatga yozilmaydi. ` +
        `Oylik uchun expenseAccount: SALARY_EXPENSE bering yoki /payroll orqali to'lang.`
    );
  }

  // Idempotentlik: qaytadan yurgizilgan import dublikat xarajat yozmasin.
  if (input.dedupKey) {
    const existing = await db.kassaEntry.findFirst({
      where: { dedupKey: input.dedupKey },
      select: { id: true },
    });
    if (existing) return { id: existing.id, transactionId: null, alreadyRecorded: true };
  }

  const res = await commit(db, actor, {
    date: input.date,
    label: "kassa yozuvi",
    outflow: input.type === "expense" ? { amount: input.amount, context: "expense" } : undefined,
    sourceTable: "KassaEntry",
    description: `Kassa ${input.type === "income" ? "kirim" : "chiqim"}: ${input.category}`,
    write: (tx) =>
      tx.kassaEntry.create({
        data: {
          type: input.type,
          category: input.category,
          amount: new Prisma.Decimal(input.amount.toFixed(2)),
          date: input.date,
          description: input.description ?? null,
          companyId: input.companyId ?? null,
          channelId: input.channelId ?? null,
          dedupKey: input.dedupKey ?? null,
          createdBy: actorUserId(actor),
        },
        select: { id: true },
      }),
    legs: () =>
      input.type === "income"
        ? [
            { accountId: ACCOUNTS.CASH, debit: input.amount, channelId: input.channelId ?? null },
            { accountId: ACCOUNTS.KASSA_INCOME, credit: input.amount },
          ]
        : [
            { accountId: expenseAccount, debit: input.amount },
            { accountId: ACCOUNTS.CASH, credit: input.amount, channelId: input.channelId ?? null },
          ],
  });

  return { ...res, alreadyRecorded: false };
}

// ─────────────────────────────────────────────────────────
// BEKOR QILISH
// ─────────────────────────────────────────────────────────

/**
 * Kassa yozuvini soft-delete qilib, jurnal izini teskarilaydi.
 *
 * Jismoniy o'chirish YO'Q va jurnal qatorlari ham o'chirilmaydi — tuzatish
 * faqat teskari yozuv orqali (`lib/ledger.ts` append-only invarianti).
 */
export async function reverseKassaMovement(
  db: Db,
  actor: CashActor,
  input: { kassaEntryId: string; reason: string }
): Promise<{ reversed: boolean }> {
  const row = await db.kassaEntry.findUnique({
    where: { id: input.kassaEntryId },
    select: { id: true, date: true, deletedAt: true },
  });
  if (!row) throw new Error("Kassa yozuvi topilmadi");
  if (row.deletedAt) return { reversed: false };

  await assertPeriodOpen(db, row.date, "kassa yozuvi");

  await db.kassaEntry.update({
    where: { id: row.id },
    data: {
      deletedAt: new Date(),
      deletedBy: actorUserId(actor),
      deleteReason: input.reason.trim() || null,
      // Kalit bo'shatiladi: o'chirilgan yozuv qayta importni to'sib qo'ymasin.
      dedupKey: null,
    },
  });

  const txId = await reverseLedger(db, {
    sourceTable: "KassaEntry",
    sourceId: row.id,
    createdBy: actorUserId(actor),
    reason: input.reason.trim(),
  });

  return { reversed: txId !== null };
}
