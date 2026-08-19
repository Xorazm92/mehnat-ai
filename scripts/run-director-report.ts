// Direktorning kunlik hisobotini QO'LDA ishga tushirish.
//
//   npx tsx scripts/run-director-report.ts            # yuboradi
//   npx tsx scripts/run-director-report.ts --dry-run  # faqat ko'rsatadi
//
// Normal holatda bu ish botning `notify` navbatida 09:00 da (Asia/Tashkent)
// avtomat bajariladi — bu skript sozlashni tekshirish va bir martalik qayta
// yuborish uchun.
//
// `--dry-run` hech narsa yozmaydi: na Notification, na NotificationDelivery.
// Shu sababli dedup kaliti ham band qilinmaydi — keyin haqiqiy yuborish
// bemalol ishlaydi.
import "./load-env";
import { prisma } from "@/lib/prisma";
import {
  buildDirectorReport,
  runDirectorReport,
  collectDirectorRecipients,
} from "@/lib/directorReport";
import { renderDirectorReport } from "@/bot/contexts/digest/application/render-director-report";
import { directorReportKeyboard } from "@/bot/contexts/digest/application/render-director-section";
import { callbackSecret } from "@/bot/config";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();

  const recipients = await collectDirectorRecipients(prisma);
  console.log(`Qabul qiluvchilar (super_admin/admin, faol): ${recipients.length}`);
  for (const r of recipients) {
    const tg = r.telegramUserId != null ? "Telegram ✓" : "Telegram ✗ (faqat sayt)";
    console.log(`  - ${r.fullName} [${r.role}] ${tg}`);
  }

  const report = await buildDirectorReport(prisma, now);
  console.log("\n--- Telegram ko'rinishi ---");
  console.log(renderDirectorReport(report));
  // Tugmalar ham ko'rsatiladi: hisobotning yarmi endi ular ortida turadi va
  // "bo'lim bo'sh bo'lsa tugma yo'q" qoidasi shu yerda ko'zga tashlanadi.
  const buttons = directorReportKeyboard(callbackSecret(), report)
    .inline_keyboard.map((row) => row.map((b) => `[ ${b.text} ]`).join(" "))
    .join("\n");
  console.log(`\nTugmalar:\n${buttons}`);
  console.log("---------------------------\n");

  if (dryRun) {
    console.log("--dry-run: hech narsa yuborilmadi va yozilmadi.");
    return;
  }

  const res = await runDirectorReport(prisma, { now });
  console.log("Natija:", res);
  if (res.skippedAlready > 0) {
    console.log(
      `Eslatma: ${res.skippedAlready} ta qabul qiluvchiga bugun allaqachon yuborilgan (dedup).`
    );
  }
  console.log(
    "Eslatma: bu skript Telegram'ni jo'natmaydi (grammY bot protsessida). " +
      "Sayt ichidagi xabar yozildi; Telegram nusxasi 09:00 dagi ish orqali ketadi."
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
