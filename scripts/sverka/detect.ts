// FAYL TURINI ANIQLASH — mijoz papkasida nima borligini o'zi topadi.
//
// Mijoz "mana kassa, mana vipiska" deb papka beradi; fayl nomlari har xil
// ("01-24.08.xls", "0718.xlsx", "Accont_payments (120).xlsx"). Shuning uchun
// tur NOM bo'yicha emas, MAZMUN bo'yicha aniqlanadi.

import type { Workbook, SheetRow } from "@/lib/bank/types";

export type FileKind = "bank" | "kassa_daily" | "kassa_monthly" | "checks" | "unknown";

function cells(rows: SheetRow[], limit = 25): string[] {
  const out: string[] = [];
  for (const r of rows.slice(0, limit)) {
    for (const v of Object.values(r)) {
      const s = String(v ?? "").trim();
      if (s) out.push(s);
    }
  }
  return out;
}

const has = (list: string[], needle: string) =>
  list.some((s) => s.toLowerCase().includes(needle.toLowerCase()));

export function detectKind(workbook: Workbook): { kind: FileKind; sheet: string | null; why: string } {
  for (const [name, rows] of Object.entries(workbook)) {
    if (!rows?.length) continue;
    const c = cells(rows);

    if (has(c, "Чеклар рўйхати") || has(c, "Махсулот Идси")) {
      return { kind: "checks", sheet: name, why: "cheklar ro'yxati" };
    }
    // Kassa hisoboti: "тўлов терминали" ustuni bor. Kunlik/oylik farqi —
    // "Сана" (kunlar) yoki "Фискал модул рақами" (apparatlar) ustunida.
    if (has(c, "тўлов терминали") || has(c, "толов терминали")) {
      const daily = has(c, "Сана");
      return {
        kind: daily ? "kassa_daily" : "kassa_monthly",
        sheet: name,
        why: daily ? "kassa kunlik hisoboti" : "kassa oylik hisoboti",
      };
    }
    if (
      has(c, "Обороты по кредиту") ||
      has(c, "Выписка лицевых счетов") ||
      has(c, "Лицевой счет") ||
      has(c, "История по счету") ||
      (has(c, "Назначение платежа") && has(c, "Кредит"))
    ) {
      return { kind: "bank", sheet: name, why: "bank vipiskasi" };
    }
  }
  return { kind: "unknown", sheet: null, why: "tanilmadi" };
}
