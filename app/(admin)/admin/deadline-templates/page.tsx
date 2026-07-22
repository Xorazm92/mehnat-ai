import { getDeadlineTemplates } from "@/server/deadlineTemplates";
import DeadlineTemplatesClient from "./DeadlineTemplatesClient";

export default async function DeadlineTemplatesPage() {
  const templates = await getDeadlineTemplates();
  return (
    <div className="p-6">
      <DeadlineTemplatesClient initial={JSON.parse(JSON.stringify(templates))} />
    </div>
  );
}
