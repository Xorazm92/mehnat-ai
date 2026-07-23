import { auth } from "@/lib/auth";
import { getTasks, getTaskFormData } from "@/server/tasks";
import TasksClient from "./TasksClient";

export default async function TasksPage() {
  const session = await auth();
  const userId = session?.user?.id || "";
  const role = (session?.user?.role as string) || "";

  const [tasks, formData] = await Promise.all([getTasks(), getTaskFormData()]);
  const rows = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    companyName: t.company?.name ?? null,
    taskType: t.taskType,
    priority: t.priority as string,
    status: t.status as string,
    assigneeUserId: t.assigneeUserId,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    responseBreached: t.responseBreached,
    resolutionBreached: t.resolutionBreached,
  }));

  return (
    <div className="h-full">
      <TasksClient
        rows={JSON.parse(JSON.stringify(rows))}
        users={JSON.parse(JSON.stringify(formData.users))}
        companies={JSON.parse(JSON.stringify(formData.companies))}
        userId={userId}
        role={role}
      />
    </div>
  );
}
