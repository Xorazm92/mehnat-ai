import { auth } from "@/lib/auth";
import { getCachedCompanies } from "@/lib/cached-queries";
import { getPayments } from "@/server/kassa";
import { getAvailableBalance } from "@/lib/balance";
import { getDebtors } from "@/server/debt";
import { getCashDeskReport } from "@/server/kassaReport";
import CashDeskTable from "./CashDeskTable";
import KassaClient from "./KassaClient";

export const metadata = { title: "Kassa" };

export default async function KassaPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";

  const [companies, payments, balance, debtors] = await Promise.all([
    getCachedCompanies(userId, userRole),
    getPayments(),
    getAvailableBalance(),
    // Qarz SERVERDA hisoblanadi. Ilgari `KassaModule` uni o'zi hisoblardi
    // (bitta faylda ikki marta) va formulasi `PAYMENT_TERM_MONTHS` ni
    // bilmasdi — ya'ni ekranda "iyulning puli avgustda" qoidasi ishlamasdi.
    getDebtors({ scope: "all" }),
  ]);

  // Kassalar jadvali — auditning markaziy jadvali. Xato bo'lsa sahifa
  // yiqilmasin: qolgan bloklar baribir foydali.
  const cashDesk = await getCashDeskReport().catch(() => null);

  // companyId → qarz. Klient endi hech narsa hisoblamaydi, faqat ko'rsatadi.
  const debtByCompany = Object.fromEntries(
    debtors.rows.map((r) => [r.companyId, { dueNow: r.dueNow, overdue: r.overdue, outstanding: r.outstanding }])
  );

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
      {cashDesk && (
        <div className="p-4 md:p-6 pb-0">
          <CashDeskTable report={JSON.parse(JSON.stringify(cashDesk))} />
        </div>
      )}
      <KassaClient
        companies={JSON.parse(JSON.stringify(companies))}
        payments={JSON.parse(JSON.stringify(mappedPayments))}
        balance={JSON.parse(JSON.stringify(balance))}
        debtByCompany={debtByCompany}
      />
    </div>
  );
}
