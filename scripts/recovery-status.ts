/**
 * PRODUCTION RECOVERY — HOLAT O'LCHAGICHI (qat'iy READ-ONLY)
 * ==========================================================
 * Audit raqamlarini bir martalik topilmadan TAKRORLANADIGAN o'lchovga
 * aylantiradi. Har bir tuzatishdan keyin qayta yuritiladi va farq ko'rinadi.
 *
 * KAFOLAT — bu skript hech narsa o'zgartirmaydi:
 *   • faqat SELECT / count / groupBy / aggregate
 *   • Redis'ga faqat o'qish buyruqlari (PING, SCAN, TYPE, LLEN, ZCARD)
 *   • worker yoki queue ishga tushirmaydi, job qo'shmaydi
 *   • migratsiya, seed, backfill YO'Q
 *
 * ISHLATISH:
 *   npm run recovery:status
 *   npm run recovery:status -- --json     # mashina uchun
 */
import "./load-env";
import { Redis } from "ioredis";
import { prisma } from "@/lib/prisma";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/obligationWorkflow";
import { LEDGER_DRIFT_TOLERANCE } from "@/lib/ledger";

const JSON_MODE = process.argv.includes("--json");

// ── Chiqish yordamchilari ────────────────────────────────────────────────
const out: string[] = [];
const say = (s = "") => out.push(s);
const num = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const pad = (n: number | string, w: number) => String(n).padStart(w);
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 19).replace("T", " ") : "—");

function header(title: string): void {
  say();
  say(`━━━ ${title} ${"━".repeat(Math.max(0, 66 - title.length))}`);
}

/** Natija baholanishi — hisobot oxiridagi xulosa uchun. */
type Verdict = "ok" | "warn" | "block";
const findings: { verdict: Verdict; label: string; detail: string }[] = [];
const note = (verdict: Verdict, label: string, detail: string) => {
  findings.push({ verdict, label, detail });
  const icon = verdict === "ok" ? "✓" : verdict === "warn" ? "!" : "✗";
  say(`  ${icon} ${label}: ${detail}`);
};

/** Maxfiy qiymatlarni ko'rsatmaymiz — bu chiqish terminal tarixida qoladi. */
const shown = (v: string | undefined) => (v && v.length > 0 ? "<BELGILANGAN>" : "<BO'SH>");

interface Section {
  [key: string]: unknown;
}
const machine: Record<string, Section> = {};

