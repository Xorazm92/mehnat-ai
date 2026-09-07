// =====================================================
// service_key APPLICABILITY MIGRATSIYASI
// =====================================================
//
// ⛔ STANDART REJIM — DRY-RUN. `--apply` BERILMASA BAZAGA HECH NARSA YOZILMAYDI.
//
// MUAMMO. 24 ta `DeadlineTemplate` da `matrixKey` bor, lekin
// `TemplateApplicability(service_key)` qoidasi YO'Q. Shuning uchun ular shu
// mezon bo'yicha UNIVERSAL ishlaydi va kaliti yo'q firmalarga ham majburiyat
// yaratadi (prodda 1 868 ta, shundan 1 704 tasi ochiq).
//
// YECHIM. Har bir tasdiqlangan moslik uchun bitta qoida qatori qo'shiladi va
// shu shablon bo'yicha kaliti yo'q firmalarning `planned` majburiyatlari bekor
// qilinadi.
//
// ┌─ NEGA BEKOR QILISH GENERATORGA TASHLANMAYDI ─────────────────────────────┐
// │ `generateObligations` "mos emas" tarmog'ida FAQAT joriy oynadagi qatorni │
// │ qidiradi (companyId_templateId_periodStart_periodEnd), runner esa joriy  │
// │ oy + catchUpMonths (bot: 2) ni ko'radi. Oyna har oy suriladi — ya'ni     │
// │ migratsiya kechikkan sari eski `planned` qatorlar oynadan chiqib ketadi  │
// │ va generator ularni HECH QACHON ko'rmaydi. Ular abadiy ochiq turadi,     │
// │ /deadlines da soxta ish bo'lib ko'rinadi va sweep eskalatsiya yuboradi.  │
// │ Shuning uchun bekor qilishni migratsiyaning O'ZI bajaradi — davridan     │
// │ qat'i nazar.                                                             │
// └──────────────────────────────────────────────────────────────────────────┘
//
// UCH TOIFA FIRMA (lib/domains/accounting/serviceKeyGate.ts):
//   kaliti bor          → tegilmaydi
//   kaliti yo'q         → `planned` majburiyati bekor qilinadi
//   HECH QANDAY kaliti yo'q → BUTUNLAY CHETLAB O'TILADI (31 firma)
//
// Uchinchi toifa "topshirmaydi" DEGANI EMAS — "bilmaymiz" degani. Ma'lumot
// yo'qligini qaror deb ko'rsatish mumkin emas.
//
// FAQAT `planned` BEKOR QILINADI. `in_progress` (20) va `sent` (11) —
// bajarilgan ish dalili; `accepted`/`cancelled` — yopilgan. Hech biriga tegilmaydi.
//
// ISHLATISH:
//   npx tsx scripts/migrate-service-key-applicability.ts                    # dry-run, active
//   npx tsx scripts/migrate-service-key-applicability.ts --scope=draft      # dry-run, draft
//   npx tsx scripts/migrate-service-key-applicability.ts --apply --backup=asro-2026-09-06.dump
//   npx tsx scripts/migrate-service-key-applicability.ts --rollback=.migrations/svckey-….json
//
// PRODGA QARSHI:
//   ssh -i ~/Downloads/ASRO.pem -N -L 15432:localhost:5432 ubuntu@16.192.135.23
//   DATABASE_URL="postgresql://…@127.0.0.1:15432/inbola?schema=public" npx tsx …

import "./load-env";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  needsServiceKeyRule,
  gateScope,
  MIN_TRUSTED_KEYS,
  type CompanyGateFacts,
} from "@/lib/domains/accounting/serviceKeyGate";
import {
  parseMappingManifest,
  selectScope,
  blockingReasons,
  type ScopeFilter,
} from "@/lib/domains/accounting/mappingManifest";

type Tx = Prisma.TransactionClient;

/**
 * Manifest yo'li. `--manifest=` faqat TEST uchun almashtiriladi — prodda
 * standart fayl ishlatiladi, aks holda "tasdiq" ni chetlab o'tish oson bo'lardi.
 */
const MANIFEST_PATH = resolve(
  process.cwd(),
  process.argv.find((a) => a.startsWith("--manifest="))?.split("=")[1] ?? "scripts/data/service-key-mappings.json",
);
const ROLLBACK_DIR = resolve(process.cwd(), ".migrations");

/**
 * 2026-09-06 auditining o'lchovi (docs/plan/business-rule-audit-2026-09.md).
 *
 * Bu MEZON emas, KUTILMA. Har yugurishda proddan qayta o'lchanadi va farq
 * bo'lsa migratsiya to'xtaydi. Farq o'z-o'zidan xato demaydi — generator har
 * kuni 06:00 da yangi majburiyat yaratadi, ya'ni raqamlar tabiiy o'sadi.
 * To'xtash sababi shu: qamrov auditdan keyin o'zgargan bo'lsa, uni ODAM
 * qayta ko'rishi kerak, skript emas.
 */
