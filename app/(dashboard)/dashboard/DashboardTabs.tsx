"use client";

// BOSH EKRANNING YORLIQ ALMASHTIRGICHI.
//
// Sahifaning O'ZI server komponenti va yorliq mazmunini serverda tanlaydi
// (`readTabParam`) — bu blok faqat URL'ni yangilaydi va qayta chizishni
// so'raydi. Shu sababli u `useTabParam` emas, `router` bilan ishlaydi:
// `kokpit` yorlig'i uchun ma'lumot (timeline, twin, capacity) SERVERDA
// olinadi, ya'ni yorliq almashganda server qayta yugurishi SHART.
//
// Boshqa ekranlarda (`Kassa`, `KPI`) `useTabParam` ishlatiladi, chunki u
// yerda ikkala yorliqning ma'lumoti allaqachon mijozda bo'ladi va server
// so'rovi ortiqcha bo'lardi. Bu yerda aksincha.

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Gauge, LayoutDashboard } from "lucide-react";
import { Tabs, type TabItem } from "@/components/ui";
import { type DashboardTab } from "@/lib/dashboardTabs";

const ITEMS: TabItem<DashboardTab>[] = [
  {
    id: "holat",
    label: "Holat",
    icon: LayoutDashboard,
    hint: "Sizning rolingiz bo'yicha kunlik ko'rsatkichlar va muddatlar",
  },
  {
    id: "kokpit",
    label: "Kokpit",
    icon: Gauge,
    hint: "Muddatlar oqimi, xavf ostidagi firmalar va xodimlar yuklamasi",
  },
];

export default function DashboardTabs({ active }: { active: DashboardTab }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={pending ? "opacity-60 transition-opacity" : undefined}>
      <Tabs
        items={ITEMS}
        value={active}
        onChange={(id) => {
          if (id === active) return;
          startTransition(() => {
            // `push`, `replace` emas: yorliq almashish shu ekrandagi ma'noli
            // qadam va "orqaga" tugmasi oldingi yorliqqa qaytarishi kerak.
            router.push(id === "holat" ? "/dashboard" : `/dashboard?tab=${id}`);
          });
        }}
        ariaLabel="Boshqaruv paneli bo'limlari"
      />
    </div>
  );
}
