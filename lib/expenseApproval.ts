// Xarajat tasdiqlash tier qoidasi (server va client uchun umumiy)
// < 1 mln avto-tasdiq; 1–10 mln Bosh Buxgalter; > 10 mln + Superadmin
export function canApproveExpense(role: string, amount: number): boolean {
  if (amount > 10_000_000) return ["admin", "super_admin"].includes(role);
  return ["chief_accountant", "admin", "super_admin"].includes(role);
}
