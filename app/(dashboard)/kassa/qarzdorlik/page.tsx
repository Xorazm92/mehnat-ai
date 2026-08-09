import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canSeeViewWith } from "@/lib/permissions";
import { getRoleViewOverrides } from "@/server/rbac";
import { getDebtComparison, getPlanFact, getReconciliation } from "@/server/debt";
import QarzdorlikClient from "./QarzdorlikClient";

export const metadata = { title: "Qarzdorlik" };

export default async function QarzdorlikPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role as string;
  const overrides = await getRoleViewOverrides().catch(() => null);
  if (!canSeeViewWith(role as never, "kassa_debt", overrides)) redirect("/cabinet");

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
