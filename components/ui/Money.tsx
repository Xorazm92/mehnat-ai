"use client";

import React from "react";
import { formatNum } from "@/lib/format";

/**
 * MONEY — pul summasining YAGONA ko'rinishi.
 *
 * Auditdagi holat: kassa modulida summa o'n xil yozilardi —
 * `formatNum(x)`, `{formatNum(x)} so'm`, `+{formatNum(x)}`, `−{formatNum(x)}`,
 * ba'zisi `tabular-nums` bilan, ba'zisi busiz. Tabular raqamsiz ustunda
 * raqamlar bir-birining tagiga tushmaydi va jadvalni ko'z bilan solishtirib
 * bo'lmaydi — zich moliyaviy jadvalda bu asosiy o'qish vositasi.
 *
 * ── RANG FAQAT PUL YO'NALISHINI BILDIRADI ──────────────────────────────
 *
 * Ekranlarda qizil bir vaqtda uch narsani anglatardi: chiqim summasi, xato
 * banneri va "o'chirish" tugmasi. Uchtasi bir xil ko'ringani uchun qizil
 * hech narsani anglatmay qolgandi.
 *
 * Endi qat'iy taqsimot:
 *   `--accent-red` / `--accent-green`  → PUL yo'nalishi (chiqdi / kirdi)
 *   `--danger` / `--success`           → HOLAT (xato, tasdiq, o'chirish)
 *
 * Ikkala juftlik hozir bir xil rangga ishora qiladi, lekin nomlash farqi
 * ikki narsani beradi: kod o'qilishi aniq bo'ladi, va kelajakda pul
 * ranglarini holat ranglaridan ajratib bo'yash bitta token o'zgarishi
 * bilan hal bo'ladi.
 */

export type MoneyTone =
  /** Ishorasiga qarab: musbat — kirim, manfiy — chiqim. */
  | "auto"
  /** Pul kirdi. */
  | "in"
  /** Pul chiqdi. */
  | "out"
  /** Yo'nalishi yo'q — qoldiq, jami, ochilish. */
  | "neutral"
  /** Ikkinchi darajali — tafsilot qatorlari. */
  | "muted";

const TONE_COLOR: Record<Exclude<MoneyTone, "auto">, string> = {
  in: "var(--accent-green)",
  out: "var(--accent-red)",
  neutral: "var(--text-primary)",
  muted: "var(--text-muted)",
};

export interface MoneyProps {
  value: number | null | undefined;
  tone?: MoneyTone;
  /** Nol bo'lsa chiziqcha — jadval ortiqcha nol bilan to'lib ketmasin. */
  dashIfZero?: boolean;
  /** "so'm" qo'shiladimi. Jadval ichida ODATDA kerak emas. */
  unit?: boolean;
  /** Ishorani majburan ko'rsatish (+/−) — harakat ustunlarida foydali. */
  showSign?: boolean;
  bold?: boolean;
  className?: string;
}

export function Money({
  value,
  tone = "neutral",
  dashIfZero = false,
  unit = false,
  showSign = false,
  bold = false,
  className = "",
}: MoneyProps) {
  const n = Number(value ?? 0);

  if (dashIfZero && n === 0) {
    return (
      <span className={`tabular-nums ${className}`} style={{ color: "var(--text-muted)" }}>
        —
      </span>
    );
  }

  const resolved = tone === "auto" ? (n < 0 ? "out" : n > 0 ? "in" : "neutral") : tone;
  const sign = showSign && n !== 0 ? (n > 0 ? "+" : "−") : "";
  const body = formatNum(showSign ? Math.abs(n) : n);

  return (
    <span
      className={`tabular-nums whitespace-nowrap ${bold ? "font-semibold" : ""} ${className}`}
      style={{ color: TONE_COLOR[resolved] }}
    >
      {sign}
      {body}
      {unit && <span className="text-micro ml-1" style={{ color: "var(--text-muted)" }}>so&apos;m</span>}
    </span>
  );
}
