import { auth } from "@/lib/auth";
import {
  getCachedCompanies,
  getCachedArchivedCompanies,
  getCachedUsers,
  getCachedOperations,
  getCachedTariffPreset,
  getCachedOwnFirms,
  getCachedOwnFirmCompanies,
} from "@/lib/cached-queries";
import { getRoleContext } from "@/server/roleContext";
import OrganizationsClient from "./OrganizationsClient";

export const metadata = { title: "Firmalar" };

// Prisma qatorini client `Company` shakliga keltiradi:
// taxRegime -> taxType, relation nomlari (accountant.fullName -> accountantName),
// Decimal/Date -> number/string.
function mapCompany(c: any) {
  const taxType =
    c.taxRegime === "vat" ? "nds_profit" :
    c.taxRegime === "turnover" ? "turnover" : "fixed";

  return {
    ...c,
    taxType,
    accountantName: c.accountant?.fullName ?? null,
    // Ekran `internalContractor` (nom) kutadi, bazada esa ID turadi.
    internalContractorId: c.internalContractorId ?? null,
    internalContractor: c.internalContractorFirm?.name ?? null,
    supervisorName: c.supervisor?.fullName ?? null,
    chiefAccountantName: c.chiefAccountant?.fullName ?? null,
    bankClientName: c.bankClient?.fullName ?? c.bankClientName ?? null,
    itParkResident: c.itParkResident === "yes" ? true : c.itParkResident === "no" ? false : Boolean(c.itParkResident),
    contractAmount: c.contractAmount != null ? Number(c.contractAmount) : null,
    accountantPerc: c.accountantPerc != null ? Number(c.accountantPerc) : null,
    supervisorPerc: c.supervisorPerc != null ? Number(c.supervisorPerc) : null,
    chiefAccountantPerc: c.chiefAccountantPerc != null ? Number(c.chiefAccountantPerc) : null,
    bankClientPerc: c.bankClientPerc != null ? Number(c.bankClientPerc) : null,
    accountantSum: c.accountantSum != null ? Number(c.accountantSum) : null,
    supervisorSum: c.supervisorSum != null ? Number(c.supervisorSum) : null,
    chiefAccountantSum: c.chiefAccountantSum != null ? Number(c.chiefAccountantSum) : null,
    bankClientSum: c.bankClientSum != null ? Number(c.bankClientSum) : null,
    currentBalance: c.currentBalance != null ? Number(c.currentBalance) : null,
    contractDate: c.contractDate ? new Date(c.contractDate).toISOString().slice(0, 10) : null,
    contracts: (c.contracts ?? []).map((k: any) => ({
      id: k.id,
      number: k.number,
      signedAt: k.signedAt ? new Date(k.signedAt).toISOString().slice(0, 10) : null,
      amount: k.amount != null ? Number(k.amount) : null,
      source: k.source,
      ownFirmName: k.ownFirm?.name ?? null,
    })),
  };
}

export default async function OrganizationsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";

  // Parallelda ma'lumotlarni cache'dan olish.
  // Arxiv alohida olinadi: ekrandagi "Faol / Arxiv / Barchasi" filtri mijoz
  // tomonida `isActive` bo'yicha ishlaydi, shuning uchun arxivdagi firmalar ham
  // ro'yxatda bo'lishi kerak — aks holda "Arxiv" doim bo'sh jadval qaytaradi.
  // Kontekst tanlangan bo'lsa ro'yxat faqat o'sha vazifadagi firmalarga
  // torayadi (lib/roleContext.ts). Bu HUQUQ emas, ko'rinish filtri.
  const roleContext = await getRoleContext().catch(() => "all" as const);

  const [companies, archivedCompanies, ownFirmCompanies, staff, operations, tariffPreset, ownFirms] = await Promise.all([
    getCachedCompanies(userId, userRole, roleContext),
    getCachedArchivedCompanies(userId, userRole, roleContext),
    // "Ichki firmalar" tabi — biriktirilgan xodim (yoki admin) o'z firma
    // uchun ham buxgalteriya ishini shu sahifadan bajara olishi uchun
    // (lib/cached-queries.ts#getCachedOwnFirmCompanies izohiga q.).
    getCachedOwnFirmCompanies(userId, userRole, roleContext),
    getCachedUsers(userId, userRole),
    getCachedOperations(userId, userRole),
    getCachedTariffPreset(),
    // "Ichki shartnoma tomoni" tanlagichi — bazadagi o'z firmalarimiz.
    getCachedOwnFirms(),
  ]);

  const mappedStaff = staff.map(u => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  const mappedCompanies = [...companies, ...archivedCompanies, ...ownFirmCompanies].map(mapCompany);

  return (
    <div className="h-full">
      <OrganizationsClient
        companies={JSON.parse(JSON.stringify(mappedCompanies))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        operations={JSON.parse(JSON.stringify(operations))}
        userRole={userRole}
        tariffPreset={tariffPreset}
        internalContractors={ownFirms}
      />
    </div>
  );
}
