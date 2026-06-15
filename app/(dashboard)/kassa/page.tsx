import { getCompanies } from "@/server/companies";
import KassaClient from "./KassaClient";

export default async function KassaPage() {
  const companies = await getCompanies();

  return (
    <div className="h-full">
      <KassaClient
        companies={JSON.parse(JSON.stringify(companies))}
        payments={[]}
      />
    </div>
  );
}
