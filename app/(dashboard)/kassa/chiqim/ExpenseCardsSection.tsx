"use client";

// XODIM KARTALARI — qoldiq, jurnal va bog'lanmagan o'tkazmalar.
//
// Karta TRANZIT hisobi: kartaga o'tkazilgan pul korxonadan CHIQMAGAN, u
// faqat xodim cho'ntagida. Shuning uchun bu ekran ikki savolga javob
// beradi: qaysi kartada qancha qoldiq bor va qaysi o'tkazma hali
// kartaga bog'lanmagan.
//
// NEGA BITTA KOMPONENT. Ilgari bu ikki blok `ChiqimKassaClient` da
// AJRALIB turardi: birinchisi 487-qatorda, ikkinchisi 804-qatorda, orasida
// esa boshqa yorliqlarning (navbat, xo'jalik, xarajat, oylik) JSX'i
// yotardi. Ikkalasi ham AYNAN bir xil shart (`tab === "kartalar"`) ostida
// chizilar, lekin faylni o'qiyotgan odam buni faqat ikkinchisiga
// yetganda bilardi.

import React from "react";
import { ArrowDownRight, ArrowUpRight, CreditCard, Link2, ListChecks, Play, Snowflake, Wand2 } from "lucide-react";
import { Badge, DataTable, EmptyState, Money, type DataColumn } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { CHANNEL_TYPE_LABELS, type ChannelType } from "@/lib/transitChannels";
import {
  setChannelActive,
  autoCreateChannelsFromStatements,
  spendFromChannel,
  linkCardTransfer,
} from "@/server/transit";
import ExpenseManualForm from "./ExpenseManualForm";
import type { Channel, LedgerRow, UnlinkedTransfer } from "./types";

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

export interface ExpenseCardsSectionProps {
  channels: Channel[];
  active: Channel[];
  unlinked: UnlinkedTransfer[];
  busy: boolean;
  /** Ochilgan jurnal — kanal id yoki `null`. */
  openLedger: string | null;
  ledger: LedgerRow[];
  ledgerColumns: DataColumn<LedgerRow>[];
  onToggleLedger: (channelId: string) => void;
  /** Kartadan sarf formasi ochiq bo'lgan kanal (`null` — yopiq). */
  spendFor: Channel | null;
  onSpend: (channel: Channel | null) => void;
  /**
   * Server amalini ishga tushiruvchi umumiy o'ramchi (`busy`, xato va toast
   * shu yerda hal qilinadi). Ataylab prop sifatida uzatiladi: uni bu yerda
   * qayta yozish ikkita xato ko'rsatish yo'lini hosil qilardi.
   */
  run: <T,>(fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, okMsg?: string) => Promise<T | null | undefined>;
}

