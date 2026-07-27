"use client";

import React, { useId } from "react";

/**
 * FIELD — yorliq + boshqaruv + xato, bitta joyda.
 *
 * Loyihada 149 ta `<input>` va 127 ta `<label>` bor, lekin ularni bog'laydigan
 * `htmlFor` atigi 7 ta. Ya'ni inputlarning ~95 foizi dasturiy jihatdan nomsiz:
 * ekran o'quvchi ularni o'qiy olmaydi va yorliqni bosish inputni fokuslamaydi.
 * Majburiy maydonlar esa faqat yorliq matnidagi `*` belgisi bilan ko'rsatilgan —
 * bu ham dasturiy emas, shunchaki matn.
 *
 * Bu yerda `htmlFor`/`id` bog'lanishi, `aria-required`, `aria-invalid` va
 * `aria-describedby` avtomatik: to'g'ri qilish — eng oson yo'l bo'lishi kerak.
 */

export interface FieldProps {
  label: string;
  children?: React.ReactElement<{
    id?: string;
    "aria-required"?: boolean;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }>;
  required?: boolean;
  error?: string | null;
  hint?: string;
  className?: string;
}

export function Field({ label, children, required, error, hint, className = "" }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={id}
        className="text-meta font-bold uppercase tracking-widest"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: "var(--danger)" }}>
            {" "}
            *
          </span>
        )}
      </label>

      {children
        ? React.cloneElement(children, {
            id,
            "aria-required": required || undefined,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy,
          })
        : null}

      {hint && !error && (
        <p id={hintId} className="text-micro" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-micro font-semibold" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default Field;
