import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canSeeViewWith, type UserRole } from "@/lib/platform/permissions";
import { getRoleViewOverrides } from "@/server/rbac";
import { getOperationsTimeline } from "@/server/timeline";
import { getCompanyTwins, getStaffCapacity } from "@/server/twin";
import { getCurrentPeriodKey } from "@/lib/periods";
import CockpitClient from "./CockpitClient";

export const metadata = { title: "Kabina" };

export default async function CockpitPage() {
  const session = await auth();
  const role = (session?.user?.role as string) || "";
  // Server darvozasi. Proxy ham shu yo'lni qo'riqlaydi, lekin sahifa o'zi ham
  // tekshiradi — va AYNAN O'SHA manbadan: ro'yxat admin tomonidan
  // tahrirlanadigan bo'lgani uchun statik allowlist bilan tekshirilsa,
  // ruxsat berilgan rol proxy'dan o'tib sahifada qaytarilardi.
  if (!canSeeViewWith(role as UserRole, "cockpit", await getRoleViewOverrides())) {
    redirect("/dashboard");
  }

  const period = getCurrentPeriodKey();
  const [timeline, twins, capacity] = await Promise.all([
    getOperationsTimeline(),
    getCompanyTwins(period),
    getStaffCapacity(period),
  ]);

  return (
    <CockpitClient
      period={period}
      timeline={JSON.parse(JSON.stringify(timeline))}
      twins={JSON.parse(JSON.stringify(twins))}
      capacity={JSON.parse(JSON.stringify(capacity))}
    />
  );
}
