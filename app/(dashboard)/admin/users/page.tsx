import { getUsers } from "@/server/users";
import AdminUsersClient from "./AdminUsersClient";

export default async function AdminUsersPage() {
  const users = await getUsers();
  return (
    <div className="p-6">
      <AdminUsersClient users={JSON.parse(JSON.stringify(users))} />
    </div>
  );
}
