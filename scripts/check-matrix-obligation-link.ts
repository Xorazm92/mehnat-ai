import "./load-env";

// =====================================================
// MATRITSA ↔ MAJBURIYAT QAMROVI TEKSHIRUVI (faqat o'qiydi)
// =====================================================
// Ko'prik jim ishlaydi: mos majburiyat topilmasa xato bermaydi. Shuning uchun
// uzilishni faqat SANAB ko'rish mumkin. Bu skript berilgan oy uchun har bir
// bog'langan ustunda nechta majburiyat harakatlanishi mumkinligini ko'rsatadi.
//
//   npx tsx scripts/check-matrix-obligation-link.ts            # joriy oy
//   npx tsx scripts/check-matrix-obligation-link.ts 2026-07

import { prisma } from "@/lib/prisma";
import { COL_KEY_TO_TEMPLATE_CODES, UNMAPPED_TEMPLATE_CODES } from "@/lib/reportTemplateMap";
import { BASE_REPORT_COLUMNS } from "@/lib/reportColumns";
import { toObligationMonthKey, toYearMonthKey } from "@/lib/periods";

async function main() {
  const period = process.argv[2] || new Date().toISOString().slice(0, 7);
  const monthKey = toObligationMonthKey(period);
  const ym = toYearMonthKey(period);
  if (!monthKey || !ym) throw new Error(`Davrni o'qib bo'lmadi: ${period}`);

  const [year, month] = ym.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  console.log(`Davr: ${period} (${monthKey})\n`);
  console.log("USTUN".padEnd(24), "SHABLON".padEnd(34), "MAJBURIYAT");

  let linked = 0;
  for (const [colKey, codes] of Object.entries(COL_KEY_TO_TEMPLATE_CODES)) {
    const templates = await prisma.deadlineTemplate.findMany({
      where: { code: { in: codes }, active: true },
      select: { id: true, code: true, lifecycle: true },
    });
    const live = templates.filter((t) => t.lifecycle === "active");
    const n = live.length
      ? await prisma.obligation.count({
          where: {
            templateId: { in: live.map((t) => t.id) },
            OR: [{ periodKey: monthKey }, { dueAt: { gte: monthStart, lt: monthEnd } }],
          },
        })
      : 0;
    if (n > 0) linked++;
    const label = templates.map((t) => `${t.code}${t.lifecycle === "active" ? "" : `(${t.lifecycle})`}`).join(", ");
    console.log(colKey.padEnd(24), (label || "— topilmadi").padEnd(34), n || "—");
  }

  const allCols = new Set<string>();
  for (const c of BASE_REPORT_COLUMNS) {
    allCols.add(c.key);
    if (c.payKey) allCols.add(c.payKey);
  }
  const unlinked = [...allCols].filter((k) => !COL_KEY_TO_TEMPLATE_CODES[k]);

  console.log(`\nBog'langan ustun: ${Object.keys(COL_KEY_TO_TEMPLATE_CODES).length} / ${allCols.size}`);
  console.log(`Shu oyda majburiyat oqimi bor ustun: ${linked}`);
  console.log(`\nMatritsa-only (majburiyatsiz) ${unlinked.length} ta ustun:\n  ${unlinked.join(", ")}`);

  // Teskari yo'nalish: matritsa hech qachon harakatga keltirmaydigan shablonlar.
  const mapped = new Set(Object.values(COL_KEY_TO_TEMPLATE_CODES).flat());
  const orphanTemplates = await prisma.deadlineTemplate.findMany({
    where: { lifecycle: "active" },
    select: { code: true },
    distinct: ["code"],
  });
  const orphans = orphanTemplates
    .map((t) => t.code)
    .filter((c) => !mapped.has(c) && !UNMAPPED_TEMPLATE_CODES[c]);
  console.log(
    orphans.length
      ? `\n⚠️  Matritsaga ulanmagan FAOL shablonlar: ${orphans.join(", ")}\n   (ular faqat /deadlines ichida yuritiladi — bu ataylab bo'lsa UNMAPPED_TEMPLATE_CODES ga yozing)`
      : "\n✅ Har bir faol shablon yo matritsaga ulangan, yo ataylab ajratilgan.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
