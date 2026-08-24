import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileNavProvider, SIDEBAR_COOKIE } from "@/components/MobileNavContext";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getCachedUnreadCount } from "@/lib/cached-queries";
import { getRoleViewOverrides } from "@/server/rbac";
import { getMyContexts, getRoleContext } from "@/server/roleContext";
import { getMyRoles } from "@/server/activeRole";
import { effectiveViewsForRole, type CompanyRelation, type UserRole } from "@/lib/permissions";

// Butun boshqaruv paneli autentifikatsiya ortida — moliyaviy va shaxsiy
// ma'lumot qidiruv botlariga ko'rinmasligi kerak. Har bir sahifada alohida
// takrorlash o'rniga shu yerda bitta joyda yopiladi.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role ?? "";
  const avatarColor = session?.user?.avatarColor ?? undefined;
  const [unreadCount, roleViewOverrides, contexts, roleContext, multiRoles] = await Promise.all([
    userId ? getCachedUnreadCount(userId) : Promise.resolve(0),
    userId ? getRoleViewOverrides().catch(() => ({})) : Promise.resolve({}),
    // Ko'p vazifali odam uchun kontekst tanlash. Bitta vazifasi bo'lsa
    // bo'sh massiv qaytadi va almashtirgich chizilmaydi.
    userId ? getMyContexts().catch(() => []) : Promise.resolve([]),
    userId ? getRoleContext().catch(() => "all" as const) : Promise.resolve("all" as const),
    // TIZIM ROLI almashtirgich — ikki rolli xodim uchun (bank klient +
    // buxgalter kabi). Bir rolli odamda null qaytadi, chizilmaydi.
    userId ? getMyRoles().catch(() => null) : Promise.resolve(null),
  ]);
  // Menyu = proxy darvozasi bilan AYNAN bir manba: kod default'i + admin
  // override'i + foydalanuvchining haqiqiy biriktiruvlari. Uchinchisisiz
  // bank-klient roli bilan buxgalter biriktiruvi bo'lgan xodim (masalan
  // 10 firmada buxgalter Ruslan) ochilishi mumkin bo'lgan ekranni menyuda
  // ko'rmasdi.
  const allowedViews = effectiveViewsForRole(
    userRole as UserRole,
    roleViewOverrides,
    (session?.user?.relations ?? []) as CompanyRelation[]
  );

  // Yon panel yig'ilganmi — cookie'dan. Serverda o'qilgani uchun sahifa
  // birinchi chizilishidayoq to'g'ri kenglikda keladi (sakrash yo'q).
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <SessionProvider session={session}>
      <MobileNavProvider initialCollapsed={sidebarCollapsed}>
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
            multiRoles={multiRoles}
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
            {/* Ruxsat berilmagan bo'lak havola bo'lmaydi — aks holda yo'l
                chizig'i ocholmaydigan sahifaga taklif qilardi va uning
                prefetch'i `/403` ga otilardi. */}
            <Breadcrumbs className="mb-4" allowedViews={allowedViews} />
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
