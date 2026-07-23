import { getMarginOverview } from "@/server/profitability";
import { getInvoices } from "@/server/invoices";
import ProfitabilityClient from "./ProfitabilityClient";

export default async function ProfitabilityPage() {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [margins, invoices] = await Promise.all([getMarginOverview(period), getInvoices({ period })]);
  return (
    <div className="h-full">
      <ProfitabilityClient
        initialPeriod={period}
        initialMargins={JSON.parse(JSON.stringify(margins))}
        initialInvoices={JSON.parse(JSON.stringify(invoices))}
      />
    </div>
  );
}
