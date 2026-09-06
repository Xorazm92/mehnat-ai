// =====================================================
// MOSLIK TASDIG'I MANIFESTI — biznes qarorining yagona manbai
// =====================================================
// `scripts/data/service-key-mappings.json` da 24 ta moslik turadi va bosh
// buxgalter har biriga `confirmed` javobini yozadi. Migratsiya skripti
// qamrovni SHU fayldan oladi — koddan emas.
//
// NEGA FAYL, KOD EMAS. Tasdiq — biznes qarori, dasturchi qarori emas.
// Kodga yozilsa, qamrovni o'zgartirish uchun har safar deploy kerak bo'lardi
// va "kim tasdiqladi" degan savol javobsiz qolardi. Faylda esa qaror,
// tasdiqlovchi va sana yonma-yon turadi va git tarixida qoladi.
//
// UCH HOLAT, ATAYLAB:
//   true  → qamrovga kiradi
//   false → RAD ETILDI; qaror yozilgan, migratsiya qo'shmaydi
//   null  → hali javob yo'q ⇒ migratsiya BLOKLANADI
//
// `null` ni `false` bilan bir xil ko'rish eng xavfli xato bo'lardi: javob
// berilmagan moslik "rad etilgan" bo'lib ko'rinardi va hech kim buni
// sezmasdi. Shuning uchun `null` bloklaydi, `false` bloklamaydi.
import { z } from "zod";

export const MappingRowSchema = z.object({
  code: z.string().min(1),
  name: z.string(),
  matrixKey: z.string().min(1),
  lifecycle: z.enum(["draft", "approved", "active", "retired"]),
  confirmed: z.boolean().nullable(),
  confirmedBy: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  auditAffected: z.number().int().nonnegative(),
  auditOpen: z.number().int().nonnegative(),
  auditCompanies: z.number().int().nonnegative(),
  note: z.string(),
});

export const MappingManifestSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.string(),
  measuredAt: z.string(),
  howTo: z.array(z.string()),
  mappings: z.array(MappingRowSchema).min(1),
});

export type MappingRow = z.infer<typeof MappingRowSchema>;
export type MappingManifest = z.infer<typeof MappingManifestSchema>;

/** Faylni tekshirib o'qiydi. Shakl buzilgan bo'lsa — otadi, jimgina o'tmaydi. */
export function parseMappingManifest(raw: unknown): MappingManifest {
  const m = MappingManifestSchema.parse(raw);
  const codes = new Set<string>();
  for (const row of m.mappings) {
    if (codes.has(row.code)) throw new Error(`Manifestda takroriy kod: ${row.code}`);
    codes.add(row.code);
    // Tasdiqlangan qator kim tomonidan tasdiqlanganini ko'rsatishi SHART —
    // aks holda "tasdiqlandi" degan yozuv egasiz qoladi.
    if (row.confirmed === true && !row.confirmedBy) {
      throw new Error(`${row.code}: confirmed=true, lekin confirmedBy bo'sh`);
    }
  }
  return m;
}

export interface ScopeSelection {
  /** Qamrovga kiradi. */
  included: MappingRow[];
  /** Ataylab rad etilgan. */
  rejected: MappingRow[];
  /** Javob berilmagan — bloklaydi. */
  unanswered: MappingRow[];
  /** `--scope` filtri tashqarisida qolgan (tasdiqlangan bo'lsa ham). */
  outOfScope: MappingRow[];
}

export type ScopeFilter = "active" | "draft" | "all";

/**
 * Manifestdan migratsiya qamrovini ajratadi.
 *
 * `--scope` ni ataylab ajratamiz (Talab §9): draft shablonlar 0 majburiyatga
 * tegadi, active shablonlar 1 673 tasiga. Ikkovini bitta yugurishda qo'llash —
 * xavfsiz o'zgarishni xavfli o'zgarish bilan bir tranzaksiyaga qo'yish bo'lardi.
 */
export function selectScope(m: MappingManifest, filter: ScopeFilter): ScopeSelection {
  const sel: ScopeSelection = { included: [], rejected: [], unanswered: [], outOfScope: [] };
  const inFilter = (r: MappingRow) =>
    filter === "all" || (filter === "draft" ? r.lifecycle === "draft" : r.lifecycle === "active");
  for (const r of m.mappings) {
    if (r.confirmed === null) {
      sel.unanswered.push(r);
      continue;
    }
    if (r.confirmed === false) {
      sel.rejected.push(r);
      continue;
    }
    if (inFilter(r)) sel.included.push(r);
    else sel.outOfScope.push(r);
  }
  return sel;
}

/**
 * Migratsiya yurishi mumkinmi. Javob berilmagan moslik BOR bo'lsa — yo'q.
 *
 * Qat'iy: bitta javobsiz qator butun migratsiyani bloklaydi. Yumshoqroq
 * qoida ("javob berilganlarini qo'llayveramiz") jimgina yarim holat yaratardi —
 * ba'zi shablon qoidali, ba'zisi universal — va buni hech kim ko'rmasdi.
 */
export function blockingReasons(sel: ScopeSelection): string[] {
  const out: string[] = [];
  if (sel.unanswered.length > 0) {
    out.push(
      `${sel.unanswered.length} ta moslikka javob berilmagan (confirmed=null): ` +
        sel.unanswered.map((r) => r.code).join(", "),
    );
  }
  if (sel.included.length === 0) {
    out.push("Qamrovda birorta ham tasdiqlangan moslik yo'q.");
  }
  return out;
}
