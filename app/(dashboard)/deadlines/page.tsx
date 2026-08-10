import { auth } from "@/lib/auth";
import { loadWorkInbox } from "./loadWorkInbox";
import WorkInboxClient from "./WorkInboxClient";

export const metadata = { title: "Ishlar" };

export default async function DeadlinesPage() {
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
        initialTab="all"
      />
    </div>
  );
}
