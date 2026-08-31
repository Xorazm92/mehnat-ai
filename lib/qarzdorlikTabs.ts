/**
 * "Qarzdorlik" ekranining yorliq reyestri.
 *
 * Nega alohida fayl (`lib/workTabs.ts`, `lib/kirimTabs.ts` bilan bir xil
 * sabab): sahifa server komponenti va `?tab=` ni SERVERDA tekshirishi kerak,
 * `QarzdorlikClient` esa `"use client"`.
 */
export type QarzdorlikTab = "holat" | "undirish" | "tolovlar" | "tekshiruv";

export const QARZDORLIK_TAB_IDS: readonly QarzdorlikTab[] = [
  "holat",
  "undirish",
  "tolovlar",
  "tekshiruv",
];
