// lib/reportApplicability.ts
// Matritsa ustuni shu FIRMAGA umuman tegishlimi — sof qoida, bog'liqliksiz.
//
// Bu "bugun topshirish kerakmi" DEGANI EMAS (u majburiyat dvigatelining ishi,
// davrga bog'liq). Bu — "bu firma bunday hisobotni UMUMAN topshiradimi".
// Ikkalasi boshqa savol: aylanma soliq choraklik, ya'ni oraliq oylarda
// "bugun kerak emas", lekin ustun baribir shu firmaniki.
//
// Hozircha yagona qoida — soliq rejimi. QQS va aylanma bir-birini istisno
// qiladi: firma yo QQS to'lovchi, yo aylanma rejimida.

/** Ustunni faqat shu soliq rejimlari ishlatadi. Ro'yxatda yo'q ustun — hammaga. */
const REGIME_ONLY: Record<string, readonly string[]> = {
  qqs: ["vat"],
  qqs_tolov: ["vat"],
  aylanma: ["turnover"],
  aylanma_tolov: ["turnover"],
};

/**
 * Ustun shu rejimdagi firmaga tegishlimi.
 *
 * Rejim NOMA'LUM bo'lsa (bo'sh satr, eski ma'lumot) — TEGISHLI deb qaraladi.
 * Xavfsiz taraf shu: noma'lum rejim tufayli katakni qulflab qo'ysak, buxgalter
 * hisobotni topshira olmay qolardi. Ortiqcha ochilgan katak esa ko'rinadi va
 * tuzatiladi.
 */
export function columnAppliesToRegime(colKey: string, regime: string | null | undefined): boolean {
  const allowed = REGIME_ONLY[colKey];
  if (!allowed) return true;
  const r = (regime ?? "").trim().toLowerCase();
  if (!r) return true;
  return allowed.includes(r);
}

/** Katak yopilgan bo'lsa — nega yopilganini tushuntiruvchi matn. */
export function regimeBlockReason(colKey: string, regime: string | null | undefined): string | null {
  if (columnAppliesToRegime(colKey, regime)) return null;
  const allowed = REGIME_ONLY[colKey];
  if (allowed?.includes("vat")) return "Bu hisobotni faqat QQS to'lovchi firmalar topshiradi";
  if (allowed?.includes("turnover")) return "Bu hisobotni faqat aylanma rejimidagi firmalar topshiradi";
  return "Bu firma uchun talab qilinmaydi";
}
