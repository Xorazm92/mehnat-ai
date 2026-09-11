"use client";

import React from "react";
import { Search } from "lucide-react";

/**
 * QIDIRUV MAYDONI — ikonka + input, bitta joyda.
 *
 * NEGA PRIMITIV. Bu naqsh uch joyda qo'lda yozilgan edi va UCHALASI HAM
 * BIR-BIRIDAN FARQ QILARDI: ikonka o'lchami 13 va 14, `pointer-events-none`
 * ikkitasida bor uchinchisida yo'q, `aria-hidden` ham shunday.
 *
 * Ikkinchi ikkitasining yo'qligi ko'rinmas nuqson:
 *   • `pointer-events-none` siz ikonka bosishni YUTADI — foydalanuvchi
 *     maydonning chap chetiga bosadi, kursor esa paydo bo'lmaydi;
 *   • `aria-hidden` siz ekran o'quvchi bezak ikonkani ham o'qiydi va maydon
 *     nomi shovqin ostida qoladi.
 *
 * Bu ikkisi "unutilishi mumkin bo'lgan tafsilot" bo'lib qolmasligi kerak —
 * shuning uchun ular primitiv ichida, majburiy.
 *
 * `TableToolbar` ning o'z qidiruvi bor va u jadval ustidagi standart yo'l.
 * Bu primitiv esa jadvaldan TASHQARIDAGI qidiruv uchun (kartalar ro'yxati,
 * sozlash paneli) — o'sha uch joy aynan shunday.
 */

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Ekran o'quvchi uchun nom — MAJBURIY: maydonning ko'rinadigan yorlig'i yo'q. */
  ariaLabel: string;
  /** Tashqi o'lcham/joylashuv sinflari (`w-56`, `flex-1`). */
  className?: string;
  inputClassName?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = "",
  inputClassName = "",
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={14}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: "var(--text-muted)" }}
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`erp-input pl-8 ${inputClassName}`}
      />
    </div>
  );
}

export default SearchInput;
