"use client";

import React from "react";

/**
 * CARD — `.dashboard-card` ustidagi yupqa qatlam.
 *
 * `.dashboard-card` o'zi yaxshi (84 ta joyda ishlatiladi), lekin sarlavhali
 * karta har safar qo'lda yig'iladi: ikonka qutisi 11px yoki 12px, sarlavha
 * `text-sm`, `text-lg` yoki `text-2xl`, padding `p-5` yoki `p-5`. Shu sababli
 * bir xil karta beshta turli o'lchamda uchraydi.
 */

export interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  /** Ichki paddingni o'chirish (masalan ichida jadval bo'lsa) */
  flush?: boolean;
  className?: string;
}

export function Card({ title, subtitle, icon, action, children, flush = false, className = "" }: CardProps) {
  const hasHeader = Boolean(title || action);

  return (
    <div className={`dashboard-card ${flush ? "!p-0" : ""} ${className}`}>
      {hasHeader && (
        <div
          className={`flex items-center gap-3 ${flush ? "px-5 py-4" : "pb-4"}`}
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          {icon && (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {title && (
              <h2
                className="text-sm font-bold leading-tight truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-meta mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className={hasHeader && !flush ? "pt-4" : flush ? "p-5" : ""}>{children}</div>
    </div>
  );
}

export default Card;
