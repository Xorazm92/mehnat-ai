import { auth } from "@/lib/auth";
import { getObligations, getObligationCounts } from "@/server/obligations";
import { OBLIGATION_PAGE_SIZE } from "@/lib/obligationWorkflow";
import DeadlinesClient from "./DeadlinesClient";

export const metadata = { title: "Muddatlar" };

export default async function DeadlinesPage() {
  const session = await auth();
  const role = (session?.user?.role as string) || "";
  const userId = session?.user?.id || "";

  // Sanoqlar butun qamrov bo'yicha, qatorlar esa faqat eng yaqin muddatlilar.
  const [obligations, counts] = await Promise.all([getObligations(), getObligationCounts()]);
  const rows = obligations.map((o) => ({
    id: o.id,
    companyName: o.company.name,
    templateName: o.template.name,
    obligationType: o.template.obligationType,
    periodKey: o.periodKey,
    dueAt: o.dueAt.toISOString(),
    status: o.status as string,
    isOverdue: o.isOverdue,
    responsibleUserId: o.responsibleUserId,
    delayReason: (o.delayReason as string | null) ?? null,
    delayMarked: !!o.delayMarkedById,
    delayApproved: !!o.delayApprovedById,
  }));

  return (
    <div className="h-full">
      <DeadlinesClient
        rows={JSON.parse(JSON.stringify(rows))}
        role={role}
        userId={userId}
        counts={counts}
        pageSize={OBLIGATION_PAGE_SIZE}
      />
    </div>
  );
}
