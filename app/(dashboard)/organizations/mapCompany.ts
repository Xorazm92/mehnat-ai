/**
 * Prisma `Company` qatorini ekran shakliga keltiruvchi YAGONA joy.
 *
 * Ro'yxat sahifasi va `[id]` kartasi bir xil `Company` obyektini kutadi
 * (`CompanyProfilePanels` ikkalasidan ham shu shaklda o'qiydi), shuning
 * uchun ikkinchi nusxa yozilmaydi.
 */

// Prisma qatorini client `Company` shakliga keltiradi:
// taxRegime -> taxType, relation nomlari (accountant.fullName -> accountantName),
// Decimal/Date -> number/string.
export function mapCompany(c: any) {
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
