"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getFairKpiScores, computeFairKpiForPeriod } from "@/server/fairKpi";
import { Button } from "@/components/ui/Button";

interface Score {
  employeeId: string;
  employeeName: string;
  sla: string;
  quality: string;
  client: string;
  volume: string;
  discipline: string;
  composite: string;
  volumePoints: string;
  shadowMode: boolean;
}

const COMPONENTS: { key: keyof Score; label: string; weight: string }[] = [
  { key: "sla", label: "SLA", weight: "35%" },
  { key: "quality", label: "Sifat", weight: "25%" },
  { key: "client", label: "Mijoz", weight: "15%" },
  { key: "volume", label: "Hajm", weight: "15%" },
  { key: "discipline", label: "Intizom", weight: "10%" },
];

const scoreColor = (n: number) => (n >= 85 ? "var(--success)" : n >= 65 ? "var(--warning)" : "var(--danger-dark)");

export default function FairKpiClient({ initialPeriod, initialScores }: { initialPeriod: string; initialScores: Score[] }) {
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState(initialPeriod);
  const [scores, setScores] = useState<Score[]>(initialScores);

  const load = (p: string) =>
    start(async () => {
      try {
        const s = (await getFairKpiScores(p)) as unknown as Score[];
        setScores(JSON.parse(JSON.stringify(s)));
        setPeriod(p);
      } catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });

  const recompute = () =>
    start(async () => {
      try {
        const res = await computeFairKpiForPeriod(period);
        toast.success(`${res.employees} xodim hisoblandi`);
        const s = (await getFairKpiScores(period)) as unknown as Score[];
        setScores(JSON.parse(JSON.stringify(s)));
      } catch (e) { toast.error((e as Error).message || "Xatolik"); }
    });

  const inputStyle = { borderColor: "var(--border, var(--rule))", background: "transparent", color: "var(--text-primary)" };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Adolatli KPI (v2)</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Weighted composite · complexity-normalized · delay-reason exclusion</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="month" value={period} onChange={(e) => e.target.value && load(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" style={inputStyle} />
          <Button variant="primary" size="sm" disabled={pending} onClick={recompute}>Qayta hisoblash</Button>
        </div>
      </div>

      {/* Tahliliy qatlam ekanini aniq aytadi — "shadow rejim" vaqtinchalik holat
          kabi o'qilardi, aslida bu doimiy rol taqsimoti (ADR-0005). */}
      <div className="rounded-lg border-2 px-4 py-2 text-sm" style={{ borderColor: "var(--accent-indigo)", background: "var(--bg-sunken)", color: "var(--text)" }}>
        <span className="font-semibold">📊 Tahliliy reyting — oylikka ta&apos;sir qilmaydi.</span>{" "}
        Maosh reglament qoidalari bo&apos;yicha <b>KPI</b> sahifasida hisoblanadi. Bu yerdagi 0–100 ball
        xodimlarni solishtirish va yuklamani ko&apos;rish uchun; bu yerda hech narsa to&apos;lanmaydi.
      </div>

      {/* Weights legend */}
      <div className="flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {COMPONENTS.map((c) => <span key={c.key} className="px-2 py-0.5 rounded-lg" style={{ background: "var(--bg-hover, var(--bg-sunken))" }}>{c.label} {c.weight}</span>)}
      </div>

      {scores.length === 0 ? (
        <div className="rounded-xl border p-10 text-center text-sm" style={{ borderColor: "var(--border, var(--rule))", color: "var(--text-muted)" }}>
          Bu davr uchun ball yo'q. "Qayta hisoblash" bilan signallardan (obligation/task/davomat) hisoblang.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, var(--rule))" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold px-3 py-2.5">Xodim</th>
                <th className="text-right font-semibold px-3 py-2.5">Composite</th>
                {COMPONENTS.map((c) => <th key={c.key} className="text-right font-semibold px-3 py-2.5">{c.label}</th>)}
                <th className="text-right font-semibold px-3 py-2.5">Hajm ball</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => {
                const comp = Number(s.composite);
                return (
                  <tr key={s.employeeId} className="border-t" style={{ borderColor: "var(--border, var(--bg-sunken))" }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{s.employeeName}</td>
                    <td className="px-3 py-2.5 text-right"><span className="text-base font-semibold" style={{ color: scoreColor(comp) }}>{comp.toFixed(1)}</span></td>
                    {COMPONENTS.map((c) => {
                      const v = Number(s[c.key]);
                      return <td key={c.key} className="px-3 py-2.5 text-right" style={{ color: scoreColor(v) }}>{v.toFixed(0)}</td>;
                    })}
                    <td className="px-3 py-2.5 text-right" style={{ color: "var(--text-muted)" }}>{Number(s.volumePoints).toFixed(1)}</td>
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
