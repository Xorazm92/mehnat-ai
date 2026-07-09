import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { isAdminRole, getHomeRoute, ROLE_LABELS, type UserRole } from "@/lib/permissions";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user.role ?? "") as string;
  if (!isAdminRole(role)) redirect(getHomeRoute(role));

  return (
    <SessionProvider session={session}>
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
        <AdminSidebar userRole={role} />
        <div className="flex-1 flex flex-col min-w-0">
          <AdminTopbar
            userName={session.user.name || "Admin"}
            role={ROLE_LABELS[role as UserRole] ?? role}
            avatarColor={session.user.avatarColor ?? undefined}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
