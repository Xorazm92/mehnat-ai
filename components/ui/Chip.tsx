"use client";

import React from "react";

/**
 * CHIP — yoqib/o'chiriladigan filtr tugmasi.
 *
 * NEGA `Button` EMAS. `Button` — BUYRUQ ("Saqlash", "Yopish"): bosilganda
 * biror ish bajariladi va u qaytib o'z holatini ko'rsatmaydi. Chip esa
 * HOLAT: u yoqilgan yoki o'chirilgan bo'ladi va ekran o'quvchiga buni
 * `aria-pressed` orqali aytishi kerak. Shakli ham boshqa — `Button`
 * `uppercase tracking-widest font-bold` ni qotiradi, filtr chipi esa oddiy
 * yozuvda va zichroq.
 *
 * NEGA UMUMAN PRIMITIV KERAK. Bu naqsh kassa ichida YETTI joyda qo'lda
 * qayta yozilgan edi (JournalClient 3 · CashDeskTable · IncomeRegister ·
 * DebtStatement 2) va har biri biroz boshqacha: uchtasida chegara bor,
 * to'rttasida yo'q; padding `px-2.5 py-1` va `px-3 py-1.5` orasida ikkiga
 * bo'lingan; `aria-pressed` esa faqat ikkitasida — ya'ni qolgan beshtasida
 * ekran o'quvchi filtr YOQILGANINI umuman ayta olmasdi.
 *
 * RANG — ma'no tashiydi. `tone` berilmasa ko'k (neytral tanlov). Berilsa
 * chipning o'z ma'nosi bo'ladi: kirim yashil, chiqim qizil, shartnoma turi
 * o'z rangida. Shuning uchun `tone` erkin CSS rangi — chaqiruvchi allaqachon
 * o'z token-jadvaliga ega (`KIND_TONE`, `DEBT_AGING_STAGES`) va uni bu yerga
 * ikkinchi marta ko'chirish ikki manba hosil qilardi.
 */

export interface ChipProps {
  /** Yoqilganmi. `aria-pressed` shundan yoziladi. */
  selected: boolean;
  onClick: () => void;
  /** Yoqilgan holatdagi fon rangi (CSS qiymati). Standart — `--accent-blue`. */
  tone?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Sichqoncha ustiga kelganda ko'rinadigan izoh. */
  title?: string;
  /** `sm` — zich qatorlar uchun; `md` — alohida filtr satri uchun. */
  size?: "sm" | "md";
  children: React.ReactNode;
}

const SIZE = {
  sm: "px-2.5 py-1 text-micro",
  md: "px-3 py-1.5 text-meta",
} as const;

export function Chip({
  selected,
  onClick,
  tone = "var(--accent-blue)",
  icon,
  disabled = false,
  title,
  size = "sm",
  children,
}: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={title}
      className={[
        "inline-flex items-center gap-1 rounded-lg font-semibold whitespace-nowrap",
        "transition-colors disabled:opacity-45 disabled:cursor-not-allowed",
        SIZE[size],
      ].join(" ")}
      style={
        selected
          ? // `#fff` EMAS: `--on-brand` qorong'i rejimda qorayadi, qattiq oq
            // esa rangli fon ustida o'qilmay qolardi.
            { background: tone, color: "var(--on-brand)", border: `1px solid ${tone}` }
          : { background: "var(--input-bg)", color: "var(--text-secondary)", border: "1px solid var(--card-border)" }
      }
    >
      {icon}
      {children}
    </button>
  );
}

export default Chip;
