import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canSeeView, getHomeRoute, type UserRole } from "@/lib/permissions";
import AuditLogModule from "@/components/AuditLogModule";

export default async function AuditLogsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user.role ?? "") as UserRole;
  // Audit log is admin-only; send others to their home instead of letting the
  // client hit a Forbidden error from the getAuditLogs server action.
  if (!canSeeView(role, "audit_logs")) redirect(getHomeRoute(role));

  return (
    <div className="h-full">
      <AuditLogModule lang="uz" />
    </div>
  );
}
