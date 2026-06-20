import { auth } from "@/lib/auth";
import { getCachedCompanies } from "@/lib/cached-queries";
import KassaClient from "./KassaClient";

export default async function KassaPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const userRole = (session?.user as any)?.role || "employee";

  const companies = await getCachedCompanies(userId, userRole);

  return (
    <div className="h-full">
      <KassaClient
        companies={JSON.parse(JSON.stringify(companies))}
        payments={[]}
      />
    </div>
  );
}
