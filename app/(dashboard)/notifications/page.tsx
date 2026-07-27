import { getNotifications } from "@/server/audit";
import NotificationsClient from "./NotificationsClient";

export const metadata = { title: "Xabarlar" };

export default async function NotificationsPage() {
  const notifications = await getNotifications();

  const records = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link || undefined,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="h-full">
      <NotificationsClient notifications={JSON.parse(JSON.stringify(records))} />
    </div>
  );
}
