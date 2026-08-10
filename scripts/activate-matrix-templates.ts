import "./load-env";

// =====================================================
// MATRITSA USTUNLARIGA BOG'LANGAN SHABLONLARNI FAOLLASHTIRISH
// =====================================================
// 10 ta shablon `draft` holatida turardi: ular matritsada ustun sifatida bor,
// lekin majburiyat hosil qilmasdi — ya'ni buxgalter uchun ish bor, muddat
// dvigateli uchun yo'q. Shu bo'shliq "matritsada topshirildi, muddatlarda
// kechikdi" holatining bir sababi edi.
//
// MUHIM — ular `draft` holatida qolgani BEJIZ EMAS: applicability'si BO'SH,
// ya'ni faollashtirilsa "Yer solig'i" ni ham, "Ekologiya" ni ham 269 ta
// firmaning HAMMASIGA yozardi va minglab soxta "muddati o'tdi" tug'ilardi.
// Shuning uchun bu skript avval har shablonga `service_key` mezonini biriktiradi:
//
//     Company.activeServices (matritsada qaysi ustun ko'rinadi)
//         ↕  bitta qaror
//     TemplateApplicability.service_key (kimga majburiyat yaratiladi)
//
// Natijada firma kartochkasidagi "xizmatlar" belgisi ikkalasini ham boshqaradi.
// DIQQAT: matritsada bo'sh `activeServices` = "hamma ustun ko'rinsin" degani,
// bu yerda esa "hech biri" — majburiyat aniq tanlov bilan tug'ilishi kerak,
// taxmin bilan emas.
//
// Ishga tushirish:
//   npx tsx scripts/activate-matrix-templates.ts            # faqat ko'rsatadi
//   npx tsx scripts/activate-matrix-templates.ts --apply    # yozadi

import { prisma } from "@/lib/prisma";
import { COL_KEY_TO_TEMPLATE_CODES } from "@/lib/obligationBridge";

/** Faollashtiriladigan shablon → uni boshqaradigan matritsa ustuni. */
const CODE_TO_COL: Record<string, string> = {
  DIDOX_FLOW: "didox",
  AVTOKAMERAL: "avtokameral",
  MY_MEHNAT: "my_mehnat",
  YER_SOLIQ: "yer_soligi",
  SUV_SOLIQ: "suv_soligi",
  MOL_MULK_SOLIQ: "mol_mulk_soligi",
  BONAK: "bonak",
  BUX_BALANS: "buxgalteriya_balansi",
  ITPARK_OYLIK: "itpark_chorak",
  EKOLOGIYA: "ekologiya",
};

async function main() {
  const apply = process.argv.includes("--apply");

  // Ko'prik bilan mos kelishini tekshiramiz: ustun kaliti noto'g'ri bo'lsa
  // shablon faollashadi-yu, matritsa uni hech qachon harakatga keltirmaydi.
  for (const [code, colKey] of Object.entries(CODE_TO_COL)) {
    if (!COL_KEY_TO_TEMPLATE_CODES[colKey]?.includes(code)) {
      throw new Error(`Mos kelmadi: ${colKey} → ${code} (lib/obligationBridge.ts bilan sinxron emas)`);
    }
  }

  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, activeServices: true },
  });

  console.log(`Rejim: ${apply ? "YOZISH (--apply)" : "KO'RISH (dry-run)"}`);
  console.log(`Faol firmalar: ${companies.length}\n`);
  console.log("KOD".padEnd(18), "USTUN".padEnd(22), "TEGISHLI FIRMA");

  let changed = 0;
  for (const [code, colKey] of Object.entries(CODE_TO_COL)) {
    const tpl = await prisma.deadlineTemplate.findFirst({
      where: { code },
      orderBy: { version: "desc" },
      select: { id: true, lifecycle: true, applicability: true },
    });
    if (!tpl) {
      console.log(code.padEnd(18), colKey.padEnd(22), "— shablon topilmadi");
      continue;
    }

    const affected = companies.filter((c) => c.activeServices.includes(colKey)).length;
    console.log(code.padEnd(18), colKey.padEnd(22), String(affected));

    if (!apply) continue;

    const hasCriterion = tpl.applicability.some(
      (a) => a.criteriaType === "service_key" && a.criteriaValue === colKey,
    );
    if (!hasCriterion) {
      await prisma.templateApplicability.create({
        data: { templateId: tpl.id, criteriaType: "service_key", criteriaValue: colKey },
      });
    }
    if (tpl.lifecycle !== "active") {
      await prisma.deadlineTemplate.update({ where: { id: tpl.id }, data: { lifecycle: "active" } });
    }
    changed++;
  }

  console.log(
    apply
      ? `\n${changed} ta shablon faollashtirildi. Majburiyatlar keyingi generatsiyada (scripts/generate-obligations.ts) paydo bo'ladi.`
      : "\nHech nima o'zgartirilmadi. Yozish uchun: --apply",
  );
  console.log(
    "Eslatma: firmada tegishli xizmat belgilanmagan bo'lsa majburiyat YARATILMAYDI —\n" +
      "bu ataylab: soxta 'muddati o'tdi' yozuvidan ko'ra bo'sh ro'yxat yaxshi.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
