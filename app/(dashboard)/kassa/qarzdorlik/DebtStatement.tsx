"use client";

// HISOB-KITOB VARAQASI — "shu mijoz bilan ahvolimiz qanday?"
//
// Beshta ustun va ular bir-birini almashtira olmaydi:
//   Boshi      — davr boshidagi sof qoldiq
//   Hisoblandi — davr ichida yozilgan xizmat haqi
//   To'landi   — davr ichida kelgan pul
//   Qarz/Avans — davr oxiridagi holat
//
// NEGA "HISOBLANDI" ALOHIDA HISOBLANADI: ikki kesim farqi o'z-o'zicha
// hisoblanma emas — u ikki narsaning yig'indisi (xizmat haqi qarzni
// oshiradi, to'lov kamaytiradi). Faqat farqni ko'rsatgan variant
// 01.08→07.08 juftligida "Hisoblandi −420 mln" degan ma'nosiz raqam
// berardi. Endi: hisoblanma = (yopilish − ochilish) + to'langan.
//
// QARZ VA AVANS ATAYIN ALOHIDA USTUN. Bitta mijozda bir shartnomada qarz,
// boshqasida avans bo'lishi mumkin (Alfraganus: doimiy xizmatda 8 mln qarz,
// bir martalikda 20 mln avans). Qo'shib yuborish "bu mijoz avans bergan"
// degan yolg'on xulosa berardi, holbuki doimiy xizmat bo'yicha u QARZDOR.
//
// MIJOZ BO'YICHA GURUHLANGAN. Shartnoma darajasi 251 qator beradi va uni
// bir ekranda o'qib bo'lmaydi; rahbarning savoli esa MIJOZ haqida.
// Shartnoma tafsiloti qatorni bosganda ochiladi.

import React, { useMemo, useState } from "react";
import { usePageSize } from "@/hooks/usePageSize";
import { useTableState } from "@/hooks/useTableState";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import {
  Badge, DataTable, Drawer, EmptyState, IdentityCell, Money, StatStrip, TableToolbar,
  type DataColumn, type StatItem,
} from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Scale, AlertTriangle, ChevronRight } from "lucide-react";

type Kind = "BK" | "RK" | "unknown";

interface Line {
  contractNumber: string | null;
  contractRaw: string | null;
  kind: Kind;
  kindLabel: string;
  ownFirmName: string | null;
  opening: number;
  accrued: number;
  debt: number;
  advance: number;
}

interface Customer {
  customerName: string;
  companyId: string | null;
  companyInn: string | null;
  opening: number;
  accrued: number;
  paid: number;
  debt: number;
  advance: number;
  lines: Line[];
}

