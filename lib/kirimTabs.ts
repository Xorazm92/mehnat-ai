/**
 * "Kirim kassa" ekranining yorliq reyestri.
 *
 * Nega alohida fayl (`lib/workTabs.ts` bilan bir xil sabab): sahifa server
 * komponenti va `?tab=` ni SERVERDA tekshirishi kerak, `KirimKassaClient`
 * esa `"use client"` — undan eksport qilingan ro'yxatni server chaqira
 * olmaydi.
 */
export type KirimTab = "reyestr" | "hisoblar" | "navbat";

export const KIRIM_TAB_IDS: readonly KirimTab[] = ["reyestr", "hisoblar", "navbat"];
