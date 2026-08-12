/** "Ishlar" ekranining yorliq reyestri (server `?tab=` ni shu ro'yxatga solishtiradi). */
export type WorkTab = "all" | "mine" | "overdue" | "tasks";

export const WORK_TAB_IDS: readonly WorkTab[] = ["all", "mine", "overdue", "tasks"];
