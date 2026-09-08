"use client";

// OY × KANAL KESIMI.
//
// Asosiy jadval "kassa apparati jami ↔ bank jami" savoliga javob beradi.
// Buxgalterning keyingi savoli esa doim bir xil: "farq QAYSI kanalda?".
// Shu jadval aynan shuni ko'rsatadi — har oy, har kanal uchun ikki tomon
// yonma-yon.
//
// IKKI TOMON MUSTAQIL:
//   kassa tomoni — apparatning to'lov turi kesimi (`FiscalDailyReport.channels`);
//   bank tomoni  — o'sha kanalning ekvayring tushumi (doiradagi terminallar).
//
// Shuning uchun "kassa 0" ikki xil ma'noni bildiradi va ular ARALASHTIRILMAYDI:
// kesim hisoboti hali yuklanmagan (kamomad emas) yoki chindan ham savdo yo'q.
// Birinchisini "kamomad" deb ko'rsatish soxta trevoga bo'lardi.

import { useState, useTransition } from "react";
import { Badge, Button, DataTable, Money, type DataColumn } from "@/components/ui";
import { CHANNEL_LABELS } from "@/lib/pos/classifySettlement";
import type { PosChannel } from "@/lib/pos/types";
import { writeSheet } from "@/lib/exportTable";
import { friendlyError } from "@/lib/actionError";
import { Download, Layers } from "lucide-react";

export interface ChannelTotalsView {
  kassa: number;
  bankFact: number;
  bankGross: number;
  commission: number;
  diff: number;
}

interface MonthTotals {
  kassaCard: number;
  bankGross: number;
  commission: number;
  diff: number;
  byChannel: Partial<Record<PosChannel, ChannelTotalsView>>;
}

interface Props {
  months: { month: string; totals: MonthTotals }[];
  rangeLabel: string;
}

/** Farq shu chegaradan kichik bo'lsa "mos" deb qaraladi (yaxlitlash qoldig'i). */
const EPSILON = 1;

type Status = "matched" | "no_breakdown" | "bank_missing" | "diff";

interface Row {
  key: string;
  month: string;
  channel: PosChannel;
  label: string;
  kassa: number;
  bankGross: number;
  commission: number;
  diff: number;
  status: Status;
}

const STATUS_VIEW: Record<Status, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  matched: { label: "Mos", tone: "success" },
  // ATAYIN "kamomad" emas: kesim yuklanmagan bo'lsa kassa tomoni bo'sh
  // ko'rinadi va uni yo'qolgan pul deb belgilash noto'g'ri bo'lardi.
  no_breakdown: { label: "Kesim yo'q", tone: "neutral" },
  bank_missing: { label: "Bankka tushmagan", tone: "danger" },
  diff: { label: "Farq", tone: "warning" },
};

function statusOf(kassa: number, bankGross: number, diff: number): Status {
  if (kassa === 0 && bankGross > 0) return "no_breakdown";
  if (bankGross === 0 && kassa > 0) return "bank_missing";
  return Math.abs(diff) < EPSILON ? "matched" : "diff";
}

/** Oy × kanal qatorlari: oy tartibida, oy ichida kanal nomi bo'yicha. */
function buildRows(months: Props["months"]): Row[] {
  const rows: Row[] = [];
  for (const m of months) {
    const entries = Object.entries(m.totals.byChannel) as [PosChannel, ChannelTotalsView][];
    entries.sort(([a], [b]) => (CHANNEL_LABELS[a] ?? a).localeCompare(CHANNEL_LABELS[b] ?? b));
    for (const [channel, t] of entries) {
      rows.push({
        key: `${m.month}|${channel}`,
        month: m.month,
        channel,
        label: CHANNEL_LABELS[channel] ?? channel,
        kassa: t.kassa,
        bankGross: t.bankGross,
        commission: t.commission,
        diff: t.diff,
        status: statusOf(t.kassa, t.bankGross, t.diff),
      });
    }
  }
  return rows;
}

