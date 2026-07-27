import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getMyCabinet } from "@/server/cabinet";
import MyCabinet, { type MyCabinetProps } from "@/components/cabinets/MyCabinet";

export const metadata = { title: "Mening kabinetim" };

// Shaxsiy kabinet — har qanday rol uchun ("Mening kabinetim").
// Profil, biriktirilgan firmalar, KPI/oylik, davomat va parol o'zgartirish.
export default async function CabinetPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const data = await getMyCabinet();
  if (!data.profile) redirect("/login");

  // serialize() bo'sh (loose) tip qaytaradi — komponent shakliga bir marta cast qilamiz
  const cabinet = data as unknown as MyCabinetProps;

  return (
    <div className="h-full">
      <MyCabinet {...cabinet} />
    </div>
  );
}
