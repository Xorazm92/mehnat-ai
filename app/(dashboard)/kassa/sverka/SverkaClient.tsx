"use client";

// SVERKA EKRANI — uchta yorliq: jadval, terminallar, apparatlar.
//
// Yorliqlar tartibi ish tartibiga mos: kundalik ish — jadval; kamdan-kam
// o'zgaradigan sozlama — terminal doirasi va apparatlar ro'yxati.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale, Upload, RefreshCw, AlertTriangle, Plus, Check, X } from "lucide-react";
import { Tabs, type TabItem, Button, Field, Badge, StatStrip, PageHeader, Money } from "@/components/ui";
import {
  uploadFiscalReport,
  rebuildSettlements,
  setTerminalScope,
  saveFiscalDevice,
  type FiscalUploadResult,
} from "@/server/posSverka";
import SverkaMatrix, { type MatrixDay } from "./SverkaMatrix";

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

type TabId = "sverka" | "terminals" | "devices";
type Msg = { tone: "ok" | "err"; text: string } | null;

export default function SverkaClient({ data }: { data: SverkaData }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("sverka");
  const [from, setFrom] = useState(data.range.from);
  const [to, setTo] = useState(data.range.to);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);

  const inScope = data.terminals.filter((t) => t.inScope);
  const outside = data.terminals.filter((t) => !t.inScope);

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
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Dan">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
          </Field>
          <Field label="Gacha">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
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
          <StatStrip
            items={[
              { label: "Kassa (karta)", value: data.totals.kassaCard, tone: "neutral" },
              { label: "Bank (fakt)", value: data.totals.bankFact, tone: "neutral" },
              { label: "Bank (brutto)", value: data.totals.bankGross, tone: "neutral", hint: "Komissiya ushlanishidan oldingi summa" },
              { label: "Komissiya", value: data.totals.commission, tone: "muted" },
              {
                label: "Farq (kassa − brutto)",
                value: data.totals.diff,
                tone: data.totals.diff > 0 ? "out" : "in",
                meta: data.totals.diff > 0 ? "bankka yetib bormagan" : "bankda ortiqcha",
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
      <table className="w-full text-meta">
        <thead style={{ color: "var(--text-secondary)" }}>
          <tr>
            <th className="text-left py-1">Oy</th>
            <th className="text-right py-1">Kassa</th>
            <th className="text-right py-1">Bank fakt</th>
            <th className="text-right py-1">Bank brutto</th>
            <th className="text-right py-1">Komissiya</th>
            <th className="text-right py-1">Farq</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} style={{ borderTop: "1px solid var(--card-border)" }}>
              <td className="py-1">{m.month}</td>
              <td className="text-right tabular-nums"><Money value={m.totals.kassaCard} /></td>
              <td className="text-right tabular-nums"><Money value={m.totals.bankFact} /></td>
              <td className="text-right tabular-nums"><Money value={m.totals.bankGross} /></td>
              <td className="text-right tabular-nums"><Money value={m.totals.commission} tone="muted" /></td>
              <td className="text-right tabular-nums">
                <Money value={m.totals.diff} bold showSign tone={m.totals.diff > 0 ? "out" : "in"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

  const row = (t: Terminal) => (
    <tr key={t.id} style={{ borderTop: "1px solid var(--card-border)" }}>
      <td className="py-2 pr-2 font-mono text-meta">{t.code}</td>
      <td className="py-2 pr-2"><Badge tone="neutral">{t.channelLabel}</Badge></td>
      <td className="py-2 pr-2 text-right tabular-nums">
        <Money value={t.outsideAmount} dashIfZero tone="muted" />
      </td>
      <td className="py-2 pr-2 text-micro" style={{ color: "var(--text-secondary)" }}>{t.scopeNote ?? ""}</td>
      <td className="py-2 text-right">
        <Button size="sm" variant={t.inScope ? "secondary" : "primary"} onClick={() => toggle(t)} disabled={pending}>
          {t.inScope ? "Doiradan chiqarish" : "Doiraga qo'shish"}
        </Button>
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
        <h3 className="text-meta font-semibold mb-1">
          Doirada — kassa apparatlari bilan solishtiriladi ({inScope.length})
        </h3>
        <table className="w-full text-meta"><tbody>{inScope.map(row)}</tbody></table>
        {inScope.length === 0 && (
          <p className="text-micro py-2" style={{ color: "var(--text-secondary)" }}>
            Hali birorta terminal doiraga kiritilmagan — sverka bo&apos;sh chiqadi.
          </p>
        )}
      </div>
      <div className="rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
        <h3 className="text-meta font-semibold mb-1">Doiradan tashqarida ({outside.length})</h3>
        <p className="text-micro mb-2" style={{ color: "var(--text-secondary)" }}>
          Bu tushumlar sverkaga KIRMAYDI. Agar ular ham shu kassa apparatlariga tegishli bo&apos;lsa — doiraga qo&apos;shing.
        </p>
        <table className="w-full text-meta"><tbody>{outside.map(row)}</tbody></table>
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
                  text: `${r.data.deviceLabel}: ${r.data.rowsInserted} yangi, ${r.data.rowsUpdated} yangilandi (${r.data.periodFrom} – ${r.data.periodTo})`,
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
            <select className="input" value={uploadFor} onChange={(e) => setUploadFor(e.target.value)}>
              <option value="">O&apos;zi aniqlansin</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Fayl">
            <input type="file" name="file" accept=".xlsx,.xls" required className="input" />
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
        <table className="w-full text-meta">
          <thead style={{ color: "var(--text-secondary)" }}>
            <tr>
              <th className="text-left py-1">Nom</th>
              <th className="text-left py-1">FM raqami</th>
              <th className="text-left py-1">STIR</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                <td className="py-1.5">{d.label}</td>
                <td className="py-1.5 font-mono">{d.fmNumber}</td>
                <td className="py-1.5">{d.inn}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-wrap items-end gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--card-border)" }}>
          <Field label="Nom">
            <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="1-savdo nuqtasi" />
          </Field>
          <Field label="FM raqami">
            <input className="input font-mono" value={form.fmNumber} onChange={(e) => setForm({ ...form, fmNumber: e.target.value })} placeholder="VG343420023218" />
          </Field>
          <Field label="STIR">
            <input className="input font-mono" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} placeholder="308229886" />
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
