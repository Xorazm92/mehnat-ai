// Bank CHIQIMINI toifalash.
//
// Real 07.2026 vipiskalari (302 ta chiqim, ~923 mln so'm) ustida sozlangan.
// Uchragan taqsimot: soliq 156, bank komissiyasi 97, xodim kartasi 10,
// firmalararo o'tkazma 8, ijara 3, aloqa/SMS 3, qolgani "boshqa".
//
// MUHIM: "firmalararo o'tkazma" alohida toifa. Vipiskalarda o'z firmalarimiz
// bir-biriga pul o'tkazgan ("возврат фин помощь", "оплата за фин займ")
// holatlar bor. Buni oddiy chiqim deb yozib bo'lmaydi: xuddi shu pul qabul
// qiluvchi firmaning vipiskasida KIRIM bo'lib turadi, ya'ni bitta pul
// harakati ikki marta hisobga kirib, balansni buzardi.
//
// Xuddi shunday, OYLIK va XODIM KARTASIGA o'tkazma ham avtomatik yozilmaydi —
// ular `Payout` qatlamiga tegishli (lib/balance.ts chiqimni Payout'dan ham
// sanaydi).

export type ExpenseCategory =
  | "soliq"
  | "bank_komissiya"
  | "xodim_kartasi"
  | "oylik"
  | "ichki_otkazma"
  | "ijara"
  | "aloqa"
  | "ovqat"
  | "boshqa";

/** UI uchun o'zbekcha nomlar. */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  soliq: "Soliq va byudjet",
  bank_komissiya: "Bank komissiyasi",
  xodim_kartasi: "Xodim kartasi",
  oylik: "Oylik",
  ichki_otkazma: "Firmalararo o'tkazma",
  ijara: "Ijara",
  aloqa: "Aloqa va internet",
  ovqat: "Ovqat va xo'jalik",
  boshqa: "Boshqa",
};

/**
 * Avtomatik KassaEntry(expense) YOZILMAYDIGAN toifalar.
 * Sabab har birida boshqa: ichki o'tkazma — ikki marta sanaladi;
 * oylik va xodim kartasi — Payout qatlamiga tegishli.
 */
export const NON_POSTABLE_CATEGORIES: ReadonlySet<ExpenseCategory> = new Set([
  "ichki_otkazma",
  "oylik",
  "xodim_kartasi",
]);