export default function ExpenseCardsSection({
  channels,
  active,
  unlinked,
  busy,
  openLedger,
  ledger,
  ledgerColumns,
  onToggleLedger,
  spendFor,
  onSpend,
  run,
}: ExpenseCardsSectionProps) {
  return (
    <>
      {/* Kanallar */}
      <div className="space-y-2">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Kanallar ({channels.length})
        </h2>
        {channels.length === 0 ? (
          <div className="rounded-xl" style={card}>
            <EmptyState
              icon={<CreditCard size={28} />}
              title="Kanal yo'q"
              description="Xodim kartalarini vipiskadan avtomatik aniqlash mumkin."
              action={
                <Button variant="secondary" size="sm" disabled={busy}
                  onClick={() => run(() => autoCreateChannelsFromStatements(), "Vipiskadan kanallar aniqlandi")}>
                  <Wand2 size={14} /> Vipiskadan aniqlash
                </Button>
              }
            />
          </div>
        ) : (
          channels.map((c) => (
            <div key={c.id} className="rounded-xl overflow-hidden" style={card}>
              <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CreditCard size={15} style={{ color: "var(--text-muted)" }} />
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{c.label}</span>
                    {c.cardMask && (
                      <span className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>{c.cardMask}</span>
                    )}
                    <Badge tone="neutral">{CHANNEL_TYPE_LABELS[c.type as ChannelType] ?? c.type}</Badge>
                    {!c.isActive && <Badge tone="warning" icon={<Snowflake size={11} />}>Muzlatilgan</Badge>}
                  </div>
                  <div className="text-micro mt-1" style={{ color: "var(--text-muted)" }}>
                    {c.employeeName ? `${c.employeeName} · ` : ""}
                    {c.entryCount} ta harakat
                    {c.lastMovementAt ? ` · oxirgisi ${formatUzDate(c.lastMovementAt)}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-micro" style={{ color: "var(--text-muted)" }}>Qoldiq</div>
                    <div className="text-lg font-semibold tabular-nums" style={{ color: c.balance < 0 ? "var(--danger)" : c.balance > 0 ? "var(--success)" : "var(--text)" }}>
                      {formatNum(c.balance)}
                    </div>
                  </div>
                  <div className="text-right text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                    <div><ArrowDownRight size={11} className="inline" /> {formatNum(c.totalIn)}</div>
                    <div><ArrowUpRight size={11} className="inline" /> {formatNum(c.totalOut)}</div>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-3 flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => onToggleLedger(c.id)}>
                  {openLedger === c.id ? "Tarixni yopish" : "Tarix"}
                </Button>
                {c.isActive && (
                  <Button variant="primary" size="sm" disabled={busy} onClick={() => onSpend(c)}>
                    Xarajat yozish
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => setChannelActive(c.id, !c.isActive), c.isActive ? "Muzlatildi" : "Qayta yoqildi")}
                >
                  {c.isActive ? <><Snowflake size={13} /> Muzlatish</> : <><Play size={13} /> Yoqish</>}
                </Button>
              </div>

              {openLedger === c.id && (
                <div style={{ borderTop: "1px solid var(--card-border)" }}>
                  <DataTable
                    rows={ledger}
                    columns={ledgerColumns}
                    rowKey={(e) => e.id}
                    caption={`${c.label} kanalining pul harakati`}
                    // Kanal kartochkasi ICHIDA — o'z balandligi bilan cheklanmaydi,
                    // aks holda kartochka ichida ikkinchi aylantirish paydo bo'lardi.
                    maxBodyHeight={null}
                    density="compact"
                    emptyTitle="Harakat yo'q"
                    emptyDescription="Bu kanalda hali kirim ham, sarf ham qayd etilmagan."
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Xarajat yozish */}
      {spendFor && (
        <ExpenseManualForm
          key={spendFor.id}
          channel={spendFor}
          busy={busy}
          onCancel={() => onSpend(null)}
          onSave={async (payload) => {
            const res = await run(
              () => spendFromChannel({ ...payload, channelId: spendFor.id }),
              "Xarajat yozildi"
            );
            if (res !== null) onSpend(null);
          }}
        />
      )}

      {/* Bog'lanmagan karta o'tkazmalari */}
      <div className="space-y-2">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Bog&apos;lanmagan karta o&apos;tkazmalari ({unlinked.length})
        </h2>
        {unlinked.length === 0 ? (
          <div className="rounded-xl" style={card}>
            <EmptyState
              icon={<ListChecks size={28} />}
              title="Hammasi bog'langan"
              description="Karta o'tkazmalarining barchasi o'z kanaliga biriktirilgan."
            />
          </div>
        ) : (
          <div className="space-y-2">
            {unlinked.map((t) => (
              <div key={t.id} className="p-3 rounded-xl flex items-center justify-between gap-3 flex-wrap" style={card}>
                <div className="min-w-0">
                  <div className="font-semibold" style={{ color: "var(--text)" }}>
                    {t.holderName ?? "Nomsiz"}{" "}
                    {t.cardMask && (
                      <span className="text-micro tabular-nums font-normal" style={{ color: "var(--text-muted)" }}>{t.cardMask}</span>
                    )}
                  </div>
                  <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                    {formatUzDate(t.valueDate)} · {t.accountLabel}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold tabular-nums whitespace-nowrap">
                    <Money value={-Math.abs(Number(t.amount))} tone="out" bold />
                  </span>
                  <Select
                    size="sm"
                    fullWidth={false}
                    defaultValue=""
                    disabled={busy}
                    placeholder="Kanalni tanlang…"
                    aria-label={`${t.holderName ?? "Nomsiz"} o'tkazmasini kanalga bog'lash`}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      void run(
                        () => linkCardTransfer({ transactionId: t.id, channelId: e.target.value }),
                        "Kanalga bog'landi"
                      );
                    }}
                  >
                    {active.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}{c.cardMask ? ` (${c.cardMask})` : ""}
                      </option>
                    ))}
                  </Select>
                  <Link2 size={14} style={{ color: "var(--text-muted)" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
