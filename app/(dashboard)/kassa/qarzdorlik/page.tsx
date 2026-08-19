import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentUserViews } from "@/server/rbac";
import {
  getDebtComparison,
  getDebtors,
  getPlanFact,
  getReconciliation,
  getCollectionQueue,
} from "@/server/debt";
import { getCachedCompanies } from "@/lib/cached-queries";
import { getPayments } from "@/server/kassa";
import QarzdorlikClient from "./QarzdorlikClient";

export const metadata = { title: "Qarzdorlik" };

export default async function QarzdorlikPage() {
  const session = await auth();
  if (!session) redirect("/login?expired=1");

  // proxy bilan AYNAN bir manba — qarang: server/rbac.ts → currentUserViews.
  const views = await currentUserViews();
  if (!views.includes("kassa_debt")) redirect("/cabinet");

  // Firmalar bo'yicha oylik to'lovlar jadvali `/kassa` dan shu yerga ko'chdi.
  const userId = session.user?.id ?? "";
  const userRole = session.user?.role || "employee";

  const [debt, debtors, queue, planFact, recon, companies, payments] = await Promise.all([
    getDebtComparison(),
    // To'lamagan firmalar — direktorning kunlik hisoboti bilan bir manbadan.
    getDebtors(),
    // "Bugun gaplashish kerak" — o'sha ro'yxatning HARAKAT kesimi.
    getCollectionQueue(),
    getPlanFact(),
    getReconciliation(),
    getCachedCompanies(userId, userRole),
    getPayments(),
  ]);

  // companyId → qarz. Qarz SERVERDA hisoblanadi (`lib/debt.ts`), klient
  // faqat ko'rsatadi.
  const debtByCompany = Object.fromEntries(
    debtors.rows.map((r) => [
      r.companyId,
      { dueNow: r.dueNow, overdue: r.overdue, outstanding: r.outstanding },
    ])
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
      <QarzdorlikClient
        debt={JSON.parse(JSON.stringify(debt))}
        debtors={JSON.parse(JSON.stringify(debtors))}
        queue={JSON.parse(JSON.stringify(queue))}
        companies={JSON.parse(JSON.stringify(companies))}
        payments={JSON.parse(JSON.stringify(mappedPayments))}
        debtByCompany={debtByCompany}
        planFact={JSON.parse(JSON.stringify(planFact))}
        recon={JSON.parse(JSON.stringify(recon))}
      />
    </div>
  );
}
