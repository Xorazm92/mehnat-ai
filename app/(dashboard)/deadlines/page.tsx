import { auth } from "@/lib/auth";
import { getObligations } from "@/server/obligations";
import DeadlinesClient from "./DeadlinesClient";

export default async function DeadlinesPage() {
  const session = await auth();
  const role = (session?.user?.role as string) || "";
  const userId = session?.user?.id || "";

  const obligations = await getObligations();
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
      <DeadlinesClient rows={JSON.parse(JSON.stringify(rows))} role={role} userId={userId} />
    </div>
  );
}
