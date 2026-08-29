/**
 * Direktor hisobotining BATAFSIL ekranlari ("shisha" tugmalar ortidagi).
 *
 * Nima uchun alohida ekran: 09:00 dagi xabar qaror uchun eng qisqa xulosa
 * bo'lishi kerak, ammo har bir raqam ostida "qayerdan chiqdi" degan savol
 * turadi. Ilgari javob faqat saytda edi — direktor telefonda o'qib, tekshirish
 * uchun kompyuter oldiga borishi kerak edi va amalda bormasdi. Endi har
 * raqamning yonida uni ochadigan tugma bor, ekran esa faqat o'sha bo'limni
 * to'liq ko'rsatadi va oxirida ASOSINI aytadi.
 *
 * Sof funksiya: Prisma ham, Telegram ham yo'q — DirectorReport kirdi, matn
 * chiqdi. Ma'lumotni kim ko'rishi mumkinligi (RBAC) bu yerda emas,
 * `handle-director-section.ts` da hal qilinadi.
 */
import type { DirectorReport } from "../../../../lib/directorReport";
import type { DebtorRow } from "../../../../lib/debt";
import { formatNum as som } from "../../../../lib/platform/format";
import { encodeCallback } from "../../interaction/domain/callback-token";
import { ACTION } from "../../interaction/domain/actions";
import {
  cbButton,
  inlineKeyboard,
  urlButton,
  type InlineButton,
  type InlineKeyboardMarkup,
} from "../../../telegram/keyboard";
import { uzDate } from "./render-director-report";
import { b, esc, expandableQuote, i, quote } from "../../../telegram/html";

/**
 * Bo'lim kalitlari. Qiymatlar SIM formatining bir qismi: `callback_data` ichida
 * yuriladi va odamlar chatidagi eski tugmalarda qolib ketadi, shuning uchun
 * qisqa va o'zgarmas. Kalitni o'zgartirgandan ko'ra yangisini qo'shing.
 */
export const DIRECTOR_SECTION = {
  /** Xulosaga qaytish. */
  HOME: "h",
  CASH: "c",
  COLLECT: "n",
  OVERDUE: "o",
  OBLIGATIONS: "b",
  QUEUES: "q",
  ONEC: "1",
} as const;

export type DirectorSectionKey =
  (typeof DIRECTOR_SECTION)[keyof typeof DIRECTOR_SECTION];

const KEYS = new Set<string>(Object.values(DIRECTOR_SECTION));

export function isDirectorSectionKey(key: string): key is DirectorSectionKey {
  return KEYS.has(key);
}

/** Batafsil ekranda nechta firma ko'rinadi — Telegram xabari 4096 belgi. */
const DETAIL_ROWS = 15;

/**
 * "ℹ️ Asos:" — raqam qaysi hisobdan chiqqani. Har ekranning oxirgi bloki.
 *
 * Sitata ichida va so'nik: bu ma'lumot HAR SAFAR o'qilishi shart emas, lekin
 * bir marta o'qilganda raqamga bo'lgan ishonchni belgilaydi. Shuning uchun
 * ko'rinadi, ammo asosiy raqamlar bilan bir og'irlikda turmaydi.
 */
function basis(...lines: string[]): string[] {
  return ["", quote([`ℹ️ ${b("Asos")}`, ...lines.map((l) => i(l))])];
}

function debtorLine(row: DebtorRow, amount: number, extra = ""): string {
  const kim = row.accountantName ? ` · ${row.accountantName}` : " · biriktirilmagan";
  return `• ${row.name} — ${som(amount)} so'm${extra}${kim}`;
}

export interface DirectorSectionView {
  text: string;
  /** null ⇒ bo'lim bu hisobotda bo'sh (tugma ko'rsatilmasligi kerak edi). */
  empty: boolean;
}

// ── Bo'lim matnlari ─────────────────────────────────────────────────────────

