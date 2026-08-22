// =====================================================
// MIJOZ NOMINI BAZADAGI FIRMAGA BOG'LASH
// =====================================================
//
// 1C hisobotlarida mijoz faqat NOMI bilan keladi — STIR yo'q. Bazadagi
// firmalarda esa STIR bor va u yagona ishonchli kalit. Shuning uchun vazifa
// bitta: 1C nomini bir marta to'g'ri firmaga bog'lash, keyin STIR o'z
// ishini qiladi.
//
// SHARTNOMA RAQAMI KALIT EMAS. Bu tuzoqqa bir marta tushilgan: qarzdorlik
// importida qator shartnoma raqami bo'yicha firmaga bog'langan edi, va
// 228 qatordan 160 tasi TASODIFIY firmaga tushgan. Sabab — raqam faqat
// firma ICHIDA unikal (`@@unique([companyId, number])`): "13/26БК" sakkizta
// firmada bor. Shartnoma faqat firma ANIQLANGANDAN KEYIN, o'sha firma
// ichidan qidiriladi.
//
// TAXMIN QILINMAYDI. Nom aniq bir firmaga tushmasa — bog'lanmagan qoladi
// va ro'yxatda ko'rinadi. Mijoz qarzini boshqasiga yozib qo'yish undirish
// ishini butunlay buzadi.

/**
 * Kirill va lotin ko'rinishi bir xil harflar. 1C ba'zan kirill yozadi
 * ("ООО"), baza lotin ("OOO") — ko'z uchun bir xil, bayt darajasida boshqa.
 */
const CYRILLIC_LOOKALIKE: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p",
  с: "c", т: "t", у: "y", х: "x", і: "i", ј: "j",
};

/**
 * Huquqiy shakl belgilari — firma AYNIYATIGA daxli yo'q, lekin yozuvda
 * bo'lishi ham, bo'lmasligi ham mumkin ("KESH LOGIST" ↔ "KESH LOGIST"
 * mas'uliyati cheklangan jamiyati).
 */
const LEGAL_FORMS = [
  "mchj", "mas uliyati cheklangan jamiyati", "masuliyati cheklangan jamiyati",
  "mas uliyati cheklangan jamiyat", "xk", "ntm", "ooo", "chp", "yatt",
  "ajm", "ychk", "qk", "xt", "ok", "nodavlat ta lim muassasasi",
  "nodavlat talim muassasasi", "qo shma korxonasi", "qoshma korxonasi",
];

/**
 * Firma nomini taqqoslash shakliga keltiradi.
 *
 * Ataylab QAT'IY: natija faqat aniq tenglik uchun ishlatiladi, o'xshashlik
 * o'lchash uchun emas.
 */
export function normalizeCompanyName(raw: string): string {
  let t = raw.toLowerCase().replace(/[`'‘’"«»]/g, " ");
  t = t.replace(/[а-яё]/g, (ch) => CYRILLIC_LOOKALIKE[ch] ?? ch);
  t = t.replace(/[^a-z0-9]+/g, " ").trim();

  for (const form of LEGAL_FORMS) {
    t = t.replace(new RegExp(`(^|\\s)${form.replace(/ /g, "\\s+")}(\\s|$)`, "g"), " ");
  }

  // "R A H M A T J O N" — 1C ba'zan harflarni ajratib yozadi.
  t = t.replace(/\b(?:[a-z]\s){2,}[a-z]\b/g, (m) => m.replace(/\s/g, ""));

  return t.replace(/\s+/g, " ").trim();
}

export interface CompanyLike {
  id: string;
  name: string;
}

/**
 * Nomga mos YAGONA firmani qaytaradi.
 *
 * Bir nechta firma mos kelsa `null` — ikkilanishda tanlash pulni noto'g'ri
 * mijozga yozish demak.
 *
 * @param aliases 1C nomi (xom holda) → companyId. Qo'lda tasdiqlangan
 *   bog'lanishlar; ular normalizatsiyadan OLDIN qaraladi, chunki ular
 *   aynan shu yozuv uchun tasdiqlangan.
 */
export function matchCompanyByName<T extends CompanyLike>(
  rawName: string,
  companies: T[],
  aliases?: Map<string, string>
): T | null {
  const aliasId = aliases?.get(rawName.trim());
  if (aliasId) return companies.find((c) => c.id === aliasId) ?? null;

  const key = normalizeCompanyName(rawName);
  if (!key) return null;

  const hits = companies.filter((c) => normalizeCompanyName(c.name) === key);
  return hits.length === 1 ? hits[0] : null;
}
