// =====================================================
// matrixKey → service_key MOSLIGI — AUDIT (faqat o'qish)
// =====================================================
//
// ⚠️ BU SKRIPT HECH NARSA YOZMAYDI. `--apply` bayrog'i YO'Q, Prisma'ning
// yozish metodlari umuman chaqirilmaydi. Bosh buxgalter tasdig'igacha
// prod ma'lumotiga tegilmaydi.
//
// SAVOL. `DeadlineTemplate.matrixKey` matritsa ustunini nomlaydi,
// `Company.activeServices` esa xuddi shu lug'atdagi kalitlar ro'yxati.
// 14 ta shablonda `matrixKey` bor, lekin `TemplateApplicability` da
// `service_key` qoidasi YO'Q — shuning uchun ular UNIVERSAL bo'lib
// ishlaydi va kaliti yo'q firmalarga ham tushadi.
//
// Bu audit har bir moslik uchun "qoida qo'shilsa nima o'zgaradi?" degan
// savolga raqam bilan javob beradi.
//
// UCH TOIFA FIRMA, ATAYLAB AJRATILGAN:
//
//   • kaliti BOR      — qoida qo'shilsa hech narsa o'zgarmaydi
//   • kaliti YO'Q     — lekin BOSHQA kalitlari bor ⇒ ishonchli "topshirmaydi"
//   • kaliti UMUMAN yo'q — hech qanday kalit yozilmagan ⇒ BILMAYMIZ
//
// Uchinchi toifa (19 firma) hisobdan butunlay CHIQARILADI: ular haqida
// "topshirmaydi" deb xulosa chiqarish ma'lumot yo'qligini qaror deb
// ko'rsatish bo'lardi.
//
//   DATABASE_URL="postgresql://…:15432/inbola" npx tsx scripts/audit-matrixkey-mapping.ts
//   … --examples=3      # har moslikka nechta firma misoli

import "./load-env";
import { prisma } from "@/lib/prisma";
import { needsServiceKeyRule } from "@/lib/domains/accounting/serviceKeyGate";

const EXAMPLES = Number(process.argv.find((a) => a.startsWith("--examples="))?.split("=")[1] ?? 2);

/** Ochiq (hali bajarilmagan) holatlar — bekor bo'lish xavfi shularda. */
const OPEN_STATUSES = ["planned", "in_progress", "ready", "sent"] as const;

