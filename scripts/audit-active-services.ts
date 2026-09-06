// =====================================================
// XIZMAT KALITLARI QAMROVI — FAQAT O'QISH (P3)
// =====================================================
//
// ⚠️ BU SKRIPT HECH NARSA YOZMAYDI va `--apply` bayrog'i YO'Q — ataylab.
//
// Topshiriq "258 firmaga xizmat biriktirish" edi. Uchta premissa
// tekshirildi va uchalasi ham rad etildi:
//
//   1. `Company.activeServiceId` USTUNI YO'Q. Bor narsa —
//      `Company.activeServices String[]`, ya'ni kalitlar RO'YXATI, bitta
//      tashqi kalit emas. `Service`/`CompanyService` esa butunlay boshqa
//      narsa (hisob-kitob katalogi: narx, miqdor) va sxemaning o'zi
//      "adashtirmang" deb ogohlantiradi.
//   2. "258 firmada hech narsa generatsiya qilinmaydi" — NOTO'G'RI.
//      Bazada 7 221 ta majburiyat va 269 ta firma bor. Sabab: 40 shablondan
//      17 tasida umuman applicability qoidasi yo'q, ya'ni ular UNIVERSAL
//      (`templateApplies` bo'sh mezonda `true` qaytaradi). Asosiy soliqlar
//      esa `tax_regime` bilan darvozalangan, `service_key` bilan emas.
//   3. "Default STANDART_BUXGALTER yaratish" — XAVFLI. `service_key` bilan
//      darvozalangan 18 shablon orasida `mol_mulk_soligi`, `yer_soligi`,
//      `suv_soligi`, `ekologiya` bor. Bular QONUNIY majburiyatlar: firma
//      ularga tegishli bo'lmasa ham biriktirilsa, tizim mavjud bo'lmagan
//      soliq uchun muddat yaratadi, kechiktiradi, eskalatsiya qiladi va
//      buxgalterga KPI jarimasi yozadi.
//
// ⚠️ TUZATISH (2026-09-06). Yuqoridagi 3-band DASTLAB "kelib chiqarish
// manbasi yo'q, `activeServices` 1/259 da to'ldirilgan" deb yozilgan edi.
// BU LOKAL BAZANING holati; PRODDA boshqacha:
//
//     activeServices to'ldirilgan : 239 / 270 firma (88%)
//     MonthlyReport qatorlari     : 323 (277 firma)
//     majburiyatlar               : 14 159
//
// Ya'ni "qaysi firma qaysi hisobotni topshiradi" ma'lumoti BOR. Xato
// AGENTS.md/xotiradagi qoidani buzganimdan kelib chiqdi: qamrov tahlili
// PROD ma'lumotiga qarshi o'lchanadi, lokal nusxaga emas.
//
// BO'SHLIQ TESKARI TOMONDA. Firmada kalit bor, lekin SHABLONDA unga
// ko'rsatuvchi `TemplateApplicability` qatori yo'q — shuning uchun o'sha
// shablon UNIVERSAL bo'lib qoladi va kaliti yo'q firmalarga ham tushadi.
// Ko'prik allaqachon mavjud: `DeadlineTemplate.matrixKey` matritsa ustunini
// nomlaydi va `Company.activeServices` xuddi shu lug'atdan.
//
// PRODDA O'LCHANGAN: 14 159 majburiyatdan 2 737 tasi firmaning O'Z kaliti
// "bu hisobotni topshirmayman" deyayotgan holatda yaratilgan. Ulardan
// 2 096 tasi (239 firma) ishonchli — firmada boshqa kalitlar BOR, faqat shu
// yo'q; 1 897 tasi hali `planned`, ya'ni kechikadi, eskalatsiya qiladi va
// KPI ga tushadi. Qolgan 641 tasi kaliti umuman yo'q 19 firmaniki — ular
// haqida hech narsa deyish mumkin emas.
//
// Shuning uchun bu skript ikkita bo'shliqni ham o'lchaydi: kalitsiz firma
// (kam) va qoidasiz shablon (ko'p).
//
//   npx tsx scripts/audit-active-services.ts
//   npx tsx scripts/audit-active-services.ts --csv=/tmp/xizmat-kalitlari.csv

import "./load-env";
import { prisma } from "@/lib/prisma";
import { writeFileSync } from "node:fs";

const CSV = process.argv.find((a) => a.startsWith("--csv="))?.split("=")[1];

