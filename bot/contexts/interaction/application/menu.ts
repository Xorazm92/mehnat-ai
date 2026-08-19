import type { PrismaClient } from "@prisma/client";
import { OPEN_OBLIGATION_STATUSES } from "../../../../lib/obligationWorkflow";
import { isSeniorRole } from "../../../../lib/permissions";
import { canSeeDirectorReport } from "../../../../lib/directorReport";
import { DIRECTOR_SECTION } from "../../digest/application/render-director-section";
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
import { b, esc, expandableQuote, i } from "../../../telegram/html";
import { rollupLedger } from "../../kpi/application/rollup";
import { periodOf } from "../../kpi/domain/kpi-event";

/** Obligation statuses that still need work — the single source of truth. */
const OPEN_STATUSES = OPEN_OBLIGATION_STATUSES;

/** How many rows a Telegram message can show before it stops being scannable. */
const TASK_LIMIT = 8;

/** Portfel ekranida nechta xodim ko'rinadi. */
const TEAM_LIMIT = 5;

/**
 * Eng eski ishni topish uchun nechta majburiyat ko'riladi. Ko'rinadigan 5
 * kishining har biri ro'yxatda uchrashi uchun yetarli zaxira bilan olinadi —
 * biri 100 ta ish bilan boshini to'sib qo'ymasin.
 */
const OLDEST_SCAN = 200;

/** Muddatdan beri necha kun o'tgani — sanoqqa ma'no beradigan yagona raqam. */
const daysLate = (dueAt: Date, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000));

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
    // Kunlik hisobot 09:00 da o'zi keladi; bu tugma uni ISTALGAN paytda qayta
    // ochadi — ertalabki xabar chatda ko'milib ketsa ham. Handler rolni
    // qaytadan tekshiradi: klaviatura rol o'zgarishidan uzoq yashaydi.
    role && canSeeDirectorReport(role)
      ? [cbButton("📊 Kunlik hisobot", encodeCallback(secret, ACTION.DIR_SECTION, DIRECTOR_SECTION.HOME))]
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
  return [`👋 ${b(fullName)}`, i("Nima qilamiz?")].join("\n");
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
  const head = `${b("📊 KPI ballarim")} ${i(`— ${period}`)}`;
  if (roll.count === 0) {
    return [head, "", "Bu oyda hali KPI hodisasi yo'q."].join("\n");
  }
  const breakdown = Object.entries(roll.byType).map(
    ([t, v]) => `${v >= 0 ? "🟢" : "🔴"} ${esc(KPI_TYPE_LABEL[t] ?? t)} — ${v >= 0 ? "+" : ""}${v}`,
  );
  return [
    head,
    "",
    // Sof ball — ekrandagi YAGONA muhim raqam, shuning uchun yolg'iz turadi.
    `${b(`Sof ball: ${roll.net >= 0 ? "+" : ""}${roll.net}`)} ${i(`· ${roll.count} ta hodisa`)}`,
    "",
    ...breakdown,
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
      // Ish NOMI. Busiz qator "firma + davr + sana" dan iborat bo'lardi va
      // xodim ro'yxatga qarab nima qilishi kerakligini bilmasdi — soliq
      // deklaratsiyasimi, statistikami, hisobotmi.
      template: { select: { name: true } },
    },
    orderBy: { dueAt: "asc" },
    take: TASK_LIMIT + 1,
  });

  if (obligations.length === 0) {
    return "✅ Ochiq majburiyatingiz yo'q.";
  }

  const shown = obligations.slice(0, TASK_LIMIT);
  // Ish NOMI qalin, tafsilot esa so'nik: ro'yxatga qaragan odam avval "nima
  // qilish kerak" ni ko'radi, "qaysi firma, qachon" keyingi navbatda turadi.
  const lines = shown.map((o) => {
    // isOverdue is computed, never stored — see the Obligation model comment.
    const overdue = o.dueAt < now;
    return [
      `${overdue ? "🔴" : "🟡"} ${b(o.template.name)}`,
      `      ${esc(o.company.name)} ${i(`· ${o.periodKey} · ${ymd(o.dueAt)}`)}`,
    ].join("\n");
  });
  if (obligations.length > TASK_LIMIT) {
    lines.push(i(`… va yana ${obligations.length - TASK_LIMIT} ta`));
  }
  const overdueCount = shown.filter((o) => o.dueAt < now).length;
  const head =
    overdueCount > 0
      ? `${b("📋 Vazifalarim")} ${i(`— ${overdueCount} ta muddati o'tgan`)}`
      : b("📋 Vazifalarim");
  return [head, "", ...lines].join("\n");
}