const pad = (s: string, n: number) => s.padEnd(n);
const num = (n: number, w = 6) => String(n).padStart(w);

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^.*@/, "").replace(/\?.*$/, "");
  console.log(`BAZA: ${host}\n`);

  const companies = await prisma.company.findMany({
    where: { isActive: true, isOwnFirm: false },
    select: { id: true, name: true, inn: true, activeServices: true },
  });
  const keyed = companies.filter((c) => c.activeServices.length > 0);
  const keyless = companies.filter((c) => c.activeServices.length === 0);

  const templates = await prisma.deadlineTemplate.findMany({
    where: { matrixKey: { not: null } },
    select: { id: true, code: true, name: true, matrixKey: true, periodicity: true, lifecycle: true, applicability: true },
    orderBy: { code: "asc" },
  });

  // Faqat qoidasi YO'Q shablonlar — qoidasi borlarida o'zgarish bo'lmaydi.
  const candidates = templates.filter(needsServiceKeyRule);

  console.log("═".repeat(112));
  console.log("1) MOSLIK JADVALI — qoida qo'shilsa nima o'zgaradi");
  console.log("═".repeat(112));
  console.log(
    `${pad("SHABLON", 20)} ${pad("matrixKey", 22)} ${pad("davr", 10)} ` +
      `${pad("kaliti bor", 11)} ${pad("kaliti yo'q", 12)} ${pad("majburiyat", 11)} ${pad("TEGILADI", 9)} ${pad("ochiq", 7)}`,
  );
  console.log("─".repeat(112));

  let totalAffected = 0;
  let totalOpen = 0;
  const affectedCompanyIds = new Set<string>();
  const perKey: Array<{ code: string; matrixKey: string; affected: number; open: number; withKey: number; withoutKey: number }> = [];
  const zeroKeyTemplates: string[] = [];

  for (const t of candidates) {
    const key = t.matrixKey!;
    const withKey = keyed.filter((c) => c.activeServices.includes(key));
    const withoutKey = keyed.filter((c) => !c.activeServices.includes(key));

    // TEGILADIGAN majburiyatlar: kaliti bor firmalar ichida shu kalit yo'q
    // bo'lganlariniki. Kalitsiz 19 firma butunlay chiqarilgan.
    const rows = await prisma.obligation.findMany({
      where: {
        templateId: t.id,
        companyId: { in: withoutKey.map((c) => c.id) },
      },
      select: { id: true, status: true, companyId: true },
    });
    const open = rows.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status));

    const allForTemplate = await prisma.obligation.count({ where: { templateId: t.id } });

    totalAffected += rows.length;
    totalOpen += open.length;
    for (const r of rows) affectedCompanyIds.add(r.companyId);
    if (withKey.length === 0) zeroKeyTemplates.push(t.code);

    perKey.push({ code: t.code, matrixKey: key, affected: rows.length, open: open.length, withKey: withKey.length, withoutKey: withoutKey.length });

    console.log(
      `${pad(t.code, 20)} ${pad(key, 22)} ${pad(t.periodicity, 10)} ` +
        `${num(withKey.length, 11)} ${num(withoutKey.length, 12)} ${num(allForTemplate, 11)} ${num(rows.length, 9)} ${num(open.length, 7)}`,
    );
  }
  console.log("─".repeat(112));
  console.log(
    `${pad("JAMI", 20)} ${pad("", 22)} ${pad("", 10)} ${pad("", 11)} ${pad("", 12)} ${pad("", 11)} ` +
      `${num(totalAffected, 9)} ${num(totalOpen, 7)}`,
  );

  // ── 2) Firma misollari ────────────────────────────────────────────────
  console.log("\n" + "═".repeat(112));
  console.log("2) FIRMA MISOLLARI — har moslik uchun uch toifa");
  console.log("═".repeat(112));

  for (const t of candidates) {
    const key = t.matrixKey!;
    const withKey = keyed.filter((c) => c.activeServices.includes(key));
    const withoutKey = keyed.filter((c) => !c.activeServices.includes(key));

    const affected = await prisma.obligation.findMany({
      where: { templateId: t.id, companyId: { in: withoutKey.map((c) => c.id) } },
      select: { companyId: true, periodKey: true, status: true, dueAt: true },
      orderBy: { dueAt: "desc" },
      take: EXAMPLES,
    });
    const byId = new Map(companies.map((c) => [c.id, c]));

    console.log(`\n▸ ${t.code}  (matrixKey = ${key})  — ${t.name}`);
    console.log(`   ✓ kaliti BOR (o'zgarmaydi):`);
    for (const c of withKey.slice(0, EXAMPLES)) console.log(`       ${c.inn}  ${c.name}`);
    if (withKey.length === 0) console.log("       ⚠️  HECH KIMDA YO'Q — qoida qo'shilsa shablon butunlay o'chadi");

    console.log(`   ✗ kaliti YO'Q, boshqa kalitlari bor (ishonchli):`);
    for (const c of withoutKey.slice(0, EXAMPLES)) {
      console.log(`       ${c.inn}  ${pad(c.name.slice(0, 34), 36)} kalitlari: ${c.activeServices.length} ta`);
    }

    console.log(`   ⚠ hozir majburiyat YARATILGAN (bekor bo'ladi):`);
    if (affected.length === 0) console.log("       (yo'q)");
    for (const o of affected) {
      const c = byId.get(o.companyId);
      console.log(
        `       ${c?.inn ?? "?"}  ${pad((c?.name ?? "?").slice(0, 30), 32)} ` +
          `${pad(o.periodKey, 10)} ${pad(o.status, 12)} ${o.dueAt.toISOString().slice(0, 10)}`,
      );
    }
  }

  // ── 3) Yakuniy hisob ──────────────────────────────────────────────────
  console.log("\n" + "═".repeat(112));
  console.log("3) YAKUNIY HISOB");
  console.log("═".repeat(112));
  const allObligations = await prisma.obligation.count();
  console.log(`  Shablonlar (matrixKey bor, qoidasi yo'q)   : ${candidates.length}`);
  console.log(`  Jami majburiyat (baza bo'yicha)            : ${allObligations}`);
  console.log(`  TEGILADIGAN majburiyat                     : ${totalAffected}  (${((totalAffected / allObligations) * 100).toFixed(1)}%)`);
  console.log(`  — shundan OCHIQ (bekor bo'ladi)            : ${totalOpen}`);
  console.log(`  — shundan yopilgan/bekor (tegilmaydi)      : ${totalAffected - totalOpen}`);
  console.log(`  Ta'sirlanadigan firma                      : ${affectedCompanyIds.size}`);
  console.log(`  Faol mijoz firma (jami)                    : ${companies.length}`);
  console.log(`  — kaliti bor                               : ${keyed.length}`);
  console.log(`  — kaliti UMUMAN yo'q (HISOBDAN CHIQARILDI) : ${keyless.length}`);

  console.log("\n  matrixKey bo'yicha taqsimot (tegiladigan majburiyat):");
  for (const p of [...perKey].sort((a, b) => b.affected - a.affected)) {
    const bar = "█".repeat(Math.round((p.affected / Math.max(1, perKey[0].affected)) * 40));
    console.log(`    ${pad(p.matrixKey, 22)} ${num(p.affected, 5)}  ${bar}`);
  }

  if (zeroKeyTemplates.length > 0) {
    console.log(
      `\n  ⚠️  ${zeroKeyTemplates.length} ta shablonning kaliti HECH BIR firmada yo'q:\n` +
        `      ${zeroKeyTemplates.join(", ")}\n` +
        "      Qoida qo'shilsa ular umuman ishlamay qoladi — moslik xato bo'lishi mumkin.",
    );
  }

  console.log("\n  TEGILMAYDIGAN FIRMALAR (kaliti umuman yo'q — ma'lumot yetishmaydi):");
  for (const c of keyless) console.log(`    ${c.inn}  ${c.name}`);

  console.log("\n  ⓘ Hech narsa yozilmadi. Bu skriptda `--apply` YO'Q.");
}

main()
  .catch((e) => {
    console.error("✗ Xato:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
