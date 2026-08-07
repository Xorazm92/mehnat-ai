import { getSystemSettings } from "@/server/system-settings";
import { prisma } from "@/lib/prisma";
import AdminSettingsClient from "./AdminSettingsClient";

export default async function AdminSettingsPage() {
  const settings = await getSystemSettings();
  // "1C baza ochish" xabarnomasini kimga yuborishni tanlash uchun ro'yxat.
  const staff = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: "asc" },
  });
  return (
    <div className="p-6">
      <AdminSettingsClient
        settings={JSON.parse(JSON.stringify(settings))}
        staff={JSON.parse(JSON.stringify(staff))}
      />
    </div>
  );
}
