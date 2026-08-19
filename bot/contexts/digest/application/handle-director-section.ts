/**
 * "Batafsil" tugmasini bosishni hisobot ekraniga aylantiradi.
 *
 * Ikki narsa uchun javob beradi:
 *
 * 1. RBAC. Imzo faqat tugmani BIZ chizganimizni isbotlaydi, uni bosgan odam
 *    ko'rishga haqli ekanini emas. Hisobot butun firma kesimini beradi va
 *    portfelga bo'linmagan, shuning uchun har bosishda bosuvchining roli
 *    qaytadan tekshiriladi — xabar chatda rol o'zgargandan keyin ham qolib
 *    ketadi, hatto ko'chirib yuborilgan bo'lishi ham mumkin.
 *
 * 2. Ma'lumotni yangidan olish. Tugma o'z ichida hisobot suratini olib yura
 *    olmaydi (64 bayt), shuning uchun bosilganda qayta hisoblanadi. Bu esa
 *    yaxshi: direktor tushdan keyin bossa ertalabki emas, HOZIRGI holatni
 *    ko'radi.
 */
import type { PrismaClient } from "@prisma/client";
import {
  buildDirectorReport,
  canSeeDirectorReport,
  type DirectorReport,
} from "../../../../lib/directorReport";
import type { CallbackOutcome } from "../../interaction/domain/outbound";
import { appBaseUrl } from "../../../config";
import { renderDirectorReport } from "./render-director-report";
import {
  DIRECTOR_SECTION,
  directorReportKeyboard,
  directorSectionKeyboard,
  isDirectorSectionKey,
  renderDirectorSection,
} from "./render-director-section";

const DENIED = "⛔ Bu hisobot faqat rahbariyat uchun.";
const EXPIRED = "Bu tugma eskirgan.";

/**
 * Hisobot og'ir so'rov (qarzdorlik butun bazani kezadi) va u HAMMA direktor
 * uchun bir xil. Bir necha tugma ketma-ket bosilganda uni har safar qaytadan
 * hisoblash bekor yuk, shuning uchun qisqa muddatli xotira.
 *
 * TTL ataylab kichik: direktor batafsil ekranga aynan "hozir nima bo'lyapti"
 * ni bilish uchun kiradi. Bir daqiqadan eski raqam ko'rsatilsa, u saytdagi
 * raqamdan farq qiladi va ishonch yo'qoladi.
 */
const CACHE_TTL_MS = 60_000;
let cached: { at: number; report: DirectorReport } | null = null;

async function getReport(prisma: PrismaClient, now: Date): Promise<DirectorReport> {
  if (cached && now.getTime() - cached.at < CACHE_TTL_MS) return cached.report;
  const report = await buildDirectorReport(prisma, now);
  cached = { at: now.getTime(), report };
  return report;
}

/** Testlar va cron uchun: keyingi bosish yangi ma'lumot olsin. */
export function resetDirectorReportCache(): void {
  cached = null;
}

export async function handleDirectorSection(
  prisma: PrismaClient,
  sectionKey: string,
  actor: { id: string; role: string },
  opts: { secret: string },
  now = new Date(),
): Promise<CallbackOutcome> {
  if (!canSeeDirectorReport(actor.role)) {
    return { answer: DENIED, alert: true };
  }
  if (!isDirectorSectionKey(sectionKey)) {
    return { answer: EXPIRED, alert: true };
  }

  const report = await getReport(prisma, now);

  // Xulosaga qaytish — tugmalar to'plami ham qayta chiziladi, chunki oxirgi
  // ochilishdan beri bo'lim bo'shab qolgan bo'lishi mumkin.
  if (sectionKey === DIRECTOR_SECTION.HOME) {
    return {
      edit: {
        text: renderDirectorReport(report),
        replyMarkup: directorReportKeyboard(opts.secret, report),
      },
    };
  }

  const view = renderDirectorSection(sectionKey, report);
  return {
    edit: {
      text: view.text,
      replyMarkup: directorSectionKeyboard(opts.secret, sectionKey, appBaseUrl()),
    },
  };
}
