// KASSA APPARATI ↔ BANK SVERKASI.
//
// Savdo nuqtasidagi karta to'lovi ikki joyda iz qoldiradi: fiskal chekda va
// bank ekvayring tushumida. Ular hech qachon avtomatik solishtirilmagan —
// buxgalter buni Excelda qo'lda qilardi va kamomad aynan shu tafovutda
// yashiringan bo'ladi.
//
// Sahifa tartibi buxgalterning ish tartibiga mos:
//   1. Sverka jadvali — kunma-kun "kassa qancha urdi / bankka qancha tushdi"
//   2. Terminallar    — qaysi kanal solishtiruvga KIRADI (eng muhim qaror)
//   3. Apparatlar     — fiskal modullar ro'yxati va hisobot yuklash
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentUserViews } from "@/server/rbac";
import { getSverkaData } from "@/server/posSverka";
import SverkaClient from "./SverkaClient";

export const metadata = { title: "Kassa–bank sverka" };

export default async function SverkaPage({
  searchParams,
}: {
  searchParams: Promise<{ dan?: string; gacha?: string }>;
}) {
  const { dan, gacha } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login?expired=1");

  // proxy bilan AYNAN bir manba — qarang: server/rbac.ts → currentUserViews.
  const views = await currentUserViews();
  if (!views.includes("kassa_sverka")) redirect("/cabinet");

  const data = await getSverkaData({ from: dan, to: gacha });

  return (
    <div className="space-y-4">
      <SverkaClient data={data} />
    </div>
  );
}
