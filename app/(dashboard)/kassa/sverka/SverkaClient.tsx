"use client";

// SVERKA EKRANI — uchta yorliq: jadval, terminallar, apparatlar.
//
// Yorliqlar tartibi ish tartibiga mos: kundalik ish — jadval; kamdan-kam
// o'zgaradigan sozlama — terminal doirasi va apparatlar ro'yxati.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale, Upload, RefreshCw, AlertTriangle, Plus, Check, X, CalendarRange } from "lucide-react";
import {
  Tabs, type TabItem, Button, Field, Badge, MetricRail, PageHeader, Money,
  DataTable, DateField, displayDate, Select, type DataColumn,
} from "@/components/ui";
import {
  uploadFiscalReport,
  rebuildSettlements,
  setTerminalScope,
  saveFiscalDevice,
  type FiscalUploadResult,
} from "@/server/posSverka";
import SverkaMatrix, { type MatrixDay } from "./SverkaMatrix";
import { formatNum } from "@/lib/platform/format";
import { useTabParam } from "@/hooks/useTabParam";
import { SVERKA_TAB_IDS, type SverkaTab } from "@/lib/sverkaTabs";

interface Device { id: string; fmNumber: string; label: string; inn: string; siteKey: string | null }
interface Terminal {
  id: string; code: string; channel: string; channelLabel: string; label: string | null;
  inScope: boolean; scopeNote: string | null; outsideAmount: number;
}
interface Totals {
  kassaCard: number; kassaCash: number; bankFact: number; bankGross: number;
  commission: number; diff: number; diffFact: number; approximateAmount: number;
}

export interface SverkaData {
  range: { from: string; to: string };
  devices: Device[];
  terminals: Terminal[];
  days: MatrixDay[];
  totals: Totals;
  months: { month: string; totals: Totals }[];
}

// Yorliq ro'yxati `lib/sverkaTabs.ts` da — sahifa uni SERVERDA tekshiradi.
type TabId = SverkaTab;

/** Oylik yakun ustunlari — `MonthlySummary` uchun. */
const MONTH_COLUMNS: DataColumn<{ month: string; totals: Totals }>[] = [
  { key: "month", header: "Oy", cell: (m) => m.month, sortValue: (m) => m.month, sticky: true, mobile: "title" },
  {
    key: "kassa",
    header: "Kassa",
    cell: (m) => <Money value={m.totals.kassaCard} />,
    sortValue: (m) => m.totals.kassaCard,
    numeric: true,
    align: "right",
  },
  {
    key: "bankFact",
    header: "Bank fakt",
    cell: (m) => <Money value={m.totals.bankFact} />,
    sortValue: (m) => m.totals.bankFact,
    numeric: true,
    align: "right",
  },
  {
    key: "bankGross",
    header: "Bank brutto",
    cell: (m) => <Money value={m.totals.bankGross} />,
    sortValue: (m) => m.totals.bankGross,
    numeric: true,
    align: "right",
  },
  {
    key: "commission",
    header: "Komissiya",
    cell: (m) => <Money value={m.totals.commission} tone="muted" />,
    sortValue: (m) => m.totals.commission,
    numeric: true,
    align: "right",
  },
  {
    key: "diff",
    header: "Farq",
    cell: (m) => <Money value={m.totals.diff} bold showSign tone={m.totals.diff > 0 ? "out" : "in"} />,
    sortValue: (m) => m.totals.diff,
    numeric: true,
    align: "right",
    mobile: "status",
  },
];

/** Kassa apparatlari ro'yxati. */
const DEVICE_COLUMNS: DataColumn<Device>[] = [
  { key: "label", header: "Nom", cell: (d) => d.label, sortValue: (d) => d.label, sticky: true, mobile: "title" },
  {
    key: "fm",
    header: "FM raqami",
    cell: (d) => <span className="font-mono">{d.fmNumber}</span>,
    sortValue: (d) => d.fmNumber,
  },
  { key: "inn", header: "STIR", cell: (d) => d.inn, sortValue: (d) => d.inn },
];
type Msg = { tone: "ok" | "err"; text: string } | null;

