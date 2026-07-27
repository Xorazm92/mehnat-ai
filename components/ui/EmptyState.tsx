"use client";

import React from "react";

/**
 * EMPTY STATE — "hech narsa yo'q" holatining yagona ko'rinishi.
 *
 * Hozir bitta tushuncha uchun sakkizta turli vertikal padding (`py-6`, `py-8`,
 * `p-8`, `py-10`, `p-10`, `py-12`, `py-16`, `3.5rem`) va oltita turli matn
 * ishlatiladi: "Ma'lumot topilmadi", "Ma'lumot yo'q", "Hech narsa topilmadi",
 * "... mavjud emas" va hokazo.
 *
 * `globals.css` da `.empty-state` allaqachon bor — u faqat bitta faylda
 * ishlatilgan. Bu komponent o'sha sinfning ustiga qurilgan.
 */

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`}>
      {icon && <div style={{ color: "var(--text-muted)", opacity: 0.35 }}>{icon}</div>}
      <p
        className="font-bold text-meta uppercase tracking-widest mt-3"
        style={{ color: "var(--text-secondary)" }}
      >
        {title}
      </p>
      {description && (
        <p className="text-body mt-1.5 max-w-sm" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