/**
 * Portfel ekrani: mening qamrovimda kim orqada va menda nima kutmoqda.
 *
 * Sanoq o'zi hech narsa demaydi — "Sevara: 126 ta" ni o'qigan rahbar keyin
 * baribir saytga kirib qaramaguncha nima qilishini bilmaydi. Shuning uchun
 * har ism yonida ENG ESKI ochiq majburiyat ko'rsatiladi: qaysi firma, qaysi
 * davr va necha kun kechikkani — suhbat aynan shundan boshlanadi.
 *
 * Guruhlash bazada bajariladi (nazoratchi portfelida minglab majburiyat
 * bo'lishi mumkin), tafsilot esa faqat ko'rinadigan 5 kishi uchun olinadi.
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
  const overdueWhere = { status: { in: OPEN_STATUSES }, dueAt: { lt: now }, ...scope };

  const [behind, totalOverdue, pendingKpi] = await Promise.all([
    prisma.obligation.groupBy({
      by: ["responsibleUserId"],
      where: overdueWhere,
      _count: { _all: true },
      orderBy: { _count: { responsibleUserId: "desc" } },
      take: TEAM_LIMIT,
    }),
    prisma.obligation.count({ where: overdueWhere }),
    prisma.monthlyPerformance.count({ where: { status: "submitted", ...scope } }),
  ]);

  const lines = [b("🏢 Portfelim"), ""];
  if (behind.length === 0) {
    lines.push("✅ Muddati o'tgan majburiyat yo'q.");
  } else {
    const ids = behind.map((b) => b.responsibleUserId).filter((id): id is string => !!id);
    const [users, oldest] = await Promise.all([
      ids.length
        ? prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
        : Promise.resolve([]),
      // Har bir odamning eng eski ishi. Bittalab so'rov o'rniga bitta so'rov:
      // eng eskilar boshida turadi, birinchi uchragani o'sha odamniki bo'ladi.
      prisma.obligation.findMany({
        where: { ...overdueWhere, responsibleUserId: { in: ids } },
        select: {
          responsibleUserId: true,
          dueAt: true,
          periodKey: true,
          company: { select: { name: true } },
          template: { select: { name: true } },
        },
        orderBy: { dueAt: "asc" },
        take: OLDEST_SCAN,
      }),
    ]);
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    const firstFor = new Map<string, (typeof oldest)[number]>();
    for (const o of oldest) {
      if (o.responsibleUserId && !firstFor.has(o.responsibleUserId)) {
        firstFor.set(o.responsibleUserId, o);
      }
    }

    lines.push(i(`Muddati o'tgan majburiyatlar — jami ${totalOverdue} ta`), "");
    // Har xodim — ikki qator: kim/qancha, keyin eng eski ishi. Uch bo'lakni
    // bitta qatorga tiqish telefonda o'ralib ketardi va ro'yxat o'qilmasdi.
    const rows: string[] = [];
    for (const row of behind) {
      // Biriktirilmagan qatorni ism bilan yozib bo'lmaydi va u BOSHQA ish:
      // odamga emas, biriktiruvga e'tibor kerak.
      const who = row.responsibleUserId
        ? (names.get(row.responsibleUserId) ?? "—")
        : "⚠️ biriktirilmagan";
      rows.push(`🔴 ${b(who)} — ${row._count._all} ta`);
      const o = row.responsibleUserId ? firstFor.get(row.responsibleUserId) : undefined;
      if (o) {
        rows.push(
          `      ${esc(o.template.name)}`,
          `      ${esc(o.company.name)} ${i(`· ${o.periodKey} · ${daysLate(o.dueAt, now)} kun`)}`,
        );
      }
      rows.push("");
    }
    // Yig'iladigan sitata: yopiq holda xabar qisqa turadi, bosilganda hammasi
    // ochiladi — ya'ni hech narsa yashirilmaydi, lekin ekran to'lib ketmaydi.
    lines.push(expandableQuote(rows.filter((r, idx) => !(r === "" && idx === rows.length - 1))));
    const qolgan = totalOverdue - behind.reduce((sum, x) => sum + x._count._all, 0);
    if (qolgan > 0) lines.push(i(`… va yana ${qolgan} ta boshqalarda`));
  }
  if (pendingKpi > 0) {
    lines.push("", `📊 ${b(pendingKpi)} ta KPI qatori tasdiqingizni kutmoqda`);
  }
  return lines.join("\n");
}
