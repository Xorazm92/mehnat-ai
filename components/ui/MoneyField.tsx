"use client";

import React, { useState } from "react";
import { groupDigits, ungroupDigits } from "@/lib/platform/format";

/**
 * MONEY FIELD — ajratkichli summa kiritish.
 *
 * NIMA UCHUN KERAK. Yangi firma sehrgarida "Shartnoma summasi" oddiy raqam
 * maydoni: foydalanuvchi `12000000` deb ko'radi va uni o'qish uchun raqamlarni
 * barmoq bilan sanashi kerak. Milliondan katta summalar bilan kunda ishlaydigan
 * mahsulotda bu — xato manbai: bitta ortiqcha nol 12 mln ni 120 mln qiladi va
 * buni ko'z bilan payqash qiyin.
 *
 * `lib/format.ts` da `groupDigits` / `ungroupDigits` ALLAQACHON bor —
 * ular `PayrollTable` da ishlatiladi, lekin umumiy komponent yo'q edi,
 * shuning uchun qolgan maydonlar xom holicha qolgan.
 *
 * Qiymat tashqariga har doim SON bo'lib chiqadi; ajratkich faqat ko'rinishda.
 */

export interface MoneyFieldProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /** O'ng tomondagi birlik yozuvi — standart "so'm" */
  suffix?: string | null;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

export function MoneyField({
  value,
  onChange,
  id,
  name,
  disabled,
  required,
  placeholder = "0",
  suffix = "so'm",
  className = "",
  ...aria
}: MoneyFieldProps) {
  const [text, setText] = useState(() => (value == null ? "" : groupDigits(value)));

  // Tashqi qiymat o'zgarganda sinxron — RENDER paytida, effektda emas.
  // Effekt bilan brauzer avval ESKI matnni chizar, keyin yangisini qo'yardi:
  // formadagi qiymat almashganda raqam bir lahza sakrab ko'rinardi.
  //
  // Foydalanuvchi terayotgan oraliq holat baribir buzilmaydi: solishtiruv
  // matnda emas, SONDA — "1 200" va "1200" bir xil qiymat.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    const current = Number(ungroupDigits(text));
    if ((value ?? null) !== (Number.isFinite(current) ? current : null)) {
      setText(value == null ? "" : groupDigits(value));
    }
  }

  const handle = (raw: string) => {
    // Faqat raqamlar qoladi — foydalanuvchi bo'shliq yoki vergul qo'ysa ham.
    const digits = ungroupDigits(raw).replace(/\D/g, "");
    setText(digits ? groupDigits(digits) : "");
    onChange(digits ? Number(digits) : null);
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        value={text}
        onChange={(e) => handle(e.target.value)}
        aria-invalid={aria["aria-invalid"]}
        aria-describedby={aria["aria-describedby"]}
        aria-required={aria["aria-required"] ?? required}
        className={`erp-input w-full text-right font-mono tabular-nums ${suffix ? "pr-12" : ""}`}
      />
      {suffix && (
        <span
          className="absolute right-3 text-meta pointer-events-none select-none"
          style={{ color: "var(--text-muted)" }}
          aria-hidden="true"
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

export default MoneyField;
