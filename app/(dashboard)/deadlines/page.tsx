import { auth } from "@/lib/auth";
import { readTabParam } from "@/lib/tabs";
import { WORK_TAB_IDS, type WorkTab } from "@/lib/workTabs";
import { loadWorkInbox } from "./loadWorkInbox";
import WorkInboxClient from "./WorkInboxClient";

export const metadata = { title: "Ishlar" };

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const role = (session?.user?.role as string) || "";
  const userId = session?.user?.id || "";

  const data = await loadWorkInbox();

  return (
    <div className="h-full">
      <WorkInboxClient
        {...JSON.parse(JSON.stringify(data))}
        role={role}
        userId={userId}
        initialTab={readTabParam<WorkTab>(sp.tab, WORK_TAB_IDS, "all")}
      />
    </div>
  );
}
