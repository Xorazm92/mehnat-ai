import { listServices, getServiceRevenue } from "@/server/services";
import ServiceCatalogClient from "./ServiceCatalogClient";

export default async function AdminServicesPage() {
  const [services, revenue] = await Promise.all([
    listServices({ includeInactive: true }),
    getServiceRevenue(),
  ]);

  return (
    <div className="p-6">
      <ServiceCatalogClient
        services={JSON.parse(JSON.stringify(services))}
        revenue={JSON.parse(JSON.stringify(revenue))}
      />
    </div>
  );
}
