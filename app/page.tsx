import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getHomeRoute } from "@/lib/permissions";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");
  // Rolga mos boshlang'ich sahifa (accountant → /cabinet, bank_manager → /cabinet/bank, ...)
  redirect(getHomeRoute(session.user.role as string));
}