export default function SverkaClient({
  data,
  /** `?tab=` dan SERVERDA o'qilgan boshlang'ich yorliq (hidratsiya uchun). */
  initialTab = "sverka",
}: {
  data: SverkaData;
  initialTab?: SverkaTab;
}) {
  const router = useRouter();
  // Yorliq URL'da: F5 bosilganda holat saqlanadi va "terminallar doirasini
  // ko'r" deb havola yuborish mumkin (`/kassa/sverka?tab=terminals`).
  // Ilgari oddiy `useState` edi — global qidiruvdagi yorliq havolasi
  // har doim birinchi tabni ochardi.
  const [tab, setTab] = useTabParam<TabId>("tab", SVERKA_TAB_IDS, initialTab);
  const [from, setFrom] = useState(data.range.from);
  const [to, setTo] = useState(data.range.to);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);

  const inScope = data.terminals.filter((t) => t.inScope);
  const outside = data.terminals.filter((t) => !t.inScope);

  // Farq NOLGA TENG deb hisoblanadigan chegara. 1 so'm — Decimal
  // yaxlitlanishi (`lib/ledger.ts` dagi 0.01 chegarasi bilan bir mantiq);
  // undan kattasi haqiqiy nomuvofiqlik va u qizil bo'lib chiqadi.
  //
  // MA'LUMOT YO'QLIGI "MOS KELDI" EMAS. Bo'sh davrda farq ham nol bo'ladi,
  // ya'ni oddiy `diff < 1` tekshiruvi "solishtiruv o'tdi, ish tugadi" degan
  // YOLG'ON yashil xulosani chizardi — holbuki hech narsa solishtirilmagan.
  const hasData = data.days.length > 0;
  const matched = hasData && Math.abs(data.totals.diff) < 1;

  const tabs: TabItem<TabId>[] = [
    { id: "sverka", label: "Sverka jadvali", icon: Scale },
    { id: "terminals", label: "Terminallar", count: outside.length || undefined, hint: "Qaysi kanal solishtiruvga kiradi" },
    { id: "devices", label: "Kassa apparatlari", count: data.devices.length },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kassa–bank sverka"
        icon={<Scale size={20} />}
        description="Fiskal apparat urgan karta to'lovi bankka to'liq tushganmi — kunma-kun tekshiruv."
        actions={
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await rebuildSettlements({ from, to });
                setMsg(
                  r.ok
                    ? {
                        tone: "ok",
                        text:
                          `Vipiskadan ${r.data.written} ta tushum ajratildi` +
                          (r.data.newTerminals.length
                            ? ` · ${r.data.newTerminals.length} ta YANGI terminal topildi — "Terminallar" yorlig'ida tasdiqlang`
                            : ""),
                      }
                    : { tone: "err", text: r.error },
                );
                router.refresh();
              })
            }
          >
            <RefreshCw size={14} className={pending ? "animate-spin" : ""} />
            Vipiskadan ajratish
          </Button>
        }
      >
        {/*
          `className="input"` ISHLATILARDI, lekin `.input` sinfi
          `app/globals.css` da e'lon qilinmagan — ya'ni bu maydonlar
          brauzerning standart ko'rinishida, dizayn tizimidan tashqarida
          chizilardi. Endi `DateField`/`Select` primitivlari.
        */}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Dan">
            <DateField value={from} onChange={setFrom} />
          </Field>
          <Field label="Gacha">
            <DateField value={to} onChange={setTo} />
          </Field>
          <Button variant="secondary" onClick={() => router.push(`/kassa/sverka?dan=${from}&gacha=${to}`)}>
            Ko&apos;rsatish
          </Button>
        </div>
      </PageHeader>

      {msg && (
        <div
          className="rounded-xl px-3 py-2 text-meta flex items-start gap-2"
          style={{ border: `1px solid ${msg.tone === "ok" ? "var(--accent-green)" : "var(--accent-red)"}` }}
        >
          {msg.tone === "ok" ? <Check size={14} className="mt-0.5" /> : <AlertTriangle size={14} className="mt-0.5" />}
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Yopish"><X size={14} /></button>
        </div>
      )}

      <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Sverka bo'limlari" />

      {tab === "sverka" && (
        <div className="space-y-3">
          {/* SOLISHTIRUV O'QILISH TARTIBI: DAVR → KUTILGAN → FAKT →
              KOMISSIYA → FARQ → HOLAT. Ilgari bu qator beshta teng
              og'irlikdagi raqam edi va qaysi ikkitasi bir-biriga
              solishtirilayotgani (kassa ↔ bank brutto) ekrandan
              ko'rinmasdi — "Farq" ustuni nimadan chiqqanini faqat
              yorlig'idagi qavs aytardi. Endi tartib o'qilishning o'zi
              tenglamani ko'rsatadi va farq nolga tengmi degan savolga
              oxirgi katak SO'Z bilan javob beradi. */}
          <MetricRail
            columns={6}
            items={[
              {
                label: "Davr",
                // Sana ORALIG'I qiymat sifatida katakka sig'masdi va
                // "01.08.2026 —…" bo'lib kesilardi. Qiymat — kunlar soni
                // (mono, tabular), oraliqning o'zi izohda: u yerda 10px
                // matn bilan to'liq sig'adi.
                value: data.days.length,
                unit: "kun",
                hint: `${displayDate(from)} — ${displayDate(to)}`,
                icon: <CalendarRange size={13} />,
              },
              {
                label: "Kutilgan · kassa",
                value: formatNum(Math.round(data.totals.kassaCard)),
                unit: "so'm",
                hint: "fiskal apparat urgan",
              },
              {
                label: "Fakt · bank brutto",
                value: formatNum(Math.round(data.totals.bankGross)),
                unit: "so'm",
                hint: "komissiya ushlanishidan oldin",
              },
              {
                label: "Komissiya",
                value: formatNum(Math.round(data.totals.commission)),
                unit: "so'm",
                hint: `bankka tushgan: ${formatNum(Math.round(data.totals.bankFact))}`,
              },
              {
                label: "Farq",
                value: `${data.totals.diff > 0 ? "+" : data.totals.diff < 0 ? "−" : ""}${formatNum(Math.abs(Math.round(data.totals.diff)))}`,
                unit: "so'm",
                hint: !hasData
                  ? "solishtirish uchun ma'lumot yo'q"
                  : data.totals.diff > 0
                    ? "bankka yetib bormagan"
                    : data.totals.diff < 0
                      ? "bankda ortiqcha"
                      : "og'ish yo'q",
                tone: !hasData ? "neutral" : matched ? "success" : "danger",
                emphasis: true,
              },
              {
                label: "Holat",
                value: !hasData ? "Ma'lumot yo'q" : matched ? "Mos keldi" : "Nomuvofiq",
                hint: !hasData
                  ? "kassa hisobotini yuklang"
                  : matched
                    ? "qo'shimcha ish talab qilinmaydi"
                    : "kunlik jadvaldan farqli kunni toping",
                icon: !hasData ? <AlertTriangle size={13} /> : matched ? <Check size={13} /> : <AlertTriangle size={13} />,
                tone: !hasData ? "neutral" : matched ? "success" : "danger",
              },
            ]}
          />
          {data.totals.approximateAmount > 0 && (
            <p className="text-micro flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                <Money value={data.totals.approximateAmount} unit /> — to&apos;lov tafsilotida sana yo&apos;q
                (UzCard &quot;100% от сальдо&quot;), hujjat sanasi bo&apos;yicha joylashtirildi. Kunlik farq shu qismda
                shartli; davr yig&apos;indisi to&apos;g&apos;ri qoladi.
              </span>
            </p>
          )}
          <SverkaMatrix days={data.days} devices={data.devices} terminals={inScope} totals={data.totals} />
          {data.months.length > 1 && <MonthlySummary months={data.months} />}
        </div>
      )}

      {tab === "terminals" && <TerminalScope terminals={data.terminals} onDone={() => router.refresh()} />}
      {tab === "devices" && <DeviceTab devices={data.devices} onDone={() => router.refresh()} setMsg={setMsg} />}
    </div>
  );
}

