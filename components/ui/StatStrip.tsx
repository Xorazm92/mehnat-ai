"use client";

import React from "react";
import { Money, type MoneyTone } from "./Money";

/**
 * STAT STRIP — blok tepasidagi ko'rsatkichlar qatori.
 *
 * Auditdagi holat: bu naqsh kassa modulida BESH marta qo'lda yozilgan va
 * har safar boshqacha —
 *   CashDeskTable   → `grid grid-cols-4`, `text-meta`
 *   CategoryBreakdown → ikki ustunli flex, `text-micro` yorliq
 *   ExpenseQueue    → bosiladigan tab-plitkalar
 *   DebtStatement   → `grid grid-cols-2 md:grid-cols-4`
 *   BalanceOverview → `px-4 py-2 rounded-xl` qutilar
 * Bir xil ma'lumot beshta turli o'lchamda, beshta turli bo'shliq bilan.
 *
 * Bu yerda bitta naqsh: yorliq (mikro, CAPS) ustida qiymat (tabular).
 * Ajratgich — chiziq, quti emas: zich moliyaviy ekranda har ko'rsatkichni
 * alohida qutiga solish sahifani ikki barobar cho'zadi va hech qanday
 * ma'lumot qo'shmaydi.
 *
 * Elementni BOSILADIGAN qilish mumkin (`onClick`) — o'shanda u filtr
 * vazifasini bajaradi va faol holati chiziq bilan belgilanadi.
 */

export interface StatItem {
  label: string;
  value: number;
  tone?: MoneyTone;
  /** Qiymat ostidagi kichik izoh — "12 ta", "3 shartnoma". */
  meta?: string;
  /** Sichqoncha ustida chiqadigan tushuntirish. */
  hint?: string;
  /** Berilsa element bosiladigan bo'ladi (filtr). */
  onClick?: () => void;
  active?: boolean;
  /**
   * Qatorning ASOSIY ko'rsatkichi — kattaroq teriladi va ko'proq joy oladi.
   * `active` dan MUSTAQIL o'q: urg'u "bu eng muhim raqam" degani, faollik esa
   * "hozir shu filtr yoqilgan" — bir element ikkalasi ham bo'lishi mumkin.
   * Qatorda bittadan ortiq element urg'u olmasin.
   */
  emphasis?: boolean;
  /** Qiymat ostidagi o'zgarish satri — "+14 o'tgan haftadan". */
  trend?: string;
}

export interface StatStripProps {
  items: StatItem[];
  /** Har element eng kam qancha joy egallaydi. */
  minWidth?: number;
  className?: string;
}

export function StatStrip({ items, minWidth = 132, className = "" }: StatStripProps) {
  return (
    <div
      className={`flex flex-wrap ${className}`}
      style={{ borderBottom: "1px solid var(--card-border)" }}
    >
      {items.map((s, i) => {
        const interactive = Boolean(s.onClick);
        const Tag = (interactive ? "button" : "div") as React.ElementType;
        return (
          <Tag
            key={s.label}
            type={interactive ? "button" : undefined}
            onClick={s.onClick}
            title={s.hint}
            aria-pressed={interactive ? Boolean(s.active) : undefined}
            className={`px-3 py-2 text-left ${s.emphasis ? "flex-[2]" : "flex-1"} ${interactive ? "cursor-pointer" : ""}`}
            style={{
              minWidth: s.emphasis ? minWidth * 1.5 : minWidth,
              borderRight: i < items.length - 1 ? "1px solid var(--card-border)" : undefined,
              // Faol filtr PASTKI CHIZIQ bilan belgilanadi, fon bilan emas:
              // to'ldirilgan fon zich qatorda qo'shni ko'rsatkichni bosib
              // qo'yadi va ko'z avval rangni, keyin raqamni o'qiydi.
              boxShadow: s.active ? "inset 0 -2px 0 0 var(--brand)" : undefined,
              background: "transparent",
            }}
          >
            <div
              className="text-micro font-semibold uppercase tracking-wide"
              style={{ color: s.active ? "var(--brand)" : "var(--text-muted)" }}
            >
              {s.label}
            </div>
            <div className={s.emphasis ? "text-lg" : "text-meta"}>
              <Money value={s.value} tone={s.tone ?? "neutral"} bold />
            </div>
            {s.trend && (
              <div className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                {s.trend}
              </div>
            )}
            {s.meta && (
              <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                {s.meta}
              </div>
            )}
          </Tag>
        );
      })}
    </div>
  );
}