export interface DebtStatementData {
  openingAsOf: string | null;
  closingAsOf: string | null;
  availableDates: string[];
  customers: Customer[];
  totals: { opening: number; accrued: number; paid: number; debt: number; advance: number };
  byKind: { kind: Kind; label: string; count: number; debt: number; advance: number; accrued: number }[];
  hasPayments: boolean;
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

const KIND_TONE: Record<Kind, string> = {
  BK: "var(--accent-blue)",
  RK: "var(--accent-green)",
  unknown: "var(--text-muted)",
};

/** Yon paneldagi shartnoma qatorlari. */
const LINE_COLUMNS: DataColumn<Line>[] = [
  {
    key: "contract",
    header: "Shartnoma",
    cell: (l) => (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span style={{ color: "var(--text-primary)" }}>{l.contractNumber ?? "Shartnomasiz"}</span>
        <span
          className="px-1.5 py-0.5 rounded text-micro font-semibold"
          style={{ background: "var(--bg-sunken)", color: KIND_TONE[l.kind] }}
        >
          {l.kindLabel}
        </span>
        {l.ownFirmName && (
          <span className="text-micro" style={{ color: "var(--text-muted)" }}>{l.ownFirmName}</span>
        )}
      </span>
    ),
    sortValue: (l) => l.contractNumber ?? "",
    sticky: true,
    mobile: "title",
  },
  {
    key: "opening",
    header: "Boshi",
    cell: (l) => <Money value={l.opening} tone="muted" dashIfZero />,
    sortValue: (l) => l.opening,
    numeric: true,
    align: "right",
  },
  {
    key: "accrued",
    header: "Hisoblandi",
    cell: (l) => <Money value={l.accrued} tone="auto" dashIfZero />,
    sortValue: (l) => l.accrued,
    numeric: true,
    align: "right",
  },
  {
    key: "debt",
    header: "Qarz",
    cell: (l) => <Money value={l.debt} tone="out" dashIfZero bold />,
    sortValue: (l) => l.debt,
    numeric: true,
    align: "right",
  },
  {
    key: "advance",
    header: "Avans",
    cell: (l) => <Money value={l.advance} tone="in" dashIfZero bold />,
    sortValue: (l) => l.advance,
    numeric: true,
    align: "right",
  },
];

export default function DebtStatement({ statement: s }: { statement: DebtStatementData }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [kind, setKind] = useState<Kind | "all">("all");
  /** Ochilgan mijoz — shartnoma tafsiloti yon panelda. */
  const [detail, setDetail] = useState<Customer | null>(null);
  const table = useTableState({ ns: "hk", defaultSortKey: "debt", defaultSortDir: "desc" });
  const [pageSize, setPageSize] = usePageSize("debt");
  const q = table.debouncedSearch;

  const setDate = (which: "dan" | "gacha", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(which, value.slice(0, 10));
    router.push(`${pathname}?${next.toString()}`);
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return s.customers.filter((c) => {
      if (kind !== "all" && !c.lines.some((l) => l.kind === kind)) return false;
      if (!needle) return true;
      return (
        c.customerName.toLowerCase().includes(needle) ||
        (c.companyInn ?? "").includes(needle) ||
        c.lines.some((l) => (l.contractNumber ?? "").toLowerCase().includes(needle))
      );
    });
  }, [s.customers, q, kind]);

  if (!s.closingAsOf) {
    return (
      <div className="rounded-xl" style={card}>
        <EmptyState
          icon={<Scale size={28} />}
          title="Qarzdorlik kesimi hali import qilinmagan"
          description="1C faylini kassa/ ga qo'ying va `npx tsx scripts/import-debt-snapshot.ts --apply` ni ishga tushiring."
        />
      </div>
    );
  }

  // RANG PUL YO'NALISHINI BILDIRADI (`components/ui/Money` izohi):
  // qarz — bizga kelishi kerak bo'lgan pul (chiqim tomoni emas, lekin
  // undirilmagani uchun "out" ohangida), avans va to'lov — kirgan pul.
  const cols: StatItem[] = [
    { label: "Boshi", value: s.totals.opening, tone: "neutral", hint: "Davr boshidagi sof qoldiq" },
    { label: "Hisoblandi", value: s.totals.accrued, tone: "auto", hint: "Davr ichida yozilgan xizmat haqi" },
    ...(s.hasPayments
      ? [{ label: "To'landi", value: s.totals.paid, tone: "in" as const, hint: "Davr ichida kelgan pul" }]
      : []),
    { label: "Qarz", value: s.totals.debt, tone: "out", hint: "Davr oxirida bizga qarzdor" },
    { label: "Avans", value: s.totals.advance, tone: "in", hint: "Davr oxirida oldindan to'langan" },
  ];

