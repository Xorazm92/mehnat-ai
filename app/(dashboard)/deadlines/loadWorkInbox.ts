import "server-only";

// Birlashgan "Ishlar" ekranining YAGONA yuklovchisi: `/deadlines` ham,
// `/tasks` ham shu ma'lumotni oladi (faqat boshlang'ich yorlig'i farq qiladi).
// Ikki sahifa ikki xil so'rov yozsa, ular yana ajralib ketardi — aynan shu
// takrorlanishni yo'q qilyapmiz.
import { getObligations, getObligationCounts } from "@/server/obligations";
import { getTasks, getTaskFormData } from "@/server/tasks";
import { OBLIGATION_PAGE_SIZE } from "@/lib/engines/workflow/obligationWorkflow";
import type { ObligationRow, TaskRow } from "./WorkInboxClient";

export async function loadWorkInbox() {
  const [obligations, counts, tasks, formData] = await Promise.all([
    getObligations(),
    getObligationCounts(),
    getTasks(),
    getTaskFormData(),
  ]);

  const obligationRows: ObligationRow[] = obligations.map((o) => ({
    kind: "obligation",
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
    taskCount: o._count.tasks,
  }));

  const taskRows: TaskRow[] = tasks.map((t) => ({
    kind: "task",
    id: t.id,
    title: t.title,
    companyId: t.companyId,
    companyName: t.company?.name ?? null,
    taskType: t.taskType,
    priority: t.priority as string,
    status: t.status as string,
    assigneeUserId: t.assigneeUserId,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    obligationLabel: t.obligation
      ? `${t.obligation.template.name} · ${t.obligation.periodKey}`
      : null,
  }));

  return {
    obligations: obligationRows,
    tasks: taskRows,
    users: formData.users,
    companies: formData.companies,
    counts,
    pageSize: OBLIGATION_PAGE_SIZE,
  };
}
