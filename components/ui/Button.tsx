"use client";

import React from "react";
import { Loader2 } from "lucide-react";

/**
 * BUTTON — yagona tugma primitivi.
 *
 * Loyihada 288 ta `<button>` bor, ulardan atigi 31 tasi umumiy sinfdan
 * foydalanadi. Asosiy amal tugmasi 6 xil ko'rinishda yozilgan va uchta turli
 * semantik rangda: `--brand`, `--accent-blue`, hatto oddiy "Saqlash" uchun
 * `--success` (yashil). `CONSISTENCY.md` sababini to'g'ri aniqlagan: umumiy
 * sinf yetarli chuqur emas, shuning uchun komponent forklaydi.
 *
 * Shuning uchun bu yerda o'lcham, ton, yuklanish, ikonka va disabled — hammasi
 * bor: forklashga sabab qolmasin.
 *
 * Muhim: qo'lda yozilgan variantlarning hammasi `text-white` ni qotirgan edi.
 * Bu qorong'i rejimda XATO — u yerda `--on-brand` = #06121C (deyarli qora),
 * chunki `--brand` yorishadi. Bu yerda har doim `--on-*` tokeni ishlatiladi.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md";

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-micro gap-1.5",
  md: "px-4 py-2.5 text-meta gap-2",
};

function variantStyle(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case "primary":
      return { background: "var(--brand)", color: "var(--on-brand)", border: "1px solid transparent" };
    case "danger":
      return { background: "var(--danger)", color: "var(--on-danger)", border: "1px solid transparent" };
    case "success":
      return { background: "var(--success)", color: "var(--on-success)", border: "1px solid transparent" };
    case "secondary":
      return { background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--card-border)" };
    case "ghost":
    default:
      return { background: "transparent", color: "var(--text-secondary)", border: "1px solid transparent" };
  }
}

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    fullWidth = false,
    disabled,
    children,
    type = "button",
    className = "",
    ...rest
  },
  ref
) {
  // Yuklanayotgan tugma har doim disabled: ikki marta yuborish shu bilan yopiladi.
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center rounded-lg font-bold uppercase tracking-widest",
        "transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed",
        SIZE[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={variantStyle(variant)}
      {...rest}
    >
      {loading ? <Loader2 size={size === "sm" ? 13 : 15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

export default Button;
