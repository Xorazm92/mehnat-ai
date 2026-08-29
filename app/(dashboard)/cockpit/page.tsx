import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentUserViews } from "@/server/rbac";
import { getOperationsTimeline } from "@/server/timeline";
import { getCompanyTwins, getStaffCapacity } from "@/server/twin";
import { getCurrentPeriodKey } from "@/lib/periods";
import CockpitClient from "./CockpitClient";

export const metadata = { title: "Kabina" };

export default async function CockpitPage() {
  await auth();
  // Server darvozasi — proxy bilan AYNAN bir manbadan (rol + admin override +
  // biriktiruvlar). Aks holda proxy kiritadi, sahifa qaytaradi va yon panelning
  // prefetch'i cheksiz siklga aylanadi (server/rbac.ts → currentUserViews).
  const views = await currentUserViews();
  if (!views.includes("cockpit")) {
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
