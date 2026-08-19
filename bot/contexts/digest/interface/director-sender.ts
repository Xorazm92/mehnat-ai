import { trySendMessage } from "../../../telegram/bot";
import type { DirectorSender } from "../../../../lib/directorReport";
import { renderDirectorReport } from "../application/render-director-report";
import { directorReportKeyboard } from "../application/render-director-section";

/**
 * Framework-free `lib/directorReport.ts` ni Telegram'ga ulovchi adapter.
 *
 * 403 da (direktor botga /start bosmagan) xato tashlamaydi, `false` qaytaradi:
 * `runDirectorReport` uni `failed` deb belgilaydi va keyingisiga o'tadi —
 * bitta bog'lanmagan qabul qiluvchi butun fan-out'ni to'xtatmasin. Sayt
 * ichidagi Notification baribir yozilgan bo'ladi.
 */
export function makeDirectorSender(secret: string): DirectorSender {
  return async (recipient, report) => {
    if (recipient.telegramUserId == null) return false;
    const res = await trySendMessage(recipient.telegramUserId, renderDirectorReport(report), {
      replyMarkup: directorReportKeyboard(secret, report),
      // Hisobot Telegram HTML chizadi; renderer har dinamik qiymatni `esc()`
      // dan o'tkazadi, aks holda bitta `&` li firma nomi butun xabarni
      // yubormay qo'yardi.
      parseMode: "HTML",
    });
    return res.ok;
  };
}
