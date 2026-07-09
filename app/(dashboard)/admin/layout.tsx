import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminRole, getHomeRoute } from "@/lib/permissions";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user.role ?? "") as string;
  // admin + super_admin only; others go to their home route.
  if (!isAdminRole(role)) redirect(getHomeRoute(role));

  return (
    <div className="flex h-full -m-6" style={{ background: "var(--bg-primary)" }}>
      <AdminSidebar userRole={role} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
