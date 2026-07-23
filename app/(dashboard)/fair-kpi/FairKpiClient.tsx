"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getFairKpiScores, computeFairKpiForPeriod } from "@/server/fairKpi";

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

const scoreColor = (n: number) => (n >= 85 ? "#15803d" : n >= 65 ? "#b45309" : "#b91c1c");

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

  const inputStyle = { borderColor: "var(--border, #e5e7eb)", background: "transparent", color: "var(--text-primary)" };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Adolatli KPI (v2)</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Weighted composite · complexity-normalized · delay-reason exclusion</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="month" value={period} onChange={(e) => e.target.value && load(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" style={inputStyle} />
          <button disabled={pending} onClick={recompute} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#2563eb" }}>Qayta hisoblash</button>
        </div>
      </div>

      {/* Shadow-mode banner */}
      <div className="rounded-lg border-2 px-4 py-2 text-sm font-semibold" style={{ borderColor: "#f59e0b", background: "#fffbeb", color: "#b45309" }}>
        ⚠️ SHADOW rejim — bu ballar oylikka TA'SIR QILMAYDI. 2–3 oy kuzatib, xodimlar bilan muhokama qilib, keyin bonus tizimiga ulanadi.
      </div>

      {/* Weights legend */}
      <div className="flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {COMPONENTS.map((c) => <span key={c.key} className="px-2 py-0.5 rounded" style={{ background: "var(--bg-hover, #f3f4f6)" }}>{c.label} {c.weight}</span>)}
      </div>

      {scores.length === 0 ? (
        <div className="rounded-xl border p-10 text-center text-sm" style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--text-muted)" }}>
          Bu davr uchun ball yo'q. "Qayta hisoblash" bilan signallardan (obligation/task/davomat) hisoblang.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-hover, #f9fafb)", color: "var(--text-muted)" }}>
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
                  <tr key={s.employeeId} className="border-t" style={{ borderColor: "var(--border, #f1f5f9)" }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{s.employeeName}</td>
                    <td className="px-3 py-2.5 text-right"><span className="text-base font-black" style={{ color: scoreColor(comp) }}>{comp.toFixed(1)}</span></td>
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
