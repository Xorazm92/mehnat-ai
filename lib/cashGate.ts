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
import { serializable } from "@/lib/tx";
import { assertPeriodOpen } from "@/lib/periodLock";
import { assertSufficientFunds } from "@/lib/balance";
import { ACCOUNTS, postLedger, reverseLedger, type LedgerLeg } from "@/lib/ledger";
import { periodKeyOf } from "@/lib/periods";

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
}

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
            { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: input.amount },
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