  /**
   * "To'landi" ustuni `hidden` orqali o'chiriladi — sarlavha, kataklar va
   * eksport BITTA ro'yxatdan kelib chiqadi. Ilgari `{s.hasPayments && <th>}`
   * ko'rinishida ikki joyda takrorlanardi.
   */
  const columns: DataColumn<Customer>[] = [
    {
      key: "customer",
      header: "Mijoz",
      cell: (c) => (
        <IdentityCell
          name={c.customerName}
          size="sm"
          secondary={
            <span className="inline-flex items-center gap-1.5">
              {c.companyInn ? c.companyInn : <Badge tone="warning">STIR yo&apos;q</Badge>}
              {c.lines.length > 1 && <span>{c.lines.length} shartnoma</span>}
            </span>
          }
        />
      ),
      sortValue: (c) => c.customerName,
      exportValue: (c) => c.customerName,
      sticky: true,
      mobile: "title",
    },
    {
      key: "opening",
      header: "Boshi",
      cell: (c) => <Money value={c.opening} tone="muted" dashIfZero />,
      sortValue: (c) => c.opening,
      numeric: true,
      align: "right",
    },
    {
      key: "accrued",
      header: "Hisoblandi",
      cell: (c) => <Money value={c.accrued} tone="auto" dashIfZero />,
      sortValue: (c) => c.accrued,
      numeric: true,
      align: "right",
    },
    {
      key: "paid",
      header: "To'landi",
      cell: (c) => <Money value={c.paid} tone="in" dashIfZero />,
      sortValue: (c) => c.paid,
      numeric: true,
      align: "right",
      hidden: !s.hasPayments,
    },
    {
      key: "debt",
      header: "Qarz",
      cell: (c) => <Money value={c.debt} tone="out" dashIfZero bold />,
      sortValue: (c) => c.debt,
      numeric: true,
      align: "right",
    },
    {
      key: "advance",
      header: "Avans",
      cell: (c) => <Money value={c.advance} tone="in" dashIfZero bold />,
      sortValue: (c) => c.advance,
      numeric: true,
      align: "right",
    },
  ];

  return (
    <div className="rounded-xl" style={card}>
      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}
      >
        <div className="flex items-center gap-2">
          <Scale size={15} style={{ color: "var(--text-muted)" }} />
          <div>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
              Hisob-kitob varaqasi
            </h2>
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              {s.customers.length} mijoz · manba: 1C qarzdorlik kesimi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Select
            size="sm"
            fullWidth={false}
            aria-label="Davr boshi"
            value={s.openingAsOf?.slice(0, 10) ?? ""}
            onChange={(e) => setDate("dan", e.target.value)}
          >
            {s.availableDates.map((d) => (
              <option key={d} value={d.slice(0, 10)}>{formatUzDate(d)}</option>
            ))}
          </Select>
          <ChevronRight size={12} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <Select
            size="sm"
            fullWidth={false}
            aria-label="Davr oxiri"
            value={s.closingAsOf.slice(0, 10)}
            onChange={(e) => setDate("gacha", e.target.value)}
          >
            {s.availableDates.map((d) => (
              <option key={d} value={d.slice(0, 10)}>{formatUzDate(d)}</option>
            ))}
          </Select>
        </div>
      </div>

      <StatStrip items={cols} minWidth={130} />

      {s.totals.accrued < 0 && (
        <div
          className="px-3 py-2 flex items-start gap-2 text-micro"
          style={{ background: "var(--warning-bg)", color: "var(--warning)", borderBottom: "1px solid var(--card-border)" }}
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            Hisoblanma manfiy. Bu odatda tanlangan ikki kesim bir davrga tegishli emasligini bildiradi —
            sanalarni tekshiring.
          </span>
        </div>
      )}

