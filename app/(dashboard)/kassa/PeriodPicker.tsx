"use client";

// KASSA OYI TANLAGICHI.
//
// Kassalar jadvali va moddalar kesimi JORIY OYGA qotib qolgan edi: o'tgan
// oyning qoldig'ini ko'rish uchun ekran umuman yo'l bermasdi, holbuki
// Excelda buxgalter oylar orasida erkin yurardi.
//
// Tanlov URL da (`?oy=2026-07`), state'da emas — shunda sahifa server
// tomonda o'sha oy uchun qayta yig'iladi, havola ulashilsa boshqa odam
// AYNAN o'sha oyni ko'radi, va orqaga tugmasi kutilgandek ishlaydi.
//
// OY GRIDI (`MonthPicker`) — strelkalar bilan 6 oy orqaga chiqish 6 klik
// edi; buxgalter yopiq oylar orasida tez-tez sakraydi, grid bir klikda
// yetkazadi. Strelkalar qoldi — qo'shni oyga o'tish eng ko'p ishlatilgan
// harakat va u uchun ikki bosish maqbul.

import React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MonthPicker } from "@/components/ui/MonthPicker";

const shift = (key: string, by: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function PeriodPicker({ period }: { period: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("oy", key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const btn = {
    background: "var(--input-bg)",
    border: "1px solid var(--card-border)",
    color: "var(--text-secondary)",
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => go(shift(period, -1))}
        className="icon-btn"
        style={btn}
        aria-label="Oldingi oy"
      >
        <ChevronLeft size={14} />
      </button>

      <MonthPicker selectedPeriod={period} onChange={go} />

      <button
        onClick={() => go(shift(period, 1))}
        className="icon-btn"
        style={btn}
        aria-label="Keyingi oy"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
