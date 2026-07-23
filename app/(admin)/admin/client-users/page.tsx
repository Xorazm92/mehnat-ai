import { getClientUsers, getStaffClientRequests } from "@/server/clientUsers";
import { getCompaniesForMapping } from "@/server/oneCConnections";
import ClientUsersClient from "./ClientUsersClient";

export default async function ClientUsersPage() {
  const [clients, requests, companies] = await Promise.all([
    getClientUsers(),
    getStaffClientRequests(),
    getCompaniesForMapping(),
  ]);
  return (
    <div className="p-6">
      <ClientUsersClient
        clients={JSON.parse(JSON.stringify(clients))}
        requests={JSON.parse(JSON.stringify(requests))}
        companies={JSON.parse(JSON.stringify(companies))}
      />
    </div>
  );
}
