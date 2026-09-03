import { sendOnce } from "../../../telegram/send";
import type { DirectorSender } from "../../../../lib/directorReport";
import { renderDirectorReport } from "../application/render-director-report";
import { directorReportKeyboard } from "../application/render-director-section";

/**
 * Framework-free `lib/directorReport.ts` ni Telegram'ga ulovchi adapter.
 *
 * 403 da (direktor botga /start bosmagan) xato tashlamaydi — `unreachable`
 * qaytaradi va keyingisiga o'tiladi. Bitta bog'lanmagan qabul qiluvchi butun
 * fan-out'ni to'xtatmasin; sayt ichidagi Notification baribir yozilgan.
 */
export function makeDirectorSender(secret: string): DirectorSender {
  return async (recipient, report) => {
    if (recipient.telegramUserId == null) return "unreachable";
    const res = await sendOnce(recipient.telegramUserId, renderDirectorReport(report), {
      replyMarkup: directorReportKeyboard(secret, report),
      // Hisobot Telegram HTML chizadi; renderer har dinamik qiymatni `esc()`
      // dan o'tkazadi, aks holda bitta `&` li firma nomi butun xabarni
      // yubormay qo'yardi.
      parseMode: "HTML",
    });
    return res.verdict;
  };
}
