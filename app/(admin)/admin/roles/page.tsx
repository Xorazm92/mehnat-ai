import { RolePermissionMatrix } from "@/components/admin/RolePermissionMatrix";
import RoleViewEditor from "@/components/admin/RoleViewEditor";
import { getRoleViewMatrix } from "@/server/rbac";

export default async function AdminRolesPage() {
  const matrix = await getRoleViewMatrix();
  return (
    <div className="p-6 space-y-8">
      {/* Tahrirlanadigan: rol → menyu/view ko'rinishi */}
      <RoleViewEditor initial={JSON.parse(JSON.stringify(matrix))} />

      {/* Ma'lumot uchun: kod bilan belgilangan qobiliyatlar (server xavfsizligi) */}
      <RolePermissionMatrix />
    </div>
  );
}
