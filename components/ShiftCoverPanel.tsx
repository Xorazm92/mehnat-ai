"use client";

// =====================================================
// O'RINBOSARLIK — kim kimning o'rniga ishladi
// =====================================================
// Reglament: uzrsiz kelmagan kun uchun yechilgan pul YO'QOLMAYDI, o'sha kuni
// ishni bajargan xodimga o'tadi (ta'tilda — yarmi). Bu panel o'sha kunni
// belgilaydi va pul o'tkazmasini ishga tushiradi.

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { Staff } from "@/types";
import { Button } from "@/components/ui/Button";
import { formatNum } from "@/lib/format";
import { assignShiftCover, getShiftCovers, applyCoverTransfers } from "@/server/shiftCover";

interface CoverRow {
  id: string;
  date: string;
  absentUserId: string;
  coverUserId: string;
  companyId: string | null;
  kind: string;
  note: string | null;
}

interface Props {
  staff: Staff[];
  canEdit: boolean;
}

const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
};

const ShiftCoverPanel: React.FC<Props> = ({ staff, canEdit }) => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<CoverRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    absentUserId: "",
    coverUserId: "",
    kind: "absence" as "absence" | "vacation",
  });

  const nameById = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  const load = async () => {
    const { start, end } = monthBounds(month);
    try {
      const data = await getShiftCovers(start, end);
      setRows(data as unknown as CoverRow[]);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!form.absentUserId || !form.coverUserId) {
      toast.error("Kelmagan xodim va o'rinbosarni tanlang");
      return;
    }
    if (form.absentUserId === form.coverUserId) {
      toast.error("Xodim o'z o'rniga o'zi turolmaydi");
      return;
    }
    setBusy(true);
    try {
      await assignShiftCover(form);
      toast.success("O'rinbosarlik saqlandi");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runTransfers = async () => {
    setBusy(true);
    try {
      const res = await applyCoverTransfers(month);
      toast.success(
        res.transfers > 0
          ? `${res.transfers} ta o'tkazma yozildi — jami ${formatNum(Math.round(res.total))} so'm`
          : "Yangi o'tkazma yo'q (avval yozilganlari yangilandi)"
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={16} style={{ color: "var(--accent-indigo)" }} />
          <h3 className="text-body font-bold" style={{ color: "var(--text-primary)" }}>
            O&apos;rinbosarlik va yo&apos;qlik puli
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg px-3 py-2 text-body font-bold outline-none cursor-pointer"
            style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--accent-blue)" }}
          />
          {canEdit && (
            <Button variant="secondary" size="sm" disabled={busy || rows.length === 0} onClick={runTransfers}>
              Pulni o&apos;tkazish
            </Button>
          )}
        </div>
      </div>

      <p className="text-micro" style={{ color: "var(--text-muted)" }}>
        Kelmagan kun uchun yechilgan foiz o&apos;rinbosarga <b>bonus</b> sifatida yoziladi. Ta&apos;tilda yarmi
        o&apos;tadi. Tugmani takror bosish pulni ikkilantirmaydi — mavjud o&apos;tkazma yangilanadi.
      </p>

      {canEdit && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="rounded-lg px-3 py-2 text-xs font-bold outline-none"
            style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
          />
          <select
            value={form.absentUserId}
            onChange={(e) => setForm({ ...form, absentUserId: e.target.value })}
            className="rounded-lg px-3 py-2 text-xs font-bold outline-none"
            style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
          >
            <option value="">Kelmagan xodim…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={form.coverUserId}
            onChange={(e) => setForm({ ...form, coverUserId: e.target.value })}
            className="rounded-lg px-3 py-2 text-xs font-bold outline-none"
            style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
          >
            <option value="">O&apos;rinbosar…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as "absence" | "vacation" })}
            className="rounded-lg px-3 py-2 text-xs font-bold outline-none"
            style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
          >
            <option value="absence">Uzrsiz kelmadi</option>
            <option value="vacation">Mehnat ta&apos;tili</option>
          </select>
          <Button variant="primary" size="sm" disabled={busy} onClick={submit}>
            Qo&apos;shish
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
          Bu oyda o&apos;rinbosarlik yozuvi yo&apos;q.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--card-border)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "var(--table-header-bg)", color: "var(--text-muted)" }}>
                <th className="text-left font-bold px-3 py-2">Sana</th>
                <th className="text-left font-bold px-3 py-2">Kelmagan</th>
                <th className="text-left font-bold px-3 py-2">O&apos;rinbosar</th>
                <th className="text-left font-bold px-3 py-2">Turi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {String(r.date).slice(0, 10)}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>
                    {nameById.get(r.absentUserId) ?? r.absentUserId}
                  </td>
                  <td className="px-3 py-2 font-bold" style={{ color: "var(--success)" }}>
                    {nameById.get(r.coverUserId) ?? r.coverUserId}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.kind === "vacation" ? "Ta'til (50%)" : "Uzrsiz"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ShiftCoverPanel;
