import type { Digest } from "../../../../lib/engines/automation/dailyDigest";
import { encodeCallback } from "../../interaction/domain/callback-token";
import { ACTION } from "../../interaction/domain/actions";
import { cbButton, inlineKeyboard, type InlineKeyboardMarkup } from "../../../telegram/keyboard";

export interface RenderedDigest {
  text: string;
  keyboard: InlineKeyboardMarkup;
}

const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr",
];

/** "29-iyul" — lib/format.ts bilan bir uslubda, Intl'siz (SSR/worker xavfsiz). */
function uzDate(d: Date): string {
  return `${d.getUTCDate()}-${UZ_MONTHS[d.getUTCMonth()]}`;
}

/**
 * The morning plan.
 *
 * Ordered by what can still be fixed today: overdue first, then due-today, then
 * the counters. A digest is only ever rendered when it has something in it —
 * `runDailyDigest` drops empty ones before reaching here.
 */
export function renderDigest(secret: string, digest: Digest, now = new Date()): RenderedDigest {
  const { counts } = digest;
  const lines = [`📅 Bugungi reja — ${uzDate(now)}`, ""];

  for (const item of digest.items) {
    const mark = item.overdue ? "🔴" : "🟡";
    const when = item.overdue ? `muddat o'tdi (${uzDate(item.dueAt)})` : "bugun oxirgi kun";
    lines.push(`${mark} ${item.what} — ${item.companyName} · ${when}`);
  }
  if (digest.more > 0) lines.push(`… va yana ${digest.more} ta majburiyat`);

  const extras: string[] = [];
  // Kecha kechikkanlari — umumiy `overdue` haftalab o'zgarmasligi mumkin,
  // yangi kechikish esa aynan bugungi ish.
  if (counts.newlyOverdue > 0) extras.push(`🆕 ${counts.newlyOverdue} ta majburiyat kecha kechikdi`);
  // Zanjir bo'ylab menga ko'tarilganlar. Bungacha bularning HAR BIRI alohida
  // xabar edi (bir bosh buxgalter bir soatda 6 389 ta olgan) — endi bitta qator.
  if (counts.escalatedToMe > 0) {
    extras.push(`⬆️ ${counts.escalatedToMe} ta majburiyat sizga ko'tarildi`);
  }
  if (counts.openQuestions > 0) extras.push(`💬 ${counts.openQuestions} ta javobsiz mijoz savoli`);
  if (counts.pendingKpi > 0) extras.push(`📊 ${counts.pendingKpi} ta KPI qatori tasdiqingizni kutmoqda`);
  if (counts.unpaidCompanies > 0) extras.push(`💳 ${counts.unpaidCompanies} ta mijozdan to'lov tushmagan`);
  if (extras.length) {
    if (digest.items.length) lines.push("");
    lines.push(...extras);
  }

  return {
    text: lines.join("\n"),
    keyboard: inlineKeyboard([
      [
        cbButton("📋 Vazifalarim", encodeCallback(secret, ACTION.MENU_TASKS)),
        cbButton("📊 KPI ballarim", encodeCallback(secret, ACTION.MENU_KPI)),
      ],
      [cbButton("◀️ Menyu", encodeCallback(secret, ACTION.MENU))],
    ]),
  };
}
