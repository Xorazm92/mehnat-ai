// lib/tariffPresets.ts
// FIRMA BIRIKTIRISHDAGI TARIF PRESETLARI
//
// Amalda deyarli har bir yangi firma bir xil taqsimot bilan ochiladi, lekin
// biriktirish oynasida to'rtala foiz har safar qo'lda terilardi. "Standart"
// tugmasi shu to'rt qiymatni bir bosishda to'ldiradi.
//
// DIQQAT: "standart" `salaryType` sifatida SAQLANMAYDI — u faqat preset.
// `lib/kpiLogic.ts` endi biriktiruvning `salaryType` ini O'QIYDI ('fixed'
// bo'lmasa foiz deb qaraydi), shuning uchun preset qatorlarni `percent` ga
// o'tkazib qiymat yozadi. (Ilgari payroll `salaryType` ni umuman ko'rmasdi
// va notanish qiymat jim nolga aylanardi — shu sabab bu qoida saqlanadi.)

import type { AssignmentRole } from "@/lib/permissions";

export type TariffPreset = Record<AssignmentRole, number>;

/**
 * Standart taqsimot — shartnoma summasidan foizda. Jami 37%.
 *
 * `sales_manager` NOL: savdo ulushi har shartnomada kelishiladi va hamma
 * firmada ham bo'lmaydi. Nol qo'yilgani "o'rin bor, lekin standart emas"
 * degani — presetni bosgan odam uni bilib turib to'ldiradi.
 */
export const STANDARD_TARIFF: TariffPreset = {
  accountant: 20,
  chief_accountant: 7,
  controller: 5,
  bank_manager: 5,
  sales_manager: 0,
};

/** SystemSetting kaliti — admin sozlamalaridan ustidan yozish uchun. */
export const TARIFF_PRESET_SETTING_KEY = "tariffPresetStandard";

/**
 * SystemSetting'dan kelgan (ishonchsiz) qiymatni tozalaydi.
 * Har bir foiz 0..100 oralig'ida bo'lishi shart; noto'g'ri kalit/qiymat
 * standart qiymatga qaytadi — sozlamadagi xato biriktirishni buzmasligi kerak.
 */
export function resolveTariffPreset(raw: unknown): TariffPreset {
  if (!raw || typeof raw !== "object") return STANDARD_TARIFF;
  const source = raw as Record<string, unknown>;
  const result = { ...STANDARD_TARIFF };
  for (const key of Object.keys(STANDARD_TARIFF) as AssignmentRole[]) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      result[key] = value;
    }
  }
  return result;
}