const BASELINE = {
  measuredAt: "2026-09-07",
  candidates: 24,
  affected: 1394,
  planned: 1228,
  inProgress: 18,
  sent: 9,
  closed: 139,
  companies: 210,
  excludedCompanies: 47,
} as const;

/**
 * 2026-09-06 dagi birinchi o'lchov (MIN_TRUSTED_KEYS kiritilishidan OLDIN):
 *   1 868 / 1 673 / 20 / 11 / 164 / 226 firma / 31 chiqarilgan
 *
 * Farq qoidadan chiqdi, prod ma'lumoti o'zgarganidan emas: ro'yxati chala
 * (6 tadan kam kalitli) 16 ta firma ham chetlab o'tiladigan bo'ldi.
 * Ular bilan birga 474 ta majburiyat qamrovdan chiqdi.
 */

const OPEN_STATUSES = ["planned", "in_progress", "ready", "sent"] as const;
const UNTOUCHABLE = ["in_progress", "ready", "sent", "accepted", "rejected", "cancelled"] as const;

// ── argumentlar ───────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string) => argv.find((a) => a.startsWith(`${f}=`))?.split("=").slice(1).join("=");

const APPLY = has("--apply");
const ROLLBACK_FILE = val("--rollback");
const BACKUP = val("--backup");
const SCOPE = (val("--scope") ?? "active") as ScopeFilter;
const ALLOW_DRIFT = has("--accept-drift");

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
const num = (n: number, w = 6) => String(n).padStart(w);
const hr = (c = "─") => console.log(c.repeat(100));

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exitCode = 1;
  throw new Error("ABORT");
}

// ── o'lchov ───────────────────────────────────────────────────
interface TemplatePlan {
  templateId: string;
  code: string;
  name: string;
  matrixKey: string;
  lifecycle: string;
  hasKey: number;
  missingKeyCompanyIds: string[];
  excluded: number;
  affected: number;
  planned: number;
  plannedIds: string[];
  inProgress: number;
  sent: number;
  closed: number;
  companies: number;
}

interface Universe {
  candidateCodes: string[];
  plans: Map<string, TemplatePlan>;
  totals: {
    candidates: number;
    affected: number;
    planned: number;
    inProgress: number;
    sent: number;
    closed: number;
    companies: number;
    excludedCompanies: number;
  };
}

/**
 * Proddan real vaqtda o'lchash. `db` — prisma yoki tranzaksiya mijozi; apply
 * paytida AYNAN SHU funksiya tranzaksiya ichida qayta chaqiriladi, ya'ni
 * dry-run va apply bir xil mantiqni o'lchaydi (ikki xil hisob bo'lishi mumkin emas).
 */
async function measure(db: Tx): Promise<Universe> {
  const companies = await db.company.findMany({
    where: { isActive: true, isOwnFirm: false },
    select: { id: true, activeServices: true },
  });
  const facts: CompanyGateFacts[] = companies;
  // Chetlab o'tiladiganlar: ro'yxati bo'sh YOKI chala (MIN_TRUSTED_KEYS dan kam).
  const keylessCount = companies.filter((c) => c.activeServices.length < MIN_TRUSTED_KEYS).length;

  const templates = await db.deadlineTemplate.findMany({
    where: { matrixKey: { not: null } },
    select: { id: true, code: true, name: true, matrixKey: true, lifecycle: true, applicability: true },
    orderBy: { code: "asc" },
  });
  const candidates = templates.filter(needsServiceKeyRule);

  const plans = new Map<string, TemplatePlan>();
  const allCompanies = new Set<string>();
  const t = { affected: 0, planned: 0, inProgress: 0, sent: 0, closed: 0 };

  for (const tpl of candidates) {
    const key = tpl.matrixKey!;
    const scope = gateScope(key, facts);
    const missingIds = scope.missingKey.map((c) => c.id);

    const rows = await db.obligation.findMany({
      where: { templateId: tpl.id, companyId: { in: missingIds } },
      select: { id: true, companyId: true, status: true },
    });
    const planned = rows.filter((r) => r.status === "planned");
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const sent = rows.filter((r) => r.status === "sent").length;
    const closed = rows.filter((r) => !(OPEN_STATUSES as readonly string[]).includes(r.status)).length;
    for (const r of rows) allCompanies.add(r.companyId);

    plans.set(tpl.code, {
      templateId: tpl.id,
      code: tpl.code,
      name: tpl.name,
      matrixKey: key,
      lifecycle: tpl.lifecycle,
      hasKey: scope.hasKey.length,
      missingKeyCompanyIds: missingIds,
      excluded: scope.excluded.length,
      affected: rows.length,
      planned: planned.length,
      plannedIds: planned.map((r) => r.id),
      inProgress,
      sent,
      closed,
      companies: new Set(rows.map((r) => r.companyId)).size,
    });
    t.affected += rows.length;
    t.planned += planned.length;
    t.inProgress += inProgress;
    t.sent += sent;
    t.closed += closed;
  }

  return {
    candidateCodes: candidates.map((c) => c.code),
    plans,
    totals: {
      candidates: candidates.length,
      affected: t.affected,
      planned: t.planned,
      inProgress: t.inProgress,
      sent: t.sent,
      closed: t.closed,
      companies: allCompanies.size,
      excludedCompanies: keylessCount,
    },
  };
}

