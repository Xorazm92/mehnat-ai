import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getMyCabinet } from "@/server/cabinet";
import { readTabParam } from "@/lib/tabs";
import { CABINET_TAB_IDS, type CabinetTabId } from "@/lib/cabinetTabs";
import MyCabinet, { type MyCabinetProps } from "@/components/cabinets/MyCabinet";

export const metadata = { title: "Mening kabinetim" };

// Shaxsiy kabinet — har qanday rol uchun ("Mening kabinetim").
// Profil, biriktirilgan firmalar, KPI/oylik, davomat va parol o'zgartirish.
export default async function CabinetPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session) redirect("/login");

  const data = await getMyCabinet();
  if (!data.profile) redirect("/login");

  // serialize() bo'sh (loose) tip qaytaradi — komponent shakliga bir marta cast qilamiz
  const cabinet = data as unknown as MyCabinetProps;

  return (
    <div className="h-full">
      <MyCabinet
        {...cabinet}
        initialTab={readTabParam<CabinetTabId>(sp.tab, CABINET_TAB_IDS, "profile")}
      />
    </div>
  );
}