// QOIDALAR TARTIBI MUHIM — birinchi mos kelgani g'olib.
//
// Xodim kartasi va oylik ATAYIN soliqdan OLDIN turadi. Sabab real matnda:
//   "…~UCHQUN AZIMBOYEV~Пополнение карты 07.01.2026 йилдаги узини узи банд
//    килган шахс сифатида ДАВЛАТ СОЛИК ХИЗМАТИ органларида руйхатдан
//    утганлиги тугрисида маълумотнома…"
// Ya'ni karta to'ldirish izohida soliq organi TILGA OLINADI. Soliq qoidasi
// oldin tursa, o'zini-o'zi band qilgan xodimga o'tkazilgan pul "soliq" deb
// yozilib, avtomatik kassaga tushib ketardi — holbuki u Payout qatlamiga
// tegishli va u yerda ikkinchi marta sanalardi.
const RULES: { category: ExpenseCategory; pattern: RegExp }[] = [
  {
    // "00634~8600492970804957~UCHQUN AZIMBOYEV COO~Пополнение карты ..."
    //
    // ISHONCHLI BELGI — aynan "Пополнение карты". "узини узи банд" O'ZI
    // YETARLI EMAS: u o'zini-o'zi band qilgan fuqarolar UCHUN TO'LANADIGAN
    // SOLIQ matnida ham uchraydi ("...фукаролар томонидан туланадиган
    // айланмадан олинадиган солиги учун тулов"). Real ma'lumotda 93 ta
    // "узини узи банд" bor, ulardan faqat 77 tasi karta to'ldirish —
    // qolgan 16 tasi soliq to'lovi.
    category: "xodim_kartasi",
    pattern: /пополнение карт|карта хисоб(?:ига)?|o['`]zini[- ]?o['`]zi band.*kart/i,
  },
  {
    category: "oylik",
    pattern: /заработн|зарплат|З\/П|ойлик|иш хак|аванс(?!\w)/i,
  },
  {
    // Byudjet: G'aznachilik, DSI, $TAX_ID$ tegi, nom bilan atalgan soliqlar.
    category: "soliq",
    pattern:
      /\$TAX_ID\$|газначилиг|казначейств|ДСИ\b|давлат солик|солик(?:лар)?\b|soliq|пенсия бадали|ижтимоий солик|даромадидан олинадиган|айланмадан олинадиган|мол-мулк солиг|ер солиг|сув солиг/i,
  },
  {
    category: "bank_komissiya",
    pattern:
      /комисси|komissiya|за обслуживание|хизмат хаки.*банк|банк.*хизмат хаки|абонплата|абон\.?плата|инкассац/i,
  },
  {
    // Firmalararo moliyaviy yordam. Kalit so'z — kuchli belgi, lekin YAKUNIY
    // qaror kontragent STIR'i bizning firmamizmi degan tekshiruvda (quyida).
    category: "ichki_otkazma",
    pattern: /фин\.?\s*помощ|фин\.?\s*за[йи]м|молиявий ёрдам|возврат фин/i,
  },
  { category: "ijara", pattern: /аренд|ижара|ijara/i },
  {
    category: "aloqa",
    pattern: /сот\.?\s*связ|интернет|internet|телефон|aloqa|СМС|связи|документооборот/i,
  },
  { category: "ovqat", pattern: /вода|сув\b|ovqat|овкат|питани|продукт|канцеляр/i },
];

export interface ClassifyInput {
  purpose: string | null;
  counterpartyName: string | null;
  counterpartyInn: string | null;
  /** Bizning o'z firmalarimiz STIR'lari — firmalararo o'tkazmani aniqlash uchun. */
  ownFirmInns?: ReadonlySet<string>;
}

/**
 * Chiqim toifasini aniqlaydi.
 *
 * Kontragent bizning O'Z firmamiz bo'lsa, matn nima deyishidan qat'i nazar
 * bu firmalararo o'tkazma: pul tizim ichida qoldi, tashqariga chiqmadi.
 */
export function classifyExpense(input: ClassifyInput): ExpenseCategory {
  const { purpose, counterpartyName, counterpartyInn, ownFirmInns } = input;

  if (counterpartyInn && ownFirmInns?.has(counterpartyInn)) {
    return "ichki_otkazma";
  }

  const text = `${counterpartyName ?? ""} ${purpose ?? ""}`;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return "boshqa";
}

/** Shu toifadagi chiqim avtomatik kassaga yozilishi mumkinmi. */
export const isPostableExpense = (category: ExpenseCategory): boolean =>
  !NON_POSTABLE_CATEGORIES.has(category);

export interface CardTransfer {
  /** Niqoblangan karta: "8600****4957". To'liq raqam HECH QAYERDA saqlanmaydi. */
  cardMask: string;
  /** Karta egasining ismi, faylda qanday yozilgan bo'lsa. */
  holderName: string | null;
}

/**
 * Karta to'ldirish tafsilotlari.
 *
 * Maqsad matni tilda ajratilgan: `00634~8600492970804957~UCHQUN AZIMBOYEV COO~Пополнение...`
 * Bu ma'lumot `DisbursementChannel` (type = 'employee_card') bilan bog'lash
 * uchun kerak: xodimlar ro'yxati o'zgarib turadi, karta esa o'sha-o'sha qoladi.
 *
 * DIQQAT: to'liq karta raqami qaytarilmaydi — faqat niqob. Uni bazada saqlash
 * to'lov ma'lumotlarini keraksiz joyda ushlab turish bo'lardi.
 */
export function extractCardTransfer(purpose: string | null | undefined): CardTransfer | null {
  if (!purpose) return null;
  const parts = String(purpose).split("~");
  const cardIndex = parts.findIndex((p) => /^\s*\d{16}\s*$/.test(p));
  if (cardIndex === -1) return null;

  const digits = parts[cardIndex].trim();
  const cardMask = `${digits.slice(0, 4)}****${digits.slice(-4)}`;
  const holderRaw = parts[cardIndex + 1]?.trim();
  // Keyingi bo'lak izoh matni bo'lishi ham mumkin — ism odatda qisqa.
  const holderName =
    holderRaw && holderRaw.length > 0 && holderRaw.length <= 60 && !/Пополнение/i.test(holderRaw)
      ? holderRaw
      : null;

  return { cardMask, holderName };
}