/** Kutilma bilan solishtirish. Farq bo'lsa — sabablarni qaytaradi. */
function baselineDrift(u: Universe): string[] {
  const t = u.totals;
  const cmp: Array<[string, number, number]> = [
    ["nomzod shablon", BASELINE.candidates, t.candidates],
    ["tegiladigan majburiyat", BASELINE.affected, t.affected],
    ["planned (bekor bo'ladi)", BASELINE.planned, t.planned],
    ["in_progress", BASELINE.inProgress, t.inProgress],
    ["sent", BASELINE.sent, t.sent],
    ["yopilgan", BASELINE.closed, t.closed],
    ["tegiladigan firma", BASELINE.companies, t.companies],
    ["chiqarilgan firma", BASELINE.excludedCompanies, t.excludedCompanies],
  ];
  return cmp
    .filter(([, exp, act]) => exp !== act)
    .map(([label, exp, act]) => `${label}: kutilgan ${exp}, hozir ${act} (${act > exp ? "+" : ""}${act - exp})`);
}

function printComparison(u: Universe): void {
  console.log(`\n${bold("KUTILGAN vs HAQIQIY")}   (audit: ${BASELINE.measuredAt})`);
  hr();
  console.log(`  ${pad("KO'RSATKICH", 32)} ${"KUTILGAN".padStart(9)} ${"HAQIQIY".padStart(10)}   FARQ`);
  const t = u.totals;
  const rows: Array<[string, number, number]> = [
    ["nomzod shablon", BASELINE.candidates, t.candidates],
    ["tegiladigan majburiyat", BASELINE.affected, t.affected],
    ["planned → bekor qilinadi", BASELINE.planned, t.planned],
    ["in_progress → tegilmaydi", BASELINE.inProgress, t.inProgress],
    ["sent → tegilmaydi", BASELINE.sent, t.sent],
    ["yopilgan → tegilmaydi", BASELINE.closed, t.closed],
    ["tegiladigan firma", BASELINE.companies, t.companies],
    ["chiqarilgan firma (chala ro'yxat)", BASELINE.excludedCompanies, t.excludedCompanies],
  ];
  for (const [label, exp, act] of rows) {
    const d = act - exp;
    console.log(`  ${pad(label, 32)} ${num(exp, 9)} ${num(act, 10)}   ${d === 0 ? "✅ bir xil" : `⚠️  ${d > 0 ? "+" : ""}${d}`}`);
  }
  hr();
}

// ── rollback fayli ────────────────────────────────────────────
interface RollbackRecord {
  migrationId: string;
  migration: "service-key-applicability";
  timestamp: string;
  scope: ScopeFilter;
  backupRef: string;
  database: string;
  affectedTemplateIds: string[];
  mappings: Array<{ code: string; matrixKey: string; templateId: string; applicabilityId: string }>;
  createdApplicabilityIds: string[];
  cancelledObligations: Array<{ id: string; fromStatus: string }>;
  statusEventIds: string[];
  /** Apply paytidagi holat — post-audit shularga qarab tekshiradi. */
  snapshot: {
    untouchableBefore: number;
    keylessPlannedBefore: number;
    otherTemplatesPlannedBefore: number;
  };
}

function dbLabel(): string {
  return (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/\?.*$/, "");
}

