import { getPortalOverview, getPortalObligations, getPortalInvoices, getPortalRequests } from "@/server/portal";
import PortalClient from "./PortalClient";

export default async function PortalPage() {
  const [overview, obligations, invoices, requests] = await Promise.all([
    getPortalOverview(),
    getPortalObligations(),
    getPortalInvoices(),
    getPortalRequests(),
  ]);
  return (
    <PortalClient
      overview={JSON.parse(JSON.stringify(overview))}
      obligations={JSON.parse(JSON.stringify(obligations))}
      invoices={JSON.parse(JSON.stringify(invoices))}
      requests={JSON.parse(JSON.stringify(requests))}
    />
  );
}
