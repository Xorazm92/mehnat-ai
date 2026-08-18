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
  // Nol harakat — ma'lumot emas, TEKSHIRISH SABABI: ish kunida bank vipiskasi
  // yuklanmagan yoki kassa yuritilmagan bo'lishi mumkin. Buni aytmasa,
  // "0 so'm" tinchlik belgisi bo'lib ko'rinadi.
  if (report.yesterday.income === 0 && report.yesterday.outflow === 0) {
    lines.push("   ⚠️ Harakat umuman yo'q — vipiska yuklanganini tekshiring");
  }
  lines.push("");

  lines.push(`🏦 Kassa balansi: ${som(report.balance.balance)} so'm`);
  // Manfiy balans — o'z-o'zidan "pul tugadi" degani EMAS. Amalda buning
  // sababi import assimetriyasi: xarajatlar eski davrdan yuklangan, ularni
  // qoplagan kirim esa yo'q (lib/reconciliation.ts "import-window" bandi).
  // Sababsiz ko'rsatilsa direktor bekorga vahimaga tushadi.
  if (report.balance.balance < 0) {
    lines.push("   ⚠️ Manfiy — kirim/chiqim import davrlari mos emas (/kassa/qarzdorlik → sverka)");
  }
  if (report.plan) {
    const mark = report.plan.percent >= 100 ? "✅" : report.plan.percent >= 90 ? "🟡" : "🔴";
    lines.push(
      `${mark} ${report.plan.period} rejasi: ${report.plan.percent}% ` +
        `(${som(report.plan.fact)} / ${som(report.plan.plan)})`
    );
  }
  lines.push("");

  const alerts: string[] = [];

  // QARZDORLIK — IKKI XIL ISH, ikki xil blok.
  //
  // Biznes qoidasi: ish oyi tugagach mijoz KEYINGI oy davomida to'laydi
  // ("iyulning puli avgustda olinadi"). Shuning uchun:
  //   dueNow  — shu oy yig'ilishi kerak. Bu BUZILISH EMAS, ish ro'yxati.
  //   overdue — to'lov oynasi yopilgan. Mana bu aralashuv sababi.
  //
  // Ilgari ikkalasi bitta raqamga qo'shilardi va natijada 18-avgustda iyul
  // qarzi "muddati o'tgan" bo'lib chiqardi — ya'ni o'z muddati ichidagi
  // 111 ta firma buzuvchi deb ko'rsatilardi.
  const d = report.debt;

  if (d.dueNowCompanies > 0) {
    // Emoji "💰 Kecha" sarlavhasidan FARQLI bo'lishi kerak — aks holda matnni
    // qidirib bo'lmaydi (test aynan shunga qoqildi).
    let block = `📥 Bu oy yig'ilishi kerak: ${d.dueNowCompanies} ta firma — ${som(d.dueNowTotal)} so'm`;
    for (const row of report.topDebtors.filter((r) => r.dueNow > 0).slice(0, 5)) {
      const kim = row.accountantName ? ` · ${row.accountantName}` : "";
      block += `\n   • ${row.name} — ${som(row.dueNow)} so'm${kim}`;
    }
    alerts.push(block);
  }

  if (d.overdueCompanies > 0) {
    let block = `⚠️ Muddati o'tgan qarz: ${d.overdueCompanies} ta firma — ${som(d.overdueTotal)} so'm`;
    if (d.neverPaid > 0) {
      block += `\n   🔴 ${d.neverPaid} tasi bir marta ham to'lamagan`;
    }
    for (const row of report.topDebtors.filter((r) => r.overdue > 0).slice(0, 5)) {
      // Kasrli qiymat ham ko'rsatiladi ("0.5 oylik" = yarim oylik qarz).
      const oy = row.monthsOverdue > 0 ? ` · ${row.monthsOverdue} oylik` : "";
      const kim = row.accountantName ? ` · ${row.accountantName}` : "";
      block += `\n   • ${row.name} — ${som(row.overdue)} so'm${oy}${kim}`;
    }
    const qolgan = d.overdueCompanies - report.topDebtors.filter((r) => r.overdue > 0).length;
    if (qolgan > 0) block += `\n   … va yana ${qolgan} ta (to'liq ro'yxat: /kassa/qarzdorlik)`;
    alerts.push(block);
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
  // 1C bilan solishtirish. Endi MA'NOLI: ikkala tomon ham JAMG'ARILGAN qarzni
  // beradi. Ilgari ASRO joriy oyni, 1C esa jamg'arilganini ko'rsatardi va
  // ularning farqi hech narsani anglatmasdi — har doim katta chiqardi.
  if (report.debt1C) {
    const d = report.debt1C;
    // AYNAN SHU KESIM DAVRIGA hisoblangan ASRO raqami bilan solishtiriladi —
    // aks holda farq har doim bir oylik shartnoma summasicha yolg'on chiqadi.
    const diff = d.total - d.asroComparable;
    let block =
      `📒 1C bo'yicha qarz: ${som(d.total)} so'm (${uzDate(d.asOf)} holatiga, ${d.contracts} shartnoma)`;
    block += `\n      ASRO hisobi (o'sha sanaga): ${som(d.asroComparable)} so'm`;
    if (Math.abs(diff) > 1000) {
      block += `\n      Farq: ${diff > 0 ? "+" : ""}${som(diff)} so'm — tekshirish kerak`;
    } else {
      block += `\n      ✅ Mos keladi`;
    }
    alerts.push(block);
  }

  if (alerts.length > 0) {
    lines.push("⚠️ E'tibor talab qiladi");
    lines.push(...alerts.map((a) => `   ${a}`));
  } else {
    lines.push("✅ E'tibor talab qiladigan holat yo'q");
  }

  return lines.join("\n");
}
