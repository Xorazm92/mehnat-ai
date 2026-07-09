import { getDepartments } from "@/server/departments";
import { getUsers } from "@/server/users";
import AdminDepartmentsClient from "./AdminDepartmentsClient";

export default async function AdminDepartmentsPage() {
  const [departments, users] = await Promise.all([getDepartments(), getUsers()]);
  // chief candidates: senior roles who can head a department
  const chiefs = (users as Array<{ id: string; fullName: string; role: string }>)
    .filter((u) => ["chief_accountant", "admin", "super_admin"].includes(u.role))
    .map((u) => ({ id: u.id, fullName: u.fullName }));

  return (
    <div className="p-6">
      <AdminDepartmentsClient
        departments={JSON.parse(JSON.stringify(departments))}
        chiefs={JSON.parse(JSON.stringify(chiefs))}
      />
    </div>
  );
}
