// =====================================================
// SHABLON TO'PLAMI v2 — YOZISH (P4A)
// =====================================================
//
// Uchta mavjud draftni faoliyatga o'tkazadi va ikkita yangisini yaratadi.
// Ta'riflar va REJA `lib/domains/accounting/deadlineTemplatesV2.ts` da —
// bu fayl faqat rejani bajaradi.
//
// ⚠️ YANGI IKKITASI `draft` BO'LIB YARATILADI. Ular universal (applicability
// bo'sh), ya'ni `active` bo'lsa 259 firmaning hammasiga tushadi — yiliga
// ~1 295 ta majburiyat, hammasi tasdiqlanmagan taxmin ustida. Intervyudan
// keyin `--activate-new` bilan yoqiladi.
//
// UNIKAL KALIT `[code, version]`, faqat `code` EMAS. `upsert` shuni
// ishlatadi; aks holda "duplicate key" xatosi chiqardi.
//
// NORMATIV MEHNAT bu yerda YOZILMAYDI — yangi qatorlarga P1 jadvalidan
// qo'yiladi, mavjud uchtasiga esa `seed-normative-minutes.ts` javobgar.
// Ikki skript bitta ustunni yozsa qaysi biri oxirgi yurgani muhim bo'lib
// qolardi.
//
// IDEMPOTENT: faol shablon qayta faollashtirilmaydi, mavjud kod qayta
// yaratilmaydi.
//
//   npx tsx scripts/seed-deadline-templates-v2.ts                    # dry-run
//   npx tsx scripts/seed-deadline-templates-v2.ts --apply
//   npx tsx scripts/seed-deadline-templates-v2.ts --apply --activate-new

import "./load-env";
import { prisma } from "@/lib/prisma";
import {
  V2_ACTIVATE_CODES,
  V2_NEW_TEMPLATES,
  planTemplateSeed,
  normativeFor,
} from "@/lib/domains/accounting/deadlineTemplatesV2";

const APPLY = process.argv.includes("--apply");
const ACTIVATE_NEW = process.argv.includes("--activate-new");

async function main(): Promise<void> {
  const codes = [...V2_ACTIVATE_CODES, ...V2_NEW_TEMPLATES.map((t) => t.code)];
  const existing = await prisma.deadlineTemplate.findMany({
    where: { code: { in: codes } },
    select: { code: true, lifecycle: true, active: true, version: true },
  });

  const plan = planTemplateSeed(existing);

  console.log(APPLY ? "▶ QO'LLASH rejimi (--apply)" : "▶ DRY-RUN — hech narsa yozilmaydi");
  if (ACTIVATE_NEW) console.log("  --activate-new: yangi shablonlar DARHOL faol bo'ladi\n");
  else console.log("");

  let activated = 0, created = 0, untouched = 0, missing = 0;

  for (const step of plan) {
    switch (step.kind) {
      case "already_active":
        untouched++;
        console.log(`  = ${step.code.padEnd(26)} allaqachon faol — tegilmadi`);
        break;

      case "activate_missing":
        missing++;
        console.error(`  ✗ ${step.code.padEnd(26)} BAZADA YO'Q — kutilmagan holat`);
        break;

      case "activate": {
        if (APPLY) {
          await prisma.deadlineTemplate.updateMany({
            where: { code: step.code, lifecycle: "draft" },
            data: { lifecycle: "active", active: true },
          });
        }
        activated++;
        console.log(`  ${APPLY ? "✓" : "·"} ${step.code.padEnd(26)} ${step.from} → active`);
        break;
      }

      case "exists":
        untouched++;
        console.log(`  = ${step.code.padEnd(26)} allaqachon bor — tegilmadi`);
        break;

      case "create": {
        const def = V2_NEW_TEMPLATES.find((t) => t.code === step.code)!;
        const lifecycle = ACTIVATE_NEW ? "active" : def.lifecycle;
        if (APPLY) {
          await prisma.deadlineTemplate.upsert({
            // Unikal kalit — [code, version], faqat `code` emas.
            where: { code_version: { code: def.code, version: 1 } },
            create: {
              code: def.code,
              name: def.name,
              obligationType: def.obligationType,
              periodicity: def.periodicity,
              anchorType: def.anchorType,
              dueDay: def.dueDay,
              dueMonth: def.dueMonth,
              normativeMinutes: normativeFor(def.code),
              // Yangi shablon BUGUNDAN kuchga kiradi: orqaga sanani qo'yish
              // o'tgan davrlar uchun ham majburiyat yaratardi.
              effectiveFrom: new Date(),
              lifecycle,
              active: true,
              version: 1,
            },
            update: {},
          });
        }
        created++;
        console.log(
          `  ${APPLY ? "✓" : "·"} ${def.code.padEnd(26)} yangi · ${def.periodicity} · ` +
            `${normativeFor(def.code)} daq · lifecycle=${lifecycle}`,
        );
        break;
      }
    }
  }

  console.log(`\n  faollashtirildi=${activated}  yaratildi=${created}  tegilmadi=${untouched}`);
  if (missing > 0) {
    console.error(`\n✗ ${missing} ta kutilgan shablon bazada topilmadi — to'xtatildi.`);
    process.exitCode = 1;
    return;
  }
  if (created > 0 && !ACTIVATE_NEW) {
    console.log(
      "\n⚠️  Yangi shablonlar `draft` — generator ularni HALI OLMAYDI. Ular universal\n" +
        "    (applicability bo'sh), ya'ni faollashtirilsa 259 firmaning hammasiga tushadi.\n" +
        "    Intervyudan keyin: --activate-new",
    );
  }
  if (!APPLY) console.log("\n  Yozish uchun: --apply");
}

main()
  .catch((e) => {
    console.error("✗ Xato:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
