"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2, Send, Ban, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatNum, formatUzDate } from "@/lib/format";
import { friendlyError } from "@/lib/actionError";
import { createInvoicesForPeriod, issueInvoice, cancelInvoice } from "@/server/invoices";

interface Row {
  id: string;
  number: string;
  period: string;
  status: string;
  companyId: string;
  companyName: string;
  total: number;
  collected: number;
  issuedAt: string;
  dueAt: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Qoralama",
  issued: "Berilgan",
  cancelled: "Bekor qilingan",
};

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

/**
 * To'lov holati schyotda SAQLANMAYDI — u shu davrdagi taqsimotlardan
 * hisoblanadi (server/invoices.ts). Shuning uchun bu yorliq ham hisoblanadi,
 * bazadagi bayroqdan o'qilmaydi.
 */
function paymentLabel(total: number, collected: number) {
  if (collected <= 0) return { text: "To'lanmagan", color: "var(--danger)" };
  if (collected + 1 < total) return { text: "Qisman", color: "var(--warning)" };
  return { text: "To'langan", color: "var(--success)" };
}

export default function InvoicesClient({
  initialPeriod,
  invoices,
}: {
  initialPeriod: string;
  invoices: Row[];
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [busy, setBusy] = useState(false);

  const filtered = invoices.filter((i) => !period || i.period === period);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await createInvoicesForPeriod(period);
      const parts = [`${res.created} ta yozildi`];
      if (res.skippedExisting) parts.push(`${res.skippedExisting} ta allaqachon bor`);
      if (res.skippedNoTerm) parts.push(`${res.skippedNoTerm} ta summasiz`);
      toast.success(parts.join(" · "));
      if (res.errors.length > 0) {
        toast.error(`${res.errors.length} ta firmada xato: ${res.errors[0].companyName} — ${res.errors[0].message}`);
      }
      router.refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = (r: Row) => {
    const reason = window.prompt(`${r.number} — bekor qilish sababi:`);
    if (!reason) return;
    act(() => cancelInvoice(r.id, reason), `${r.number} bekor qilindi`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Schyot-fakturalar
          </h1>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Satrlar xizmat katalogidan, jami esa shartnoma summasidan. To&apos;lov holati
            tushumdan hisoblanadi — schyotda saqlanmaydi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-lg text-body outline-none"
            style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }}
          />
          <Button onClick={generate} disabled={busy || !period}>
            <FilePlus2 size={16} /> Oy uchun yozish
          </Button>
        </div>
      </div>

      <div className="p-5 rounded-xl" style={card}>
        {filtered.length === 0 ? (
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>
            {period} davri uchun schyot yo&apos;q. &laquo;Oy uchun yozish&raquo; tugmasini bosing.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body">
              <thead>
                <tr className="text-meta text-left" style={{ color: "var(--text-muted)" }}>
                  <th className="py-2 pr-3">Raqam</th>
                  <th className="py-2 pr-3">Firma</th>
                  <th className="py-2 pr-3">Sana</th>
                  <th className="py-2 pr-3 text-right">Summa</th>
                  <th className="py-2 pr-3 text-right">Tushgan</th>
                  <th className="py-2 pr-3">Holat</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const pay = paymentLabel(r.total, r.collected);
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--card-border)", opacity: r.status === "cancelled" ? 0.5 : 1 }}>
                      <td className="py-2 pr-3 font-mono">
                        <Link href={`/admin/invoices/${r.id}`} className="flex items-center gap-1" style={{ color: "var(--accent-blue)" }}>
                          {r.number} <ExternalLink size={12} />
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{r.companyName}</td>
                      <td className="py-2 pr-3 text-meta" style={{ color: "var(--text-muted)" }}>
                        {formatUzDate(r.issuedAt)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold">{formatNum(r.total)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: pay.color }}>
                        {formatNum(r.collected)}
                        <span className="text-micro ml-1">{pay.text}</span>
                      </td>
                      <td className="py-2 pr-3 text-meta">{STATUS_LABELS[r.status] ?? r.status}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {r.status === "draft" && (
                          <button
                            onClick={() => act(() => issueInvoice(r.id), `${r.number} berildi`)}
                            disabled={busy}
                            title="Berilgan deb belgilash"
                            className="p-1"
                          >
                            <Send size={15} style={{ color: "var(--success)" }} />
                          </button>
                        )}
                        {r.status !== "cancelled" && (
                          <button onClick={() => cancel(r)} disabled={busy} title="Bekor qilish" className="p-1 ml-1">
                            <Ban size={15} style={{ color: "var(--danger)" }} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
