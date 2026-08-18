// =====================================================
// OYLIK MAJBURIYATI — YAGONA MANBA
// =====================================================
//
// "Bu xodimga bu oyda qancha to'lash kerak?" degan savolga javob UCH joyda
// mustaqil hisoblanardi va uchalasi HAR XIL raqam berardi:
//
//   server/payouts.ts    payment + avans          → to'lov chegarasi
//   lib/monthClose.ts    payment + avans          → oy yopish ogohlantirishi
//   PayrollTable.tsx     ... − avans − jarima     → ekrandagi "Qolgan"
//   PayrollDrafts.tsx    faqat KPI hisobi         → ekrandagi "Jami"
//
// IKKI NUQSON SHUNDAN KELIB CHIQQAN:
//
//  1) AVANS IKKI MARTA. Server avansni MAJBURIYAT deb sanardi, holbuki avans
//     tasdiqlanganda darhol `Payout` yoziladi (server/payroll.ts) — ya'ni u
//     TO'LOV. Natijada `remaining = (oylik + avans) − avans = oylik`, ya'ni
//     avans hech qachon ayirilmasdi va oy yopishda doimiy soxta
//     "to'lanmagan majburiyat" ogohlantirishi chiqardi.
//
//  2) QO'LDA BONUS TO'LANMASDI. Server majburiyatga faqat `payment` va
//     `avans` ni qo'shardi; `bonus` umuman yo'q edi. UI esa uni "Jami maosh"
//     ga qo'shardi — natijada "To'lash" tugmasi serverdan kattaroq summa
//     yuborar va `Ortiqcha to'lov bloklandi` xatosi qaytardi. Qo'lda `jarima`
//     ham simmetrik ravishda faqat ekranda qolardi.
//
// QOIDA. Majburiyat = xodim SHU OY UCHUN olishi kerak bo'lgan jami summa.
// To'lov (`Payout`) undan AYIRILADI, unga qo'shilmaydi.
//
//   majburiyat = Σ payment + Σ bonus − Σ jarima
//   berilgan   = Σ payout (avans payoutlari ham shu yerda)
//   qolgan     = majburiyat − berilgan
//
// Bu modul SOF: prisma import qilmaydi, shuning uchun server action, klient
// komponent va test uchun bir xil ishlaydi (lib/debt.ts qarz uchun qilgani kabi).

import { adjustmentMagnitude } from "@/lib/adjustments";

/**
 * Majburiyat yig'indisiga qo'shiladigan ulush.
 *
 * `avans` ATAYIN 0: u majburiyat emas, majburiyatning oldindan berilgan
 * qismi. Tasdiqlanganda `Payout` yoziladi va `berilgan` tomonida sanaladi.
 *
 * `manual` / `other` ham 0: bu turlar uchun ishora konventsiyasi hech qachon
 * belgilanmagan (`lib/adjustments.ts` dagi izohga qarang — tarixiy qatorlar
 * aralash ishorada), shuning uchun ularni pul chegarasiga qo'shish xavfli.
 * Ular ekranda ko'rinadi, lekin to'lov chegarasiga ta'sir qilmaydi.
 */
const WEIGHT: Record<string, number> = {
  payment: 1,
  bonus: 1,
  jarima: -1,
  avans: 0,
  manual: 0,
  other: 0,
};

export interface ObligationRow {
  adjustmentType: string;
  /** Prisma Decimal, satr yoki son bo'lishi mumkin. */
  amount: unknown;
  /** Faqat TASDIQLANGAN qator pul chegarasiga ta'sir qiladi. */
  isApproved?: boolean | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Xodimning bir oydagi jami majburiyati.
 *
 * Faqat `isApproved === true` qatorlar sanaladi — tasdiqlanmagan tuzatma
 * hali qaror emas. Chaqiruvchi so'rovida `adjustmentType` va `isApproved`
 * ni tanlashi SHART, aks holda hamma qator tashlab yuboriladi.
 *
 * Summa MIQDOR sifatida o'qiladi (`adjustmentMagnitude`): bazadagi qatorlar
 * tarixan aralash ishorada — `approveEmployeeSalary` musbat, eski UI yo'li
 * manfiy yozgan. Yo'nalishni ishora emas, TUR (`WEIGHT`) belgilaydi.
 */
export function computeObligation(rows: readonly ObligationRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.isApproved !== true) continue;
    const weight = WEIGHT[row.adjustmentType] ?? 0;
    if (weight === 0) continue;
    total += weight * adjustmentMagnitude(row.amount);
  }
  return r2(total);
}

/**
 * Hali berilmagan qism.
 *
 * Manfiy bo'lishi MUMKIN va bu ma'noli: ortiqcha to'langan (masalan majburiyat
 * keyin kamaytirilgan). Chaqiruvchi nolga qisib qo'ymasin — aks holda ortiqcha
 * to'lov ko'rinmay ketadi.
 */
export function computeRemaining(obligation: number, paid: number): number {
  return r2(obligation - paid);
}
