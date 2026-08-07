// lib/tariffPresets.ts
// FIRMA BIRIKTIRISHDAGI TARIF PRESETLARI
//
// Amalda deyarli har bir yangi firma bir xil taqsimot bilan ochiladi, lekin
// biriktirish oynasida to'rtala foiz har safar qo'lda terilardi. "Standart"
// tugmasi shu to'rt qiymatni bir bosishda to'ldiradi.
//
// DIQQAT: "standart" `salaryType` sifatida SAQLANMAYDI — u faqat preset.
// Sabab: lib/kpiLogic.ts oylikni hisoblashda `salaryType` ni umuman o'qimaydi,
// u `Company.*Sum > 0` bo'lsa fiks, aks holda `Company.*Perc` deb qaraydi.
// Yangi `salaryType` qiymati kiritilsa payroll uni ko'rmay jim nolga aylantirardi.
// Shuning uchun preset to'rtala qatorni `percent` ga o'tkazib, qiymat yozadi.

import type { AssignmentRole } from "@/lib/permissions";

export type TariffPreset = Record<AssignmentRole, number>;

/** Standart taqsimot — shartnoma summasidan foizda. Jami 37%. */
export const STANDARD_TARIFF: TariffPreset = {
  accountant: 20,
  chief_accountant: 7,
  controller: 5,
  bank_manager: 5,
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
