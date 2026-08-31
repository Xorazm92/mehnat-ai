/**
 * QARZ ESKIRISH BOSQICHLARI — yagona manba.
 *
 * Nega alohida fayl: chegaralar UCH joyda takrorlangan edi —
 * `lib/debt.ts#computeDebtAgingMatrix` (server, direktor hisoboti),
 * `QarzdorlikClient` dagi `AGING_STAGES` + `stageOf` (ekran) va o'sha
 * ekrandagi izoh "chegaralar AYNAN bir xil bo'lishi kerak" deb ogohlantirar
 * edi. Ogohlantirish kerak bo'lishining o'zi — ajralib ketish xavfi belgisi:
 * kimdir 60 ni 90 ga o'zgartirsa, direktorning Telegram hisoboti va ekran
 * boshqa-boshqa javob berardi.
 *
 * Bu fayl `lib/debt.ts` ga bog'liq EMAS (u Prisma tortadi va mijoz
 * to'plamida prod build'ni yiqitadi) — shuning uchun uni klient ham,
 * server ham xavfsiz import qiladi.
 *
 * Bosqichlar biznes eskalatsiyasi: operatsion → ogohlantirish →
 * xizmatni to'xtatish xavfi → kritik (sud/shartnoma bekor qilish).
 */

export type DebtAgingStage = "normal" | "warning" | "suspension" | "critical";

export interface DebtAgingStageDef {
  key: DebtAgingStage;
  /** Kun oralig'i — ekranda ko'rinadigan yorliq. */
  label: string;
  /** Biznes ma'nosi — nima qilish kerakligini aytadi. */
  hint: string;
  /** Shu bosqichga kiruvchi eng katta kun (oxirgisi — cheksiz). */
  maxDays: number;
  /** Semantik rang tokeni. */
  color: string;
}

export const DEBT_AGING_STAGES: readonly DebtAgingStageDef[] = [
  { key: "normal", label: "1-10 kun", hint: "Operatsion", maxDays: 10, color: "var(--text-muted)" },
  { key: "warning", label: "11-30 kun", hint: "Ogohlantirish", maxDays: 30, color: "var(--warning)" },
  { key: "suspension", label: "31-60 kun", hint: "To'xtatish xavfi", maxDays: 60, color: "var(--warning)" },
  { key: "critical", label: "60+ kun", hint: "Kritik / sud", maxDays: Infinity, color: "var(--danger)" },
] as const;

/** Kechikkan kun soni qaysi bosqichga tushadi. */
export function debtAgingStage(days: number): DebtAgingStage {
  for (const s of DEBT_AGING_STAGES) {
    if (days <= s.maxDays) return s.key;
  }
  return "critical";
}
