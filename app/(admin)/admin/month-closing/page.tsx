import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getMonthClosingBoard } from "@/server/monthClosing";
import { getAccountingPeriods, getFinancialSnapshots } from "@/server/accounting";
import MonthClosingClient from "./MonthClosingClient";
import YearClosingPanel from "./YearClosingPanel";

export default async function MonthClosingPage() {
  const session = await auth();
  if (!session) redirect("/login?expired=1");
  const role = (session.user.role ?? "") as string;

  const year = new Date().getFullYear();
  const [board, periods, snapshots] = await Promise.all([
    getMonthClosingBoard(year),
    getAccountingPeriods(year),
    getFinancialSnapshots(),
  ]);

  return (
    <div className="space-y-5">
      <MonthClosingClient
        initialBoard={JSON.parse(JSON.stringify(board))}
        isSuperAdmin={role === "super_admin"}
      />
      {/* Davr qulfi va yil yopish — server/accounting.ts da yozilgan-u,
          ekrani yo'q edi. Oy yopish bilan bir domen, shuning uchun shu yerda. */}
      <YearClosingPanel
        year={year}
        periods={JSON.parse(JSON.stringify(periods))}
        snapshots={JSON.parse(JSON.stringify(snapshots))}
        isSuperAdmin={role === "super_admin"}
      />
    </div>
  );
}
