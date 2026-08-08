import type { DirectorReport } from "../../../../lib/directorReport";

/**
 * Direktorning ertalabki hisoboti (09:00).
 *
 * Tartib — "nima bo'ldi → qancha pul bor → nimaga aralashish kerak".
 * Xodim digest'idan (08:50) farqli o'laroq bo'sh hisobot ham yuboriladi:
 * "kecha harakat bo'lmadi" ham signal (masalan vipiska yuklanmagan bo'lishi
 * mumkin), shuning uchun sukut bilan yo'qotilmasin.
 */

const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr",
];

/** "6-avgust" — Intl'siz (worker'da locale ma'lumoti bo'lmasligi mumkin). */
function uzDate(d: Date): string {
  return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`;
}

/** Vergul bilan ajratilgan summa — lib/format.ts formatNum bilan bir xil. */
function som(value: number): string {
  const n = Math.round(value);
  const sign = n < 0 ? "-" : "";
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function renderDirectorReport(report: DirectorReport): string {
  const lines = [`📊 Kunlik hisobot — ${uzDate(report.forDate)}`, ""];

  lines.push("💰 Kecha");
  lines.push(`   Kirim:  ${som(report.yesterday.income)} so'm`);
  lines.push(`   Chiqim: ${som(report.yesterday.outflow)} so'm`);
  const net = report.yesterday.income - report.yesterday.outflow;
  lines.push(`   Sof:    ${net >= 0 ? "+" : ""}${som(net)} so'm`);
  lines.push("");

  lines.push(`🏦 Kassa balansi: ${som(report.balance.balance)} so'm`);
  lines.push("");

  const alerts: string[] = [];
  if (report.debt.companies > 0) {
    alerts.push(
      `💳 Qarzdorlik: ${report.debt.companies} ta firma — ${som(report.debt.total)} so'm` +
        (report.debt.red > 0 ? `\n   🔴 ${report.debt.red} tasi umuman to'lamagan` : "")
    );
  }
  if (report.obligations.overdue > 0) {
    alerts.push(`⏰ Muddati o'tgan majburiyat: ${report.obligations.overdue} ta`);
  }
  if (report.obligations.dueToday > 0) {
    alerts.push(`🟡 Bugun oxirgi kun: ${report.obligations.dueToday} ta`);
  }
  if (report.pending.expenses > 0) {
    alerts.push(`🧾 Tasdiq kutayotgan xarajat: ${report.pending.expenses} ta`);
  }
  if (report.pending.proofs > 0) {
    alerts.push(`📎 Ko'rib chiqilmagan dalil: ${report.pending.proofs} ta`);
  }
  // Ikki xil ish, ikki xil odam: kirimni bank-klient bog'laydi, chiqimni
  // admin toifalaydi. Bitta raqamga qo'shilsa manzara buziladi.
  if (report.unmatchedBank.income > 0) {
    alerts.push(`🔗 Mijozi topilmagan kirim: ${report.unmatchedBank.income} ta (bank-klient)`);
  }
  if (report.unmatchedBank.expense > 0) {
    alerts.push(`🧮 Toifalanmagan chiqim: ${report.unmatchedBank.expense} ta (admin)`);
  }
  // 1C bilan solishtirish: ASRO joriy oyni, 1C esa jamg'arilgan qarzni
  // ko'rsatadi. Farq katta bo'lsa eski oylardan qarz qolgan degani.
  if (report.debt1C) {
    const d = report.debt1C;
    const diff = d.total - report.debt.total;
    alerts.push(
      `📒 1C bo'yicha qarz: ${som(d.total)} so'm (${uzDate(d.asOf)} holatiga, ${d.contracts} shartnoma)` +
        (Math.abs(diff) > 1000 ? `\n      ASRO hisobidan farqi: ${diff > 0 ? "+" : ""}${som(diff)} so'm` : "")
    );
  }

  if (alerts.length > 0) {
    lines.push("⚠️ E'tibor talab qiladi");
    lines.push(...alerts.map((a) => `   ${a}`));
  } else {
    lines.push("✅ E'tibor talab qiladigan holat yo'q");
  }

  return lines.join("\n");
}
