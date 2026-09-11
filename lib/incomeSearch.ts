// KIRIM REYESTRI QIDIRUVI — bitta shart, ikkita chaqiruvchi.
//
// NEGA ALOHIDA MODUL. Aynan shu besh maydonli shart IKKI joyda nusxa bo'lib
// yozilgan edi:
//
//   server/incomeRegister.ts      — serverda filtrlash (birinchi yuklash)
//   .../kirim/IncomeRegister.tsx  — mijozda filtrlash (yozish davomida)
//
// Ikkalasi HAR XIL paytda ishlaydi, lekin FOYDALANUVCHI uchun bitta qidiruv.
// Nusxa qolsa, kimdir qidiriladigan maydon qo'shganda (masalan `channelLabel`)
// bir tomon yangilanardi-yu, ikkinchisi eskirardi — va natija qaysi yo'l
// ishlaganiga qarab HAR XIL chiqardi. Bunday nomuvofiqlikni ushlash qiyin:
// hech qanday xato bermaydi, shunchaki qator "yo'qoladi".
//
// Shart SOF — `lib/` da yashaydi, chunki "use server" fayllardan faqat async
// funksiya eksport qilinadi va mijoz komponenti undan import qila olmaydi.

/** Qidiruvda qatnashadigan maydonlar. Faqat shular — ro'yxat ataylab qisqa. */
export interface IncomeSearchable {
  companyName: string | null;
  companyInn: string | null;
  contractNumber: string | null;
  docRef: string | null;
  note: string | null;
}

/**
 * Qator qidiruv so'roviga mos keladimi.
 *
 * `query` CHAQIRUVCHIDA normallashtiriladi (trim + lowercase) — u odatda
 * bir marta hisoblanadi va yuzlab qator bo'ylab qayta ishlatiladi.
 *
 * Bo'sh so'rov HAMMASIGA mos keladi: "filtr yo'q" degani. `null` ham shunday —
 * ikkita chaqiruvchi bo'shlikni ikki xil ifodalaydi (server `null`, mijoz `""`)
 * va ularni bu yerda tenglashtirish har bir chaqiruv o'rnida normallashtirishdan
 * xavfsizroq: unutilgan normallashtirish jim ravishda "hech narsa topilmadi"
 * berardi.
 *
 * STIR ATAYLAB `toLowerCase()` siz: u faqat raqamlardan iborat, registrni
 * o'zgartirish bekorga ish.
 */
export function matchesIncomeSearch(row: IncomeSearchable, query: string | null | undefined): boolean {
  if (!query) return true;
  return (
    (row.companyName ?? "").toLowerCase().includes(query) ||
    (row.companyInn ?? "").includes(query) ||
    (row.contractNumber ?? "").toLowerCase().includes(query) ||
    (row.docRef ?? "").toLowerCase().includes(query) ||
    (row.note ?? "").toLowerCase().includes(query)
  );
}