function cashSection(r: DirectorReport): string[] {
  const net = r.yesterday.income - r.yesterday.outflow;
  const lines = [
    `💰 ${b("Pul harakati")} ${i(`· ${uzDate(r.forDate)}`)}`,
    "",
    `⬆️ Kirim   ${som(r.yesterday.income)} so'm`,
    `⬇️ Chiqim  ${som(r.yesterday.outflow)} so'm`,
    `${net >= 0 ? "🟢" : "🔴"} Sof     ${b(`${net >= 0 ? "+" : ""}${som(net)} so'm`)}`,
    "",
    `🏦 ${b("Kassa qoldig'i")}  ${b(`${som(r.balance.balance)} so'm`)}`,
    i(`   jami kirim ${som(r.balance.income)} · jami chiqim ${som(r.balance.outflow)}`),
  ];
  const { b2bIncome, b2cIncome } = r.revenueBreakdown;
  if (b2bIncome > 0 || b2cIncome > 0) {
    lines.push(
      "",
      `📈 ${b("Joriy oy tushumi")}`,
      `   Shartnoma (B2B): ${som(b2bIncome)} so'm`,
      `   Kassa (B2C):     ${som(b2cIncome)} so'm`,
    );
  }
  if (r.plan) {
    lines.push(
      "",
      `🎯 ${b(`${r.plan.period} rejasi: ${r.plan.percent}%`)}`,
      `   Reja: ${som(r.plan.plan)} so'm`,
      `   Fakt: ${som(r.plan.fact)} so'm`,
    );
  }
  return [
    ...lines,
    ...basis(
      "Kirim/chiqim — bank vipiskasi + kassa yozuvlari, o'sha kun sanasi bo'yicha.",
      "Qoldiq — tizim ochilganidan beri jami kirim − jami chiqim (o'chirilganlarsiz).",
      "Reja fakti — shu davrga to'langan/qisman to'langan shartnoma to'lovlari.",
    ),
  ];
}

function collectSection(r: DirectorReport): string[] {
  const rows = r.topDebtors.filter((x) => x.dueNow > 0);
  const lines = [
    `📥 ${b("Bu oy yig'ilishi kerak")} ${i(`· ${r.debt.dueNowCompanies} ta firma`)}`,
    `Jami: ${b(`${som(r.debt.dueNowTotal)} so'm`)}`,
    "",
  ];
  const shown = rows.slice(0, DETAIL_ROWS).map((row) => debtorLine(row, row.dueNow));
  const qolgan = r.debt.dueNowCompanies - Math.min(DETAIL_ROWS, rows.length);
  if (qolgan > 0) shown.push(i(`… va yana ${qolgan} ta — to'liq ro'yxat saytda`));
  if (shown.length > 0) lines.push(expandableQuote(shown));
  return [
    ...lines,
    ...basis(
      "Ish oyi tugagach mijoz KEYINGI oy davomida to'laydi.",
      "Bu — BUZILISH EMAS, inkasso ish ro'yxati: muddati hali ichida.",
      "Hisob = shartnoma summasi × hisoblangan oylar − tushgan to'lovlar.",
    ),
  ];
}

