import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getHomeRoute, type UserRole } from "@/lib/permissions";
import { currentUserViews } from "@/server/rbac";
import AuditLogModule from "@/components/AuditLogModule";

export const metadata = { title: "Audit jurnali" };

export default async function AuditLogsPage() {
  const session = await auth();
  if (!session) redirect("/login?expired=1");

  const role = (session.user.role ?? "") as UserRole;
  // Audit log is admin-only; send others to their home instead of letting the
  // client hit a Forbidden error from the getAuditLogs server action.
  // Darvoza proxy bilan AYNAN bir manbadan (rol + override + biriktiruv) —
  // qarang: server/rbac.ts → currentUserViews.
  const views = await currentUserViews();
  if (!views.includes("audit_logs")) redirect(getHomeRoute(role));

  return (
    <div className="h-full">
      <AuditLogModule lang="uz" />
    </div>
  );
}
