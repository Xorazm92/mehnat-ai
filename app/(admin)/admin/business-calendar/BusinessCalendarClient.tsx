"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatUzDate } from "@/lib/format";
import { getCalendarDays, upsertCalendarDay, deleteCalendarDay } from "@/server/businessCalendar";
import { Button } from "@/components/ui/Button";

interface Day {
  id: string;
  date: string;
  isWorkday: boolean;
  isHoliday: boolean;
  name: string | null;
}

// Kun turi → (isWorkday, isHoliday)
const KINDS: Record<string, { label: string; isWorkday: boolean; isHoliday: boolean; bg: string; fg: string }> = {
  holiday: { label: "Bayram", isWorkday: false, isHoliday: true, bg: "var(--danger-bg)", fg: "var(--danger-dark)" },
  dayoff: { label: "Dam olish", isWorkday: false, isHoliday: false, bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
  workday: { label: "Ish kuni (override)", isWorkday: true, isHoliday: false, bg: "var(--success-bg)", fg: "var(--success)" },
};

function kindOf(d: Day): keyof typeof KINDS {
  if (d.isHoliday) return "holiday";
  if (!d.isWorkday) return "dayoff";
  return "workday";
}

export default function BusinessCalendarClient({ initial, initialYear }: { initial: Day[]; initialYear: number }) {
  const [pending, start] = useTransition();
  const [year, setYear] = useState(initialYear);
  const [days, setDays] = useState<Day[]>(initial);
  const [form, setForm] = useState({ date: "", kind: "holiday" as keyof typeof KINDS, name: "" });

  const reload = (y: number) =>
    start(async () => {
      try {
        const rows = (await getCalendarDays(y)) as unknown as Day[];
        setDays(JSON.parse(JSON.stringify(rows)));
        setYear(y);
      } catch (e) {
        toast.error((e as Error).message || "Xatolik");
      }
    });

  const addDay = () => {
    if (!form.date) return toast.error("Sana majburiy");
    const k = KINDS[form.kind];
    start(async () => {
      try {
        await upsertCalendarDay({ date: form.date, isWorkday: k.isWorkday, isHoliday: k.isHoliday, name: form.name || undefined });
        toast.success("Saqlandi");
        const rows = (await getCalendarDays(year)) as unknown as Day[];
        setDays(JSON.parse(JSON.stringify(rows)));
        setForm({ date: "", kind: form.kind, name: "" });
      } catch (e) {
        toast.error((e as Error).message || "Xatolik");
      }
    });
  };

  const remove = (id: string) =>
    start(async () => {
      try {
        await deleteCalendarDay(id);
        setDays((ds) => ds.filter((d) => d.id !== id));
        toast.success("O'chirildi");
      } catch (e) {
        toast.error((e as Error).message || "Xatolik");
      }
    });

  const inputStyle = { borderColor: "var(--border, var(--rule))", background: "transparent", color: "var(--text-primary)" };
  const years = [initialYear - 1, initialYear, initialYear + 1];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Biznes kalendar</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Bayram / dam olish / ish kuni override — muddatlar shu bo'yicha suriladi (Asia/Tashkent)</p>
        </div>
        <div className="flex gap-1.5">
          {years.map((y) => (
            <button key={y} disabled={pending} onClick={() => reload(y)} className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: y === year ? "var(--brand)" : "var(--bg-hover, var(--bg-sunken))", color: y === year ? "#fff" : "var(--text-primary)" }}>
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border p-4 flex flex-wrap items-end gap-3" style={{ borderColor: "var(--border, var(--rule))" }}>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Sana
          <input type="date" className="block px-2.5 py-1.5 rounded-lg border text-sm" style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>Turi
          <select className="block px-2.5 py-1.5 rounded-lg border text-sm" style={inputStyle} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as keyof typeof KINDS })}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="text-xs flex-1 min-w-[160px]" style={{ color: "var(--text-muted)" }}>Nomi (ixt.)
          <input className="block px-2.5 py-1.5 rounded-lg border text-sm w-full" style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mustaqillik kuni" />
        </label>
        <Button variant="success" size="md" disabled={pending} onClick={addDay}>Saqlash</Button>
      </div>

      {days.length === 0 ? (
        <div className="rounded-xl border p-10 text-center text-sm" style={{ borderColor: "var(--border, var(--rule))", color: "var(--text-muted)" }}>
          {year} yil uchun maxsus kun yo'q. Dam olish (Sha/Yak) avtomatik hisobga olinadi; faqat bayramlar va override'larni kiriting.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, var(--rule))" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold px-3 py-2.5">Sana</th>
                <th className="text-left font-semibold px-3 py-2.5">Turi</th>
                <th className="text-left font-semibold px-3 py-2.5">Nomi</th>
                <th className="text-right font-semibold px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const k = KINDS[kindOf(d)];
                return (
                  <tr key={d.id} className="border-t" style={{ borderColor: "var(--border, var(--bg-sunken))" }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{formatUzDate(d.date)}</td>
                    <td className="px-3 py-2.5"><span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: k.bg, color: k.fg }}>{k.label}</span></td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{d.name || "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button disabled={pending} onClick={() => remove(d.id)} className="text-xs font-semibold px-2 py-1 rounded-lg disabled:opacity-50" style={{ background: "var(--danger-bg)", color: "var(--danger-dark)" }}>O'chirish</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
