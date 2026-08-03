import type { PrismaClient } from "@prisma/client";
import { OPEN_OBLIGATION_STATUSES } from "../../../../lib/obligationWorkflow";
import { isSeniorRole } from "../../../../lib/permissions";
import { scopeCompanyIds } from "../../../../lib/dailyDigest";
import { encodeCallback } from "../domain/callback-token";
import { ACTION } from "../domain/actions";
import {
  cbButton,
  inlineKeyboard,
  webAppButton,
  type InlineKeyboardMarkup,
} from "../../../telegram/keyboard";
import { appBaseUrl } from "../../../config";
import { rollupLedger } from "../../kpi/application/rollup";
import { periodOf } from "../../kpi/domain/kpi-event";

/** Obligation statuses that still need work — the single source of truth. */
const OPEN_STATUSES = OPEN_OBLIGATION_STATUSES;

/** How many rows a Telegram message can show before it stops being scannable. */
const TASK_LIMIT = 8;

const KPI_TYPE_LABEL: Record<string, string> = {
  response: "Javob (savollarga)",
  attendance: "Davomat",
  report: "Hisobot",
  manual: "Qo'lda tuzatish",
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The bot's home screen. Buttons replace the slash commands they came from.
 * The portfolio row appears only for senior roles — the handler re-checks that
 * too, since a keyboard can outlive a role change.
 */
export function mainMenuKeyboard(secret: string, role?: string): InlineKeyboardMarkup {
  // Telegram refuses a web_app button on anything but HTTPS, so on a local run
  // (appBaseUrl() === null) the Mini App row is simply absent rather than dead.
  const app = appBaseUrl();
  return inlineKeyboard([
    [
      cbButton("📅 Bugun", encodeCallback(secret, ACTION.MENU_TODAY)),
      cbButton("📋 Vazifalarim", encodeCallback(secret, ACTION.MENU_TASKS)),
    ],
    [
      cbButton("📊 KPI ballarim", encodeCallback(secret, ACTION.MENU_KPI)),
      cbButton("🔑 Sayt paroli", encodeCallback(secret, ACTION.MENU_PASSWORD)),
    ],
    role && isSeniorRole(role)
      ? [cbButton("🏢 Portfelim", encodeCallback(secret, ACTION.MENU_TEAM))]
      : null,
    app
      ? [
          webAppButton("📄 Dalil yuklash", `${app}/telegram-app/proof`),
          webAppButton("📊 Dashboard", `${app}/telegram-app/dashboard`),
        ]
      : null,
  ]);
}

/** A "back to menu" row for drill-down screens. */
export function backToMenuKeyboard(secret: string): InlineKeyboardMarkup {
  return inlineKeyboard([[cbButton("◀️ Menyu", encodeCallback(secret, ACTION.MENU))]]);
}

export function renderMenu(fullName: string): string {
  return [`👋 ${fullName}`, "", "Nima qilamiz?"].join("\n");
}

/**
 * The caller's own current-month KPI, summed live from the ledger.
 * Shared by `/stats` and the menu button so the two can never disagree.
 */
export async function renderMyKpi(
  prisma: PrismaClient,
  user: { id: string; fullName: string },
): Promise<string> {
  const period = periodOf(new Date());
  const events = await prisma.kpiEvent.findMany({
    where: { employeeId: user.id, periodMonth: period },
    select: { type: true, points: true },
  });
  const roll = rollupLedger(events.map((e) => ({ type: e.type, points: Number(e.points) })));
  if (roll.count === 0) {
    return `📊 ${user.fullName} — ${period}\nBu oyda hali KPI hodisasi yo'q.`;
  }
  const breakdown = Object.entries(roll.byType)
    .map(([t, v]) => `• ${KPI_TYPE_LABEL[t] ?? t}: ${v >= 0 ? "+" : ""}${v}`)
    .join("\n");
  return [
    `📊 ${user.fullName} — ${period}`,
    `Sof ball: ${roll.net >= 0 ? "+" : ""}${roll.net}`,
    `Hodisalar: ${roll.count}`,
    breakdown,
  ].join("\n");
}

/** The caller's open obligations, soonest first, overdue ones flagged. */
export async function renderMyTasks(
  prisma: PrismaClient,
  user: { id: string; fullName: string },
  now = new Date(),
): Promise<string> {
  const obligations = await prisma.obligation.findMany({
    where: { responsibleUserId: user.id, status: { in: OPEN_STATUSES } },
    select: {
      dueAt: true,
      periodKey: true,
      status: true,
      company: { select: { name: true } },
    },
    orderBy: { dueAt: "asc" },
    take: TASK_LIMIT + 1,
  });

  if (obligations.length === 0) {
    return "✅ Ochiq majburiyatingiz yo'q.";
  }

  const shown = obligations.slice(0, TASK_LIMIT);
  const lines = shown.map((o) => {
    // isOverdue is computed, never stored — see the Obligation model comment.
    const overdue = o.dueAt < now;
    return `${overdue ? "🔴" : "🟡"} ${o.company.name} — ${o.periodKey} · ${ymd(o.dueAt)}`;
  });
  if (obligations.length > TASK_LIMIT) {
    lines.push(`… va yana ${obligations.length - TASK_LIMIT} ta`);
  }
  const overdueCount = shown.filter((o) => o.dueAt < now).length;
  const head = overdueCount > 0 ? `📋 Vazifalar (${overdueCount} ta muddati o'tgan)` : "📋 Vazifalar";
  return [head, "", ...lines].join("\n");
}

/**
 * The portfolio screen: who in my scope is behind, and what is waiting on me.
 *
 * Grouped in the database rather than pulled and counted in memory — a
 * supervisor's portfolio can hold thousands of obligations.
 */
export async function renderTeam(
  prisma: PrismaClient,
  actor: { id: string; role: string },
  now = new Date(),
): Promise<string> {
  if (!isSeniorRole(actor.role)) {
    return "Bu ekran faqat nazoratchi va bosh buxgalter uchun.";
  }

  const companyIds = await scopeCompanyIds(prisma, actor);
  if (companyIds !== null && companyIds.length === 0) {
    return "🏢 Portfelingizda korxona yo'q.";
  }
  const scope = companyIds === null ? {} : { companyId: { in: companyIds } };

  const [behind, pendingKpi] = await Promise.all([
    prisma.obligation.groupBy({
      by: ["responsibleUserId"],
      where: { status: { in: OPEN_STATUSES }, dueAt: { lt: now }, ...scope },
      _count: { _all: true },
      orderBy: { _count: { responsibleUserId: "desc" } },
      take: 5,
    }),
    prisma.monthlyPerformance.count({ where: { status: "submitted", ...scope } }),
  ]);

  const lines = ["🏢 Portfelim", ""];
  if (behind.length === 0) {
    lines.push("✅ Muddati o'tgan majburiyat yo'q.");
  } else {
    const ids = behind.map((b) => b.responsibleUserId).filter((id): id is string => !!id);
    const names = new Map(
      (
        await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
      ).map((u) => [u.id, u.fullName]),
    );
    lines.push("Muddati o'tgan majburiyatlar:");
    for (const row of behind) {
      const who = row.responsibleUserId
        ? (names.get(row.responsibleUserId) ?? "—")
        : "biriktirilmagan";
      lines.push(`🔴 ${who}: ${row._count._all} ta`);
    }
  }
  if (pendingKpi > 0) {
    lines.push("", `📊 ${pendingKpi} ta KPI qatori tasdiqingizni kutmoqda`);
  }
  return lines.join("\n");
}