// ═════════════════════════════════════════════════════════════════════════
// 1. MUHIT
// ═════════════════════════════════════════════════════════════════════════
function checkEnv(): void {
  header("1 · MUHIT");

  const dbUrl = process.env.DATABASE_URL ?? "";
  let dbTarget = "<O'QILMADI>";
  try {
    const u = new URL(dbUrl);
    dbTarget = `${u.hostname}:${u.port || 5432}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    /* noma'lum format */
  }

  const redisUrl = process.env.REDIS_URL ?? "(o'rnatilmagan → redis://127.0.0.1:6379)";
  const botMode = process.env.BOT_MODE ?? "(o'rnatilmagan → webhook)";
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  say(`  Baza          : ${dbTarget}`);
  say(`  REDIS_URL     : ${redisUrl}`);
  say(`  BOT_MODE      : ${botMode}`);
  say(`  BOT_TOKEN     : ${shown(botToken)}`);
  say(`  WEBHOOK_SECRET: ${shown(webhookSecret)}`);
  say(`  NODE_ENV      : ${process.env.NODE_ENV ?? "(o'rnatilmagan)"}`);
  say(`  TZ            : ${process.env.TZ ?? "(o'rnatilmagan)"}`);
  say();

  const effectiveMode = process.env.BOT_MODE ?? "webhook";
  if (effectiveMode === "webhook" && !webhookSecret) {
    note(
      "block",
      "Telegram ingress",
      "BOT_MODE=webhook, lekin TELEGRAM_WEBHOOK_SECRET bo'sh — " +
        "/api/telegram/webhook HAR BIR update'ni 503 bilan rad etadi (fail-closed).",
    );
  } else if (!botToken) {
    note("block", "Telegram ingress", "TELEGRAM_BOT_TOKEN bo'sh — yuborish ham, polling ham o'chiq.");
  } else {
    note("ok", "Telegram ingress", `rejim=${effectiveMode}, token va secret joyida`);
  }

  machine.env = { dbTarget, redisUrl, botMode: effectiveMode, hasToken: !!botToken, hasWebhookSecret: !!webhookSecret };
}

// ═════════════════════════════════════════════════════════════════════════
// 2. REDIS + BULLMQ NAVBATLARI
// ═════════════════════════════════════════════════════════════════════════
const QUEUES = ["message", "question", "obligation", "kpi", "notify"] as const;

async function checkRedis(): Promise<void> {
  header("2 · REDIS + NAVBATLAR");

  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  if (url.trim() === "") {
    note("block", "Redis", 'REDIS_URL ataylab bo\'sh — BullMQ umuman ishlamaydi (bot butunlay o\'lik).');
    machine.redis = { reachable: false, reason: "REDIS_URL empty" };
    return;
  }

  // lazyConnect + qisqa timeout: Redis o'lik bo'lsa skript osilib qolmasin.
  const redis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null, // qayta urinmaymiz — bu diagnostika
  });
  redis.on("error", () => {}); // ioredis 'error' tinglovchisiz jarayonni yiqitadi

  try {
    await redis.connect();
    const pong = await redis.ping();
    note("ok", "Redis", `javob bermoqda (${pong}) — ${url}`);
  } catch (e) {
    note(
      "block",
      "Redis",
      `ULANIB BO'LMADI (${(e as Error).message}). BullMQ scheduler'lari Redis'da yashaydi — ` +
        "ya'ni obligation generatsiyasi, sweep, KPI, digest, eskalatsiya HECH BIRI ishlamayapti.",
    );
    machine.redis = { reachable: false, url, reason: (e as Error).message };
    redis.disconnect();
    return;
  }

  // ── Har navbat bo'yicha holat (faqat o'qish) ──────────────────────────
  say();
  say("  navbat        kutmoqda  faol  kechik.  yiqilgan  bajarilgan  rejalar");
  say("  ────────────  ────────  ────  ───────  ────────  ──────────  ───────");

  const queueStats: Record<string, Record<string, number>> = {};
  for (const q of QUEUES) {
    const base = `bull:${q}`;
    const [wait, active, delayed, failed, completed] = await Promise.all([
      redis.llen(`${base}:wait`).catch(() => 0),
      redis.llen(`${base}:active`).catch(() => 0),
      redis.zcard(`${base}:delayed`).catch(() => 0),
      redis.zcard(`${base}:failed`).catch(() => 0),
      redis.zcard(`${base}:completed`).catch(() => 0),
    ]);
    // BullMQ v5 Job Scheduler'lari `bull:<q>:repeat` ZSET'ida turadi.
    const schedulers = await redis.zcard(`${base}:repeat`).catch(() => 0);

    queueStats[q] = { wait, active, delayed, failed, completed, schedulers };
    say(
      `  ${q.padEnd(12)}  ${pad(wait, 8)}  ${pad(active, 4)}  ${pad(delayed, 7)}  ` +
        `${pad(failed, 8)}  ${pad(completed, 10)}  ${pad(schedulers, 7)}`,
    );
  }
  say();

  // Scheduler'lar ro'yxatdan o'tganmi? Bu `bot/main.ts` ishga tushganini bildiradi.
  const schedulerTotal = Object.values(queueStats).reduce((s, q) => s + q.schedulers, 0);
  if (schedulerTotal === 0) {
    note(
      "block",
      "BullMQ scheduler'lari",
      "BITTA ham takrorlanuvchi reja ro'yxatdan o'tmagan — `bot/main.ts` (asro-bot) " +
        "hech qachon ishga tushmagan yoki Redis tozalangan. 06:00 generatsiya, soatlik " +
        "sweep, KPI, digest — hech biri rejalashtirilmagan.",
    );
  } else {
    note("ok", "BullMQ scheduler'lari", `${schedulerTotal} ta reja ro'yxatda`);
  }

  const failedTotal = Object.values(queueStats).reduce((s, q) => s + q.failed, 0);
  if (failedTotal > 0) {
    note("warn", "Yiqilgan job'lar", `${failedTotal} ta — sabablarini pm2 loglaridan qarang`);
  }

  const completedTotal = Object.values(queueStats).reduce((s, q) => s + q.completed, 0);
  if (completedTotal === 0 && schedulerTotal > 0) {
    note("warn", "Bajarilgan job'lar", "0 — rejalar bor, lekin hech qachon yugurmagan (worker o'lik?)");
  }

  machine.redis = { reachable: true, url, queues: queueStats };
  redis.disconnect();
}