function MonthlySummary({ months }: { months: { month: string; totals: Totals }[] }) {
  return (
    <div className="rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
      <h3 className="text-meta font-semibold mb-2">Oylik yakun</h3>
      <DataTable
        rows={months}
        columns={MONTH_COLUMNS}
        rowKey={(m) => m.month}
        caption="Oylar bo'yicha kassa va bank yakuni"
        maxBodyHeight={null}
        density="compact"
        emptyTitle="Oylik yakun yo'q"
      />
    </div>
  );
}

/**
 * Terminal doirasi — sverkaning ENG MUHIM qarori.
 *
 * Bitta hisobvaraqqa bir nechta savdo liniyasi tushadi. Ularni qo'shib
 * yuborish farqni butunlay chalg'itadi: alohida EPOS qurilmasi va onlayn
 * to'lovlar kassa apparatlariga qo'shilib ketganda 2,5 mlrd lik sverka
 * 5 mlrd bo'lib ko'ringan edi. Shuning uchun yangi kanal AVTOMATIK kirmaydi.
 */
function TerminalScope({ terminals, onDone }: { terminals: Terminal[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const inScope = terminals.filter((t) => t.inScope);
  const outside = terminals.filter((t) => !t.inScope);

  const toggle = (t: Terminal) =>
    startTransition(async () => {
      await setTerminalScope({ id: t.id, inScope: !t.inScope });
      onDone();
    });

  /**
   * Ustunlar ikkala jadval uchun bir xil — ilgari bu `<tbody>` ga to'g'ridan
   * qo'yiladigan `<tr>` qaytaruvchi funksiya edi, ya'ni jadvalda SARLAVHA
   * umuman yo'q edi: "bu ustun nima?" degan savolga ekran javob bermasdi.
   */
  const columns: DataColumn<Terminal>[] = [
    {
      key: "code",
      header: "Terminal kodi",
      cell: (t) => <span className="font-mono">{t.code}</span>,
      sortValue: (t) => t.code,
      sticky: true,
      mobile: "title",
    },
    {
      key: "channel",
      header: "Kanal",
      cell: (t) => <Badge tone="neutral">{t.channelLabel}</Badge>,
      sortValue: (t) => t.channelLabel,
      mobile: "status",
    },
    {
      key: "amount",
      header: "Summa",
      cell: (t) => <Money value={t.outsideAmount} dashIfZero tone="muted" />,
      sortValue: (t) => t.outsideAmount,
      numeric: true,
      align: "right",
    },
    {
      key: "note",
      header: "Izoh",
      cell: (t) => t.scopeNote ?? "—",
      sortValue: (t) => t.scopeNote ?? "",
    },
    {
      key: "actions",
      header: "Amal",
      align: "right",
      cell: (t) => (
        <Button size="sm" variant={t.inScope ? "secondary" : "primary"} onClick={() => toggle(t)} disabled={pending}>
          {t.inScope ? "Doiradan chiqarish" : "Doiraga qo'shish"}
        </Button>
      ),
      mobile: "actions",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
        <h3 className="text-meta font-semibold mb-1">
          Doirada — kassa apparatlari bilan solishtiriladi ({inScope.length})
        </h3>
        <DataTable
          rows={inScope}
          columns={columns}
          rowKey={(t) => t.id}
          caption="Sverka doirasidagi terminallar"
          maxBodyHeight={null}
          density="compact"
          emptyTitle="Doirada terminal yo'q"
          emptyDescription="Hali birorta terminal doiraga kiritilmagan — sverka bo'sh chiqadi."
        />
      </div>
      <div className="rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
        <h3 className="text-meta font-semibold mb-1">Doiradan tashqarida ({outside.length})</h3>
        <p className="text-micro mb-2" style={{ color: "var(--text-secondary)" }}>
          Bu tushumlar sverkaga KIRMAYDI. Agar ular ham shu kassa apparatlariga tegishli bo&apos;lsa — doiraga qo&apos;shing.
        </p>
        <DataTable
          rows={outside}
          columns={columns}
          rowKey={(t) => t.id}
          caption="Sverka doirasidan tashqaridagi terminallar"
          maxBodyHeight={null}
          density="compact"
          emptyTitle="Hammasi doirada"
        />
      </div>
    </div>
  );
}

function DeviceTab({
  devices,
  onDone,
  setMsg,
}: {
  devices: Device[];
  onDone: () => void;
  setMsg: (m: Msg) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ fmNumber: "", label: "", inn: "" });
  const [uploadFor, setUploadFor] = useState("");
  const [result, setResult] = useState<FiscalUploadResult | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
        <h3 className="text-meta font-semibold mb-2">Kunlik hisobotni yuklash</h3>
        <p className="text-micro mb-2" style={{ color: "var(--text-secondary)" }}>
          Soliq kabinetidan olingan &quot;Кунлик ҳисобот&quot; fayli. Apparat fayl nomi yoki fayl ichidagi FM raqami
          bo&apos;yicha o&apos;zi topiladi; topilmasa ro&apos;yxatdan tanlang. Bir kun qayta yuklansa — yangilanadi.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          action={(fd) =>
            startTransition(async () => {
              if (uploadFor) fd.set("deviceId", uploadFor);
              const r = await uploadFiscalReport(fd);
              if (r.ok) {
                setResult(r.data);
                setMsg({
                  tone: "ok",
                  // Kesim hisoboti kassa jamisini O'ZGARTIRMAYDI — buni
                  // aytmaslik "yukladim, lekin jami o'smadi" degan savol
                  // tug'dirardi.
                  text:
                    `${r.data.deviceLabel}: ${r.data.rowsInserted} yangi, ${r.data.rowsUpdated} yangilandi ` +
                    `(${r.data.periodFrom} – ${r.data.periodTo})` +
                    (r.data.channelLabel
                      ? ` · ${r.data.channelLabel} kesimi — kassa jamisiga qo'shilmaydi`
                      : ""),
                });
                onDone();
              } else {
                setResult(null);
                setMsg({ tone: "err", text: r.error });
              }
            })
          }
        >
          <Field label="Apparat (ixtiyoriy)">
            <Select value={uploadFor} onChange={(e) => setUploadFor(e.target.value)}>
              <option value="">O&apos;zi aniqlansin</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fayl">
            <input type="file" name="file" accept=".xlsx,.xls" required className="erp-input" />
          </Field>
          <Button type="submit" disabled={pending}>
            <Upload size={14} />
            Yuklash
          </Button>
        </form>
        {result && result.warnings.length > 0 && (
          <ul className="mt-2 text-micro space-y-0.5" style={{ color: "var(--accent-amber)" }}>
            {result.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
          </ul>
        )}
      </div>

      <div className="rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
        <h3 className="text-meta font-semibold mb-2">Apparatlar ({devices.length})</h3>
        <DataTable
          rows={devices}
          columns={DEVICE_COLUMNS}
          rowKey={(d) => d.id}
          caption="Ro'yxatga olingan kassa apparatlari"
          maxBodyHeight={null}
          density="compact"
          emptyTitle="Apparat qo'shilmagan"
          emptyDescription="Quyidagi maydonlar orqali kassa apparatini qo'shing."
        />

        <div className="flex flex-wrap items-end gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--card-border)" }}>
          <Field label="Nom">
            <input className="erp-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="1-savdo nuqtasi" />
          </Field>
          <Field label="FM raqami">
            <input className="erp-input font-mono" value={form.fmNumber} onChange={(e) => setForm({ ...form, fmNumber: e.target.value })} placeholder="VG343420023218" />
          </Field>
          <Field label="STIR">
            <input className="erp-input font-mono" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} placeholder="308229886" />
          </Field>
          <Button
            variant="secondary"
            disabled={pending || !form.fmNumber.trim() || !form.label.trim()}
            onClick={() =>
              startTransition(async () => {
                await saveFiscalDevice(form);
                setForm({ fmNumber: "", label: "", inn: "" });
                onDone();
              })
            }
          >
            <Plus size={14} />
            Qo&apos;shish
          </Button>
        </div>
      </div>
    </div>
  );
}