const COLUMNS: DataColumn<Row>[] = [
  { key: "month", header: "Oy", cell: (r) => r.month, sortValue: (r) => r.month, sticky: true, mobile: "title" },
  { key: "channel", header: "Kanal", cell: (r) => r.label, sortValue: (r) => r.label },
  {
    key: "kassa",
    header: "Kassa",
    cell: (r) => <Money value={r.kassa} dashIfZero />,
    sortValue: (r) => r.kassa,
    numeric: true,
    align: "right",
  },
  {
    key: "bank",
    header: "Bank (brutto)",
    cell: (r) => <Money value={r.bankGross} dashIfZero />,
    sortValue: (r) => r.bankGross,
    numeric: true,
    align: "right",
  },
  {
    key: "commission",
    header: "Komissiya",
    cell: (r) => <Money value={r.commission} dashIfZero tone="muted" />,
    sortValue: (r) => r.commission,
    numeric: true,
    align: "right",
  },
  {
    key: "diff",
    header: "Farq",
    // Ishora asosiy jadval bilan bir xil: musbat = bankka yetib bormagan.
    cell: (r) => <Money value={r.diff} dashIfZero bold showSign tone={r.diff > 0 ? "out" : "in"} />,
    sortValue: (r) => r.diff,
    numeric: true,
    align: "right",
  },
  {
    key: "status",
    header: "Holat",
    cell: (r) => {
      const v = STATUS_VIEW[r.status];
      return <Badge tone={v.tone} dot>{v.label}</Badge>;
    },
    sortValue: (r) => r.status,
    mobile: "status",
  },
];

export default function ChannelMatrix({ months, rangeLabel }: Props) {
  const rows = buildRows(months);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (rows.length === 0) return null;

  // Eksport ekrandagi UZUN shakldan emas, KENG shakldan chiqadi: buxgalter
  // Excelda oyni bitta qator qilib ko'radi va kanallarni yonma-yon
  // solishtiradi. Ekranda esa kanal soni ustunlarni sig'dirmaydi.
  const channels = [...new Set(rows.map((r) => r.channel))].sort((a, b) =>
    (CHANNEL_LABELS[a] ?? a).localeCompare(CHANNEL_LABELS[b] ?? b),
  );

  function exportWide() {
    setErr(null);
    startTransition(async () => {
      try {
        const header = [
          "Oy",
          ...channels.flatMap((c) => {
            const l = CHANNEL_LABELS[c] ?? c;
            return [`${l} · kassa`, `${l} · bank`, `${l} · farq`];
          }),
          "Kassa (karta jami)",
          "Bank brutto jami",
          "Komissiya jami",
          "Farq jami",
        ];
        const body = months.map((m) => [
          m.month,
          ...channels.flatMap((c) => {
            const t = m.totals.byChannel[c];
            return [t?.kassa ?? 0, t?.bankGross ?? 0, t?.diff ?? 0];
          }),
          m.totals.kassaCard,
          m.totals.bankGross,
          m.totals.commission,
          m.totals.diff,
        ]);
        await writeSheet(header, body, `sverka-kanallar-${rangeLabel}`, "Oy x Kanal");
      } catch (e) {
        // Xom `Error.message` ekranga chiqmaydi: prod'da u Next'ning
        // inglizcha matni bo'lib qoladi (`lib/actionError.spec.ts`).
        setErr(friendlyError(e, "Faylni tayyorlab bo'lmadi"));
      }
    });
  }

  return (
    <div className="rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-meta font-semibold flex items-center gap-1.5">
          <Layers size={14} />
          Oy × kanal kesimi
        </h3>
        <Button variant="secondary" onClick={exportWide} disabled={pending}>
          <Download size={14} />
          Excel
        </Button>
      </div>
      <p className="text-micro mb-2" style={{ color: "var(--text-secondary)" }}>
        Kassa ustuni — apparatning to&apos;lov turi kesimi, bank ustuni — o&apos;sha kanalning ekvayring tushumi
        (brutto, komissiyagacha). Kesim hisoboti yuklanmagan kanal &quot;Kesim yo&apos;q&quot; bo&apos;lib turadi —
        bu kamomad emas. Kanal qatorlari kassa karta jamisining ichki bo&apos;lagi, ular qo&apos;shilmaydi.
      </p>
      {err && (
        <p className="text-micro mb-2" style={{ color: "var(--accent-red)" }}>
          Eksport qilinmadi: {err}
        </p>
      )}
      <DataTable
        rows={rows}
        columns={COLUMNS}
        rowKey={(r) => r.key}
        caption="Oylar va to'lov kanallari bo'yicha kassa va bank solishtiruvi"
        maxBodyHeight={null}
        density="compact"
        emptyTitle="Kanal kesimi yo'q"
      />
    </div>
  );
}
