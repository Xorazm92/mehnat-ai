/**
 * OPERATSION MA'LUMOTNI TOZALASH — yangi hisob davriga toza start
 * ==============================================================
 * Ma'lumot ikkiga bo'linadi:
 *
 *   SPRAVOCHNIK (saqlanadi) — kim ishlaydi, qaysi firmalar, qanday qoidalar:
 *     User, Company, Department, ContractAssignment, KpiRule, CompanyKpiRule,
 *     SlaPolicy, DeadlineTemplate va uning yo'ldoshlari, SystemSetting,
 *     ClientCredential, ClientUser, TelegramGroup, InventoryItem, OneCConnection.
 *
 *   OPERATSION (o'chiriladi) — pul, ball, hisobot, xabar: quyidagi TABLES ro'yxati.
 *
 * ⚠️  QAYTARIB BO'LMAYDI. Ishlatishdan oldin ALBATTA:
 *       bash scripts/backup.sh
 *
 * ISHLATISH:
 *   npx tsx scripts/reset-operational-data.ts                    # quruq hisobot
 *   npx tsx scripts/reset-operational-data.ts --apply --confirm=RESET
 *
 * `--confirm=RESET` ataylab: yolg'iz `--apply` ni tasodifan yozib yuborish
 * mumkin, ikkita mustaqil bayroqni esa yo'q.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

interface Target {
  /** Prisma model nomi (delegate kaliti). */
  model: string;
  /** Nima uchun operatsion deb hisoblanadi. */
  why: string;
}

/**
 * O'chirish TARTIBI muhim: bola jadval avval ketadi, aks holda tashqi kalit
 * cheklovi to'sadi (hamma bog'lanish ham `onDelete: Cascade` emas).
 */
const TABLES: Target[] = [
  // Majburiyat zanjiri (eng chuqur boladan boshlab)
  { model: "submissionEvidence", why: "majburiyat dalillari" },
  { model: "obligationSubmission", why: "majburiyat topshirishlari" },
  { model: "obligationStatusEvent", why: "majburiyat holat tarixi" },
  { model: "obligationAssignmentEvent", why: "majburiyat biriktirish tarixi" },
  { model: "obligation", why: "majburiyatlar (har oy qayta generatsiya qilinadi)" },

  // Bot: savol/javob va xabar tarixi
  { model: "answer", why: "javoblar" },
  { model: "question", why: "mijoz savollari (SLA)" },
  { model: "telegramMessage", why: "guruh xabarlari tarixi" },
  { model: "processedUpdate", why: "Telegram dedup jurnali" },

  // Vazifa / SLA
  { model: "slaBreach", why: "SLA buzilishlari" },
  { model: "taskEvent", why: "vazifa hodisalari" },
  { model: "task", why: "vazifalar" },

  // Xabarnomalar
  { model: "notificationDelivery", why: "yetkazish jurnali (eskalatsiya dedup)" },
  { model: "notification", why: "ilova ichidagi xabarlar" },
  { model: "paymentReminder", why: "to'lov eslatmalari tarixi" },

  // Moliya: ledger va davr
  { model: "ledgerEntry", why: "ikki tomonlama yozuvlar" },
  { model: "financialSnapshot", why: "oy yopish suratlari" },
  { model: "accountingPeriod", why: "hisob davrlari (qulflar)" },

  // Moliya: hujjatlar
  { model: "payout", why: "real to'lovlar" },
  { model: "payrollAdjustment", why: "oylik: bonus/jarima/avans/hisoblangan" },
  { model: "invoice", why: "chiqarilgan hisob-fakturalar" },
  { model: "payment", why: "mijoz to'lovlari" },
  { model: "expense", why: "xarajatlar" },
  { model: "kassaEntry", why: "kassa kirim/chiqim" },

  // KPI
  { model: "monthlyPerformance", why: "KPI baholari (oylikka ta'sir qiladi)" },
  { model: "kpiEvent", why: "KPI ledgeri (bot signallari)" },
  { model: "fairKpiScore", why: "adolatli KPI (shadow)" },

  // Davomat / vaqt
  { model: "attendance", why: "davomat" },
  { model: "timeEntry", why: "vaqt hisobi" },

  // Hisobot matritsasi
  { model: "reportProof", why: "hisobot dalillari (skrinshotlar)" },
  { model: "monthlyReport", why: "amallar matritsasi kataklari" },
  { model: "financialReport", why: "moliyaviy hisobotlar" },

  // Integratsiya
  { model: "integrationEvent", why: "1C hodisalari navbati" },
];

