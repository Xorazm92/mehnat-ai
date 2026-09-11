// KASSA YOZUVLARI — UMUMIY QO'RIQCHILAR VA JURNAL OYOG'I.
//
// NEGA ALOHIDA MODUL. Bu uchtasi `entries.ts` va `expenses.ts` ning IKKALASIDA
// ham ishlatiladi (`createKassaEntry`, `createExpense`, `approveExpense`).
// Bo'linishdan oldin ular bitta faylda yashardi, shuning uchun bog'liqlik
// ko'rinmasdi. Nusxa ko'chirilsa, "oylik kassaga yozilmaydi" qoidasi ikki
// joyda turib qolardi va biri o'zgarganda ikkinchisi jimgina eskirardi.
//
// NEGA "use server" EMAS: bular server action emas, ichki qo'riqchilar —
// mijozdan chaqirilmaydi va tarmoq chegarasiga aylanishi shart emas.

import { Prisma } from "@prisma/client";
import { ACCOUNTS, postLedger } from "@/lib/ledger";
import { SALARY_CATEGORY_RE } from "@/lib/cashGate";
import { periodKeyOf } from "@/lib/periods";

// Summa har doim musbat son bo'lishi kerak — manfiy/NaN qiymat balans
// agregatlarini (lib/balance.ts) buzadi, shuning uchun serverda qat'iy tekshiriladi.
export function assertPositiveAmount(amount: number, label = "Summa") {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} musbat son bo'lishi kerak`);
  }
}

/**
 * Oylik OPERATSION XARAJAT emas — u `Payout` qatlamidan chiqadi.
 *
 * Qoida `lib/cashGate.ts` dagi bilan bir xil, lekin UI yo'lida QAT'IYROQ:
 * bu yerda `SALARY_EXPENSE` ga yozish imkoni umuman berilmaydi, chunki
 * ekrandan oylik kiritish `/payroll` orqali bo'lishi kerak. Tranzit backfilli
 * (kartadan berilgan mehnat haqi) darvoza orqali o'tadi va u yerda ruxsat bor.
 */
export function assertNotSalary(type: string, category: string) {
  if (type === "expense" && SALARY_CATEGORY_RE.test(category)) {
    throw new Error(
      "Oylik kassa chiqimi sifatida yozilmaydi — u ikki marta hisobga kirardi. " +
        "Oylik to'lovi \"Oylik\" bo'limi (/payroll) orqali beriladi."
    );
  }
}

/** Tasdiqlangan kassa yozuvining ikki tomonlama izi. */
export async function postExpenseLegs(
  tx: Prisma.TransactionClient,
  row: { id: string; amount: Prisma.Decimal | number; category: string; date: Date; channelId: string | null; type: string },
  userId: string
) {
  const amount = Number(row.amount);
  await postLedger(tx, {
    legs:
      row.type === "income"
        ? [
            { accountId: ACCOUNTS.CASH, debit: amount, channelId: row.channelId },
            { accountId: ACCOUNTS.KASSA_INCOME, credit: amount },
          ]
        : [
            { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: amount },
            { accountId: ACCOUNTS.CASH, credit: amount, channelId: row.channelId },
          ],
    period: periodKeyOf(row.date),
    sourceTable: "KassaEntry",
    sourceId: row.id,
    createdBy: userId,
    description: `Kassa ${row.type === "income" ? "kirim" : "chiqim"}: ${row.category}`,
  });
}
