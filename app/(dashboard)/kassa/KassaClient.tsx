"use client";

// Bosh kassaning balans bloki. Firmalar bo'yicha to'lovlar jadvali bu yerdan
// OLIB TASHLANDI va `/kassa/qarzdorlik` ga ko'chdi — u yerda qarzdorlar bilan
// yonma-yon turgani mantiqan to'g'ri va bitta sahifada ikki xil firma ro'yxati
// qolmaydi.

import React from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import BalanceOverview from "@/components/BalanceOverview";
import { BalanceBreakdown } from "@/types";

interface Props {
  balance?: BalanceBreakdown;
}

export default function KassaClient({ balance }: Props) {
  useAutoRefresh();
  if (!balance) return null;
  return <BalanceOverview breakdown={balance} />;
}
