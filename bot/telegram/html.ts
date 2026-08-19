/**
 * Telegram HTML matn qurilishi.
 *
 * Bot xabarlari uzoq vaqt sof matn edi: hamma qator bir xil og'irlikda
 * ko'rinardi va o'qiyotgan odam sarlavha bilan tafsilotni faqat emoji orqali
 * ajratardi. HTML rejimi qalin sarlavha, so'nik izoh va — eng muhimi —
 * YIG'ILADIGAN sitata beradi: uzun ro'yxat xabarni cho'zmaydi, lekin bosilganda
 * to'liq ochiladi.
 *
 * Sof va framework-free (grammY yo'q), shuning uchun har qatlam ishlata oladi
 * va testlari DB'siz yuriladi.
 */

/**
 * Telegram HTML'ida MAJBURIY qochirish.
 *
 * Firma nomlari `&`, `<`, `>` belgilarini o'z ichiga oladi (masalan
 * «AVTO & TRADE»). Qochirilmasa Telegram butun xabarni rad etadi — ya'ni
 * bitta nom tufayli hisobot umuman yetib bormaydi. Shuning uchun tashqaridan
 * kelgan HAR qiymat shu funksiyadan o'tishi kerak.
 */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Qalin sarlavha. Ichidagi matn qochiriladi. */
export const b = (text: unknown): string => `<b>${esc(text)}</b>`;

/** So'nik izoh — asos/manba qatorlari uchun. */
export const i = (text: unknown): string => `<i>${esc(text)}</i>`;

/** Raqam yoki kalit: bir xil kenglikda turadi, ustma-ust o'qish oson. */
export const code = (text: unknown): string => `<code>${esc(text)}</code>`;

/**
 * Yig'iladigan sitata (Bot API 7.4+).
 *
 * Uzun ro'yxatni xabarni cho'zmasdan BERISH usuli: yopiq holda bir necha
 * qator ko'rinadi, bosilganda hammasi ochiladi. Shu tufayli xulosa qisqa
 * qoladi va shu bilan birga hech qanday ma'lumot yashirilmaydi.
 *
 * Qatorlar ALLAQACHON qochirilgan bo'lishi kutiladi — ichida qalin/so'nik
 * bo'laklar bo'lishi mumkin.
 */
export function expandableQuote(lines: string[]): string {
  return `<blockquote expandable>${lines.join("\n")}</blockquote>`;
}

/** Oddiy sitata — qisqa, doim ochiq bloklar uchun. */
export function quote(lines: string[]): string {
  return `<blockquote>${lines.join("\n")}</blockquote>`;
}
