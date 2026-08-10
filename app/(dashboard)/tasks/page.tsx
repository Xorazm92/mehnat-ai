import { auth } from "@/lib/auth";
import { loadWorkInbox } from "../deadlines/loadWorkInbox";
import WorkInboxClient from "../deadlines/WorkInboxClient";

export const metadata = { title: "Vazifalar" };

/**
 * `/tasks` endi ALOHIDA modul emas — birlashgan "Ishlar" ekranining vazifalar
 * yorlig'i. Yo'l saqlanadi (eski havolalar, bildirishnomalar va RBAC `tasks`
 * view'i ishlashda davom etadi), lekin ma'lumot va amallar bitta manbadan
 * keladi: majburiyat + unga biriktirilgan vazifalar.
 */
export default async function TasksPage() {
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
        initialTab="tasks"
      />
    </div>
  );
}
