import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileNavProvider } from "@/components/MobileNavContext";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getCachedUnreadCount } from "@/lib/cached-queries";
import { getRoleViewOverrides } from "@/server/rbac";
import { getMyContexts, getRoleContext } from "@/server/roleContext";
import { effectiveViewsForRole, type UserRole } from "@/lib/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role ?? "";
  const avatarColor = session?.user?.avatarColor ?? undefined;
  const [unreadCount, roleViewOverrides, contexts, roleContext] = await Promise.all([
    userId ? getCachedUnreadCount(userId) : Promise.resolve(0),
    userId ? getRoleViewOverrides().catch(() => ({})) : Promise.resolve({}),
    // Ko'p vazifali odam uchun kontekst tanlash. Bitta vazifasi bo'lsa
    // bo'sh massiv qaytadi va almashtirgich chizilmaydi.
    userId ? getMyContexts().catch(() => []) : Promise.resolve([]),
    userId ? getRoleContext().catch(() => "all" as const) : Promise.resolve("all" as const),
  ]);
  // Admin tomonidan sozlangan menyu ko'rinishi (override) — bo'lmasa kod default'i
  const allowedViews = effectiveViewsForRole(userRole as UserRole, roleViewOverrides);

  return (
    <SessionProvider session={session}>
      <MobileNavProvider>
      <ConfirmProvider>
      <div
        style={{
          display: "flex",
          // dvh: mobil brauzer manzil paneli 100vh ni ko'rinadigan viewport'dan
          // balandroq qiladi va tartib panel yashiringanda sakraydi.
          height: "100dvh",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          overflow: "hidden",
        }}
      >
        {/* Sidebar — to'liq balandlik (chapda) */}
        <DashboardSidebar userRole={userRole} allowedViews={allowedViews} />

        {/* O'ng ustun: topbar + kontent */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {/* TopBar (faqat kontent ustida) */}
          <DashboardTopBar
            userName={session?.user?.name || ""}
            userEmail={session?.user?.email || ""}
            userRole={userRole}
            avatarColor={avatarColor}
            unreadCount={unreadCount}
            allowedViews={allowedViews}
            roleContexts={contexts}
            roleContext={roleContext}
          />

          {/* Main content */}
          {/* Pastki zaxira MobileBottomNav'ning o'z env() ifodasini takrorlaydi.
              Avval bu qotib qolgan `pb-[76px]` edi, navigatsiya esa notchli
              qurilmada 94px gacha chiqib, har bir mobil sahifaning oxirgi
              ~18px ini yopib qo'yardi. */}
          <main
            className="flex-1 overflow-y-auto p-3 md:p-6 pb-[calc(76px_+_env(safe-area-inset-bottom,0px))] md:pb-6"
            style={{ minWidth: 0, background: "var(--bg-primary)" }}
          >
            <Breadcrumbs className="mb-4" />
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>

        {/* Mobil pastki navigatsiya (faqat kichik ekranlarda) */}
        <MobileBottomNav userRole={userRole} allowedViews={allowedViews} />
      </div>
      </ConfirmProvider>
      </MobileNavProvider>
    </SessionProvider>
  );
}
