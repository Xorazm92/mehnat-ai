import { trySendMessage } from "../../../telegram/bot";
import type { DirectorSender } from "../../../../lib/directorReport";
import { renderDirectorReport } from "../application/render-director-report";

/**
 * Framework-free `lib/directorReport.ts` ni Telegram'ga ulovchi adapter.
 *
 * 403 da (direktor botga /start bosmagan) xato tashlamaydi, `false` qaytaradi:
 * `runDirectorReport` uni `failed` deb belgilaydi va keyingisiga o'tadi —
 * bitta bog'lanmagan qabul qiluvchi butun fan-out'ni to'xtatmasin. Sayt
 * ichidagi Notification baribir yozilgan bo'ladi.
 */
export function makeDirectorSender(): DirectorSender {
  return async (recipient, report) => {
    if (recipient.telegramUserId == null) return false;
    const res = await trySendMessage(recipient.telegramUserId, renderDirectorReport(report));
    return res.ok;
  };
}