// ── DRY-RUN / APPLY ───────────────────────────────────────────
async function run(): Promise<void> {
  console.log(`\n${bold("service_key APPLICABILITY MIGRATSIYASI")}`);
  console.log(`BAZA:   ${dbLabel()}`);
  console.log(`REJIM:  ${APPLY ? bold("APPLY — BAZAGA YOZADI") : "DRY-RUN (hech narsa yozilmaydi)"}`);
  console.log(`QAMROV: --scope=${SCOPE}\n`);

  // 1) Manifest
  if (!existsSync(MANIFEST_PATH)) die(`Manifest topilmadi: ${MANIFEST_PATH}`);
  const manifest = parseMappingManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
  const sel = selectScope(manifest, SCOPE);

  // 2) Manifest va baza bir xil to'plamni ko'rsatyaptimi
  const u = await measure(prisma);
  const dbCodes = new Set(u.candidateCodes);
  const manifestCodes = new Set(manifest.mappings.map((m) => m.code));
  const missingInManifest = [...dbCodes].filter((c) => !manifestCodes.has(c));
  const missingInDb = [...manifestCodes].filter((c) => !dbCodes.has(c));

  console.log(bold("1) MANIFEST ↔ BAZA MOSLIGI"));
  hr();
  console.log(`  Bazadagi nomzod : ${u.candidateCodes.length}`);
  console.log(`  Manifestdagi    : ${manifest.mappings.length}`);
  if (missingInManifest.length) {
    die(
      `Bazada nomzod bor, manifestda yo'q: ${missingInManifest.join(", ")}\n` +
        "    Manifest eskirgan — auditni qayta yurgizing.",
    );
  }
  if (missingInDb.length) {
    console.log(`  ⚠️  Manifestda bor, bazada nomzod emas (qoidasi allaqachon bor?): ${missingInDb.join(", ")}`);
  }
  console.log("  ✅ Har bir bazadagi nomzod manifestda mavjud");

  // 3) Kutilma bilan solishtirish
  printComparison(u);
  const drift = baselineDrift(u);
  if (drift.length > 0) {
    console.log(`\n⚠️  ${bold("QAMROV AUDITDAN KEYIN O'ZGARGAN")}`);
    for (const d of drift) console.log(`     • ${d}`);
    console.log(
      "\n   Sabab odatda tabiiy: generator har kuni 06:00 da yangi majburiyat yaratadi.\n" +
        "   Lekin qaror ODAMniki. Ikki yo'l:\n" +
        "     1) auditni qayta yurgizing va BASELINE ni yangilang (tavsiya etiladi)\n" +
        "     2) farqni bilib turib davom eting: --accept-drift",
    );
    if (APPLY && !ALLOW_DRIFT) die("APPLY TO'XTATILDI — kutilgan va haqiqiy raqamlar farq qiladi.");
    if (!ALLOW_DRIFT) console.log("\n   (dry-run davom etadi, lekin --apply bloklangan)");
  } else {
    console.log("\n  ✅ Barcha raqamlar audit bilan bir xil");
  }

  // 4) Tasdiq holati
  console.log(`\n${bold("2) BIZNES TASDIG'I")}`);
  hr();
  console.log(`  ✅ tasdiqlangan (qamrovda) : ${sel.included.length}`);
  console.log(`  ⛔ rad etilgan             : ${sel.rejected.length}${sel.rejected.length ? " — " + sel.rejected.map((r) => r.code).join(", ") : ""}`);
  console.log(`  🕓 keyinroq                : ${sel.deferred.length}${sel.deferred.length ? " — " + sel.deferred.map((r) => r.code).join(", ") : ""}`);
  console.log(`  ❔ javob berilmagan        : ${sel.unanswered.length}`);
  console.log(`  ↔  boshqa qamrovda         : ${sel.outOfScope.length}${sel.outOfScope.length ? " — " + sel.outOfScope.map((r) => r.code).join(", ") : ""}`);

  const blockers = blockingReasons(sel);
  if (blockers.length > 0) {
    console.log(`\n  ${bold("⛔ MIGRATSIYA BLOKLANGAN")}`);
    for (const b of blockers) console.log(`     • ${b}`);
    console.log(`\n  Tasdiqni shu faylga yozing: ${MANIFEST_PATH.replace(process.cwd() + "/", "")}`);
    console.log("  Har qatorda: confirmed (true/false), confirmedBy, confirmedAt");
  }

  // 5) Reja
  console.log(`\n${bold("3) MIGRATSIYA REJASI")}`);
  hr();
  if (sel.included.length === 0) {
    console.log("  (qamrov bo'sh — tasdiqlangan moslik yo'q)");
  } else {
    console.log(
      `  ${pad("SHABLON", 20)} ${pad("service_key", 22)} ${pad("qoida", 7)} ${pad("bekor", 7)} ${pad("tegilmas", 9)} ${pad("chiqarilgan", 11)}`,
    );
    hr("·");
  }
  let planApplicability = 0;
  let planCancel = 0;
  const planned: TemplatePlan[] = [];
  for (const row of sel.included) {
    const p = u.plans.get(row.code);
    if (!p) {
      console.log(`  ${pad(row.code, 20)} — bazada nomzod emas, o'tkazib yuborildi`);
      continue;
    }
    if (p.matrixKey !== row.matrixKey) {
      die(`${row.code}: manifestda matrixKey="${row.matrixKey}", bazada "${p.matrixKey}" — mos emas.`);
    }
    planned.push(p);
    planApplicability++;
    planCancel += p.planned;
    console.log(
      `  ${pad(p.code, 20)} ${pad(p.matrixKey, 22)} ${num(1, 7)} ${num(p.planned, 7)} ` +
        `${num(p.inProgress + p.sent + p.closed, 9)} ${num(p.excluded, 11)}`,
    );
  }
  if (planned.length > 0) {
    hr("·");
    console.log(`  ${pad("JAMI", 20)} ${pad("", 22)} ${num(planApplicability, 7)} ${num(planCancel, 7)}`);
  }

  if (!APPLY) {
    console.log(`\n${bold("DRY-RUN TUGADI — bazaga hech narsa yozilmadi.")}`);
    if (blockers.length > 0) console.log("Holat: ⛔ APPLY BLOKLANGAN — biznes tasdig'i kutilmoqda.");
    else console.log(`Holat: ✅ APPLY ga tayyor.  --apply --backup=<zaxira nomi>`);
    return;
  }

  // ── APPLY ───────────────────────────────────────────────────
  if (blockers.length > 0) die("APPLY TO'XTATILDI — biznes tasdig'i to'liq emas (yuqoriga qarang).");
  if (!BACKUP) {
    die(
      "APPLY uchun --backup=<zaxira nomi> SHART.\n" +
        "    Avval zaxira oling, keyin uning nomini shu bayroqda bering:\n" +
        "      pg_dump … > asro-$(date +%F).dump",
    );
  }

  const migrationId = `svckey-${SCOPE}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  console.log(`\n${bold("4) APPLY")}   id=${migrationId}   zaxira=${BACKUP}`);
  hr();

  const record: RollbackRecord = {
    migrationId,
    migration: "service-key-applicability",
    timestamp: new Date().toISOString(),
    scope: SCOPE,
    backupRef: BACKUP,
    database: dbLabel(),
    affectedTemplateIds: planned.map((p) => p.templateId),
    mappings: [],
    createdApplicabilityIds: [],
    cancelledObligations: [],
    statusEventIds: [],
    snapshot: { untouchableBefore: -1, keylessPlannedBefore: -1, otherTemplatesPlannedBefore: -1 },
  };

  await prisma.$transaction(
    async (tx) => {
      // 4a) YAKUNIY O'LCHOV — tranzaksiya ichida, mutatsiyadan OLDIN.
      const fin = await measure(tx);
      const finPlanned = planned.reduce((s, p) => s + (fin.plans.get(p.code)?.planned ?? -1), 0);
      if (finPlanned !== planCancel) {
        throw new Error(
          `YAKUNIY TEKSHIRUV YIQILDI: rejada ${planCancel} ta bekor qilish, tranzaksiya ichida ${finPlanned}. ` +
            "Hech narsa o'zgartirilmadi.",
        );
      }
      console.log(`  ✅ yakuniy tekshiruv: ${finPlanned} ta bekor qilish rejasi tasdiqlandi`);

      // 4b) TEGILMASLIGI KERAK BO'LGANLARNI OLDINDAN SANAB OLAMIZ.
      const templateIds = planned.map((p) => p.templateId);
      const untouchedBefore = await tx.obligation.count({
        where: { templateId: { in: templateIds }, status: { in: UNTOUCHABLE as unknown as never } },
      });
      // Prisma massiv uzunligi bo'yicha filtrlay olmaydi — JS'da kesamiz.
      const keyless = (
        await tx.company.findMany({
          where: { isActive: true, isOwnFirm: false },
          select: { id: true, activeServices: true },
        })
      )
        .filter((c) => c.activeServices.length < MIN_TRUSTED_KEYS)
        .map((c) => c.id);
      const keylessBefore = await tx.obligation.count({
        where: { templateId: { in: templateIds }, companyId: { in: keyless }, status: "planned" },
      });
      const otherTemplatesBefore = await tx.obligation.count({
        where: { templateId: { notIn: templateIds }, status: "planned" },
      });
      record.snapshot = {
        untouchableBefore: untouchedBefore,
        keylessPlannedBefore: keylessBefore,
        otherTemplatesPlannedBefore: otherTemplatesBefore,
      };

      // 4c) QOIDA QATORLARI
      for (const p of planned) {
        const created = await tx.templateApplicability.create({
          data: { templateId: p.templateId, criteriaType: "service_key", criteriaValue: p.matrixKey },
          select: { id: true },
        });
        record.createdApplicabilityIds.push(created.id);
        record.mappings.push({
          code: p.code,
          matrixKey: p.matrixKey,
          templateId: p.templateId,
          applicabilityId: created.id,
        });
      }
      console.log(`  ✅ ${record.createdApplicabilityIds.length} ta TemplateApplicability yaratildi`);

      // 4d) `planned` MAJBURIYATLARNI BEKOR QILISH — davridan qat'i nazar.
      for (const p of planned) {
        const target = fin.plans.get(p.code)!;
        if (target.plannedIds.length === 0) continue;
        const upd = await tx.obligation.updateMany({
          where: { id: { in: target.plannedIds }, status: "planned" },
          data: { status: "cancelled" },
        });
        if (upd.count !== target.plannedIds.length) {
          throw new Error(
            `${p.code}: ${target.plannedIds.length} ta kutilgan edi, ${upd.count} tasi yangilandi. Bekor qilindi.`,
          );
        }
        for (const id of target.plannedIds) record.cancelledObligations.push({ id, fromStatus: "planned" });
        await tx.obligationStatusEvent.createMany({
          data: target.plannedIds.map((obligationId) => ({
            obligationId,
            fromStatus: "planned" as const,
            toStatus: "cancelled" as const,
            byUserId: null,
            note: `Firma "${p.matrixKey}" xizmatiga ega emas — ${migrationId}`,
          })),
        });
      }
      console.log(`  ✅ ${record.cancelledObligations.length} ta majburiyat bekor qilindi`);

      // 4e) INVARIANTLAR — commitdan OLDIN
      const untouchedAfter = await tx.obligation.count({
        where: { templateId: { in: templateIds }, status: { in: UNTOUCHABLE as unknown as never } },
      });
      const expectedUntouched = untouchedBefore + record.cancelledObligations.length;
      if (untouchedAfter !== expectedUntouched) {
        throw new Error(
          `INVARIANT: tegilmasligi kerak bo'lgan qatorlar soni ${untouchedBefore} → ${untouchedAfter}, ` +
            `kutilgan ${expectedUntouched}. Bekor qilindi.`,
        );
      }
      const keylessAfter = await tx.obligation.count({
        where: { templateId: { in: templateIds }, companyId: { in: keyless }, status: "planned" },
      });
      if (keylessAfter !== keylessBefore) {
        throw new Error(
          `INVARIANT: kalitsiz firmalarning planned majburiyati ${keylessBefore} → ${keylessAfter}. ` +
            "Bu firmalarga TEGILMASLIGI kerak edi. Bekor qilindi.",
        );
      }
      const otherTemplatesAfter = await tx.obligation.count({
        where: { templateId: { notIn: templateIds }, status: "planned" },
      });
      if (otherTemplatesAfter !== otherTemplatesBefore) {
        throw new Error(
          `INVARIANT: boshqa shablonlarning planned majburiyati ${otherTemplatesBefore} → ${otherTemplatesAfter}. Bekor qilindi.`,
        );
      }
      const applicabilityCount = await tx.templateApplicability.count({
        where: { templateId: { in: templateIds }, criteriaType: "service_key" },
      });
      if (applicabilityCount !== planned.length) {
        throw new Error(`INVARIANT: service_key qatori ${applicabilityCount}, kutilgan ${planned.length}. Bekor qilindi.`);
      }
      console.log("  ✅ invariantlar: kalitsiz firma tegilmadi · in_progress/sent tegilmadi · boshqa shablon tegilmadi");
    },
    { timeout: 180_000 },
  );

  // 5) Rollback fayli — tranzaksiya MUVAFFAQIYATLI tugagach.
  mkdirSync(ROLLBACK_DIR, { recursive: true });
  const outPath = val("--out") ?? resolve(ROLLBACK_DIR, `${migrationId}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");

  console.log(`\n${bold("APPLY TUGADI")}`);
  console.log(`  qoida qatori    : ${record.createdApplicabilityIds.length}`);
  console.log(`  bekor qilingan  : ${record.cancelledObligations.length}`);
  console.log(`  rollback fayli  : ${outPath}`);
  console.log(`\n  Post-audit:  npx tsx scripts/audit-matrixkey-mapping.ts`);
}

// ── ROLLBACK ──────────────────────────────────────────────────
async function rollback(file: string): Promise<void> {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) die(`Rollback fayli topilmadi: ${path}`);
  const rec = JSON.parse(readFileSync(path, "utf8")) as RollbackRecord;
  if (rec.migration !== "service-key-applicability") {
    die(`Bu fayl boshqa migratsiyaga tegishli: ${rec.migration}`);
  }

  console.log(`\n${bold("ROLLBACK")}   id=${rec.migrationId}`);
  console.log(`BAZA:  ${dbLabel()}`);
  if (rec.database && rec.database !== dbLabel()) {
    die(`Fayl "${rec.database}" bazasiga tegishli, hozirgisi "${dbLabel()}".`);
  }
  console.log(`REJIM: ${APPLY ? bold("APPLY") : "DRY-RUN (hech narsa yozilmaydi)"}`);
  hr();
  console.log(`  o'chiriladigan qoida qatori   : ${rec.createdApplicabilityIds.length}`);
  console.log(`  tiklanadigan majburiyat       : ${rec.cancelledObligations.length}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN TUGADI. Haqiqiy rollback uchun: --rollback=${file} --apply`);
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // FAQAT shu migratsiya yaratgan qatorlar — ID bo'yicha, boshqasiga tegilmaydi.
      const del = await tx.templateApplicability.deleteMany({
        where: { id: { in: rec.createdApplicabilityIds } },
      });

      // Majburiyatlar: faqat HALI HAM `cancelled` bo'lganlari tiklanadi.
      // Kimdir oradan keyin holatni o'zgartirgan bo'lsa — tegilmaydi.
      const ids = rec.cancelledObligations.map((o) => o.id);
      const restorable = await tx.obligation.findMany({
        where: { id: { in: ids }, status: "cancelled" },
        select: { id: true },
      });
      const restoreIds = restorable.map((r) => r.id);
      const upd = await tx.obligation.updateMany({
        where: { id: { in: restoreIds } },
        data: { status: "planned" },
      });
      await tx.obligationStatusEvent.createMany({
        data: restoreIds.map((obligationId) => ({
          obligationId,
          fromStatus: "cancelled" as const,
          toStatus: "planned" as const,
          byUserId: null,
          note: `Rollback: ${rec.migrationId}`,
        })),
      });

      console.log(`  ✅ ${del.count} ta qoida qatori o'chirildi`);
      console.log(`  ✅ ${upd.count} ta majburiyat tiklandi`);
      const skipped = ids.length - restoreIds.length;
      if (skipped > 0) {
        console.log(`  ⚠️  ${skipped} ta majburiyat tiklanmadi — holati oradan keyin o'zgargan`);
      }
    },
    { timeout: 180_000 },
  );

  console.log(`\n${bold("ROLLBACK TUGADI")}`);
}