// ═════════════════════════════════════════════════════════════════════════
// 3. TELEGRAM ULANISHI
// ═════════════════════════════════════════════════════════════════════════
async function checkTelegram(): Promise<void> {
  header("3 · TELEGRAM ULANISHI");

  const [groups, boundGroups, staff, linkedStaff, kpiEvents, lastUpdate] = await Promise.all([
    prisma.telegramGroup.count(),
    prisma.telegramGroup.count({ where: { companyId: { not: null } } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true, telegramUserId: { not: null } } }),
    prisma.kpiEvent.count(),
    prisma.processedUpdate.findFirst({ orderBy: { processedAt: "desc" }, select: { processedAt: true } }),
  ]);

  say(`  TelegramGroup      : ${groups} ta (firmaga bog'langan: ${boundGroups})`);
  say(`  Faol xodim         : ${staff} ta`);
  say(`  Telegram'ga ulangan: ${linkedStaff} ta (${staff > 0 ? Math.round((linkedStaff / staff) * 100) : 0}%)`);
  say(`  KpiEvent           : ${kpiEvents} ta`);
  say(`  Oxirgi update      : ${iso(lastUpdate?.processedAt)}`);
  say();

  if (groups === 0) {
    note("block", "Guruh bog'lanishi", "0 ta TelegramGroup — hech kim /bind qila olmagan (ingress yopiq)");
  } else {
    note(groups === boundGroups ? "ok" : "warn", "Guruh bog'lanishi", `${boundGroups}/${groups} firmaga bog'langan`);
  }

  if (!lastUpdate) {
    note("block", "Update oqimi", "ProcessedUpdate bo'sh — bot HECH QACHON bitta ham update qayta ishlamagan");
  } else {
    const ageH = (Date.now() - lastUpdate.processedAt.getTime()) / 3_600_000;
    note(
      ageH < 24 ? "ok" : "warn",
      "Update oqimi",
      `oxirgisi ${ageH < 48 ? `${ageH.toFixed(1)} soat` : `${(ageH / 24).toFixed(0)} kun`} oldin`,
    );
  }

  if (kpiEvents === 0) {
    note("block", "KPI hodisalari", "0 ta — savol/javob oqimi umuman boshlanmagan");
  }

  machine.telegram = { groups, boundGroups, staff, linkedStaff, kpiEvents, lastUpdateAt: lastUpdate?.processedAt ?? null };
}

