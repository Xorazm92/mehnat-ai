"use client";

// Bosh kassaning balans bloki. Firmalar bo'yicha to'lovlar jadvali bu yerdan
// OLIB TASHLANDI va `/kassa/qarzdorlik` ga ko'chdi — u yerda qarzdorlar bilan
// yonma-yon turgani mantiqan to'g'ri va bitta sahifada ikki xil firma ro'yxati
// qolmaydi.

import React from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import BalanceOverview, { type MonthlyMovement } from "@/components/BalanceOverview";
import { BalanceBreakdown } from "@/types";

interface Props {
  balance?: BalanceBreakdown;
  /** Tanlangan oyning harakati — bosh raqamlar shu oydan olinadi. */
  monthly?: MonthlyMovement;
  periodLabel?: string;
}

export default function KassaClient({ balance, monthly, periodLabel }: Props) {
  useAutoRefresh();
  if (!balance) return null;
  return <BalanceOverview breakdown={balance} monthly={monthly} periodLabel={periodLabel} />;
}
