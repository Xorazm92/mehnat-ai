"use client";

// CHIQIM KASSASINING KO'RSATKICHLAR QATORI.
//
// Olti raqam bitta panelda: navbat, tasdiq oqimi va kartalar qoldig'i.
// `canManageChannels` uchtasini yashiradi — kassa xodimi kartalarni
// boshqarmaydi va unga bu raqamlar shovqin bo'lardi.
//
// NEGA ALOHIDA FAYL. Qatorning o'zi 60 qator shartli ro'yxat edi va u
// `ChiqimKassaClient` ning o'rtasida, yorliqlar bilan ekran mantiqining
// orasida turardi. Bu yerda u nima ko'rsatishini bir qarashda o'qish mumkin.

import React from "react";
import { AlertTriangle, ArrowUpRight, Link2, ListChecks, Wallet } from "lucide-react";
import { MetricRail, type MetricTone } from "@/components/ui";
import { formatNum } from "@/lib/platform/format";

export interface ExpenseSummaryRailProps {
  /** Kartalarni boshqarish huquqi — uchta ko'rsatkich shunga bog'liq. */
  canManageChannels: boolean;
  queue: { rows: unknown[] };
  queueTotal: number;
  pendingCount: number;
  pendingAmount: number;
  approvedCount: number;
  approvedAmount: number;
  totalBalance: number;
  activeCount: number;
  frozenCount: number;
  unlinkedCount: number;
  rejectedCount: number;
}

export default function ExpenseSummaryRail({
  canManageChannels,
  queue,
  queueTotal,
  pendingCount,
  pendingAmount,
  approvedCount,
  approvedAmount,
  totalBalance,
  activeCount,
  frozenCount,
  unlinkedCount,
  rejectedCount,
}: ExpenseSummaryRailProps) {
  return (
      <MetricRail
        columns={canManageChannels ? 5 : 3}
        items={[
          ...(canManageChannels
            ? [
                {
                  label: "Yopish kerak",
                  value: queue.rows.length,
                  unit: "ta",
                  hint: `${formatNum(queueTotal)} so'm vipiskadan`,
                  icon: <ListChecks size={13} />,
                  tone: (queue.rows.length > 0 ? "warning" : "success") as MetricTone,
                },
              ]
            : []),
          {
            label: "Tasdiq kutmoqda",
            value: pendingCount,
            unit: "ta",
            hint: `${formatNum(pendingAmount)} so'm`,
            icon: <AlertTriangle size={13} />,
            tone: (pendingCount > 0 ? "warning" : "success") as MetricTone,
          },
          {
            label: "Tasdiqlangan xarajat",
            value: formatNum(approvedAmount),
            unit: "so'm",
            hint: `${approvedCount} ta yozuv`,
            icon: <ArrowUpRight size={13} />,
            tone: "neutral" as MetricTone,
          },
          ...(canManageChannels
            ? [
                {
                  label: "Kartalarda qoldiq",
                  value: formatNum(totalBalance),
                  unit: "so'm",
                  hint: `${activeCount} faol · ${frozenCount} muzlatilgan kanal`,
                  icon: <Wallet size={13} />,
                  tone: (totalBalance < 0 ? "danger" : "brand") as MetricTone,
                  emphasis: true,
                },
                {
                  label: "Bog'lanmagan o'tkazma",
                  value: unlinkedCount,
                  unit: "ta",
                  hint: "qaysi kartaga tushgani noma'lum",
                  icon: <Link2 size={13} />,
                  tone: (unlinkedCount > 0 ? "warning" : "neutral") as MetricTone,
                },
              ]
            : [
                {
                  label: "Rad etilgan",
                  value: rejectedCount,
                  unit: "ta",
                  hint: "qayta ko'rib chiqish uchun",
                  icon: <AlertTriangle size={13} />,
                  tone: (rejectedCount > 0 ? "danger" : "neutral") as MetricTone,
                },
              ]),
        ]}
      />
  );
}
