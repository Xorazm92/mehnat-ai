/**
 * Hisobotlar ekranining yorliq reyestri.
 *
 * `ReportsClient` `"use client"` bo'lgani uchun sahifa (server komponenti)
 * `?tab=` ni tekshirishda undan import qila olmaydi — ro'yxat shu yerda.
 */

export type ReportsTabId = "matrix" | "reports";

/**
 * Tartib muhim: birinchi element sukut bo'yicha ochiladi. Matritsa —
 * kundalik ish yuzasi, moliyaviy hujjatlar esa kamdan-kam ochiladi.
 */
export const REPORTS_TAB_IDS: readonly ReportsTabId[] = ["matrix", "reports"];
