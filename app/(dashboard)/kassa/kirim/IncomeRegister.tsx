"use client";

// =====================================================
// KIRIM REYESTRI — barcha tushum bitta jadvalda
// =====================================================
//
// Ilgari bu o'rinda faqat "Plastik va naqd tushumlari" turardi: BANK tushumi
// ko'rinmasdi, sana filtri yo'q edi va eksport ham yo'q edi. Ya'ni "1–19
// avgust holatini ko'rsat" degan savolga ekran javob bera olmasdi.
//
// JADVAL ENDI `DataTable` USTIDA. Ilgari bu yerda qo'lda yozilgan `<table>`
// turardi: saralash yo'q, `<caption>` yo'q, `aria-sort` yo'q, telefonda esa
// yetti ustun qisilib o'qilmasdi. Kassa modulida shunday jadvallardan 16 ta
// bor edi va har biri boshqacha xulq ko'rsatardi — foydalanuvchi "nomuvofiq"
// deb ataydigan narsa aynan shu. Ustun ta'riflari endi BITTA manba: jadval,
// mobil kartochka va Excel eksporti hammasi shundan oziqlanadi.

import React, { useEffect, useState, useTransition, useMemo } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import {
  Badge,
  DataTable,
  Drawer,
  IdentityCell,
  Money,
  StatStrip,
  TableToolbar,
  type BadgeTone,
  type DataColumn,
  type StatItem,
} from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { CompanySelect } from "@/components/ui/CompanySelect";
import { Select } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";
import { Field } from "@/components/ui/Field";
import { usePageSize } from "@/hooks/usePageSize";
import { useTableState } from "@/hooks/useTableState";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import { exportRowsToExcel } from "@/lib/exportTable";
import { RANGE_LABELS, type RangePreset } from "@/lib/dateRange";
import { getIncomeRegister } from "@/server/incomeRegister";

type Row = Awaited<ReturnType<typeof getIncomeRegister>>["rows"][number];
type Totals = Awaited<ReturnType<typeof getIncomeRegister>>["totals"];

interface Props {
  companies: { id: string; name: string; inn: string }[];
  /**
   * Bu jadval o'z ma'lumotini mustaqil so'raydi (props orqali emas) —
   * shuning uchun ota komponentdagi `router.refresh()` uni yangilamaydi.
   * Mutatsiyadan keyin ota shu qiymatni oshiradi, effekt qaramligiga
   * qo'shilgani uchun jadval qayta so'raydi.
   */
  refreshKey?: number;
}

// Foydalanuvchi eng ko'p so'ragan ikkitasi oldinda.
const PRESETS: RangePreset[] = [
  "month_to_date",
  "year_to_date",
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_month",
  "custom",
];

const SOURCE_LABELS: Record<string, string> = {
  bank: "Bank o'tkazmasi",
  plastik: "Plastik",
  naqd: "Naqd",
};

/** Nishon toni — `Badge` ning umumiy `TONE_COLORS` xaritasidan. */
const SOURCE_TONE: Record<string, BadgeTone> = {
  bank: "info",
  plastik: "brand",
  naqd: "success",
};

const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

/** Yon paneldagi maydonlar — jadval ustunlaridan mustaqil (u yerda yashiringanlari ham bor). */
const detailFields = (r: Row): { label: string; value: React.ReactNode }[] => [
  { label: "To'lov turi", value: <Badge tone={SOURCE_TONE[r.source] ?? "neutral"}>{sourceLabel(r.source)}</Badge> },
  { label: "STIR", value: r.companyInn ?? "—" },
  { label: "Shartnoma", value: r.contractNumber ?? "—" },
  { label: "Kassa", value: r.channelLabel ?? "—" },
  { label: "Hujjat", value: r.docRef ?? "—" },
  { label: "Izoh", value: r.note ?? "—" },
];

