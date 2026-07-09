import { getSystemSettings } from "@/server/system-settings";
import AdminSettingsClient from "./AdminSettingsClient";

export default async function AdminSettingsPage() {
  const settings = await getSystemSettings();
  return (
    <div className="p-6">
      <AdminSettingsClient settings={JSON.parse(JSON.stringify(settings))} />
    </div>
  );
}
