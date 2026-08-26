"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import { formatUzDateNumeric } from "@/lib/format";

/**
 * DATE FIELD — o'zbekcha sana kiritish.
 *
 * NIMA UCHUN KERAK. Loyihada 34 ta joyda brauzerning tug'ma
 * `<input type="date">` i ishlatiladi. Uning ko'rinishini CSS boshqarmaydi:
 * u BRAUZER tiliga bo'ysunadi, sahifaning `lang="uz"` atributiga emas.
 * Natijada o'zbek tilidagi tizimda buxgalter `mm/dd/yyyy` ko'radi —
 * amerikacha tartib. Yomonrog'i: `05/08/2026` ni ikki xil o'qish mumkin
 * (5-avgust yoki 8-may), ya'ni bu shunchaki chiroysizlik emas, XATO
 * KIRITISH manbai. Auditda bitta ekranda uchta format yonma-yon uchradi:
 * `14/08/2026`, `mm/dd/yyyy` va `5-avgust, 2026`.
 *
 * QANDAY ISHLAYDI. Ko'rinadigan maydon — oddiy matn: `kk.oo.yyyy`.
 * Yonida tug'ma sana tanlagichi qoladi (kalendar ikonkasi), chunki
 * kalendarni qo'lda yozish — o'z xatolarini olib keladigan alohida
 * loyiha, brauzernikisi esa mobil qurilmada tizim tanlagichini ochadi.
 * Ya'ni: TERISH o'zbekcha, TANLASH tug'ma.
 *
 * Qiymat har doim ISO (`yyyy-mm-dd`) — server va Prisma o'sha shaklni
 * kutadi; formatlash faqat ko'rinishda.
 */

/** `2026-08-25` → `25.08.2026`; noto'g'ri qiymatda bo'sh satr. */
function isoToUz(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** `25.08.2026` yoki `25/08/2026` yoki `25-08-2026` → `2026-08-25`. */
function uzToIso(text: string): string | null {
  const cleaned = text.trim();
  const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(cleaned);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Haqiqiy sana ekanini tekshiramiz: 31.02 kabi qiymat o'tib ketmasin.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface DateFieldProps {
  /** ISO `yyyy-mm-dd` yoki bo'sh satr */
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** ISO chegaralari — tug'ma tanlagichga ham beriladi */
  min?: string;
  max?: string;
  /** O'rab turuvchi elementga */
  className?: string;
  /**
   * Kiritish maydonining uslubi. Sukut bo'yicha `erp-input` — loyihaning
   * yagona kiritish uslubi. Beshta fayl o'zining `const input = "px-2.5 …"`
   * ini yozgan (deyarli aynan shu narsa), shuning uchun ular ham shu
   * yerdan o'tishi mumkin — lekin majburiy emas.
   */
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

export function DateField({
  value,
  onChange,
  id,
  name,
  disabled,
  required,
  min,
  max,
  className = "",
  inputClassName = "erp-input",
  inputStyle,
  ...aria
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToUz(value));
  const [touched, setTouched] = useState(false);

  // Tashqaridan kelgan qiymat o'zgarsa (masalan formani tozalash) — sinxron.
  useEffect(() => {
    setText(isoToUz(value));
  }, [value]);

  const invalid = useMemo(() => touched && text.length > 0 && uzToIso(text) === null, [touched, text]);

  const commit = (raw: string) => {
    const iso = uzToIso(raw);
    if (iso) onChange(iso);
    else if (raw.trim() === "") onChange("");
  };

  return (
    /* Kenglik: sukut bo'yicha to'liq — chunki 20 ta qo'llanishning 18 tasi
       forma maydoni. Qatorga tiqiladigan ixcham holat (davr oralig'i) uchun
       chaqiruvchi `className="w-auto"` beradi. */
    <div className={`relative flex items-center w-full min-w-0 ${className}`}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        required={required}
        placeholder="kk.oo.yyyy"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          setTouched(true);
          commit(e.target.value);
        }}
        aria-invalid={invalid || aria["aria-invalid"] || undefined}
        aria-describedby={aria["aria-describedby"]}
        aria-required={aria["aria-required"] ?? required}
        className={`${inputClassName} w-full pr-10 tabular-nums`}
        style={invalid ? { ...inputStyle, borderColor: "var(--danger)" } : inputStyle}
      />

      {/* Tug'ma tanlagich — ko'rinmas, lekin kalendar ikonkasi orqali ochiladi.
          Mobil qurilmada bu tizim tanlagichini beradi; uni qo'lda yozilgan
          kalendar bilan almashtirish yutuq emas. */}
      <label
        className="absolute right-1 icon-btn-sm cursor-pointer"
        style={{ color: "var(--text-muted)" }}
      >
        <span className="sr-only">Kalendardan tanlash</span>
        <Calendar size={15} aria-hidden="true" />
        <input
          type="date"
          tabIndex={-1}
          disabled={disabled}
          min={min}
          max={max}
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            setText(isoToUz(e.target.value));
            setTouched(false);
          }}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-hidden="true"
        />
      </label>
    </div>
  );
}

/** Faqat ko'rsatish uchun: ISO → `25.08.2026`. */
export const displayDate = (iso: string | Date | null | undefined) =>
  iso ? formatUzDateNumeric(iso) : "—";

export default DateField;