export default function IncomeRegister({ companies, refreshKey }: Props) {
  // Serverga boradigan kesimlar — bular yig'indini o'zgartiradi.
  const [preset, setPreset] = useState<RangePreset>("month_to_date");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [source, setSource] = useState("");

  // Qidiruv, saralash, sahifa va zichlik — `useTableState` da. U holatni
  // `history.replaceState` bilan URL'ga yozadi (server so'rovi yo'q), ya'ni
  // "shu saralashda ochilgan reyestr" havolasi ishlaydi.
  const table = useTableState({ ns: "kirim", defaultSortKey: "date", defaultSortDir: "desc" });
  const [pageSize, setPageSize] = usePageSize("income");

  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<Row | null>(null);

  // Qidiruv MIJOZDA filtrlanadi (serverga har harf uchun so'rov yubormaslik
  // uchun); oraliq va kesimlar esa serverda — ular yig'indini o'zgartiradi.
  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      getIncomeRegister({
        preset,
        custom: preset === "custom" ? { from: customFrom, to: customTo } : undefined,
        companyId: companyId || null,
        source: source || null,
      })
        .then((res) => {
          if (cancelled) return;
          setRows(res.rows);
          setTotals(res.totals);
          setError(null);
        })
        .catch((e) => {
          if (!cancelled) setError(friendlyError(e) || "Reyestrni yuklab bo'lmadi");
        });
    });
    return () => {
      cancelled = true;
    };
  }, [preset, customFrom, customTo, companyId, source, refreshKey]);

  const visible = useMemo(() => {
    const q = table.debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.companyName ?? "").toLowerCase().includes(q) ||
        (r.companyInn ?? "").includes(q) ||
        (r.contractNumber ?? "").toLowerCase().includes(q) ||
        (r.docRef ?? "").toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q)
    );
  }, [rows, table.debouncedSearch]);

  // Kesim o'zgarsa birinchi sahifaga. (Qidiruv va sahifa `useTableState` ning
  // o'z ichida allaqachon bog'langan.)
  const { setPage } = table;
  useEffect(() => {
    setPage(1);
  }, [preset, customFrom, customTo, companyId, source, setPage]);

  // Ekrandagi jami HAR DOIM ko'rinib turgan qatorlardan hisoblanadi — qidiruv
  // qo'yilganda serverdan kelgan yig'indi noto'g'ri bo'lib qolardi.
  const shown = useMemo(() => {
    const t = { total: 0, naqd: 0, plastik: 0, bank: 0, count: visible.length, anonymousTotal: 0 };
    for (const r of visible) {
      t.total += r.amount;
      if (r.source === "naqd") t.naqd += r.amount;
      else if (r.source === "plastik") t.plastik += r.amount;
      else if (r.source === "bank") t.bank += r.amount;
      if (r.anonymous) t.anonymousTotal += r.amount;
    }
    return t;
  }, [visible]);

  const stats = table.debouncedSearch.trim() ? shown : (totals ?? shown);

  /**
   * DAVR YIG'INDISI — sahifa tepasidagi KPI plitkalari EMAS, `StatStrip`.
   *
   * Ataylab boshqa komponent: tepadagi plitkalar qat'iy davrni ko'rsatadi
   * (bugun / shu oy / qoldiq), bu qator esa TANLANGAN filtrga bo'ysunadi.
   * Ilgari ikkalasi ham bir xil kartochka bo'lgani uchun raqamlar ziddek
   * ko'rinardi va qaysi biri "haqiqiy" ekani ekrandan bilinmasdi.
   */
  const summary: StatItem[] = [
    // PUL YO'NALISHI — `--accent-green` (`--success` holat rangi emas).
    { label: "Jami kirim", value: stats.total, tone: "in", meta: `${stats.count} ta`, emphasis: true },
    { label: "Naqd", value: stats.naqd, tone: "neutral" },
    { label: "Plastik", value: stats.plastik, tone: "neutral" },
    { label: "Bank o'tkazmasi", value: stats.bank, tone: "neutral" },
  ];

  /**
   * USTUNLAR — jadval, mobil kartochka va Excel uchun YAGONA manba.
   * `DataColumn` tuzilishi `ExportColumn` bilan mos, shuning uchun eksport
   * shu ro'yxatni to'g'ridan-to'g'ri oladi (ilgari ikkita alohida ro'yxat
   * bor edi va ular bir-biridan ajralib ketishi mumkin edi).
   */
  const columns: DataColumn<Row>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Sana",
        cell: (r) => <span className="tabular-nums">{r.receivedAt ? formatUzDate(r.receivedAt) : "—"}</span>,
        sortValue: (r) => r.receivedAt ?? "",
        exportValue: (r) => (r.receivedAt ? formatUzDate(r.receivedAt) : ""),
        width: "110px",
        mobile: "meta",
      },
      {
        key: "company",
        header: "Firma",
        cell: (r) =>
          r.companyName ? (
            <IdentityCell name={r.companyName} secondary={r.companyInn ?? undefined} size="sm" />
          ) : (
            <span style={{ color: "var(--text-muted)" }}>Nomsiz tushum</span>
          ),
        sortValue: (r) => r.companyName ?? "",
        exportValue: (r) => r.companyName ?? "Nomsiz tushum",
        sticky: true,
        mobile: "title",
      },
      {
        key: "inn",
        header: "STIR",
        cell: (r) => r.companyInn ?? "—",
        sortValue: (r) => r.companyInn ?? "",
        // Firma katagi STIRni allaqachon ikkinchi qatorda ko'rsatadi —
        // ustun faqat eksport uchun turadi.
        hidden: true,
      },
      {
        key: "contract",
        header: "Shartnoma",
        cell: (r) => r.contractNumber ?? "—",
        sortValue: (r) => r.contractNumber ?? "",
      },
      {
        key: "source",
        header: "To'lov turi",
        cell: (r) => <Badge tone={SOURCE_TONE[r.source] ?? "neutral"}>{sourceLabel(r.source)}</Badge>,
        sortValue: (r) => sourceLabel(r.source),
        mobile: "status",
      },
      {
        key: "channel",
        header: "Kassa",
        cell: (r) => r.channelLabel ?? "—",
        sortValue: (r) => r.channelLabel ?? "",
      },
      {
        key: "doc",
        header: "Hujjat",
        cell: (r) => r.docRef ?? "—",
        sortValue: (r) => r.docRef ?? "",
      },
      {
        key: "note",
        header: "Izoh",
        cell: (r) => r.note ?? "—",
        sortValue: (r) => r.note ?? "",
        hidden: true,
      },
      {
        key: "amount",
        header: "Summa",
        cell: (r) => <Money value={r.amount} tone="in" showSign bold />,
        sortValue: (r) => r.amount,
        exportValue: (r) => r.amount,
        numeric: true,
        align: "right",
      },
    ],
    []
  );

  const filterCount = (companyId ? 1 : 0) + (source ? 1 : 0);
  const clearFilters = () => {
    setCompanyId("");
    setSource("");
    table.setSearch("");
  };

  return (
    <div className="space-y-3">
      {/* DAVR — reyestrning asosiy boshqaruvi, shuning uchun asboblar
          panelining ichiga yashirilmaydi. */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((p) => {
          const active = preset === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              aria-pressed={active}
              className="px-2.5 py-1.5 rounded-lg text-meta transition-colors"
              style={
                active
                  ? { background: "var(--accent-blue)", color: "var(--on-brand)", border: "1px solid var(--accent-blue)" }
                  : { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }
              }
            >
              {RANGE_LABELS[p]}
            </button>
          );
        })}
      </div>

      {preset === "custom" && (
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="Boshlanishi" className="w-auto">
            <DateField className="w-auto" value={customFrom} onChange={setCustomFrom} />
          </Field>
          <Field label="Tugashi" className="w-auto">
            <DateField className="w-auto" value={customTo} onChange={setCustomTo} />
          </Field>
        </div>
      )}

      <TableToolbar
        search={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Firma, STIR, shartnoma yoki hujjat"
        density={table.density}
        onDensityChange={table.setDensity}
        onExport={() =>
          exportRowsToExcel(visible, columns, `kirim-reyestri-${RANGE_LABELS[preset]}`, "Kirim")
        }
        filterCount={filterCount}
        filter={
          <div className="space-y-3 min-w-[240px]">
            <Field label="Firma">
              {/* 269 ta firma — nom ham, STIR ham qidiriladi. */}
              <CompanySelect
                companies={companies}
                value={companyId}
                onChange={setCompanyId}
                emptyLabel="Barcha firmalar"
                placeholder="Barcha firmalar"
              />
            </Field>
            <Field label="To'lov turi">
              <Select value={source} onChange={(e) => setSource(e.target.value)} placeholder="Barchasi">
                <option value="naqd">Naqd</option>
                <option value="plastik">Plastik</option>
                <option value="bank">Bank o&apos;tkazmasi</option>
              </Select>
            </Field>
            {filterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Filtrni tozalash
              </Button>
            )}
          </div>
        }
      />

      <StatStrip items={summary} />

      {stats.anonymousTotal > 0 && (
        <div
          className="p-3 rounded-lg flex items-start gap-2"
          style={{ background: "var(--danger-bg)", border: "1px solid var(--card-border)" }}
        >
          <AlertTriangle size={16} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
          <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
            {formatNum(stats.anonymousTotal)} so&apos;m firmaga bog&apos;lanmagan — bu pul hech
            kimning qarzini kamaytirmayapti. Qatorlarni ochib firmani belgilang.
          </p>
        </div>
      )}

      {/* Server `limit` ga kesgan qatorlar — aks holda ro'yxat "hammasi shu"
          degan yolg'on taassurot qoldirardi. */}
      {(totals?.truncated ?? 0) > 0 && (
        <p className="text-micro" style={{ color: "var(--warning)" }}>
          Davr bo&apos;yicha jami {totals!.count + totals!.truncated} ta qator;{" "}
          {totals!.truncated} tasi ko&apos;rsatilmagan — davrni qisqartiring yoki firmani tanlab
          toraytiring.
        </p>
      )}

      {error ? (
        <p
          className="p-4 rounded-xl text-meta"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--danger)" }}
        >
          {error}
        </p>
      ) : (
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(r) => r.id}
          caption="Kirim reyestri — davr bo'yicha barcha tushumlar"
          sortKey={table.sortKey}
          sortDir={table.sortDir}
          onToggleSort={table.toggleSort}
          density={table.density}
          page={table.page}
          pageSize={pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={setPageSize}
          loading={pending && rows.length === 0}
          onRowClick={setDetail}
          rowLabel={(r) => `${r.companyName ?? "Nomsiz tushum"} — ${formatNum(r.amount)} so'm`}
          emptyIcon={<Inbox size={28} />}
          emptyTitle="Tanlangan davrda kirim yo'q"
          emptyDescription={
            filterCount > 0 || table.debouncedSearch.trim()
              ? "Filtr yoki qidiruv natijani nolga tushirdi."
              : "Davrni kengaytiring yoki vipiska yuklang."
          }
          emptyAction={
            filterCount > 0 || table.debouncedSearch.trim() ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Filtrni tozalash
              </Button>
            ) : undefined
          }
          className={pending ? "opacity-60" : undefined}
        />
      )}

      {/* QATOR DETALI — yon panel, markazlashgan modal emas: kassir ro'yxatni
          yopmasdan qator ketidan qator ko'rib chiqadi. */}
      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.companyName ?? "Nomsiz tushum"}
        description={detail?.receivedAt ? formatUzDate(detail.receivedAt) : undefined}
      >
        {detail && (
          <div className="space-y-4">
            <div>
              <div className="text-meta font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Summa
              </div>
              <div className="text-2xl font-mono font-semibold tabular-nums mt-1">
                <Money value={detail.amount} tone="in" showSign unit bold />
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-3">
              {detailFields(detail).map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <dt className="text-meta" style={{ color: "var(--text-muted)" }}>
                    {label}
                  </dt>
                  <dd className="text-body text-right min-w-0" style={{ color: "var(--text-primary)" }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {detail.anonymous && (
              <div
                className="p-3 rounded-lg flex items-start gap-2"
                style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}
              >
                <AlertTriangle size={15} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
                <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
                  Bu tushum firmaga bog&apos;lanmagan — hech kimning qarzini kamaytirmayapti.
                </p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
