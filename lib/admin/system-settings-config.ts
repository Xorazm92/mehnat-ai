// Plain (non-"use server") module so these non-function exports can be shared.
import { STANDARD_TARIFF, type TariffPreset } from "@/lib/tariffPresets";
import { PAYROLL_BASIS_DEFAULT, type PayrollBasis } from "@/lib/payrollBasis";

export const SYSTEM_SETTING_DEFAULTS = {
  appName: "ASRO",
  defaultUserPassword: "Password123!",
  features: {
    eimzo: false,
    integration_1c: false,
    integration_didox: false,
    integration_soliq: false,
    integration_mysoliq: false,
    tasks: false,
    invoices: false,
  },
  // Firma biriktirishdagi "Standart taqsimot" tugmasi qo'yadigan foizlar.
  tariffPresetStandard: STANDARD_TARIFF,
  // Yangi firma ochilganda "1C baza ochish kerak" xabarini oladigan xodimlar
  // (User.id ro'yxati). Bo'sh bo'lsa — barcha admin/superadmin.
  oneCBaseOpeners: [] as string[],
  // Oylik ulushi shartnoma summasidan ('accrual') yoki haqiqatda tushgan
  // puldan ('cash') hisoblanishi. Standart ATAYLAB 'accrual' — rejimni
  // jimgina almashtirish barcha xodimning oyligini o'zgartirib yuboradi.
  payrollBasis: PAYROLL_BASIS_DEFAULT as PayrollBasis,
} as const;

export type SystemSettings = {
  appName: string;
  defaultUserPassword: string;
  features: Record<string, boolean>;
  tariffPresetStandard: TariffPreset;
  oneCBaseOpeners: string[];
  payrollBasis: PayrollBasis;
};
