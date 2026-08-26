"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

/**
 * MOBIL QATOR KARTOCHKASI — `DataTable` ning `mobileCard` sloti uchun.
 *
 * NEGA ALOHIDA KOMPONENT. `DataTable` ga `mobileCard` sloti qo'shilgan edi,
 * lekin slot — bu faqat TESHIK: har bir ekran o'z kartochkasini noldan
 * yozadi. Sakkizta ekran sakkizta kartochka yozsa, biz jadval muammosini
 * aynan takrorlagan bo'lardik — 26 ta jadval, 26 xil implementatsiya.
 * Shuning uchun kartochkaning SHAKLI shu yerda bir marta hal qilinadi,
 * ekranlar esa faqat MAZMUNNI beradi.
 *
 * SHAKL. Telefonda ustun sarlavhasi yo'q, shuning uchun har bir qiymat
 * o'z yorlig'ini olib yurishi kerak — aks holda "1 250 000" nima ekani
 * bilinmaydi. Lekin hamma qiymatga yorliq qo'yilsa kartochka ikki barobar
 * uzayadi. Yechim — ikki qatlam:
 *
 *   · SARLAVHA  — o'zini o'zi tushuntiradi (firma nomi, xodim ismi).
 *     Yorliqsiz, eng katta shrift.
 *   · MAYDONLAR — yorliq + qiymat juftligi, ikki ustunli tor grid.
 *
 * `meta` — sarlavha ostidagi ikkinchi darajali satr (INN, lavozim).
 * `status` — o'ng yuqoridagi nishon; u odatda qatorning "holati" bo'ladi
 * va ko'z birinchi shu yerni qidiradi.
 *
 * SENSORLI NISHON. Kartochkaning o'zi bosiladigan bo'lsa (`DataTable`
 * `onRowClick` bergan bo'lsa) balandligi 44px dan kam bo'lmasligi kerak —
 * ichki bo'shliq shuni kafolatlaydi. Kartochka ichidagi tugmalar
 * `stopPropagation` qilishi shart, aks holda qatorni ochib yuboradi.
 */

export interface MobileField {
  label: string;
  value: React.ReactNode;
  /** Butun qatorni egallasin (uzun matn — masalan izoh yoki manzil) */
  wide?: boolean;
}

export interface MobileRowCardProps {
  title: React.ReactNode;
  /** Sarlavha ostidagi ikkinchi darajali satr */
  meta?: React.ReactNode;
  /** O'ng yuqoridagi nishon — odatda holat */
  status?: React.ReactNode;
  fields?: MobileField[];
  /** Pastdagi amallar qatori */
  actions?: React.ReactNode;
  /**
   * Chap chekkadagi rangli chiziq. Rang YOLG'IZ ma'no tashimasligi uchun
   * `accentLabel` majburiy — u ekran o'quvchiga o'qiladi.
   */
  accent?: string;
  accentLabel?: string;
  /** Qator bosiladigan bo'lsa strelka ko'rsatiladi */
  chevron?: boolean;
}

export function MobileRowCard({
  title,
  meta,
  status,
  fields = [],
  actions,
  accent,
  accentLabel,
  chevron = false,
}: MobileRowCardProps) {
  const visible = fields.filter((f) => f.value !== null && f.value !== undefined && f.value !== "");

  return (
    <div className="mobile-card-cell relative flex flex-col gap-2.5 py-3 pr-3 pl-3.5">
      {accent && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
          style={{ background: accent }}
        />
      )}
      {accent && accentLabel && <span className="sr-only">{accentLabel}</span>}

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div
            className="text-body font-semibold leading-snug break-words"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </div>
          {meta && (
            <div className="text-meta mt-0.5 break-words" style={{ color: "var(--text-muted)" }}>
              {meta}
            </div>
          )}
        </div>
        {status && <div className="shrink-0">{status}</div>}
        {chevron && (
          <ChevronRight
            size={16}
            aria-hidden="true"
            className="shrink-0 mt-0.5"
            style={{ color: "var(--text-muted)" }}
          />
        )}
      </div>

      {visible.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          {visible.map((f, i) => (
            <div key={i} className={f.wide ? "col-span-2 min-w-0" : "min-w-0"}>
              <dt
                className="text-micro font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                {f.label}
              </dt>
              <dd
                className="text-meta mt-0.5 break-words"
                style={{ color: "var(--text-primary)" }}
              >
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {actions && (
        <div
          className="flex flex-wrap items-center gap-2 pt-1"
          // Amal tugmasi qatorni OCHIB YUBORMASIN. `DataTable` kartochkani
          // `onRowClick` ga bog'laydi, shuning uchun ichkaridagi bosish
          // shu yerda to'xtatiladi.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export default MobileRowCard;