// ═════════════════════════════════════════════════════════════════════════
// 4. MAJBURIYAT DVIGATELI
// ═════════════════════════════════════════════════════════════════════════
function currentPeriodKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-M${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function checkObligations(): Promise<void> {
  header("4 · MAJBURIYAT DVIGATELI");

  const now = new Date();
  const thisPeriod = currentPeriodKey(now);

  const [total, templates, lastCreated, byPeriod] = await Promise.all([
    prisma.obligation.count(),
    prisma.deadlineTemplate.count({ where: { lifecycle: "active", active: true } }),
    prisma.obligation.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, periodKey: true } }),
    prisma.obligation.groupBy({ by: ["periodKey"], _count: { _all: true } }),
  ]);

  say(`  Jami Obligation    : ${total} ta`);
  say(`  Faol shablon       : ${templates} ta`);
  say(`  Oxirgi generatsiya : ${iso(lastCreated?.createdAt)}  (davr: ${lastCreated?.periodKey ?? "—"})`);
  say();
  say("  Davr bo'yicha:");
  const sorted = [...byPeriod].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  for (const p of sorted) say(`    ${p.periodKey.padEnd(10)} ${pad(p._count._all, 6)}`);
  say();

  const currentCount = byPeriod.find((p) => p.periodKey === thisPeriod)?._count._all ?? 0;
  if (currentCount === 0) {
    note(
      "block",
      `Joriy davr (${thisPeriod})`,
      "0 ta majburiyat — generatsiya bu oy uchun HECH QACHON yugurmagan. " +
        "Trigger: `npm run obligations:generate` (bot to'xtatilgan holda).",
    );
  } else {
    note("ok", `Joriy davr (${thisPeriod})`, `${currentCount} ta majburiyat`);
  }

  if (lastCreated) {
    const ageDays = (Date.now() - lastCreated.createdAt.getTime()) / 86_400_000;
    if (ageDays > 2) {
      note("warn", "Generatsiya yoshi", `oxirgi yozuv ${ageDays.toFixed(0)} kun oldin (kunlik 06:00 cron ishlamayapti)`);
    }
  }

  // ── PAYROLL shablonlari: universal + period_end_offset tuzog'i ────────
  const payroll = await prisma.obligation.findMany({
    where: { template: { code: { in: ["PAYROLL_CALC", "PAYROLL_POSTED"] } } },
    select: { periodKey: true, status: true, dueAt: true, template: { select: { code: true } } },
  });
  if (payroll.length > 0) {
    const grouped = new Map<string, number>();
    for (const o of payroll) {
      const k = `${o.periodKey} · ${o.template.code}`;
      grouped.set(k, (grouped.get(k) ?? 0) + 1);
    }
    say("  PAYROLL shablonlari (universal — applicability mezoni yo'q):");
    for (const [k, v] of [...grouped].sort()) say(`    ${k.padEnd(30)} ${pad(v, 6)}`);
    say();

    const stalePayroll = payroll.filter(
      (o) =>
        o.periodKey < thisPeriod &&
        o.dueAt < now &&
        (OPEN_OBLIGATION_STATUSES as string[]).includes(o.status),
    ).length;
    if (stalePayroll > 0) {
      note(
        "block",
        "Soxta PAYROLL majburiyatlari",
        `${stalePayroll} ta ochiq + muddati o'tgan, o'tgan davrlarda. Shablon effectiveFrom ` +
          "2026-08-01 ga ko'chirilgan (sabab tuzatilgan), lekin YOZUVLAR bazada qolgan. " +
          "Bot yoqilsa har biri uchun qizil eskalatsiya ketadi.",
      );
    }
  }

  // ── Kechikkanlar: shablon kesimida ────────────────────────────────────
  const overdue = await prisma.obligation.findMany({
    where: { dueAt: { lt: now }, status: { in: OPEN_OBLIGATION_STATUSES } },
    select: { periodKey: true, responsibleUserId: true, template: { select: { code: true } } },
  });
  const byTemplate = new Map<string, number>();
  for (const o of overdue) byTemplate.set(o.template.code, (byTemplate.get(o.template.code) ?? 0) + 1);
  say(`  Kechikkan (dueAt < hozir, status ochiq): ${overdue.length} ta`);
  for (const [code, n] of [...byTemplate].sort((a, b) => b[1] - a[1])) {
    say(`    ${code.padEnd(20)} ${pad(n, 6)}`);
  }
  say();

  const orphanOverdue = overdue.filter((o) => !o.responsibleUserId).length;
  if (orphanOverdue > 0) {
    note(
      "warn",
      "Mas'ulsiz kechikkanlar",
      `${orphanOverdue}/${overdue.length} tasida responsibleUserId bo'sh — sweep ular bo'yicha ` +
        "HECH KIMGA xabar yubormaydi (firmaga buxgalter biriktirilmagan).",
    );
  }

  const noFirstOverdue = await prisma.obligation.count({
    where: { dueAt: { lt: now }, status: { in: OPEN_OBLIGATION_STATUSES }, firstOverdueAt: null },
  });
  if (noFirstOverdue > 0) {
    note(
      "block",
      "Sweep ishlamayapti",
      `${noFirstOverdue} ta kechikkan majburiyatda firstOverdueAt bo'sh — soatlik sweep ` +
        "ularni hech qachon belgilamagan (ya'ni eslatma ham yubormagan).",
    );
  }

  machine.obligations = {
    total,
    activeTemplates: templates,
    currentPeriod: thisPeriod,
    currentPeriodCount: currentCount,
    lastCreatedAt: lastCreated?.createdAt ?? null,
    byPeriod: Object.fromEntries(sorted.map((p) => [p.periodKey, p._count._all])),
    overdue: overdue.length,
    overdueByTemplate: Object.fromEntries(byTemplate),
    overdueWithoutResponsible: orphanOverdue,
    overdueWithoutFirstOverdueAt: noFirstOverdue,
    payrollTotal: payroll.length,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// 5. JURNAL ↔ MANBA MOSLIGI
// ═════════════════════════════════════════════════════════════════════════
interface GapRow {
  cnt: number;
  total: number;
}

async function checkJournal(): Promise<void> {
  header("5 · JURNAL ↔ MANBA");

  // Har manba jadval uchun: jurnalda IZI YO'Q qatorlar. `monthClose.ts` dagi
  // yaxlitlik tekshiruvi bu yo'nalishni ko'rmaydi — u id'larni LedgerEntry'dan
  // yig'adi, ya'ni jurnalda umuman qatori bo'lmagan manba unga tushmaydi.
  const [kassa, payment, expense, payout] = await Promise.all([
    prisma.$queryRaw<GapRow[]>`
      SELECT count(*)::int AS cnt, coalesce(sum(k.amount), 0)::float8 AS total
        FROM "KassaEntry" k
       WHERE k."deletedAt" IS NULL
         -- FAQAT TASDIQLANGAN — lib/reconciliation.ts bilan bir xil shart.
         -- "pending" yozuvda pul hali chiqmagan, ya'ni jurnal qatori
         -- BO'LMASLIGI to'g'ri. Bu filtr yo'qligi sababli skript tasdiq
         -- navbatidagi 3 qatorni (63 048 000 so'm) "jurnalga tushmagan" deb
         -- ko'rsatib, backfill hammasini yopgandan keyin ham qizil turgan edi.
         AND k.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                          WHERE l."sourceId" = k.id AND l."sourceTable" = 'KassaEntry')`,
    prisma.$queryRaw<GapRow[]>`
      SELECT count(*)::int AS cnt, coalesce(sum(p.amount), 0)::float8 AS total
        FROM "Payment" p
       WHERE p."deletedAt" IS NULL AND p.status IN ('paid', 'partial')
         AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                          WHERE l."sourceId" = p.id AND l."sourceTable" = 'Payment')`,
    prisma.$queryRaw<GapRow[]>`
      SELECT count(*)::int AS cnt, coalesce(sum(e.amount), 0)::float8 AS total
        FROM "Expense" e
       WHERE e."deletedAt" IS NULL AND e.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                          WHERE l."sourceId" = e.id AND l."sourceTable" = 'Expense')`,
    prisma.$queryRaw<GapRow[]>`
      SELECT count(*)::int AS cnt, coalesce(sum(o.amount), 0)::float8 AS total
        FROM "Payout" o
       WHERE o."deletedAt" IS NULL
         AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                          WHERE l."sourceId" = o.id AND l."sourceTable" = 'Payout')`,
  ]);

  const rows: [string, GapRow][] = [
    ["KassaEntry", kassa[0]],
    ["Payment", payment[0]],
    ["Expense", expense[0]],
    ["Payout", payout[0]],
  ];

  say("  Jurnalda IZI YO'Q manba qatorlari:");
  say("    jadval        qator          summa (so'm)");
  say("    ────────────  ─────  ────────────────────");
  let gapTotal = 0;
  let gapCount = 0;
  for (const [name, r] of rows) {
    say(`    ${name.padEnd(12)}  ${pad(r.cnt, 5)}  ${pad(num(r.total), 20)}`);
    gapTotal += r.total;
    gapCount += r.cnt;
  }
  say();

  // Balans ikki manbadan: manba jadvallar (lib/balance.ts) ↔ jurnal (lib/ledger.ts)
  const [srcAgg, ledgerAgg] = await Promise.all([
    prisma.$queryRaw<{ balance: number }[]>`
      SELECT (
        coalesce((SELECT sum(amount) FROM "Payment"    WHERE "deletedAt" IS NULL AND status IN ('paid','partial')), 0)
      -- status = 'approved' SHART: lib/balance.ts aynan shunday filtrlaydi.
      -- Filtrsiz bu nusxa tasdiq navbatidagi chiqimni ham ayirar va manba
      -- balansini 63 048 000 so'mga kam ko'rsatardi — ya'ni skript o'zi
      -- o'lchayotgan tafovutni o'zi yaratardi.
      + coalesce((SELECT sum(amount) FROM "KassaEntry" WHERE "deletedAt" IS NULL AND type = 'income'  AND status = 'approved'), 0)
      - coalesce((SELECT sum(amount) FROM "KassaEntry" WHERE "deletedAt" IS NULL AND type = 'expense' AND status = 'approved'), 0)
      - coalesce((SELECT sum(amount) FROM "Expense"    WHERE "deletedAt" IS NULL AND status = 'approved'), 0)
      - coalesce((SELECT sum(amount) FROM "Payout"     WHERE "deletedAt" IS NULL), 0)
      )::float8 AS balance`,
    prisma.$queryRaw<{ balance: number }[]>`
      SELECT coalesce(sum(debit) - sum(credit), 0)::float8 AS balance
        FROM "LedgerEntry" WHERE "accountId" = 'CASH'`,
  ]);

  const srcBalance = srcAgg[0]?.balance ?? 0;
  const ledgerBalance = ledgerAgg[0]?.balance ?? 0;
  const drift = srcBalance - ledgerBalance;

  say(`  Balans — manba jadvallar (lib/balance.ts)  : ${num(srcBalance)} so'm`);
  say(`  Balans — jurnal CASH   (lib/ledger.ts)     : ${num(ledgerBalance)} so'm`);
  say(`  TAFOVUT                                    : ${num(drift)} so'm`);
  say();

  if (gapCount > 0) {
    note(
      "block",
      "Jurnal to'liq emas",
      `${gapCount} ta manba qatorining jurnalda izi yo'q (${num(gapTotal)} so'm). ` +
        "Sabab: import/skript yo'llari (bankImport, import-kassa-data, transit) postLedger chaqirmaydi.",
    );
  } else {
    note("ok", "Jurnal to'liq", "har bir manba qatorining jurnalda izi bor");
  }

  // Chegara `lib/ledger.ts` dan — oy yopish tekshiruvi bilan AYNAN bir xil
  // bo'lishi kerak, aks holda skript yashil bo'lgani holda oy yopilmasdi.
  if (Math.abs(drift) > LEDGER_DRIFT_TOLERANCE) {
    note(
      "block",
      "Ikki balans mos emas",
      `${num(Math.abs(drift))} so'm farq (ruxsat: ${num(LEDGER_DRIFT_TOLERANCE)}). ` +
        "Yil yopilganda jurnal qiymati snapshotga MUHRLANADI.",
    );
  } else if (Math.abs(drift) > 1) {
    note(
      "ok",
      "Ikki balans mos",
      `${num(Math.abs(drift))} so'm farq — qabul qilingan chegara ichida ` +
        "(sabab: lib/balance.ts qaytarishlarni modellashtirmaydi).",
    );
  }

  // Yetim jurnal qatorlari — manbasi o'chgan/topilmagan
  const orphan = await prisma.$queryRaw<GapRow[]>`
    SELECT count(*)::int AS cnt, coalesce(sum(abs(debit - credit)), 0)::float8 AS total
      FROM "LedgerEntry" l
     WHERE l."sourceTable" = 'KassaEntry'
       AND NOT EXISTS (SELECT 1 FROM "KassaEntry" k WHERE k.id = l."sourceId")`;
  if ((orphan[0]?.cnt ?? 0) > 0) {
    note("warn", "Yetim jurnal qatorlari", `${orphan[0].cnt} ta KassaEntry yozuvining manbasi topilmadi`);
  }

  machine.journal = {
    gaps: Object.fromEntries(rows.map(([n, r]) => [n, { count: r.cnt, total: r.total }])),
    sourceBalance: srcBalance,
    ledgerBalance,
    drift,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// 6. MA'LUMOT SIFATI
// ═════════════════════════════════════════════════════════════════════════
async function checkDataQuality(): Promise<void> {
  header("6 · MA'LUMOT SIFATI");

  const [companies, noServices, noAccountant, noSupervisor, noContract] = await Promise.all([
    prisma.company.count({ where: { isActive: true } }),
    prisma.company.count({ where: { isActive: true, activeServices: { isEmpty: true } } }),
    prisma.company.count({ where: { isActive: true, accountantId: null } }),
    prisma.company.count({ where: { isActive: true, supervisorId: null, chiefAccountantId: null } }),
    prisma.company.count({ where: { isActive: true, contractDate: null } }),
  ]);

  say(`  Faol firma                       : ${companies} ta`);
  say(`  activeServices bo'sh             : ${noServices} ta`);
  say(`  buxgalter (accountantId) yo'q    : ${noAccountant} ta`);
  say(`  nazoratchi/bosh buxgalter yo'q   : ${noSupervisor} ta`);
  say(`  contractDate yo'q                : ${noContract} ta`);
  say();

  if (noServices > companies * 0.5) {
    note(
      "warn",
      "activeServices bo'sh",
      `${noServices}/${companies} — service_key va has_employees applicability mezonlari ` +
        "amalda hech kimga tushmaydi, faqat universal shablonlar ishlaydi.",
    );
  }
  if (noAccountant > 0) {
    note(
      "warn",
      "Mas'ulsiz firmalar",
      `${noAccountant} ta firmada buxgalter yo'q — ularning majburiyatlari responsibleUserId=null ` +
        "bilan yaratiladi va eslatma hech kimga bormaydi.",
    );
  }

  machine.dataQuality = { companies, noServices, noAccountant, noSupervisor, noContract };
}

// ═════════════════════════════════════════════════════════════════════════
// 7. TEST QOLDIQLARI
// ═════════════════════════════════════════════════════════════════════════
async function checkTestResidue(): Promise<void> {
  header("7 · TEST QOLDIQLARI (ishchi bazadagi vitest izlari)");

  const [users, kassa, expenses, companies, ledger] = await Promise.all([
    prisma.user.count({ where: { OR: [{ email: { contains: "vitest" } }, { fullName: { contains: "vitest" } }] } }),
    prisma.kassaEntry.count({ where: { description: { contains: "vitest" } } }),
    prisma.expense.count({ where: { description: { contains: "vitest" } } }),
    prisma.company.count({ where: { name: { contains: "vitest" } } }),
    prisma.ledgerEntry.count({ where: { sourceTable: { contains: "Vitest" } } }),
  ]);

  const rows: [string, number][] = [
    ["User", users],
    ["KassaEntry", kassa],
    ["Expense", expenses],
    ["Company", companies],
    ["LedgerEntry", ledger],
  ];
  for (const [name, n] of rows) say(`  ${name.padEnd(14)} ${pad(n, 6)}`);
  say();

  const total = rows.reduce((s, [, n]) => s + n, 0);
  if (total > 0) {
    note(
      "block",
      "Test qoldig'i",
      `${total} ta vitest qatori ISHCHI bazada — testlar shu bazaga yozgan. ` +
        "Qo'riqchi endi qo'yildi (test/setup.ts), lekin mavjud qoldiq o'z-o'zidan ketmaydi.",
    );
  } else {
    note("ok", "Test qoldig'i", "topilmadi");
  }

  machine.testResidue = Object.fromEntries(rows);
}

// ═════════════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  say();
  say("╔════════════════════════════════════════════════════════════════════════╗");
  say("║  ASRO — PRODUCTION RECOVERY HOLATI            (QAT'IY READ-ONLY)       ║");
  say("╚════════════════════════════════════════════════════════════════════════╝");
  say(`  Vaqt: ${iso(new Date())}`);

  checkEnv();
  await checkRedis();
  await checkTelegram();
  await checkObligations();
  await checkJournal();
  await checkDataQuality();
  await checkTestResidue();

  // ── Xulosa ────────────────────────────────────────────────────────────
  header("XULOSA");
  const blockers = findings.filter((f) => f.verdict === "block");
  const warns = findings.filter((f) => f.verdict === "warn");
  say(`  ✗ Bloker : ${blockers.length}`);
  say(`  ! Ogoh.  : ${warns.length}`);
  say(`  ✓ Joyida : ${findings.filter((f) => f.verdict === "ok").length}`);
  if (blockers.length > 0) {
    say();
    say("  BLOKERLAR:");
    blockers.forEach((b, i) => say(`    ${i + 1}. ${b.label}`));
  }
  say();

  if (JSON_MODE) {
    console.log(JSON.stringify({ findings, ...machine }, null, 2));
  } else {
    console.log(out.join("\n"));
  }

  await prisma.$disconnect();
  // Bloker bo'lsa non-zero: CI/skript zanjirida to'siq bo'lib turadi.
  process.exit(blockers.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.log(out.join("\n"));
  console.error("\n✗ recovery-status yiqildi:", e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