function overdueSection(r: DirectorReport): string[] {
  const rows = r.topDebtors.filter((x) => x.overdue > 0);
  const lines = [
    `⚠️ ${b("Muddati o'tgan qarz")} ${i(`· ${r.debt.overdueCompanies} ta firma`)}`,
    `Jami: ${b(`${som(r.debt.overdueTotal)} so'm`)}`,
  ];
  if (r.debt.neverPaid > 0) {
    lines.push(`🔴 ${r.debt.neverPaid} tasi bir marta ham to'lamagan`);
  }

  // Bosqichlar — bu ro'yxat emas, ISH TARTIBI: qaysi guruhga qanday choralar
  // ko'rilishi shartnomada yozilgan (ogohlantirish → to'xtatish → sud).
  const m = r.agingMatrix.stages;
  const stages = [m.normal, m.warning, m.suspension, m.critical].filter(
    (s) => s.companyCount > 0,
  );
  if (stages.length > 0) {
    lines.push("", `📊 ${b("Kechikish bosqichlari")}`);
    for (const st of stages) {
      lines.push(`   ${esc(st.label)}: ${st.companyCount} ta — ${som(st.totalAmount)} so'm`);
    }
  }

  const rowsOut: string[] = [];
  if (rows.length > 0) {
    lines.push("", b("Eng yiriklari"));
    for (const row of rows.slice(0, DETAIL_ROWS)) {
      const oy = row.monthsOverdue > 0 ? ` · ${row.monthsOverdue} oylik` : "";
      const oxirgi = row.lastPaidPeriod ? "" : " · hech to'lamagan";
      rowsOut.push(debtorLine(row, row.overdue, `${i(`${oy}${oxirgi}`)}`));
    }
    const qolgan = r.debt.overdueCompanies - Math.min(DETAIL_ROWS, rows.length);
    if (qolgan > 0) rowsOut.push(i(`… va yana ${qolgan} ta — to'liq ro'yxat saytda`));
    lines.push(expandableQuote(rowsOut));
  }
  return [
    ...lines,
    ...basis(
      "To'lov oynasi YOPILGAN qarz — aralashuv talab qiladi.",
      "Kechikish kuni eng eski to'lanmagan hisob muddatidan sanaladi.",
      "Ism — biriktirilgan buxgalter, ya'ni kim bilan gaplashish kerakligi.",
    ),
  ];
}

