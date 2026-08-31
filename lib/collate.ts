/**
 * MATN SARALASH — server va klientda BIR XIL natija.
 *
 * BUG (2026-08-31, brauzer testida topildi): loyihada matn `localeCompare(x, "uz")`
 * bilan saralanardi. Ammo:
 *
 *   Node (server):   "Sherzod".localeCompare("Super Admin", "uz") →  1
 *   Chrome (klient): "Sherzod".localeCompare("Super Admin", "uz") → -1
 *
 * Sababi: Node to'liq ICU bilan keladi va o'zbek tartibini BILADI ("sh" —
 * alohida harf, ya'ni "Sherzod" barcha "su…" so'zlaridan keyin turadi).
 * Chrome'da esa `uz` kolatsiyasi YO'Q va u jimgina `en-US` ga tushadi.
 *
 * Natijada SSR chizgan qatorlar tartibi klient chizganidan farq qilardi va
 * React "Hydration failed — server rendered text didn't match" deb butun
 * daraxtni qayta qurardi. Bu HAR BIR matn bo'yicha saralanadigan `DataTable`
 * ekraniga tegardi (Xodimlar, Firmalar, Xarajatlar, Oylik, Ishlar…).
 *
 * Yechim: aniq va HAMMA MUHITDA MAVJUD kolatsiya. "uz" ni tashlab ketish
 * hech narsani yo'qotmaydi — brauzerda u allaqachon ishlamayotgan edi,
 * ya'ni foydalanuvchi o'zbek tartibini hech qachon ko'rmagan; faqat SSR
 * HTML'i bir lahza boshqacha turardi.
 *
 * `numeric: true` — "10-uy" "9-uy" dan keyin tursin.
 */
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "variant" });

/** Matnlarni server/klientda bir xil tartibda solishtiradi. */
export function compareText(a: string, b: string): number {
  return collator.compare(a, b);
}
