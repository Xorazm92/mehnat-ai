import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <SessionProvider session={session}>
      <div className="flex flex-col h-screen bg-bg-primary text-text-primary overflow-hidden">
        {/* TopBar full width */}
        <DashboardTopBar
          userName={session?.user?.name || ""}
          userEmail={session?.user?.email || ""}
          userRole={(session?.user as any)?.role}
          avatarColor={(session?.user as any)?.avatarColor}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <DashboardSidebar userRole={(session?.user as any)?.role} />

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
