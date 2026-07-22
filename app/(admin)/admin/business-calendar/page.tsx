import { getCalendarDays } from "@/server/businessCalendar";
import BusinessCalendarClient from "./BusinessCalendarClient";

export default async function BusinessCalendarPage() {
  const year = new Date().getFullYear();
  const days = await getCalendarDays(year);
  return (
    <div className="p-6">
      <BusinessCalendarClient initial={JSON.parse(JSON.stringify(days))} initialYear={year} />
    </div>
  );
}
