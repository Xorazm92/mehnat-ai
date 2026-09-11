"use client";

// KUNMA-KUN SVERKA MATRITSASI.
//
// Ustunlar DINAMIK (har apparat va har terminal — alohida ustun), shuning
// uchun `DataTable` emas, o'z jadvali: `DataTable` bir xil shakldagi qator
// ro'yxati uchun (`DataColumn[]` kompilyatsiya vaqtida ma'lum), bu yerda esa
// ustunlar MA'LUMOTDAN hosil bo'ladi va har terminal ikkita ustun beradi.
//
// ⚠️ XOM `<table>` ISTISNOSI — ESLint `RAW_TABLE_RULE` ruxsat bergan yo'l:
// jadval `.erp-table` sinfi bilan yoziladi va SABABI shu izohda turadi
// (yuqoridagi xatboshi). `.erp-table` pul ustunlariga `tabular-nums` beradi,
// ya'ni `DataTable` dan olinmagan yagona narsa — saralash va CSV eksporti,
// ular esa pivot to'rda ma'noga ega emas.
//
// Har terminal uchun IKKI ustun beriladi — FAKT va BRUTTO. Faqat faktni
// ko'rsatish har kuni komissiya hajmida soxta "kamomad" chizardi; faqat
// bruttoni ko'rsatish esa "hisobga qancha tushdi" savolini javobsiz
// qoldirardi. Buxgalterga ikkalasi ham kerak.

import React from "react";
import { EmptyState, Money } from "@/components/ui";
import { formatUzDate } from "@/lib/platform/format";
import type { SverkaDay } from "@/lib/pos/reconcile";
import { AlertTriangle, Scale } from "lucide-react";

/**
 * Bu jadval `SverkaDay` ning FAQAT BIR QISMINI ishlatadi (`kassaCash` va
 * `byChannel` bu yerda chizilmaydi), shuning uchun tor shartnoma qoladi.
 *
 * Lekin u QO'LDA QAYTA YOZILMAYDI — `Pick` orqali manbaga bog'lanadi.
 * Ilgari bu interfeys `lib/pos/reconcile.ts` dagi maydonlarning nusxasi edi:
 * manbada maydon nomi o'zgarsa yoki olib tashlansa, bu yerda hech narsa
 * sezilmasdi va komponent mavjud bo'lmagan maydonni o'qishda `undefined`
 * chizardi. Endi bunday o'zgarish kompilyatsiya xatosi beradi.
 */
export type MatrixDay = Pick<
  SverkaDay,
  | "date"
  | "byDevice"
  | "kassaCard"
  | "byTerminal"
  | "bankFact"
  | "bankGross"
  | "commission"
  | "diff"
  | "diffFact"
  | "approximateDate"
>;

interface Props {
  days: MatrixDay[];
  devices: { id: string; label: string }[];
  terminals: { id: string; code: string; label: string | null }[];
  totals: { kassaCard: number; bankFact: number; bankGross: number; commission: number; diff: number; diffFact: number };
}

const cell = "px-2 py-1.5 whitespace-nowrap text-right tabular-nums";
const head = "px-2 py-2 text-micro font-semibold uppercase tracking-wide whitespace-nowrap";

