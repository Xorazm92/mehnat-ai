// =====================================================
// AI DA'VOSI — AI aytgan har bir raqamning pasporti (M5.1)
// =====================================================
// MUAMMO. `server/assistant.ts` `reply: string` qaytarardi. Modda 7
// ("manbagacha kuzatib bo'lmaydigan raqam ko'rsatilmaydi") va PRODUCT.md
// 4-va'dasi ("AI aytgan har bir raqam UI'dagi raqamga TENG") esa matn ustida
// tekshirib bo'lmaydi: satr ichidagi "18 500 000" qayerdan kelganini na
// ekran, na test bila oladi.
//
// Shuning uchun raqam matndan AJRATILADI. AI matn yozadi, raqamlar esa
// yonida tuzilgan ro'yxat bo'lib keladi — ekran ularni matndan qidirmaydi,
// test esa manbaga solishtira oladi.
//
// NAQSH `lib/engines/evidence/claim.ts` DAN OLINGAN, lekin O'SHA EMAS.
// Import qilingan dalil da'vosi majburiyat STATUSI haqida (prepared /
// submitted / accepted…), bu esa RAQAM haqida. Ikkalasini bitta tipga
// tiqish har ikkisini ham buzardi; umumiy bo'lgani — `confidence` ning
// ma'nosi (pastga qarang).
import { z } from "zod";

/**
 * `confidence` — ANIQLIK EMAS, VAKOLAT.
 *
 * `lib/engines/evidence/claim.ts` dagi bilan AYNAN bir xil shkala, ataylab:
 * ikki joyda ikki xil ma'no bo'lsa, 0.7 bir yerda "ehtimol" ikkinchi yerda
 * "vakolat" bo'lib qolardi.
 *
 *   1.0  vakolatli organ tasdig'i (soliq kvitansiyasi, bank vipiskasi)
 *   0.7  ASROning O'Z hisobi — jurnal, qarzdorlik, majburiyat holati
 *   0.4  odam qo'lda kiritgan qiymat
 */
export const AI_CONFIDENCE = {
  /** Tashqi vakolatli manba tasdiqlagan. */
  authority: 1.0,
  /** Tizimning o'z hisobi (yagona hisob qatlamidan). */
  system: 0.7,
  /** Operator kiritgan. */
  operator: 0.4,
} as const;

export const aiClaimSchema = z.object({
  /** Raqamning o'zi. */
  value: z.number().finite(),
  /** O'lchov birligi: "so'm" | "kun" | "ball" | "foiz" | "dona". */
  unit: z.string().min(1),
  /** Foydalanuvchiga ko'rinadigan yorliq: "Artel Logistics qarzi". */
  label: z.string().min(1),
  /** Qaysi tool berdi — `lib/ai/tools.ts` dagi nom. */
  sourceTool: z.string().min(1),
  /**
   * Raqam QAYSI hisob qatlamidan chiqqani — nosozlik izlashda birinchi savol.
   * Erkin satr: "lib/debt.ts#listDebtors(companyId)".
   */
  sourceQuery: z.string().min(1),
  /** Qachon o'lchangan (ISO, UTC). */
  asOf: z.string().min(1),
  confidence: z.number().min(0).max(1),
  /**
   * Raqam SHARTLI bo'lsa — sharti. Modda 7: shart ham manbaning bir qismi,
   * "agar sentyabrda to'lov bo'lmasa" yozilmasa raqam yolg'on bo'ladi.
   */
  conditions: z.array(z.string()).optional(),
});

export type AiClaim = z.infer<typeof aiClaimSchema>;

/**
 * Tool natijasi — MA'LUMOT va DA'VOLAR birga.
 *
 * `data` modelga (Gemini'ga) beriladi, `claims` esa ekranga va testga.
 * Ikkalasi bitta funksiyadan chiqadi, ya'ni raqam matnga aylanguncha
 * uning pasporti allaqachon yozilgan bo'ladi — keyin qo'shib bo'lmaydi.
 */
export type ToolResult<T> =
  | { ok: true; data: T; claims: AiClaim[] }
  | { ok: false; error: string };

/** Da'vo qurish — `asOf` va `confidence` unutilmasin. */
export function claim(input: {
  value: number;
  unit: string;
  label: string;
  sourceTool: string;
  sourceQuery: string;
  asOf?: Date;
  confidence?: number;
  conditions?: string[];
}): AiClaim {
  return aiClaimSchema.parse({
    value: input.value,
    unit: input.unit,
    label: input.label,
    sourceTool: input.sourceTool,
    sourceQuery: input.sourceQuery,
    asOf: (input.asOf ?? new Date()).toISOString(),
    confidence: input.confidence ?? AI_CONFIDENCE.system,
    ...(input.conditions ? { conditions: input.conditions } : {}),
  });
}