/**
 * AuditLog ATAYIN ro'yxatda yo'q: u kim nima qilganining izi va odatda
 * tozalashda saqlanadi. `--with-audit` bilan uni ham o'chirish mumkin.
 */
const AUDIT_MODEL = "auditLog";

type Delegate = { count: () => Promise<number>; deleteMany: (args?: object) => Promise<{ count: number }> };
const delegate = (name: string): Delegate =>
  (prisma as unknown as Record<string, Delegate>)[name];

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm=RESET");
  const withAudit = process.argv.includes("--with-audit");

  const list = withAudit ? [...TABLES, { model: AUDIT_MODEL, why: "audit izi" }] : TABLES;

  console.log("\n🧹 OPERATSION MA'LUMOTNI TOZALASH\n");
  let total = 0;
  const counts: Array<{ t: Target; n: number }> = [];
  for (const t of list) {
    const d = delegate(t.model);
    if (!d) {
      console.error(`⚠️  Model topilmadi: ${t.model} — o'tkazib yuborildi`);
      continue;
    }
    const n = await d.count();
    total += n;
    if (n > 0) counts.push({ t, n });
  }

  if (counts.length === 0) {
    console.log("✅ Tozalanadigan operatsion ma'lumot yo'q — baza allaqachon toza.");
    await prisma.$disconnect();
    return;
  }

  console.log("O'CHIRILADI:");
  for (const c of counts) {
    console.log(`  ${String(c.n).padStart(7)}  ${c.t.model.padEnd(28)} ${c.t.why}`);
  }
  console.log(`  ${String(total).padStart(7)}  JAMI`);

  // Saqlanadigan spravochnik — operator nima qolishini ko'rib turishi uchun.
  const keep: Array<[string, number]> = [];
  for (const m of [
    "user", "company", "department", "contractAssignment", "kpiRule",
    "companyKpiRule", "slaPolicy", "deadlineTemplate", "systemSetting",
    "clientCredential", "clientUser", "telegramGroup", "inventoryItem",
  ]) {
    const d = delegate(m);
    if (d) keep.push([m, await d.count()]);
  }
  console.log("\nSAQLANADI (spravochnik):");
  for (const [m, n] of keep.filter(([, n]) => n > 0)) {
    console.log(`  ${String(n).padStart(7)}  ${m}`);
  }
  if (!withAudit) {
    const a = await delegate(AUDIT_MODEL).count();
    console.log(`  ${String(a).padStart(7)}  auditLog  (--with-audit bilan o'chiriladi)`);
  }

  const templates = await delegate("deadlineTemplate").count();
  if (templates === 0) {
    console.log(
      "\n⚠️  DeadlineTemplate = 0 — majburiyat shablonlari yo'q, ya'ni tozalashdan\n" +
        "    keyin yangi majburiyatlar GENERATSIYA QILINMAYDI va bot muddat\n" +
        "    eslatmalarini yubora olmaydi. Avval shablonlarni kiriting.",
    );
  }

  if (!apply || !confirmed) {
    console.log(
      "\n— Quruq ishlash, hech narsa o'chirilmadi.\n" +
        "  Avval zaxira:  bash scripts/backup.sh\n" +
        "  So'ng:         npx tsx scripts/reset-operational-data.ts --apply --confirm=RESET",
    );
    await prisma.$disconnect();
    return;
  }

  console.log("\n⏳ O'chirilmoqda…");
  let deleted = 0;
  for (const c of counts) {
    const res = await delegate(c.t.model).deleteMany({});
    deleted += res.count;
    console.log(`   ${String(res.count).padStart(7)}  ${c.t.model}`);
  }
  console.log(`\n✅ ${deleted} qator o'chirildi. Spravochnik tegilmadi.`);
  console.log(
    "   Keyingi qadam: majburiyatlar 06:00 dagi generatsiyada qayta yaratiladi\n" +
      "   (yoki qo'lda: npx tsx -e \"...runGenerationLocked\").",
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("reset-operational-data failed:", e);
  process.exit(1);
});
