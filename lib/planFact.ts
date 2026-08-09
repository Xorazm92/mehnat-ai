// =====================================================
// OYLIK REJA / FAKT ("Plan fact")
// =====================================================
//
// Tuzilishi: har oy uchun TO'RTTA ustun —
//   Fakt · Plan · Solishtirma summada · Solishtirma % da
// Oy nomi guruhning BIRINCHI ustunida turadi ("Iyun 2025"), qolgan uchtasida
// shablondan qolgan ruscha yorliqlar ("янв. 2025") — ular OY EMAS, ularga
// qarab bo'lmaydi.
//
// Faqat Fakt va Plan olinadi: farq va foiz ulardan hisoblanadi, saqlashning
// hojati yo'q (va ular faylda `#REF!` bo'lib chiqishi mumkin).

import { toAmount, cleanText } from "@/lib/bank/normalize";

type Row = Record<string, unknown>;

const UZ_MONTHS: Record<string, number> = {
  yanvar: 1, fevral: 2, mart: 3, aprel: 4, may: 5, iyun: 6,
  iyul: 7, avgust: 8, sentyabr: 9, oktyabr: 10, noyabr: 11, dekabr: 12,
};

/** "Iyun 2025" → "2025-06". Tanilmasa null. */
export function periodOfLabel(label: string): string | null {
  const m = /^([A-Za-zʼ'`]+)\s*(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const month = UZ_MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[2]}-${String(month).padStart(2, "0")}`;
}

export interface PlanFactRow {
  period: string;
  metric: string;
  plan: number | null;
  fact: number | null;
}

/** `#REF!`, bo'sh satr va boshqa formula xatolari — qiymat yo'q degani. */
function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const text = String(value);
  if (text.includes("#")) return null;
  const n = toAmount(value);
  return Number.isFinite(n) ? n : null;
}

export function parsePlanFact(rows: Row[]): PlanFactRow[] {
  if (rows.length < 3) return [];

  const header = rows[0];
  const sub = rows[1];
  const keys = Object.keys(header);
  const labelKey = keys[0];

  // Oy guruhlarini topamiz: sarlavhada tanigan oy nomi turgan ustun —
  // guruhning boshi; keyingi ustun "Plan".
  const groups: { period: string; factKey: string; planKey: string }[] = [];
  for (let i = 1; i < keys.length; i++) {
    const period = periodOfLabel(String(header[keys[i]] ?? ""));
    if (!period) continue;
    const factLabel = String(sub[keys[i]] ?? "").toLowerCase();
    // Birinchi ustun Fakt bo'lishi kerak (o'zbekcha yoki ruscha yozilgan).
    if (!/fakt|факт/.test(factLabel)) continue;
    const planKey = keys[i + 1];
    if (!planKey) continue;
    groups.push({ period, factKey: keys[i], planKey });
  }

  const out: PlanFactRow[] = [];
  for (const row of rows.slice(2)) {
    const metric = cleanText(row[labelKey]);
    if (!metric) continue;
    for (const g of groups) {
      const fact = numberOrNull(row[g.factKey]);
      const plan = numberOrNull(row[g.planKey]);
      if (fact === null && plan === null) continue;
      out.push({ period: g.period, metric, plan, fact });
    }
  }
  return out;
}
