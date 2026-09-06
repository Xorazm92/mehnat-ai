// =====================================================
// NORMATIV MEHNATNI SHABLONLARGA YOZISH (P1)
// =====================================================
//
// ⚠️ BU SKRIPT TAXMINNI QARORGA AYLANTIRADI — o'qib chiqmasdan yurgizmang.
//
// Bugun `DeadlineTemplate.normativeMinutes` 40 shablonning hammasida `NULL`
// va bu SIG'IM HISOBINI BUZMAYDI: `normativeEffort()` ish turiga ko'ra
// standart beradi hamda `estimated: true` bayrog'ini qaytaradi, UI esa uni
// "taxminiy" deb belgilaydi. Ya'ni bugun ekran ROSTINI aytadi — "bu raqam
// standartdan, bosh buxgalterdan emas".
//
// Bu skript ishga tushgach o'sha bayroq YO'QOLADI: qiymat bazada turadi,
// demak `estimated: false` bo'ladi va kokpit taxminni tasdiqlangan norma
// sifatida ko'rsatadi. `normativeEffort.ts` izohi buni ataylab ogohlantiradi
// ("ekilgan taxmin — qaror bo'lib ko'rinadi").
//
// Shuning uchun standart rejim — DRY-RUN, va `--apply` qo'lda beriladi.
// To'g'ri navbat: intervyu → raqamlarni `normativePresets.ts` da yangilash →
// `--apply`.
//
// IDEMPOTENT: qiymati bor qator TEGILMAYDI (bosh buxgalter qo'lda kiritgan
// raqam skript tomonidan qayta yozilmaydi).
//
//   npx tsx scripts/seed-normative-minutes.ts            # dry-run
//   npx tsx scripts/seed-normative-minutes.ts --apply
//   npx tsx scripts/seed-normative-minutes.ts --apply --force   # borini ham qayta yozadi

import "./load-env";
import { prisma } from "@/lib/prisma";
import {
  presetFor,
  NORMATIVE_PRESETS,
  DEFAULT_PRESET_MINUTES,
  MAX_NORMATIVE_MINUTES,
} from "@/lib/domains/accounting/normativePresets";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

export interface SeedResult {
  total: number;
  updated: number;
  /** Qiymati allaqachon bor (yoki `--force` siz tegilmaydi). */
  skipped: number;
  /** Jadvalda kodi yo'q — standartga tushdi. */
  fellBack: string[];
}

async function main(): Promise<void> {
  const templates = await prisma.deadlineTemplate.findMany({
    select: { id: true, code: true, name: true, periodicity: true, normativeMinutes: true },
    orderBy: [{ periodicity: "asc" }, { code: "asc" }],
  });

  const res: SeedResult = { total: templates.length, updated: 0, skipped: 0, fellBack: [] };

  console.log(APPLY ? "▶ QO'LLASH rejimi (--apply)" : "▶ DRY-RUN — hech narsa yozilmaydi");
  console.log(`  ${templates.length} ta shablon topildi\n`);

  for (const t of templates) {
    const minutes = presetFor(t.code);
    if (!(t.code in NORMATIVE_PRESETS)) res.fellBack.push(t.code);

    // Bor qiymat SAQLANADI: u bosh buxgalterning qarori bo'lishi mumkin va
    // uni taxmin bilan almashtirish ma'lumot yo'qotish bo'lardi.
    if (t.normativeMinutes != null && !FORCE) {
      res.skipped++;
      console.log(`  = ${t.code.padEnd(24)} ${String(t.normativeMinutes).padStart(3)} daq (bor — tegilmadi)`);
      continue;
    }

    // Qo'riqchi: bir ish bir ish kunidan (8 soat) uzun bo'lolmaydi.
    if (minutes < 1 || minutes > MAX_NORMATIVE_MINUTES) {
      console.error(`✗ ${t.code}: normativ oralig'idan tashqarida (${minutes} daq)`);
      process.exitCode = 1;
      return;
    }

    if (APPLY) {
      await prisma.deadlineTemplate.update({ where: { id: t.id }, data: { normativeMinutes: minutes } });
    }
    res.updated++;
    console.log(`  ${APPLY ? "✓" : "·"} ${t.code.padEnd(24)} ${String(minutes).padStart(3)} daq  ${t.name}`);
  }

  console.log(`\n  jami=${res.total}  yozildi=${res.updated}  tegilmadi=${res.skipped}`);
  if (res.fellBack.length > 0) {
    // Bu OGOHLANTIRISH, xato emas: yangi shablon qo'shilgan, lekin tarif
    // jadvaliga kiritilmagan. Jimgina 45 ga tushishi jadval "to'liq" degan
    // yolg'on taassurot berardi.
    console.log(
      `\n⚠️  ${res.fellBack.length} ta shablon tarif jadvalida YO'Q va standart ` +
        `${DEFAULT_PRESET_MINUTES} daqiqaga tushdi:\n     ${res.fellBack.join(", ")}`,
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
