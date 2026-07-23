import { getOneCConnections, getSyncOverview, getCompaniesForMapping } from "@/server/oneCConnections";
import Integration1CClient from "./Integration1CClient";

export default async function Integration1CPage() {
  const [connections, overview, companies] = await Promise.all([
    getOneCConnections(),
    getSyncOverview(),
    getCompaniesForMapping(),
  ]);
  return (
    <div className="p-6">
      <Integration1CClient
        connections={JSON.parse(JSON.stringify(connections))}
        overview={JSON.parse(JSON.stringify(overview))}
        companies={JSON.parse(JSON.stringify(companies))}
      />
    </div>
  );
}
