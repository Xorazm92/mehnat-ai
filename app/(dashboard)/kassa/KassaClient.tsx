"use client";

// Bosh kassaning pozitsiya bloki. Firmalar bo'yicha to'lovlar jadvali bu yerdan
// OLIB TASHLANDI va `/kassa/qarzdorlik` ga ko'chdi — u yerda qarzdorlar bilan
// yonma-yon turgani mantiqan to'g'ri va bitta sahifada ikki xil firma ro'yxati
// qolmaydi.
//
// `BalanceOverview` o'rniga `TreasuryPanel`: sabab o'sha faylning tepasida
// yozilgan. `BalanceOverview` Boshqaruv paneli va Xarajatlar ekranida
// O'ZGARISHSIZ qoladi.

import React from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { MonthlyMovement } from "@/components/BalanceOverview";
import TreasuryPanel from "./TreasuryPanel";
import { BalanceBreakdown } from "@/types";

interface Props {
  balance?: BalanceBreakdown;
  /** Tanlangan oyning harakati — bosh raqamlar shu oydan olinadi. */
  monthly?: MonthlyMovement;
  /** Bugungi harakat — `getDayMovement`. */
  today?: { income: number; outflow: number };
  periodLabel?: string;
}

export default function KassaClient({ balance, monthly, today, periodLabel }: Props) {
  useAutoRefresh();
  if (!balance) return null;
  return (
    <TreasuryPanel balance={balance} monthly={monthly} today={today} periodLabel={periodLabel} />
  );
}
