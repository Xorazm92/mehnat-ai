import { auth } from "@/lib/auth";
import {
  getCachedCompanies,
  getCachedArchivedCompanies,
  getCachedUsers,
  getCachedOperations,
  getCachedTariffPreset,
  getCachedOwnFirms,
  getCachedInternalParties,
  getCachedOwnFirmCompanies,
} from "@/lib/cached-queries";
import { getRoleContext } from "@/server/roleContext";
import { hydrateBankCredentials } from "@/lib/companyCredentials";
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
    accountantAvatarRef: c.accountant?.avatarRef ?? null,
    // Ekran `internalContractor` (nom) kutadi, bazada esa ID turadi.
    internalContractorId: c.internalContractorId ?? null,
    internalContractor: c.internalContractorFirm?.name ?? null,
    // Og'zaki shartnoma tomoni — firma o'rniga plastik/naqd kanali.
    internalChannelId: c.internalChannelId ?? null,
    internalChannelLabel: c.internalChannel?.label ?? null,
    supervisorName: c.supervisor?.fullName ?? null,
    supervisorAvatarRef: c.supervisor?.avatarRef ?? null,
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

  const [companies, archivedCompanies, ownFirmCompanies, staff, operations, tariffPreset, ownFirms, internalParties] = await Promise.all([
    getCachedCompanies(userId, userRole, roleContext),
    getCachedArchivedCompanies(userId, userRole, roleContext),
    // "Ichki firmalar" tabi — biriktirilgan xodim (yoki admin) o'z firma
    // uchun ham buxgalteriya ishini shu sahifadan bajara olishi uchun
    // (lib/cached-queries.ts#getCachedOwnFirmCompanies izohiga q.).
    getCachedOwnFirmCompanies(userId, userRole, roleContext),
    getCachedUsers(userId, userRole),
    getCachedOperations(userId, userRole),
    getCachedTariffPreset(),
    // "Ichki shartnoma tomoni" tanlagichi — o'z firmalarimiz va og'zaki
    // shartnoma tomonlari (plastik/naqd kanallari).
    getCachedOwnFirms(),
    getCachedInternalParties(),
  ]);

  const mappedStaff = staff.map(u => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  // Bank-klient login/parol cache'langan so'rovda emas — u shifrlangan
  // vault'da yotadi va faqat huquqi bor foydalanuvchiga ochiladi
  // (lib/companyCredentials.ts).
  const withBank = await hydrateBankCredentials(
    [...companies, ...archivedCompanies, ...ownFirmCompanies] as any[],
    userId,
    userRole
  );
  const mappedCompanies = withBank.map(mapCompany);

  return (
    <div className="h-full">
      <OrganizationsClient
        companies={JSON.parse(JSON.stringify(mappedCompanies))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        operations={JSON.parse(JSON.stringify(operations))}
        userRole={userRole}
        tariffPreset={tariffPreset}
        internalContractors={ownFirms}
        internalParties={JSON.parse(JSON.stringify(internalParties))}
      />
    </div>
  );
}
