import { getSlaPolicies } from "@/server/slaPolicies";
import SlaPoliciesClient from "./SlaPoliciesClient";

export default async function SlaPoliciesPage() {
  const policies = await getSlaPolicies();
  return (
    <div className="p-6">
      <SlaPoliciesClient initial={JSON.parse(JSON.stringify(policies))} />
    </div>
  );
}
