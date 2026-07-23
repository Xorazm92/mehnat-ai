import { getFairKpiScores } from "@/server/fairKpi";
import FairKpiClient from "./FairKpiClient";

export default async function FairKpiPage() {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const scores = await getFairKpiScores(period);
  return (
    <div className="h-full">
      <FairKpiClient initialPeriod={period} initialScores={JSON.parse(JSON.stringify(scores))} />
    </div>
  );
}
