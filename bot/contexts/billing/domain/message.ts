import type { ReminderLevel } from "./debt";

/**
 * Pure Telegram reminder payload generation. Framework-free and deterministic so
 * it is fully unit-testable. Tone escalates 🟡 friendly → 🟠 professional → 🔴
 * urgent, matching the agreed business templates.
 */
export interface ReminderMessageInput {
  companyName: string;
  period: string; // "YYYY-MM"
  amountDue: number;
  level: ReminderLevel;
}

/** Group thousands with a space: 1000000 → "1 000 000". Pure/SSR-safe. */
export function formatSom(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function buildReminderMessage(input: ReminderMessageInput): string {
  const amount = `${formatSom(input.amountDue)} so'm`;

  switch (input.level) {
    case "yellow":
      return [
        "🟡 To'lov eslatmasi",
        "",
        `Korxona: ${input.companyName}`,
        `Davr: ${input.period}`,
        `Qarz: ${amount}`,
        "",
        "To'lov muddati o'tgan.",
        "Iltimos to'lovni amalga oshiring.",
      ].join("\n");
    case "orange":
      return [
        "⚠️ Ikkinchi ogohlantirish",
        "",
        `Korxona: ${input.companyName}`,
        `Davr: ${input.period}`,
        `Qarz: ${amount}`,
        "",
        "3 kundan beri to'lov amalga oshirilmagan.",
      ].join("\n");
    case "red":
      return [
        "🚨 Oxirgi ogohlantirish",
        "",
        `Korxona: ${input.companyName}`,
        `Davr: ${input.period}`,
        `Qarz: ${amount}`,
        "",
        "7 kundan ortiq muddat o'tgan.",
        "Mas'ul buxgalter va direktor xabardor qilindi.",
      ].join("\n");
  }
}
