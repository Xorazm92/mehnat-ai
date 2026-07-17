import type { PrismaClient } from "@prisma/client";

/**
 * Resolve the employee accountable for a question, from the company it belongs
 * to and the responsible role. Attendance is per-person, but question KPI must
 * land on a specific employee — in the ASRO model each company has one
 * accountant / bank-client / supervisor, so the company assignment IS the
 * attribution. Returns null when the chat is unbound or the role is unassigned
 * (then no KPI event is emitted).
 */
export async function resolveResponsibleUserId(
  prisma: PrismaClient,
  companyId: string | null | undefined,
  role: string,
): Promise<string | null> {
  if (!companyId) return null;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      accountantId: true,
      bankClientId: true,
      supervisorId: true,
      chiefAccountantId: true,
    },
  });
  if (!company) return null;

  switch (role) {
    case "accountant":
      return company.accountantId;
    case "bank_client":
      return company.bankClientId;
    case "controller":
    case "supervisor":
      return company.supervisorId;
    default:
      return null;
  }
}
