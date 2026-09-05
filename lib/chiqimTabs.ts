/**
 * "Chiqim kassa" ekranining yorliq reyestri.
 *
 * Nega alohida fayl (`lib/kirimTabs.ts` bilan bir xil sabab): sahifa server
 * komponenti va `?tab=` ni SERVERDA tekshirishi kerak, `ChiqimKassaClient`
 * esa `"use client"` — undan eksport qilingan ro'yxatni server chaqira
 * olmaydi.
 */
export type ChiqimTab = "navbat" | "kartalar" | "xojalik" | "xarajat";

export const CHIQIM_TAB_IDS: readonly ChiqimTab[] = ["navbat", "kartalar", "xojalik", "xarajat"];