export default function SverkaMatrix({ days, devices, terminals, totals }: Props) {
  if (days.length === 0) {
    // Bo'sh holat `EmptyState` bilan: ilgari bu bitta kulrang jumla edi va
    // "sahifa yuklanmadi" bilan "bu davrda ma'lumot yo'q" farqi bilinmasdi.
    // KASSA_START_PERIOD dan oldingi davr uchun ma'lumot BO'LMASLIGI normal —
    // bu xato emas.
    return (
      <div className="rounded-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <EmptyState
          icon={<Scale size={28} />}
          title="Bu davr uchun solishtiruv ma'lumoti yo'q"
          description="Kassa (fiskal) hisobotini yuklang va vipiskadan tushumni ajrating — shundan keyin kunma-kun jadval shu yerda chiziladi. Yuqoridagi sana oralig'ini kengaytirib ham ko'ring."
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
      <table className="erp-table w-full text-meta border-collapse">
        {/* `DataTable` da `caption` majburiy; bu jadval dinamik ustunli
            pivot bo'lgani uchun qo'lda qoladi — lekin nomsiz qolmaydi. */}
        <caption className="sr-only">
          Kunlar bo&apos;yicha kassa apparatlari va terminallar sverkasi
        </caption>
        <thead style={{ background: "var(--input-bg)" }}>
          <tr style={{ color: "var(--text-secondary)" }}>
            <th scope="col" className={`${head} text-left sticky left-0 z-10`} style={{ background: "var(--input-bg)" }}>
              Sana
            </th>
            {devices.map((d) => (
              <th key={d.id} scope="col" className={`${head} text-right`} title={d.label}>
                {d.label}
              </th>
            ))}
            <th scope="col" className={`${head} text-right`} style={{ color: "var(--accent-blue)" }}>
              Jami kassa
            </th>
            {terminals.map((t) => (
              <th key={t.id} scope="colgroup" colSpan={2} className={`${head} text-center`} style={{ borderLeft: "1px solid var(--card-border)" }}>
                {t.label || t.code}
              </th>
            ))}
            <th scope="col" className={`${head} text-right`}>Bank fakt</th>
            <th scope="col" className={`${head} text-right`}>Bank brutto</th>
            <th scope="col" className={`${head} text-right`}>Komissiya</th>
            <th scope="col" className={`${head} text-right`} style={{ color: "var(--accent-blue)" }}>
              Farq
            </th>
          </tr>
          {terminals.length > 0 && (
            <tr style={{ color: "var(--text-secondary)" }}>
              <th className={head} />
              {devices.map((d) => (
                <th key={d.id} className={head} />
              ))}
              <th className={head} />
              {terminals.map((t) => (
                <React.Fragment key={t.id}>
                  <th scope="col" className={`${head} text-right`} style={{ borderLeft: "1px solid var(--card-border)" }}>
                    fakt
                  </th>
                  <th scope="col" className={`${head} text-right`}>brutto</th>
                </React.Fragment>
              ))}
              <th className={head} />
              <th className={head} />
              <th className={head} />
              <th className={head} />
            </tr>
          )}
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} style={{ borderTop: "1px solid var(--card-border)" }}>
              <th scope="row" className="px-2 py-1.5 whitespace-nowrap text-left font-normal sticky left-0 z-10" style={{ background: "var(--card-bg)" }}>
                <span className="inline-flex items-center gap-1">
                  {formatUzDate(d.date)}
                  {/* Sanasi tafsilotda YO'Q tushum shu kunga hujjat sanasi
                      bo'yicha tushgan — kunlik farq shartli, buni yashirmaymiz. */}
                  {d.approximateDate && (
                    <AlertTriangle size={12} style={{ color: "var(--accent-amber)" }} aria-label="Sana hujjatdan olingan" />
                  )}
                </span>
              </th>
              {devices.map((dev) => (
                <td key={dev.id} className={cell}>
                  <Money value={d.byDevice[dev.id] ?? 0} dashIfZero tone="muted" />
                </td>
              ))}
              <td className={cell}>
                <Money value={d.kassaCard} dashIfZero bold />
              </td>
              {terminals.map((t) => {
                const v = d.byTerminal[t.id];
                return (
                  <React.Fragment key={t.id}>
                    <td className={cell} style={{ borderLeft: "1px solid var(--card-border)" }}>
                      <Money value={v?.fact ?? 0} dashIfZero tone="muted" />
                    </td>
                    <td className={cell}>
                      <Money value={v?.gross ?? 0} dashIfZero tone="muted" />
                    </td>
                  </React.Fragment>
                );
              })}
              <td className={cell}>
                <Money value={d.bankFact} dashIfZero />
              </td>
              <td className={cell}>
                <Money value={d.bankGross} dashIfZero bold />
              </td>
              <td className={cell}>
                <Money value={d.commission} dashIfZero tone="muted" />
              </td>
              <td className={cell}>
                <Money value={d.diff} dashIfZero bold showSign tone={d.diff > 0 ? "out" : "in"} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--text-primary)", background: "var(--input-bg)" }}>
            <th scope="row" className="px-2 py-2 font-semibold text-left sticky left-0 z-10" style={{ background: "var(--input-bg)" }}>
              Jami
            </th>
            {devices.map((dev) => (
              <td key={dev.id} className={`${cell} font-semibold`}>
                <Money value={days.reduce((s, d) => s + (d.byDevice[dev.id] ?? 0), 0)} dashIfZero />
              </td>
            ))}
            <td className={`${cell} font-semibold`}>
              <Money value={totals.kassaCard} bold />
            </td>
            {terminals.map((t) => (
              <React.Fragment key={t.id}>
                <td className={`${cell} font-semibold`} style={{ borderLeft: "1px solid var(--card-border)" }}>
                  <Money value={days.reduce((s, d) => s + (d.byTerminal[t.id]?.fact ?? 0), 0)} dashIfZero />
                </td>
                <td className={`${cell} font-semibold`}>
                  <Money value={days.reduce((s, d) => s + (d.byTerminal[t.id]?.gross ?? 0), 0)} dashIfZero />
                </td>
              </React.Fragment>
            ))}
            <td className={`${cell} font-semibold`}>
              <Money value={totals.bankFact} />
            </td>
            <td className={`${cell} font-semibold`}>
              <Money value={totals.bankGross} bold />
            </td>
            <td className={`${cell} font-semibold`}>
              <Money value={totals.commission} />
            </td>
            <td className={`${cell} font-semibold`}>
              <Money value={totals.diff} bold showSign tone={totals.diff > 0 ? "out" : "in"} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
