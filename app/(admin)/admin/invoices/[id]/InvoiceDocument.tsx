"use client";

// Chop etiladigan schyot.
//
// PDF kutubxonasi ATAYLAB ishlatilmadi: brauzerning o'z "Chop etish → PDF"
// oqimi shu ishni bajaradi, mijozga ketadigan hujjatning ko'rinishi esa
// oddiy HTML/CSS bo'lgani uchun tuzatish arzon. `@media print` qoidalari
// tugmalarni va ilova bezagini olib tashlaydi.

import React from "react";
import { Printer } from "lucide-react";
import { formatNum, formatUzDate } from "@/lib/format";

interface Line {
  id: string;
  description: string;
  qty: number;
  unitPrice: string | number;
  amount: string | number;
}

interface Invoice {
  id: string;
  number: string;
  period: string;
  status: string;
  total: string | number;
  note: string | null;
  cancelReason: string | null;
  issuedAt: string;
  dueAt: string | null;
  createdByName: string | null;
  lines: Line[];
  company: {
    name: string;
    inn: string;
    directorName: string | null;
    legalAddress: string | null;
  };
}

export default function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const total = Number(invoice.total);

  return (
    <div className="max-w-3xl mx-auto">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .invoice-sheet {
            background: #fff !important;
            color: #000 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .invoice-sheet * { color: #000 !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Schyot {invoice.number}
          </h1>
          {invoice.status === "cancelled" && (
            <p className="text-meta" style={{ color: "var(--danger)" }}>
              Bekor qilingan{invoice.cancelReason ? `: ${invoice.cancelReason}` : ""}
            </p>
          )}
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-micro font-semibold rounded-lg uppercase tracking-widest flex items-center gap-2"
          style={{
            color: "var(--accent-blue)",
            background: "color-mix(in srgb, var(--accent-blue) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-blue) 20%, transparent)",
          }}
        >
          <Printer size={14} /> Chop etish / PDF
        </button>
      </div>

      <div
        className="invoice-sheet p-8 rounded-xl"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }}
      >
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="text-2xl font-bold">Schyot № {invoice.number}</div>
            <div className="text-sm mt-1">{formatUzDate(invoice.issuedAt)} · {invoice.period} uchun</div>
            {invoice.dueAt && (
              <div className="text-sm">To&apos;lov muddati: {formatUzDate(invoice.dueAt)}</div>
            )}
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">ASRO</div>
            <div>Buxgalteriya autsorsing</div>
          </div>
        </div>

        <div className="mb-6 text-sm">
          <div className="font-semibold mb-1">To&apos;lovchi:</div>
          <div>{invoice.company.name}</div>
          <div>STIR: {invoice.company.inn}</div>
          {invoice.company.legalAddress && <div>{invoice.company.legalAddress}</div>}
          {invoice.company.directorName && <div>Direktor: {invoice.company.directorName}</div>}
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr style={{ borderBottom: "2px solid currentColor" }}>
              <th className="py-2 text-left">Xizmat</th>
              <th className="py-2 text-right w-16">Soni</th>
              <th className="py-2 text-right w-36">Narxi</th>
              <th className="py-2 text-right w-36">Summa</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid color-mix(in srgb, currentColor 20%, transparent)" }}>
                <td className="py-2">{l.description}</td>
                <td className="py-2 text-right tabular-nums">{l.qty}</td>
                <td className="py-2 text-right tabular-nums">{formatNum(Number(l.unitPrice))}</td>
                <td className="py-2 text-right tabular-nums">{formatNum(Number(l.amount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid currentColor" }}>
              <td className="py-3 font-bold" colSpan={3}>Jami to&apos;lovga</td>
              <td className="py-3 text-right tabular-nums font-bold text-lg">
                {formatNum(total)} so&apos;m
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.note && <div className="text-sm mb-6">Izoh: {invoice.note}</div>}

        <div className="flex justify-between items-end mt-12 text-sm">
          <div>
            <div style={{ borderTop: "1px solid currentColor", width: 200, paddingTop: 4 }}>
              Rahbar imzosi
            </div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid currentColor", width: 200, paddingTop: 4 }}>
              Bosh hisobchi imzosi
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