function obligationsSection(r: DirectorReport): string[] {
  const o = r.obligations;
  const lines = [
    b("⏰ Majburiyatlar"),
    "",
    `🔴 Muddati o'tgan: ${b(`${o.overdue} ta`)}`,
    `🟡 Bugun oxirgi kun: ${b(`${o.dueToday} ta`)}`,
  ];
  // "1890 ta" o'zi qaror uchun yaroqsiz raqam — kimda to'planganini bilmasa,
  // direktor buni har kuni o'qib, hech qachon hech narsa qilmaydi.
  if (o.topResponsible.length > 0) {
    lines.push("", b("Kimda to'planib qolgan"));
    for (const row of o.topResponsible) {
      lines.push(`   🔴 ${esc(row.name)}: ${row.count} ta ${i(`· eng eskisi ${row.oldestDays} kun`)}`);
    }
  }
  if (o.unassigned > 0) {
    // Bu boshqacha ish: odamni emas, BIRIKTIRUVNI tuzatish kerak.
    lines.push("", `⚠️ ${b(`Mas'uli biriktirilmagan: ${o.unassigned} ta`)}`);
  }
  return [
    ...lines,
    ...basis(
      "Majburiyat = shartnoma + reglament bo'yicha avtomatik yaratilgan ish",
      "(hisobot topshirish, to'lov, ariza). Ochiq statusdagilar sanaladi.",
      "«Muddati o'tgan» hisoblanadi, saqlanmaydi: dueAt < bugun.",
      "Ro'yxatda eng og'ir 5 mas'ul; qolgani saytdagi «Ishlar» ekranida.",
    ),
  ];
}

function queuesSection(r: DirectorReport): string[] {
  const lines = [`🧾 ${b("Navbatlar")} ${i("— kim nima qilishi kerak")}`, ""];
  lines.push(`🧾 Tasdiq kutayotgan xarajat: ${b(`${r.pending.expenses} ta`)} ${i("· admin")}`);
  lines.push(`📎 Ko'rib chiqilmagan dalil: ${b(`${r.pending.proofs} ta`)} ${i("· nazoratchi")}`);
  lines.push(`🔗 Mijozi topilmagan kirim: ${b(`${r.unmatchedBank.income} ta`)} ${i("· bank-klient")}`);
  lines.push(`🧮 Toifalanmagan chiqim: ${b(`${r.unmatchedBank.expense} ta`)} ${i("· admin")}`);
  return [
    ...lines,
    ...basis(
      "To'rttasi TURLI odamning ishi, shuning uchun bitta raqamga qo'shilmaydi.",
      "Mijozi topilmagan kirim qarzni kamaytirmaydi — bog'lanmaguncha firma",
      "qarzdor bo'lib turadi, ya'ni bu navbat qarzdorlik raqamiga ta'sir qiladi.",
    ),
  ];
}

function onecSection(r: DirectorReport): string[] {
  const d = r.debt1C;
  if (!d) return [`📒 ${b("1C bo'yicha kesim yuklanmagan.")}`];
  const diff = d.total - d.asroComparable;
  const lines = [
    `📒 ${b("1C bilan sverka")} ${i(`· ${uzDate(d.asOf)} holatiga`)}`,
    "",
    `1C:   ${som(d.total)} so'm ${i(`(${d.contracts} shartnoma)`)}`,
    `ASRO: ${som(d.asroComparable)} so'm`,
  ];
  if (Math.abs(diff) > 1000) {
    lines.push(`${b(`Farq: ${diff > 0 ? "+" : ""}${som(diff)} so'm`)}`);
    lines.push(
      "",
      diff > 0
        ? "1C ko'proq: ASRO'da yo'q shartnoma yoki ortiqcha yozilgan to'lov bo'lishi mumkin."
        : "ASRO ko'proq: 1C'ga tushmagan hisob yoki ASRO'da hisobga olinmagan to'lov.",
    );
  } else {
    lines.push("✅ Mos keladi");
  }
  return [
    ...lines,
    ...basis(
      "Ikkala tomon ham JAMG'ARILGAN qarzni beradi va bir xil sanaga keltirilgan.",
      "Joriy oy ishi qo'shilmaydi — 1C uni hali ko'rmaydi, qo'shilsa farq har doim",
      "bir oylik aylanma summasicha yolg'on kattayardi.",
    ),
  ];
}

/** Bo'limda ko'rsatadigan narsa bormi — tugma shu bo'yicha chiziladi. */
export function hasSection(r: DirectorReport, key: DirectorSectionKey): boolean {
  switch (key) {
    case DIRECTOR_SECTION.COLLECT:
      return r.debt.dueNowCompanies > 0;
    case DIRECTOR_SECTION.OVERDUE:
      return r.debt.overdueCompanies > 0;
    case DIRECTOR_SECTION.OBLIGATIONS:
      return r.obligations.overdue > 0 || r.obligations.dueToday > 0;
    case DIRECTOR_SECTION.QUEUES:
      return (
        r.pending.expenses > 0 ||
        r.pending.proofs > 0 ||
        r.unmatchedBank.income > 0 ||
        r.unmatchedBank.expense > 0
      );
    case DIRECTOR_SECTION.ONEC:
      return r.debt1C !== null;
    default:
      // Pul harakati va xulosa har doim bor — nol ham javob.
      return true;
  }
}

export function renderDirectorSection(
  key: DirectorSectionKey,
  report: DirectorReport,
): DirectorSectionView {
  const empty = !hasSection(report, key);
  switch (key) {
    case DIRECTOR_SECTION.CASH:
      return { text: cashSection(report).join("\n"), empty };
    case DIRECTOR_SECTION.COLLECT:
      return { text: collectSection(report).join("\n"), empty };
    case DIRECTOR_SECTION.OVERDUE:
      return { text: overdueSection(report).join("\n"), empty };
    case DIRECTOR_SECTION.OBLIGATIONS:
      return { text: obligationsSection(report).join("\n"), empty };
    case DIRECTOR_SECTION.QUEUES:
      return { text: queuesSection(report).join("\n"), empty };
    case DIRECTOR_SECTION.ONEC:
      return { text: onecSection(report).join("\n"), empty };
    default:
      return { text: "", empty: true };
  }
}

// ── Klaviaturalar ───────────────────────────────────────────────────────────

const secBtn = (secret: string, label: string, key: DirectorSectionKey): InlineButton =>
  cbButton(label, encodeCallback(secret, ACTION.DIR_SECTION, key));

/**
 * Xulosa ostidagi tugmalar. Faqat MAZMUNI BOR bo'limlar chiziladi — bo'sh
 * bo'limga tugma qo'yilsa, direktor bosib "0 ta" ni ko'radi va keyingi safar
 * umuman bosmaydi.
 */
export function directorReportKeyboard(
  secret: string,
  report: DirectorReport,
): InlineKeyboardMarkup {
  const has = (k: DirectorSectionKey) => hasSection(report, k);
  const row1: InlineButton[] = [secBtn(secret, "💰 Pul harakati", DIRECTOR_SECTION.CASH)];
  if (has(DIRECTOR_SECTION.ONEC)) {
    row1.push(secBtn(secret, "📒 1C sverka", DIRECTOR_SECTION.ONEC));
  }
  const row2: InlineButton[] = [];
  if (has(DIRECTOR_SECTION.COLLECT)) {
    row2.push(secBtn(secret, `📥 Yig'iladi (${report.debt.dueNowCompanies})`, DIRECTOR_SECTION.COLLECT));
  }
  if (has(DIRECTOR_SECTION.OVERDUE)) {
    row2.push(secBtn(secret, `⚠️ Muddati o'tgan (${report.debt.overdueCompanies})`, DIRECTOR_SECTION.OVERDUE));
  }
  const row3: InlineButton[] = [];
  if (has(DIRECTOR_SECTION.OBLIGATIONS)) {
    row3.push(secBtn(secret, `⏰ Majburiyat (${report.obligations.overdue})`, DIRECTOR_SECTION.OBLIGATIONS));
  }
  if (has(DIRECTOR_SECTION.QUEUES)) {
    row3.push(secBtn(secret, "🧾 Navbatlar", DIRECTOR_SECTION.QUEUES));
  }
  return inlineKeyboard([
    row1,
    row2,
    row3,
    [cbButton("◀️ Menyu", encodeCallback(secret, ACTION.MENU))],
  ]);
}

/**
 * Batafsil ekranning tugmalari: xulosaga qaytish + saytdagi to'liq ro'yxat.
 * `appUrl` null bo'lsa (lokal HTTP) havola tugmasi umuman chizilmaydi —
 * Telegram HTTPS bo'lmagan url tugmasini jimgina rad etadi.
 */
export function directorSectionKeyboard(
  secret: string,
  key: DirectorSectionKey,
  appUrl: string | null,
): InlineKeyboardMarkup {
  const deep = appUrl ? SECTION_LINK[key] : null;
  return inlineKeyboard([
    deep ? [urlButton(deep.label, `${appUrl}${deep.path}`)] : null,
    [secBtn(secret, "◀️ Hisobotga qaytish", DIRECTOR_SECTION.HOME)],
  ]);
}

/** Har bo'lim uchun saytdagi "to'liq ko'rish" sahifasi. */
const SECTION_LINK: Partial<Record<DirectorSectionKey, { label: string; path: string }>> = {
  [DIRECTOR_SECTION.CASH]: { label: "🌐 Kassa", path: "/kassa" },
  [DIRECTOR_SECTION.COLLECT]: { label: "🌐 Qarzdorlik", path: "/kassa/qarzdorlik" },
  [DIRECTOR_SECTION.OVERDUE]: { label: "🌐 Qarzdorlik", path: "/kassa/qarzdorlik" },
  [DIRECTOR_SECTION.ONEC]: { label: "🌐 Sverka", path: "/kassa/qarzdorlik" },
};
