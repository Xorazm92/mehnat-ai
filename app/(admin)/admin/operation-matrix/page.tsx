import { getOperationColumnsForAdmin } from "@/server/report-columns";
import OperationMatrixClient from "./OperationMatrixClient";

export default async function OperationMatrixPage() {
  const rows = await getOperationColumnsForAdmin();
  return (
    <div className="p-6">
      <OperationMatrixClient initialRows={JSON.parse(JSON.stringify(rows))} />
    </div>
  );
}