async function main(): Promise<void> {
  const templates = await prisma.deadlineTemplate.findMany({
    select: { code: true, name: true, lifecycle: true, matrixKey: true, applicability: true },
    orderBy: { code: "asc" },
  });
  const companies = await prisma.company.findMany({
    where: { isActive: true, isOwnFirm: false },
    select: { id: true, name: true, inn: true, taxRegime: true, activeServices: true },
    orderBy: { name: "asc" },
  });

  const universal = templates.filter((t) => t.applicability.length === 0);
  const byServiceKey = templates.filter((t) =>
    t.applicability.some((a) => a.criteriaType === "service_key"),
  );
  const byRegime = templates.filter((t) =>
    t.applicability.some((a) => a.criteriaType === "tax_regime"),
  );

  const withKeys = companies.filter((c) => c.activeServices.length > 0);

  console.log("XIZMAT KALITLARI QAMROVI\n");
  console.log(`  Firmalar (faol, o'z firma emas) : ${companies.length}`);
  console.log(`  activeServices to'ldirilgan     : ${withKeys.length}`);
  console.log(`  Shablonlar                       : ${templates.length}`);
  console.log(`    · universal (mezonsiz)         : ${universal.length}  → HAMMA firmaga tushadi`);
  console.log(`    · tax_regime bo'yicha          : ${byRegime.length}  → rejimdan avtomatik`);
  console.log(`    · service_key bo'yicha         : ${byServiceKey.length}  → qo'lda kalit kerak\n`);

  // Har service_key shabloni bugun nechta firmaga tushayotgani.
  console.log("SERVICE_KEY BILAN DARVOZALANGAN SHABLONLAR\n");
  for (const t of byServiceKey) {
    const keys = t.applicability.filter((a) => a.criteriaType === "service_key").map((a) => a.criteriaValue);
    const reach = companies.filter((c) => keys.some((k) => c.activeServices.includes(k))).length;
    const flag = reach === 0 ? "  ← hech kimga tushmaydi" : "";
    console.log(
      `  ${t.code.padEnd(24)} ${String(reach).padStart(3)} firma  ` +
        `[${keys.join(", ")}] ${t.lifecycle}${flag}`,
    );
  }

  // ── matrixKey ko'prigi: shablonda qoida bormi? ───────────────────────
  // Bu bo'lim asosiy bo'shliqni ko'rsatadi. `matrixKey` firma kalitlari
  // bilan bir lug'atdan, ya'ni "qaysi firma bu shablonni oladi" allaqachon
  // ma'lum — faqat qoida yozilmagan.
  console.log("\nMATRIXKEY KO'PRIGI — qoidasiz shablonlar\n");
  let overreach = 0;
  for (const t of templates) {
    if (!t.matrixKey) continue;
    const hasServiceRule = t.applicability.some((a) => a.criteriaType === "service_key");
    if (hasServiceRule) continue;
    const withKey = companies.filter((c) => c.activeServices.includes(t.matrixKey!)).length;
    const extra = companies.length - withKey;
    if (extra <= 0) continue;
    overreach++;
    console.log(
      `  ${t.code.padEnd(24)} matrixKey=${t.matrixKey!.padEnd(22)} ` +
        `kaliti bor: ${String(withKey).padStart(3)}  ORTIQCHA: ${String(extra).padStart(3)} firma`,
    );
  }
  if (overreach === 0) console.log("  (yo'q — har shablonda qoida bor)");
  else
    console.log(
      `\n  ⇒ ${overreach} ta shablon UNIVERSAL bo'lib ishlayapti, holbuki matritsa\n` +
        "    kaliti kimga tegishli ekanini allaqachon aytadi. Yechim — firmaga emas,\n" +
        "    SHABLONGA yozish: `TemplateApplicability(service_key = matrixKey)`.",
    );

  console.log("\nKELIB CHIQARISH MANBALARI (tekshirildi)\n");
  const withRequired = await prisma.company.count({
    where: { isActive: true, requiredReports: { isEmpty: false } },
  });
  console.log(`  requiredReports to'ldirilgan : ${withRequired} / ${companies.length}`);
  console.log(`  activeServices to'ldirilgan  : ${withKeys.length} / ${companies.length}`);
  const regimes = new Map<string, number>();
  for (const c of companies) regimes.set(c.taxRegime, (regimes.get(c.taxRegime) ?? 0) + 1);
  console.log(`  taxRegime                    : ${[...regimes].map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(
    "\n  ⇒ Lokal bazada bu ko'rsatkichlar bo'sh, PRODDA esa 239/270. Qamrovni\n" +
      "    har doim prod ma'lumotiga qarshi o'lchang — lokal nusxa tozalangan.",
  );

  if (CSV) {
    // To'ldiriladigan jadval: firma × service_key. Bosh buxgalter belgilaydi.
    const keys = [...new Set(byServiceKey.flatMap((t) =>
      t.applicability.filter((a) => a.criteriaType === "service_key").map((a) => a.criteriaValue),
    ))].sort();
    const head = ["INN", "Firma", "Soliq rejimi", ...keys].join(";");
    const rows = companies.map((c) =>
      [c.inn, `"${c.name.replace(/"/g, "'")}"`, c.taxRegime, ...keys.map((k) => (c.activeServices.includes(k) ? "1" : ""))].join(";"),
    );
    writeFileSync(CSV, [head, ...rows].join("\n") + "\n", "utf8");
    console.log(`\n  ✓ To'ldiriladigan jadval yozildi: ${CSV} (${companies.length} qator × ${keys.length} kalit)`);
  } else {
    console.log("\n  Intervyu uchun jadval: --csv=/tmp/xizmat-kalitlari.csv");
  }
}

main()
  .catch((e) => {
    console.error("✗ Xato:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
