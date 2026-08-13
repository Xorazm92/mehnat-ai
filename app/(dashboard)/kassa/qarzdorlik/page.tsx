import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentUserViews } from "@/server/rbac";
import { getDebtComparison, getPlanFact, getReconciliation } from "@/server/debt";
import QarzdorlikClient from "./QarzdorlikClient";

export const metadata = { title: "Qarzdorlik" };

export default async function QarzdorlikPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // proxy bilan AYNAN bir manba — qarang: server/rbac.ts → currentUserViews.
  const views = await currentUserViews();
  if (!views.includes("kassa_debt")) redirect("/cabinet");

  const [debt, planFact, recon] = await Promise.all([
    getDebtComparison(),
    getPlanFact(),
    getReconciliation(),
  ]);

  return (
    <div className="h-full">
      <QarzdorlikClient
        debt={JSON.parse(JSON.stringify(debt))}
        planFact={JSON.parse(JSON.stringify(planFact))}
        recon={JSON.parse(JSON.stringify(recon))}
      />
    </div>
  );
}
