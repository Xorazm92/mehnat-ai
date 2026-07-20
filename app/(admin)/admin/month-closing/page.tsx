import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getMonthClosingBoard } from "@/server/monthClosing";
import MonthClosingClient from "./MonthClosingClient";

export default async function MonthClosingPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = (session.user.role ?? "") as string;

  const year = new Date().getFullYear();
  const board = await getMonthClosingBoard(year);

  return (
    <MonthClosingClient
      initialBoard={JSON.parse(JSON.stringify(board))}
      isSuperAdmin={role === "super_admin"}
    />
  );
}
