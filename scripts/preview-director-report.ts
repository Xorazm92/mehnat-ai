// Direktor hisobotini BITTA chatga yuborib, ko'rinishini tekshirish.
//
//   npx tsx scripts/preview-director-report.ts <telegram_user_id>
//   npx tsx scripts/preview-director-report.ts            # TELEGRAM_ADMIN_TELEGRAM_ID
//
// Nima uchun alohida skript: hisobot endi Telegram HTML chizadi (qalin
// sarlavha, yig'iladigan sitata). Razmetka buzilsa Telegram BUTUN xabarni rad
// etadi va 09:00 dagi fan-out jimgina "failed" bo'ladi — hech kim sezmaydi.
// Shuning uchun har dizayn o'zgarishidan keyin bitta haqiqiy yuborish bilan
// tekshiriladi.
//
// Dedup kalitini band qilmaydi va Notification yozmaydi: ertalabki haqiqiy
// yuborish shundan keyin ham bemalol ishlaydi.
import "./load-env";
import { prisma } from "@/lib/prisma";
import { buildDirectorReport } from "@/lib/directorReport";
import { renderDirectorReport } from "@/bot/contexts/digest/application/render-director-report";
import { directorReportKeyboard } from "@/bot/contexts/digest/application/render-director-section";
import { callbackSecret, config } from "@/bot/config";
import { trySendMessage } from "@/bot/telegram/bot";

async function main() {
  const arg = process.argv[2];
  const chatId = arg ? BigInt(arg) : config.telegram.adminTelegramId;
  if (chatId == null) {
    throw new Error(
      "Qabul qiluvchi ko'rsatilmadi: argument bering yoki TELEGRAM_ADMIN_TELEGRAM_ID ni sozlang.",
    );
  }

  const report = await buildDirectorReport(prisma, new Date());
  const text = renderDirectorReport(report);
  const res = await trySendMessage(chatId, text, {
    replyMarkup: directorReportKeyboard(callbackSecret(), report),
    parseMode: "HTML",
  });

  if (res.ok) {
    console.log(`✅ Yuborildi → ${chatId} (message_id: ${res.messageId})`);
    return;
  }
  // Razmetka xatosi aynan shu yerda ko'rinadi ("can't parse entities: …").
  console.error(`❌ Yuborilmadi (${res.reason}): ${res.message}`);
  console.error("\n--- Xom matn ---\n" + text);
  process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
