import type { Company } from "@/types";

/**
 * Firma ustunlaridan sehrgar (`OnboardingWizard`) kutgan biriktiruv qatorlarini
 * yasaydi.
 *
 * YAGONA MANBA: bu xarita ilgari faqat `OrganizationModule.startEdit` ichida
 * turardi. Firma kartasi sahifasi ham xuddi shu sehrgarni ochadi va ikkinchi
 * nusxa yozilsa, ular ajralib ketishi mumkin edi — masalan `sum` ustuni
 * "fixed" ga o'tkazish qoidasi bir joyda o'zgarib, ikkinchisida qolib ketardi.
 * Bu esa oylik hisobiga tegadi: qat'iy summa foiz sifatida saqlanib qolsa,
 * xodimning haqi jimgina boshqacha hisoblanadi.
 */
export function assignmentsFromCompany(c: Company) {
  const row = (
    role: string,
    userId: string | undefined,
    sum: number | undefined,
    perc: number | undefined,
  ) =>
    sum
      ? { role, userId: userId || "", salaryType: "fixed", salaryValue: Number(sum) }
      : { role, userId: userId || "", salaryType: "percent", salaryValue: Number(perc ?? 0) };

  return [
    row("accountant", c.accountantId, c.accountantSum, c.accountantPerc),
    row("chief_accountant", c.chiefAccountantId, c.chiefAccountantSum, c.chiefAccountantPerc),
    row("controller", c.supervisorId, c.supervisorSum, c.supervisorPerc),
    row("bank_manager", c.bankClientId, c.bankClientSum, c.bankClientPerc),
  ];
}
