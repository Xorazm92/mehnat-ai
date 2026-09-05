/**
 * "Kassa–bank sverka" ekranining yorliq reyestri.
 *
 * Nega alohida fayl (`lib/kirimTabs.ts` bilan bir xil sabab): sahifa server
 * komponenti va `?tab=` ni SERVERDA tekshirishi kerak, `SverkaClient` esa
 * `"use client"` — undan eksport qilingan ro'yxatni server chaqira olmaydi.
 */
export type SverkaTab = "sverka" | "terminals" | "devices";

export const SVERKA_TAB_IDS: readonly SverkaTab[] = ["sverka", "terminals", "devices"];
