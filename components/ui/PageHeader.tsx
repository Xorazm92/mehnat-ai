"use client";

import React from "react";

/**
 * PAGE HEADER — har bir ekranning yagona sarlavha naqshi.
 *
 * Auditdagi holat: `<h1>` atigi 4 ta sahifada bor edi, `<h2>` beshtasida
 * (`text-lg` / `text-sm` / `text-2xl` — uch xil o'lchamda), va SAKKIZ ta sahifa
 * — Xarajatlar, Oylik, Xabarlar, Sozlamalar, Hujjatlar, Inventar, Davomat, KPI —
 * umuman hech qanday sarlavhasiz ochilardi. Sahifa `metadata` ham yo'q, ya'ni
 * brauzer yorlig'i 44 ta yo'nalishda bir xil matnni ko'rsatadi, breadcrumb ham
 * yo'q. Natijada foydalanuvchiga qayerdaligini FAQAT yon paneldagi belgi aytardi.
 *
 * Bu komponent shuni to'g'rilaydi: bitta sarlavha darajasi, bitta o'lcham,
 * ixtiyoriy tavsif va o'ngda asosiy amal uchun joy.
 */

export interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Chapdagi ikonka (lucide, 20px tavsiya etiladi) */
  icon?: React.ReactNode;
  /** O'ngdagi asosiy amal(lar) */
  actions?: React.ReactNode;
  /** Sarlavha ostidagi qo'shimcha qator (filtr, tab va h.k.) */
  children?: React.ReactNode;
  className?: string;
  /**
   * IXCHAM REJIM — zich ish yuzalari uchun (masalan amallar matritsasi).
   *
   * Ikonka, ko'rinadigan sarlavha va tavsif olib tashlanadi, `children`
   * (yorliqlar) qoladi. `h1` YO'QOLMAYDI, faqat ko'zdan yashiriladi: sahifa
   * tuzilmasi ekran o'quvchi uchun buzilmasligi kerak — aynan shu nuqson
   * auditda topilib tuzatilgan edi.
   *
   * Nima uchun kerak: matritsa ekranida sarlavha ~64px vertikal joyni oladi,
   * holbuki modulning O'ZI ham "Amallar Matritsasi" deb yozadi va yon panelda
   * "Hisobotlar" allaqachon yoritilgan — ya'ni matn uch marta takrorlanadi,
   * jadvalga esa joy qolmaydi.
   */
  compact?: boolean;
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
  children,
  className = "",
  compact = false,
}: PageHeaderProps) {
  if (compact) {
    return (
      <header className={`flex flex-col gap-2 mb-2 ${className}`}>
        <h1 className="sr-only">{title}</h1>
        {(actions || children) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {children}
            {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
          </div>
        )}
      </header>
    );
  }

  // Ostki chiziq: sarlavhani kontentdan ajratadi. Lekin `children` (yorliqlar
  // qatori) berilganda uning O'ZI chiziq chizadi — ikkalasi qolsa ikkita
  // parallel hairline hosil bo'lib, yorliqlar "qayerga ulanishi" noaniq
  // ko'rinardi.
  const hasChildren = React.Children.count(children) > 0;

  return (
    <header
      className={`flex flex-col gap-4 ${hasChildren ? "mb-5" : "pb-4 mb-5"} ${className}`}
      style={hasChildren ? undefined : { borderBottom: "1px solid var(--rule-strong)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {/* Har sahifada aynan bitta `h1` — ekran o'quvchi hujjat tuzilmasini
                shu orqali o'qiydi. */}
            <h1
              className="text-xl font-semibold tracking-tight leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </h1>
            {description && (
              <p className="text-body mt-1" style={{ color: "var(--text-secondary)" }}>
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>

      {children}
    </header>
  );
}

export default PageHeader;
