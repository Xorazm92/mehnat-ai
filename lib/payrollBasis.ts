// =====================================================
// OYLIK BAZASI — hisoblanma (accrual) yoki tushum (cash)
// =====================================================
//
// NEGA: ilgari xodim ulushi HAR DOIM shartnoma summasidan hisoblanardi
// (`Salary = Base + Contract * KPI%`). Ya'ni mijoz bir tiyin to'lamagan oyda
// ham buxgalterga to'liq gonorar yozilardi va qarz o'sgani sari korxona
// to'lanmagan pul ustidan oylik chiqarardi. Tushum ma'lumoti bazada bor
// (`PaymentAllocation`), faqat oylik hisobiga ulanmagan edi.
//
// Ikki rejim ATAYLAB saqlanadi: 'accrual' — eski xatti-harakat (standart,
// chunki rejimni jimgina almashtirish barchaning oyligini o'zgartirib
// yuboradi); 'cash' — haqiqatda tushgan pul. Rejim `SystemSetting.payrollBasis`
// da, admin ekranidan almashtiriladi.

export type PayrollBasis = "accrual" | "cash";

export const PAYROLL_BASIS_DEFAULT: PayrollBasis = "accrual";

export const PAYROLL_BASIS_LABELS: Record<PayrollBasis, string> = {
  accrual: "Hisoblanma (shartnoma summasi)",
  cash: "Tushum (haqiqatda to'langan)",
};

export function isPayrollBasis(v: unknown): v is PayrollBasis {
  return v === "accrual" || v === "cash";
}

export interface SalaryBasis {
  /** Foizli ulush va KPI bonusi shu summadan hisoblanadi. */
  basisAmount: number;
  /**
   * Shartnomaning qanchasi yopilgani (0..1). 'accrual' da doim 1.
   * Qat'iy summali (`...Sum`) ulush shu koeffitsiyentga ko'paytiriladi —
   * aks holda cash rejimida foizli xodim to'lovga bog'liq, qat'iy summali
   * xodim esa bog'liq bo'lmay qolardi va bitta firmada ikki xil qoida
   * ishlardi.
   */
  collectionRatio: number;
  /** Tafsilot satriga qo'shiladigan izoh (bo'sh bo'lsa — izoh kerak emas). */
  note: string | null;
}

/**
 * Oylik bazasini aniqlash.
 *
 * `collected` — shu firma shu davrda TO'LAGAN summa (PaymentAllocation
 * yig'indisi). Ortiqcha to'lov (avans) koeffitsiyentni 1 dan oshirmaydi:
 * aks holda kelasi oy uchun oldindan to'langan pul joriy oyning gonorarini
 * shishirib yuborardi.
 */
export function resolveSalaryBasis(input: {
  basis: PayrollBasis;
  contract: number;
  collected?: number;
}): SalaryBasis {
  const contract = Number.isFinite(input.contract) ? input.contract : 0;

  if (input.basis !== "cash") {
    return { basisAmount: contract, collectionRatio: 1, note: null };
  }

  const collectedRaw = Number(input.collected ?? 0);
  const collected = Number.isFinite(collectedRaw) && collectedRaw > 0 ? collectedRaw : 0;
  const capped = contract > 0 ? Math.min(collected, contract) : collected;
  const ratio = contract > 0 ? capped / contract : collected > 0 ? 1 : 0;

  return {
    basisAmount: capped,
    collectionRatio: ratio,
    note: `Tushum bazasi: shartnomaning ${(ratio * 100).toFixed(1)}% i to'langan`,
  };
}
