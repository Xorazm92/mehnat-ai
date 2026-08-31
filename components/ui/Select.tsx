"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

/**
 * SELECT — yagona tanlagich primitivi.
 *
 * O'LCHOV (2026-08-31): ilovada 75 ta xom `<select>` bor va ulardan **60
 * tasi uslubni QAYTA yozadi** — `style={{ background: 'var(--input-bg)',
 * border: '1px solid var(--card-border)', … }}` ko'rinishida, har ekranda
 * o'z `INPUT_CLASS` / `inputStyle` / `input` konstantasi bilan. Atigi 15
 * tasi mavjud `.erp-input` sinfidan foydalanadi. Ya'ni ramka rangi bitta
 * ekranda `--card-border`, boshqasida `--input-border`; fokus halqasi
 * ba'zilarida bor, ba'zilarida yo'q.
 *
 * Nega NATIVE `<select>`:
 *   · loyihada komponent kutubxonasi YO'Q (`package.json` da Radix ham,
 *     Headless UI ham yo'q) — faqat shu primitiv uchun bog'liqlik qo'shish
 *     asossiz;
 *   · native tanlagich klaviatura, ekran o'quvchi va TELEFONDAGI tizim
 *     g'ildiragini bepul beradi — div'lardan yasalgan combobox ularning
 *     hammasini qaytadan yozishni talab qiladi;
 *   · qorong'i rejimdagi ro'yxat allaqachon hal qilingan
 *     (`globals.css` → `color-scheme` + `.dark select option`).
 *
 * Bu yerda YO'Q, chunki ilovada ishlatilmaydi: `multiple` (0 marta),
 * qidiruvli combobox, ko'p tanlov. Kerak bo'lsa — SHU faylni kengaytiring,
 * yonига ikkinchi tanlagich yozmang.
 */

export type SelectSize = "sm" | "md";

const SIZE: Record<SelectSize, string> = {
  // Jadval ichidagi zich tanlagich (`WorkInboxColumns`, filtr panellari).
  sm: "text-xs py-1 pl-2 pr-7",
  // Formadagi standart maydon — `.erp-input` ning o'z o'lchami.
  md: "text-body py-2 pl-3 pr-9",
};

const ICON_OFFSET: Record<SelectSize, string> = { sm: "right-1.5", md: "right-2.5" };

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /**
   * `Button` bilan bir xil o'lcham nomlari.
   *
   * DIQQAT: native `size` atributi (ro'yxatda ko'rinadigan qatorlar soni)
   * QO'LLAB-QUVVATLANMAYDI — u ilovada bir marta ham ishlatilmagan va
   * nomi bu yerda o'lcham variantiga band.
   */
  size?: SelectSize;
  /** Xato holati — ramka va halqa `--danger` ga o'tadi, `aria-invalid` qo'yiladi. */
  invalid?: boolean;
  /**
   * Birinchi bo'sh variant matni (`value=""`).
   *
   * 71 ta tanlagichning deyarli hammasi shunday qator bilan boshlanadi, lekin
   * matni har xil: "— Tanlanmagan —", "Manbani tanlang…", "Mas'ul…". Matn
   * chaqiruvchida qoladi (u domenga tegishli), MEXANIZM esa shu yerda.
   */
  placeholder?: string;
  /** Standart — butun kenglik. Jadval katagida `false` bering. */
  fullWidth?: boolean;
  className?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    size = "md",
    invalid = false,
    placeholder,
    fullWidth = true,
    disabled,
    children,
    className = "",
    ...rest
  },
  ref,
) {
  return (
    <span className={`relative ${fullWidth ? "block w-full" : "inline-block"}`}>
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        // `.erp-input` — dizayn tizimining maydon uslubi: tokenli fon/ramka,
        // fokus halqasi va telefonda 16px (iOS aks holda sahifani kattalashtiradi).
        // Bu yerda faqat o'lcham va o'z g'ildiragimiz uchun joy qo'shiladi.
        className={[
          "erp-input appearance-none cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          SIZE[size],
          fullWidth ? "w-full" : "w-auto",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          invalid
            ? { borderColor: "var(--danger)", boxShadow: "0 0 0 3px var(--danger-bg)" }
            : undefined
        }
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {children}
      </select>
      {/* `appearance-none` native g'ildirakni o'chiradi, shuning uchun o'zimiznikini
          chizamiz — aks holda u har brauzerda boshqacha ko'rinardi. Bosishni
          o'tkazib yuboradi: ikonka ustiga bosilsa ham ro'yxat ochiladi. */}
      <ChevronDown
        size={size === "sm" ? 13 : 15}
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${ICON_OFFSET[size]}`}
        style={{ color: disabled ? "var(--text-muted)" : "var(--text-secondary)" }}
      />
    </span>
  );
});

export default Select;
