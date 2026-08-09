"use client";

// YIL YOPISH VA DAVR QULFI.
//
// `server/accounting.ts` da bu amallar allaqachon yozilgan va eng qattiq
// himoyaga ega (`requireSuperAdmin`), lekin ULARGA EKRAN YO'Q edi — ya'ni
// davrni qulflash yoki yilni yopish faqat skript orqali mumkin bo'lardi.
//
// Oy yopish sahifasining yonida turadi, chunki bir domen: oy yopiladi →
// davr LOCKED bo'ladi → yil oxirida snapshot yoziladi.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, Archive, AlertTriangle } from "lucide-react";
import { formatNum } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { lockPeriod, unlockPeriod, closeYear } from "@/server/accounting";

interface Period {
  id: string;
  year: number;
  month: number;
  status: string;
}
interface Snapshot {
  id: string;
  period: string;
  openingBalance: string | number | null;
  closingBalance: string | number | null;
  totalIncome: string | number | null;
  totalExpense: string | number | null;
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };
const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

export default function YearClosingPanel({
  year,
  periods,
  snapshots,
  isSuperAdmin,
}: {
  year: number;
  periods: Period[];
  snapshots: Snapshot[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyMonth, setBusyMonth] = useState<number | null>(null);

  const byMonth = new Map(periods.filter((p) => p.year === year).map((p) => [p.month, p]));
  const yearClosed = snapshots.some((s) => s.period === String(year));

  const run = (fn: () => Promise<unknown>, month?: number) => {
    setError(null);
    setBusyMonth(month ?? -1);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError((e as Error).message || "Amal bajarilmadi");
      } finally {
        setBusyMonth(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl overflow-hidden" style={card}>
        <div className="px-3 py-2 flex items-center justify-between" style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}>
          <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
            {year} — davr qulflari
          </h2>
          {!isSuperAdmin && (
            <span className="text-micro" style={{ color: "var(--text-muted)" }}>
              faqat superadmin o&apos;zgartiradi
            </span>
          )}
        </div>

        {error && (
          <div className="px-3 py-2 text-meta flex items-start gap-2" style={{ background: "var(--danger-bg)", color: "var(--text-secondary)" }}>
            <AlertTriangle size={15} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-3">
          {MONTHS.map((label, i) => {
            const month = i + 1;
            const p = byMonth.get(month);
            const locked = p?.status === "LOCKED";
            return (
              <div
                key={month}
                className="p-2 rounded-lg text-center"
                style={{
                  background: locked ? "var(--danger-bg)" : "var(--input-bg)",
                  border: "1px solid var(--card-border)",
                }}
              >
                <div className="text-meta font-semibold" style={{ color: "var(--text)" }}>{label}</div>
                <div className="text-micro mb-1" style={{ color: locked ? "var(--danger)" : "var(--text-muted)" }}>
                  {locked ? "yopiq" : p?.status === "CLOSING" ? "yopilmoqda" : "ochiq"}
                </div>
                {isSuperAdmin && (
                  <button
                    disabled={pending && busyMonth === month}
                    onClick={() =>
                      run(() => (locked ? unlockPeriod(year, month) : lockPeriod(year, month)), month)
                    }
                    className="text-micro font-semibold inline-flex items-center gap-1"
                    style={{ color: locked ? "var(--success)" : "var(--danger)" }}
                  >
                    {locked ? <Unlock size={11} /> : <Lock size={11} />}
                    {locked ? "ochish" : "qulflash"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={card}>
        <div className="px-3 py-2 flex items-center justify-between gap-3" style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}>
          <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>Yil yopilishlari</h2>
          {isSuperAdmin && !yearClosed && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => closeYear(year))}
            >
              <Archive size={13} /> {year} yilni yopish
            </Button>
          )}
        </div>

        {snapshots.length === 0 ? (
          <p className="p-3 text-meta" style={{ color: "var(--text-muted)" }}>
            Hali birorta yil yopilmagan. Yil yopilganda ledger butunligi tekshiriladi,
            qoldiq hisoblanadi va 12 oy qulflanadi.
          </p>
        ) : (
          <table className="w-full text-meta">
            <thead>
              <tr style={{ background: "var(--input-bg)" }}>
                <th className="text-left p-2">Davr</th>
                <th className="text-right p-2">Ochilish</th>
                <th className="text-right p-2">Kirim</th>
                <th className="text-right p-2">Chiqim</th>
                <th className="text-right p-2">Yopilish</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                  <td className="p-2 font-semibold">{s.period}</td>
                  <td className="p-2 text-right tabular-nums">{formatNum(Number(s.openingBalance ?? 0))}</td>
                  <td className="p-2 text-right tabular-nums" style={{ color: "var(--success)" }}>
                    {formatNum(Number(s.totalIncome ?? 0))}
                  </td>
                  <td className="p-2 text-right tabular-nums" style={{ color: "var(--danger)" }}>
                    {formatNum(Number(s.totalExpense ?? 0))}
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {formatNum(Number(s.closingBalance ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
