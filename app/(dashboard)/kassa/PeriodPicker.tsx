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

import React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { formatPeriodLabel } from "@/lib/periods";

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
        className="p-1.5 rounded-lg"
        style={btn}
        aria-label="Oldingi oy"
      >
        <ChevronLeft size={14} />
      </button>

      <span
        className="px-3 py-1.5 rounded-lg text-meta font-semibold flex items-center gap-1.5"
        style={{ background: "var(--input-bg)", color: "var(--text)" }}
      >
        <CalendarDays size={13} style={{ color: "var(--text-muted)" }} />
        {formatPeriodLabel(period)}
      </span>

      <button
        onClick={() => go(shift(period, 1))}
        className="p-1.5 rounded-lg"
        style={btn}
        aria-label="Keyingi oy"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