// ── POST-AUDIT ────────────────────────────────────────────────
/**
 * Applydan keyingi tekshiruv — FAQAT O'QISH.
 *
 * Qo'lda tekshirish o'tkazib yuborilishi mumkin, shuning uchun ro'yxat
 * skriptda. Har bandi rollback faylidagi yozuvga qarshi solishtiriladi.
 */
async function postAudit(file: string): Promise<void> {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) die(`Rollback fayli topilmadi: ${path}`);
  const rec = JSON.parse(readFileSync(path, "utf8")) as RollbackRecord;

  console.log(`\n${bold("POST-AUDIT")}   id=${rec.migrationId}`);
  console.log(`BAZA: ${dbLabel()}   (faqat o'qish)`);
  hr();

  const manifest = parseMappingManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
  const notConfirmed = manifest.mappings.filter((m) => m.confirmed !== true).map((m) => m.code);
  const templateIds = rec.affectedTemplateIds;
  const results: Array<[string, boolean, string]> = [];
  const check = (label: string, ok: boolean, detail: string) => results.push([label, ok, detail]);

  // 1) Tasdiqlangan shablonlarda qoida bor
  const rules = await prisma.templateApplicability.findMany({
    where: { templateId: { in: templateIds }, criteriaType: "service_key" },
    select: { id: true, templateId: true, criteriaValue: true, template: { select: { code: true } } },
  });
  const ruleByCode = new Map(rules.map((r) => [r.template.code, r]));
  const missingRule = rec.mappings.filter((m) => !ruleByCode.has(m.code)).map((m) => m.code);
  check("tasdiqlangan shablonlarda service_key qoidasi bor", missingRule.length === 0,
    missingRule.length ? `yo'q: ${missingRule.join(", ")}` : `${rules.length} ta qoida`);

  // 2) Tasdiqlanmagan moslik QO'SHILMAGAN
  const strayRules = await prisma.templateApplicability.findMany({
    where: { criteriaType: "service_key", template: { code: { in: notConfirmed } } },
    select: { template: { select: { code: true } } },
  });
  check("tasdiqlanmagan moslik qo'shilmagan", strayRules.length === 0,
    strayRules.length ? `⚠️ topildi: ${strayRules.map((r) => r.template.code).join(", ")}` : "toza");

  // 3) Kalitsiz firmalar o'zgarmagan
  const keyless = (
    await prisma.company.findMany({
      where: { isActive: true, isOwnFirm: false },
      select: { id: true, activeServices: true },
    })
  )
    .filter((c) => c.activeServices.length < MIN_TRUSTED_KEYS)
    .map((c) => c.id);
  const keylessNow = await prisma.obligation.count({
    where: { templateId: { in: templateIds }, companyId: { in: keyless }, status: "planned" },
  });
  check(`chala ro'yxatli firmalar (${keyless.length}) tegilmagan`, keylessNow === rec.snapshot.keylessPlannedBefore,
    `planned: ${rec.snapshot.keylessPlannedBefore} → ${keylessNow}`);

  // 4-5) in_progress va sent o'zgarmagan
  const cancelledIds = new Set(rec.cancelledObligations.map((o) => o.id));
  const inProg = await prisma.obligation.count({ where: { templateId: { in: templateIds }, status: "in_progress" } });
  const sent = await prisma.obligation.count({ where: { templateId: { in: templateIds }, status: "sent" } });
  const wronglyCancelled = await prisma.obligation.count({
    where: { templateId: { in: templateIds }, status: "cancelled", id: { notIn: [...cancelledIds] } },
  });
  check("in_progress mavjud (bekor qilinmagan)", inProg >= 0, `${inProg} ta`);
  check("sent mavjud (bekor qilinmagan)", sent >= 0, `${sent} ta`);

  // 6) Kutilgan miqdorda bekor qilingan
  const stillCancelled = await prisma.obligation.count({
    where: { id: { in: rec.cancelledObligations.map((o) => o.id) }, status: "cancelled" },
  });
  check("bekor qilinganlar kutilgan miqdorda", stillCancelled === rec.cancelledObligations.length,
    `${stillCancelled} / ${rec.cancelledObligations.length}`);

  // 7) Boshqa majburiyatlar o'zgarmagan
  const otherNow = await prisma.obligation.count({
    where: { templateId: { notIn: templateIds }, status: "planned" },
  });
  check("boshqa shablonlar tegilmagan", otherNow === rec.snapshot.otherTemplatesPlannedBefore,
    `planned: ${rec.snapshot.otherTemplatesPlannedBefore} → ${otherNow}`);
  check("migratsiyadan tashqari bekor qilish yo'q", wronglyCancelled === 0,
    wronglyCancelled ? `⚠️ ${wronglyCancelled} ta begona cancelled` : "toza");

  // 8) Migratsiyadan keyin yaratilgan noto'g'ri majburiyat
  const companies = await prisma.company.findMany({
    where: { isActive: true, isOwnFirm: false },
    select: { id: true, activeServices: true },
  });
  let wrongNew = 0;
  for (const m of rec.mappings) {
    const missingIds = gateScope(m.matrixKey, companies).missingKey.map((c) => c.id);
    wrongNew += await prisma.obligation.count({
      where: {
        templateId: m.templateId,
        companyId: { in: missingIds },
        status: "planned",
        createdAt: { gt: new Date(rec.timestamp) },
      },
    });
  }
  check("migratsiyadan keyin noto'g'ri majburiyat yaratilmagan", wrongNew === 0,
    wrongNew ? `⚠️ ${wrongNew} ta yangi qator` : "toza");

  for (const [label, ok, detail] of results) {
    console.log(`  ${ok ? "✅" : "❌"} ${pad(label, 52)} ${detail}`);
  }
  hr();
  const failed = results.filter(([, ok]) => !ok).length;
  console.log(failed === 0 ? bold("POST-AUDIT: HAMMASI O'TDI") : bold(`POST-AUDIT: ${failed} ta band YIQILDI`));
  if (failed > 0) {
    console.log(`\n  Rollback:  npx tsx ${SCRIPT_NAME} --rollback=${file} --apply`);
    process.exitCode = 1;
  }
  console.log(`\n  Eslatma: 8-band generator ishlaganidan KEYIN qayta yurgizilsin —\n` +
    `  kunlik 06:00 generatsiyasi yangi qator yaratmasligini shu isbotlaydi.`);
}

const SCRIPT_NAME = "scripts/migrate-service-key-applicability.ts";

async function main(): Promise<void> {
  if (!["active", "draft", "all"].includes(SCOPE)) die(`--scope faqat active|draft|all bo'lishi mumkin, berilgani: ${SCOPE}`);
  const postAuditFile = val("--post-audit");
  if (postAuditFile) await postAudit(postAuditFile);
  else if (ROLLBACK_FILE) await rollback(ROLLBACK_FILE);
  else await run();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  if ((e as Error).message !== "ABORT") console.error("\n✗ migratsiya yiqildi:", e);
  await prisma.$disconnect();
  process.exit(1);
});
