// =====================================================
// SHABLON MOSLIGI — BATAFSIL AUDIT (faqat o'qish)
// =====================================================
//
// ⚠️ BU SKRIPT HECH NARSA YOZMAYDI. `--apply` bayrog'i YO'Q; Prisma'ning
// create/update/delete metodlari umuman chaqirilmaydi.
//
// `scripts/audit-matrixkey-mapping.ts` "nechta tegiladi" degan savolga
// javob berdi. Bu skript undan keyingi uchta savolga javob beradi:
//
//   §5  har bir shablon uchun to'liq kesim (jami / ochiq / planned / yopilgan
//       / firma soni / 3 ta real misol / hozirgi applicability)
//   §7  qoida qo'shilgach generator ochiq majburiyatlarni HAQIQATAN
//       bekor qiladimi — davr oynasi bo'yicha ajratib
//   §11 hozir 0 majburiyat yaratayotgan draft shablonlar
//
// §7 NEGA MUHIM. `generateObligations` "mos emas" holatida FAQAT joriy
// oynadagi bitta qatorni qidiradi (`findUnique` kompozit kalit bilan), va
// runner faqat `catchUpMonths` oyni qayta ko'radi. Ya'ni oynadan tashqarida
// qolgan `planned` qatorlar generator tomonidan HECH QACHON bekor
// qilinmaydi — ular abadiy ochiq turadi.
//
//   DATABASE_URL="postgresql://…:15432/inbola" npx tsx scripts/audit-template-mapping-detail.ts
//   … --examples=3     # har shablonga nechta firma misoli (default 3)
//   … --catch-up=2     # generator runner'idagi qiymat (bot: 2)

import "./load-env";
import { prisma } from "@/lib/prisma";
import { periodWindowFor } from "@/lib/engines/obligation/deadlines";
import { templateApplies } from "@/lib/engines/obligation/applicability";
import { toSubject } from "@/lib/domains/accounting/subjects";
import { needsServiceKeyRule, gateScope } from "@/lib/domains/accounting/serviceKeyGate";

const EXAMPLES = Number(process.argv.find((a) => a.startsWith("--examples="))?.split("=")[1] ?? 3);
const CATCH_UP = Number(process.argv.find((a) => a.startsWith("--catch-up="))?.split("=")[1] ?? 2);

/** Ochiq (hali bajarilmagan) holatlar — audit-matrixkey-mapping.ts bilan bir xil. */
const OPEN_STATUSES = ["planned", "in_progress", "ready", "sent"] as const;

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
const num = (n: number, w = 6) => String(n).padStart(w);

