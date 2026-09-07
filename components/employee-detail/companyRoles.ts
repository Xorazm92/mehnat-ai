import type { Company } from "@/types";
import type { AssignedCompany, CompanyRoleShare } from "./types";

/**
 * Xodimning firmadagi mas'uliyat(lar)i va ulushi.
 *
 * BIR firmada BIR NECHTA rol bo'lishi mumkin (masalan buxgalter + nazoratchi),
 * shuning uchun massiv qaytadi: ilgari birinchi moslik qaytarilib, qolgan
 * ulushlar ro'yxatda umuman ko'rinmasdi.
 *
 * Solishtirish faqat ID bo'yicha — ism bo'yicha moslash bir xil ismli ikki
 * xodimni chalkashtirardi.
 */
export function companyRolesFor(c: Company, personId: string): CompanyRoleShare[] {
  const out: CompanyRoleShare[] = [];
  if (c.accountantId === personId)
    out.push({ role: "accountant", perc: c.accountantPerc, sum: c.accountantSum });
  if (c.chiefAccountantId === personId)
    out.push({ role: "chief_accountant", perc: c.chiefAccountantPerc, sum: c.chiefAccountantSum });
  if (c.supervisorId === personId)
    out.push({ role: "supervisor", perc: c.supervisorPerc, sum: c.supervisorSum });
  if (c.bankClientId === personId)
    out.push({ role: "bank_manager", perc: c.bankClientPerc, sum: c.bankClientSum });
  return out;
}

/** Xodim biriktirilgan firmalar — kartochka va tezkor sanoq uchun. */
export function assignedCompaniesFor(companies: Company[], personId: string): AssignedCompany[] {
  const out: AssignedCompany[] = [];
  for (const c of companies) {
    const roles = companyRolesFor(c, personId);
    if (roles.length === 0) continue;
    out.push({ id: c.id, name: c.name, inn: c.inn, roles });
  }
  return out;
}
