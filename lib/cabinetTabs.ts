/** Shaxsiy kabinet yorliqlari (server `?tab=` ni shu ro'yxatga solishtiradi). */
export type CabinetTabId =
  | "profile"
  | "companies"
  | "kpi"
  | "leaderboard"
  | "attendance"
  | "security";

export const CABINET_TAB_IDS: readonly CabinetTabId[] = [
  "profile",
  "companies",
  "kpi",
  "leaderboard",
  "attendance",
  "security",
];
