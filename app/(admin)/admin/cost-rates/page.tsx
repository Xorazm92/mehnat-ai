import { getCostRates, getUsersForRates } from "@/server/costRates";
import CostRatesClient from "./CostRatesClient";

export default async function CostRatesPage() {
  const [rates, users] = await Promise.all([getCostRates(), getUsersForRates()]);
  return (
    <div className="p-6">
      <CostRatesClient rates={JSON.parse(JSON.stringify(rates))} users={JSON.parse(JSON.stringify(users))} />
    </div>
  );
}
