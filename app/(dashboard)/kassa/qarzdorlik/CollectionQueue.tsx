"use client";

// =====================================================
// "BUGUN PUL MASALASINI GAPLASHISH KERAK"
// =====================================================
//
// Qarzdorlik ekrani qarz SUMMASINI ko'rsatardi, lekin u bilan nima
// qilinganini emas. Natijada ro'yxat har kuni bir xil turar va rahbar uni
// signal emas, shovqin deb o'qirdi.
//
// Bu blok HARAKAT ro'yxati: gaplashilgan firma keyingi suhbat sanasigacha
// ro'yxatdan chiqadi, ya'ni ro'yxat kun davomida qisqaradi.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import { setDebtContact } from "@/server/debt";
import { Field } from "@/components/ui/Field";
import { DateField } from "@/components/ui/DateField";

interface QueueRow {
  companyId: string;
  name: string;
  inn: string;
  outstanding: number;
  overdue: number;
  dueNow: number;
  monthsOverdue: number;
  lastPaidPeriod: string | null;
  accountantName: string | null;
  contactedAt?: string | null;
  nextContactAt?: string | null;
  contactNote?: string | null;
}

interface Props {
  rows: QueueRow[];
  totals: { companies: number; overdue: number; dueNow: number; neverContacted: number };
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

/**
 * Boshida nechta firma ko'rsatiladi. 12 — ekranning bir "sahifasi": undan
 * pastdagi bloklar (eskirish matritsasi, to'lovlar) ko'rinish maydonidan
 * chiqib ketmaydi. Ro'yxat eng katta qarzdan saralangani uchun birinchi
 * o'nlik aynan bugungi ish.
 */
const PREVIEW_COUNT = 12;

export default function CollectionQueue({ rows, totals }: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [nextAt, setNextAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const submit = async (companyId: string) => {
    setBusy(true);
    setError(null);
    try {
      await setDebtContact({ companyId, nextContactAt: nextAt || null, note: note || null });
      setOpenId(null);
      setNote("");
      setNextAt("");
      router.refresh();
    } catch (e) {
      setError(friendlyError(e) || "Saqlab bo'lmadi");
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="p-4 rounded-xl" style={card}>
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Bugun pul masalasini gaplashish kerak
        </h2>
        <p className="text-meta mt-1" style={{ color: "var(--text-muted)" }}>
          Bugunga bog&apos;lanish kerak bo&apos;lgan firma yo&apos;q.
        </p>
      </div>
    );
  }

  // KO'RSATILADIGAN QATORLAR SONI.
  //
  // Ilgari bu ro'yxat BARCHA qatorni (prodda 228 ta) to'liq kartochka
  // ko'rinishida chizardi — har biri ~70px, ya'ni 16 000px lik devor. Sahifada
  // undan pastda yana ikkita blok bor edi va ularga umuman yetib bo'lmasdi;
  // undirish navbati esa PRIORITET ro'yxati — u eng katta qarzdan boshlab
  // saralangan, ya'ni pastki 200 tasi bugungi ish emas.
  const visible = showAll ? rows : rows.slice(0, PREVIEW_COUNT);
  const hidden = rows.length - visible.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Bugun pul masalasini gaplashish kerak ({totals.companies})
        </h2>
        <div className="flex items-center gap-3 text-meta" style={{ color: "var(--text-secondary)" }}>
          <span>
            Muddati o&apos;tgan:{" "}
            <b className="tabular-nums" style={{ color: "var(--danger)" }}>
              {formatNum(totals.overdue)}
            </b>{" "}
            so&apos;m
          </span>
          {totals.neverContacted > 0 && (
            <span style={{ color: "var(--text-muted)" }}>
              {totals.neverContacted} tasi bilan hech gaplashilmagan
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="p-2 rounded-lg text-meta" style={{ ...card, color: "var(--danger)" }}>{error}</p>
      )}

      <div className="rounded-xl overflow-hidden" style={card}>
        <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
          {visible.map((r) => (
            <div key={r.companyId} className="p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold truncate" style={{ color: "var(--text)" }}>
                    {r.name}
                    <span className="text-micro ml-2" style={{ color: "var(--text-muted)" }}>
                      {r.inn}
                    </span>
                  </p>
                  <p className="text-micro mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {r.monthsOverdue > 0 ? `${r.monthsOverdue} oylik qarz · ` : ""}
                    oxirgi to&apos;lov: {r.lastPaidPeriod ?? "hech qachon"}
                    {r.accountantName ? ` · ${r.accountantName}` : ""}
                  </p>
                  <p className="text-micro mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {r.contactedAt
                      ? `oxirgi suhbat: ${formatUzDate(r.contactedAt)}`
                      : "hech gaplashilmagan"}
                    {r.contactNote ? ` · ${r.contactNote}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div
                      className="font-bold tabular-nums"
                      style={{ color: r.overdue > 0 ? "var(--danger)" : "var(--text)" }}
                    >
                      {formatNum(r.overdue > 0 ? r.overdue : r.dueNow)}
                    </div>
                    <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                      {r.overdue > 0 ? "muddati o'tgan" : "shu oy yig'iladi"}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setOpenId(openId === r.companyId ? null : r.companyId);
                      setNote("");
                      setNextAt("");
                    }}
                  >
                    <Phone size={14} /> Gaplashildi
                  </Button>
                </div>
              </div>

              {openId === r.companyId && (
                <div
                  className="mt-3 p-3 rounded-lg space-y-2"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Field label="Keyingi suhbat" hint="Bo'sh qoldirilsa — 7 kundan keyin">
                      <DateField value={nextAt} onChange={setNextAt} />
                    </Field>
                    <Field label="Nima kelishildi">
                      <input
                        className="erp-input w-full"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="15-sanagacha to'laydi"
                      />
                    </Field>
                  </div>
                  <Button variant="primary" size="sm" disabled={busy} onClick={() => submit(r.companyId)}>
                    {busy ? "Saqlanmoqda…" : "Saqlash"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {(hidden > 0 || showAll) && rows.length > PREVIEW_COUNT && (
          <div style={{ borderTop: "1px solid var(--card-border)" }}>
            <Button variant="ghost" fullWidth onClick={() => setShowAll(!showAll)}>
              {showAll
                ? `Faqat birinchi ${PREVIEW_COUNT} tasini ko'rsatish`
                : `Yana ${hidden} ta firmani ko'rsatish`}
            </Button>
          </div>
        )}
      </div>

      <p className="text-micro flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        <AlertTriangle size={12} /> Gaplashilgan firma keyingi suhbat sanasigacha bu
        ro&apos;yxatdan chiqadi.
      </p>
    </div>
  );
}
