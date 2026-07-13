import { auth } from "@/lib/auth";
import { getCachedCompanies } from "@/lib/cached-queries";
import { getPayments } from "@/server/kassa";
import { getAvailableBalance } from "@/lib/balance";
import KassaClient from "./KassaClient";

export default async function KassaPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";

  const [companies, payments, balance] = await Promise.all([
    getCachedCompanies(userId, userRole),
    getPayments(),
    getAvailableBalance(),
  ]);

  const mappedPayments = payments.map((p) => ({
    id: p.id,
    companyId: p.companyId,
    amount: Number(p.amount),
    period: p.period,
    paymentDate: p.paymentDate ? p.paymentDate.toISOString() : "",
    status: p.status,
    comment: p.comment || "",
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div className="h-full">
      <KassaClient
        companies={JSON.parse(JSON.stringify(companies))}
        payments={JSON.parse(JSON.stringify(mappedPayments))}
        balance={JSON.parse(JSON.stringify(balance))}
      />
    </div>
  );
}