      {/* Filtr */}
      <div
        className="px-3 py-2 flex flex-wrap items-center gap-2"
        style={{ borderBottom: "1px solid var(--card-border)" }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Shartnoma turi filtri — `ui/Button` ustida (Faza 6).
              Tanlangan holat RANG bilan ko'rsatiladi: `BK` doimiy, `RK` bir
              martalik shartnoma va bu farq jadval bo'ylab bir xil rang kodida
              yuradi. `style` ataylab `Button` ning o'z variantidan keyin
              qo'llanadi (`{...rest}` spread tartibi) — shusiz turga bog'liq
              rang yo'qolib, ikkala filtr bir xil ko'rinardi.

              `--on-brand` EMAS `#fff`: dark rejimda qattiq oq rangli fon
              ustida o'qilmay qolardi. */}
          <Button
            size="sm"
            variant={kind === "all" ? "primary" : "secondary"}
            onClick={() => setKind("all")}
            aria-pressed={kind === "all"}
            style={
              kind === "all"
                ? { background: "var(--accent-blue)", color: "var(--on-brand)" }
                : undefined
            }
          >
            Hammasi
          </Button>
          {s.byKind.map((k) => (
            <Button
              key={k.kind}
              size="sm"
              variant={kind === k.kind ? "primary" : "secondary"}
              onClick={() => setKind(k.kind)}
              aria-pressed={kind === k.kind}
              style={
                kind === k.kind
                  ? { background: KIND_TONE[k.kind], color: "var(--on-brand)" }
                  : undefined
              }
              title={`qarz ${formatNum(k.debt)} · avans ${formatNum(k.advance)}`}
            >
              {k.label} ({k.count})
            </Button>
          ))}
        </div>
        <TableToolbar
          className="ml-auto"
          search={table.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Mijoz, STIR yoki shartnoma"
          density={table.density}
          onDensityChange={table.setDensity}
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.companyId ?? c.customerName}
        caption="Mijozlar bo'yicha hisob-kitob varaqasi"
        {...table.bind}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onRowClick={setDetail}
        rowLabel={(c) => `${c.customerName} shartnomalarini ochish`}
        emptyIcon={<Scale size={28} />}
        emptyTitle="Mijoz topilmadi"
        emptyDescription={
          kind !== "all" || q.trim() ? "Qidiruv yoki kesimni o'zgartirib ko'ring." : undefined
        }
        emptyAction={
          kind !== "all" || q.trim() ? (
            <Button variant="secondary" size="sm" onClick={() => { setKind("all"); table.setSearch(""); }}>
              Filtrni tozalash
            </Button>
          ) : undefined
        }
      />

      <p
        className="px-3 py-2 text-micro"
        style={{ borderTop: "1px solid var(--card-border)", color: "var(--text-muted)" }}
      >
        Qatorni bosing — mijozning shartnomalari bo&apos;yicha tafsilot yon panelda ochiladi.
        &quot;STIR yo&apos;q&quot; nishoni bazadagi firmaga bog&apos;lanmaganini bildiradi.
      </p>

      {/*
        SHARTNOMA TAFSILOTI — YON PANELDA.

        Ilgari u jadval ICHIGA qo'shimcha qator bo'lib ochilardi va o'sha
        qatorlar asosiy ustunlar bilan bir xil kenglikda emas edi: "To'landi"
        katagi har doim "—" turardi, chunki to'lov shartnoma darajasida
        taqsimlanmaydi. Yon panel ustun tuzilmasini buzmaydi va ro'yxatni
        yopmaydi — kassir mijozdan mijozga o'ta oladi.
      */}
      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        width="lg"
        title={detail?.customerName ?? ""}
        description={detail ? `${detail.lines.length} ta shartnoma · ${detail.companyInn ? `STIR ${detail.companyInn}` : "bazadagi firmaga bog'lanmagan"}` : undefined}
      >
        {detail && (
          <div className="space-y-3">
            <StatStrip
              items={[
                { label: "Boshi", value: detail.opening, tone: "neutral" },
                { label: "Hisoblandi", value: detail.accrued, tone: "auto" },
                ...(s.hasPayments ? [{ label: "To'landi", value: detail.paid, tone: "in" as const }] : []),
                { label: "Qarz", value: detail.debt, tone: "out" },
                { label: "Avans", value: detail.advance, tone: "in" },
              ]}
              minWidth={110}
            />

            <DataTable
              rows={detail.lines}
              columns={LINE_COLUMNS}
              rowKey={(l) => `${l.contractNumber ?? "yo'q"}-${l.kind}-${l.ownFirmName ?? ""}`}
              caption={`${detail.customerName} shartnomalari`}
              maxBodyHeight={null}
              density="compact"
              emptyTitle="Shartnoma topilmadi"
            />
          </div>
        )}
      </Drawer>

    </div>
  );
}
