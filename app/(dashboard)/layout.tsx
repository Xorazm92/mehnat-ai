import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileNavProvider } from "@/components/MobileNavContext";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { getCachedUnreadCount } from "@/lib/cached-queries";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role ?? "";
  const avatarColor = session?.user?.avatarColor ?? undefined;
  const unreadCount = userId ? await getCachedUnreadCount(userId) : 0;

  return (
    <SessionProvider session={session}>
      <MobileNavProvider>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          overflow: "hidden",
        }}
      >
        {/* TopBar */}
        <DashboardTopBar
          userName={session?.user?.name || ""}
          userEmail={session?.user?.email || ""}
          userRole={userRole}
          avatarColor={avatarColor}
          unreadCount={unreadCount}
        />

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Sidebar */}
          <DashboardSidebar userRole={userRole} />

          {/* Main content */}
          <main
            className="flex-1 overflow-y-auto p-3 md:p-6 pb-[76px] md:pb-6"
            style={{ minWidth: 0, background: "var(--bg-primary)" }}
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>

        {/* Mobil pastki navigatsiya (faqat kichik ekranlarда) */}
        <MobileBottomNav userRole={userRole} />
      </div>
      </MobileNavProvider>
    </SessionProvider>
  );
}