/** Runner joriy sozlama bilan qaysi davr kalitlarini qayta ko'radi. */
function visitedPeriodKeys(now: Date, catchUp: number): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i <= catchUp; i++) {
    const ref = new Date(now);
    ref.setUTCMonth(ref.getUTCMonth() - i);
    keys.add(periodWindowFor("monthly", ref).periodKey);
    keys.add(periodWindowFor("quarterly", ref).periodKey);
    keys.add(periodWindowFor("annual", ref).periodKey);
  }
  return keys;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  console.log(`BAZA: ${url.replace(/^.*@/, "").replace(/\?.*$/, "")}`);
  const now = new Date();
  const visited = visitedPeriodKeys(now, CATCH_UP);
  console.log(`BUGUN: ${now.toISOString().slice(0, 10)}   catch-up: ${CATCH_UP} oy`);
  console.log(`Generator qayta ko'radigan davrlar: ${[...visited].sort().join(", ")}\n`);

  const companies = await prisma.company.findMany({
    where: { isActive: true, isOwnFirm: false },
    select: {
      id: true, name: true, inn: true, activeServices: true,
      taxRegime: true, statsType: true, companyStatus: true, contractDate: true,
    },
  });
  const byId = new Map(companies.map((c) => [c.id, c]));
  const keylessIds = new Set(companies.filter((c) => c.activeServices.length === 0).map((c) => c.id));

  const templates = await prisma.deadlineTemplate.findMany({
    where: { matrixKey: { not: null } },
    select: {
      id: true, code: true, name: true, matrixKey: true, periodicity: true,
      lifecycle: true, active: true, applicability: true,
    },
    orderBy: { code: "asc" },
  });
  const candidates = templates.filter(needsServiceKeyRule);

  console.log("═".repeat(120));
  console.log(`§5  BATAFSIL KESIM — ${candidates.length} ta shablon (matrixKey bor, service_key qoidasi yo'q)`);
  console.log("═".repeat(120));

  let sumTotal = 0, sumOpen = 0, sumPlanned = 0, sumClosed = 0;
  let sumInWindow = 0, sumOutWindow = 0;
  const affectedCompanies = new Set<string>();
  const drafts: string[] = [];

  for (const t of candidates) {
    const key = t.matrixKey!;
    // Uch toifaga ajratish — audit va migratsiya bir xil predikatni ishlatadi.
    const scope = gateScope(key, companies);
    const withKey = scope.hasKey.length;
    const withoutKeyIds = scope.missingKey.map((c) => c.id);

    const rows = await prisma.obligation.findMany({
      where: { templateId: t.id, companyId: { in: withoutKeyIds } },
      select: { companyId: true, status: true, periodKey: true },
    });
    const open = rows.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status));
    const planned = rows.filter((r) => r.status === "planned");
    const closed = rows.length - open.length;
    const inWin = open.filter((r) => visited.has(r.periodKey)).length;
    const outWin = open.length - inWin;
    const firms = new Set(rows.map((r) => r.companyId));
    for (const id of firms) affectedCompanies.add(id);

    sumTotal += rows.length; sumOpen += open.length; sumPlanned += planned.length;
    sumClosed += closed; sumInWindow += inWin; sumOutWindow += outWin;
    if (t.lifecycle !== "active") drafts.push(`${t.code} (${t.lifecycle})`);

    const crit = t.applicability.length
      ? t.applicability.map((a) => `${a.criteriaType}=${a.criteriaValue}`).join(", ")
      : "— (UNIVERSAL)";

    console.log(`\n┌ ${t.code}  ·  ${t.name}`);
    console.log(`│ matrixKey=${key}   davr=${t.periodicity}   lifecycle=${t.lifecycle}   active=${t.active}`);
    console.log(`│ hozirgi applicability: ${crit}`);
    console.log(`│ kutilayotgan qoida:    service_key=${key}`);
    console.log(
      `│ kaliti bor: ${num(withKey, 3)} firma  ·  kaliti yo'q: ${num(withoutKeyIds.length, 3)} firma  ` +
        `·  tegiladigan firma: ${num(firms.size, 3)}`,
    );
    console.log(
      `│ majburiyat: jami ${num(rows.length, 5)}  ochiq ${num(open.length, 5)}  ` +
        `planned ${num(planned.length, 5)}  yopilgan ${num(closed, 5)}`,
    );
    console.log(`│ ochiqlardan generator ko'radi: ${num(inWin, 5)}   ko'rmaydi (qolib ketadi): ${num(outWin, 5)}`);

    // 3 ta real misol — eng ko'p ochiq majburiyati bor firmalardan.
    const perFirm = new Map<string, number>();
    for (const r of open) perFirm.set(r.companyId, (perFirm.get(r.companyId) ?? 0) + 1);
    const top = [...perFirm.entries()].sort((a, b) => b[1] - a[1]).slice(0, EXAMPLES);
    if (top.length === 0) {
      console.log("└ misol: yo'q (ochiq majburiyat yaratilmagan)");
    } else {
      console.log("│ misollar (ochiq majburiyati bor firmalar):");
      for (const [cid, cnt] of top) {
        const c = byId.get(cid)!;
        const other = c.activeServices.slice(0, 4).join(", ") + (c.activeServices.length > 4 ? ", …" : "");
        console.log(`│   ${c.inn ?? "—"}  ${pad(c.name, 38)}  ochiq=${num(cnt, 3)}  kalitlari: ${other || "—"}`);
      }
      console.log("└");
    }
  }

  console.log("\n" + "═".repeat(120));
  console.log("§5b  JAMI");
  console.log("═".repeat(120));
  console.log(`  Shablon                     : ${candidates.length}`);
  console.log(`  Tegiladigan majburiyat      : ${sumTotal}`);
  console.log(`    — ochiq                   : ${sumOpen}`);
  console.log(`    — shundan planned         : ${sumPlanned}`);
  console.log(`    — yopilgan (tegilmaydi)   : ${sumClosed}`);
  console.log(`  Tegiladigan firma           : ${affectedCompanies.size}`);
  console.log(`  Kalitsiz firma (chiqarilgan): ${keylessIds.size}`);

  console.log("\n" + "═".repeat(120));
  console.log("§7  GENERATOR OCHIQ MAJBURIYATLARNI BEKOR QILADIMI?");
  console.log("═".repeat(120));
  console.log(`  Ochiq jami                              : ${sumOpen}`);
  console.log(`  ✅ generator ko'radigan davrda          : ${sumInWindow}  → planned bo'lsa bekor qilinadi`);
  console.log(`  ❌ generator ko'rmaydigan davrda        : ${sumOutWindow}  → QOLIB KETADI`);
  console.log(
    `\n  Sabab: generateObligations "mos emas" tarmog'ida faqat joriy oyna qatorini\n` +
      `  qidiradi (companyId_templateId_periodStart_periodEnd), runner esa joriy oy +\n` +
      `  ${CATCH_UP} oyni ko'radi. Undan tashqaridagi planned qatorlar tegilmay qoladi.`,
  );

  console.log("\n" + "═".repeat(120));
  console.log("§11 DRAFT SHABLONLAR (hozir 0 majburiyat)");
  console.log("═".repeat(120));
  console.log(drafts.length ? "  " + drafts.join("\n  ") : "  yo'q");

  // ── §6 AND semantikasi ────────────────────────────────────
  // Engine'ning O'ZI bilan hisoblanadi (taxmin emas): mavjud mezon bo'yicha
  // mos keladigan firmalar to'plami, undan keyin service_key bilan kesishma.
  console.log("\n" + "=".repeat(120));
  console.log("§6  AND SEMANTIKASI — mavjud mezon + service_key kesishmasi");
  console.log("=".repeat(120));
  const withOther = candidates.filter((t) => t.applicability.length > 0);
  if (withOther.length === 0) console.log("  (mavjud mezonli shablon yo'q)");
  for (const t of withOther) {
    const key = t.matrixKey!;
    const crit = t.applicability.map((a) => ({ criteriaType: a.criteriaType, criteriaValue: a.criteriaValue }));
    let nowMatch = 0, bothMatch = 0, drop = 0;
    for (const c of companies) {
      const subj = toSubject({
        id: c.id, isActive: true, companyStatus: c.companyStatus, contractDate: c.contractDate,
        taxRegime: c.taxRegime, statsType: c.statsType, activeServices: c.activeServices,
        accountantId: null, supervisorId: null, chiefAccountantId: null,
      });
      const a = templateApplies(crit, subj);
      const b = templateApplies([...crit, { criteriaType: "service_key", criteriaValue: key }], subj);
      if (a) nowMatch++;
      if (b) bothMatch++;
      if (a && !b) drop++;
    }
    const byType = new Map<string, string[]>();
    for (const a of t.applicability) byType.set(a.criteriaType, [...(byType.get(a.criteriaType) ?? []), a.criteriaValue]);
    console.log(`\n  ${t.code}  (${t.name})`);
    console.log(`    mezon: ${[...byType].map(([k, v]) => `${k}${String.fromCharCode(8712)}{${v.join("|")}}`).join(" AND ")}  AND  service_key=${key}`);
    console.log(`    hozir mos: ${nowMatch}   qoidadan keyin: ${bothMatch}   tushib qoladi: ${drop}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("audit failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
