import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getMonthClosingBoard } from "@/server/monthClosing";
import { getYearClosingState } from "@/server/accounting";
import MonthClosingClient from "./MonthClosingClient";

export default async function MonthClosingPage() {
  const session = await auth();
  if (!session) redirect("/login?expired=1");
  const role = (session.user.role ?? "") as string;

  const year = new Date().getFullYear();
  const [board, yearState] = await Promise.all([
    getMonthClosingBoard(year),
    getYearClosingState(year),
  ]);

  return (
    <MonthClosingClient
      initialBoard={JSON.parse(JSON.stringify(board))}
      initialYearState={JSON.parse(JSON.stringify(yearState))}
      isSuperAdmin={role === "super_admin"}
    />
  );
}
