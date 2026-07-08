import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserById } from "@/server/users";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  if (!userId) redirect("/login");

  const user = await getUserById(userId);
  if (!user) redirect("/login");

  const profile = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone || undefined,
    department: user.department || undefined,
    avatarColor: user.avatarColor || undefined,
    role: user.role,
  };

  return (
    <div className="h-full">
      <SettingsClient profile={JSON.parse(JSON.stringify(profile))} />
    </div>
  );
}
