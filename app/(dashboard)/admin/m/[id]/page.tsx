import { notFound } from "next/navigation";
import { findAdminModule } from "@/lib/admin/registry";
import { getSystemSettings } from "@/server/system-settings";
import { AdminModulePlaceholder } from "@/components/admin/AdminModulePlaceholder";

export default async function AdminSoonModulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mod = findAdminModule(id);
  if (!mod) notFound();

  let enabled = false;
  if (mod.featureFlag) {
    try {
      const settings = await getSystemSettings();
      enabled = Boolean(settings.features?.[mod.featureFlag]);
    } catch {
      enabled = false;
    }
  }

  return <AdminModulePlaceholder moduleId={id} enabled={enabled} />;
}
