"use client";
import React, { useMemo, useState, useEffect } from "react";
import { KPIRule, KpiRuleOption, Language, MonthlyPerformance } from "@/types";
import { computeRuleScore, type KpiEntryInput } from "@/lib/kpiScoring";

interface Props {
  rule: KPIRule;
  perf?: MonthlyPerformance;
  /** so'm base for this role at this company — shows live salary impact when set */
  base?: number;
  lang: Language;
  disabled?: boolean;
  onSave: (input: KpiEntryInput) => void | Promise<void>;
}

// color -> ASRO CSS vars
const C = {
  green: { fg: "var(--success)", bg: "var(--success-bg)", bd: "var(--success-border)" },
  yellow: { fg: "var(--warning)", bg: "var(--warning-bg)", bd: "var(--warning-border)" },
  red: { fg: "var(--danger)", bg: "var(--danger-bg)", bd: "var(--danger-border)" },
} as const;

const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${Number(n.toFixed(2))}%`;
const fmtSom = (n: number) => Math.round(n).toLocaleString("ru-RU");

const KpiEntryCard: React.FC<Props> = ({ rule, perf, base, lang, disabled, onSave }) => {
  const options = (rule.options ?? []) as KpiRuleOption[];
  const type = rule.inputTypeV2 ?? "select";

  // local input state seeded from the existing performance record
  const [selectedOption, setSelectedOption] = useState<string | null>(perf?.selectedOption ?? null);
  const [earlyDays, setEarlyDays] = useState<number>(perf?.earlyDays ?? 0);
  const [lateMinutes, setLateMinutes] = useState<number>(perf?.lateMinutes ?? 0);
  const [absentDays, setAbsentDays] = useState<number>(perf?.absentDays ?? 0);
  const [penaltyAmount, setPenaltyAmount] = useState<number>(perf?.penaltyAmount ?? 0);

  useEffect(() => {
    setSelectedOption(perf?.selectedOption ?? null);
    setEarlyDays(perf?.earlyDays ?? 0);
    setLateMinutes(perf?.lateMinutes ?? 0);
    setAbsentDays(perf?.absentDays ?? 0);
    setPenaltyAmount(perf?.penaltyAmount ?? 0);
  }, [perf?.id, perf?.selectedOption, perf?.earlyDays, perf?.lateMinutes, perf?.absentDays, perf?.penaltyAmount]);

  const input: KpiEntryInput = useMemo(
    () => ({
      selectedOption,
      counters: { early_days: earlyDays, late_5min: Math.floor(lateMinutes / 5), absent_days: absentDays },
      penaltyAmount,
    }),
    [selectedOption, earlyDays, lateMinutes, absentDays, penaltyAmount]
  );

  const score = useMemo(() => computeRuleScore(rule as never, input), [rule, input]);
  const pct = score.percent;
  const somImpact = base ? (base * pct) / 100 : 0;
  const activeColor = score.color ? C[score.color] : null;

  const save = (patch: Partial<{ selectedOption: string | null; earlyDays: number; lateMinutes: number; absentDays: number; penaltyAmount: number }>) => {
    if (disabled) return;
    const nextEarly = patch.earlyDays ?? earlyDays;
    const nextLate = patch.lateMinutes ?? lateMinutes;
    const nextAbsent = patch.absentDays ?? absentDays;
    onSave({
      selectedOption: patch.selectedOption ?? selectedOption,
      counters: { early_days: nextEarly, late_5min: Math.floor(nextLate / 5), absent_days: nextAbsent },
      penaltyAmount: patch.penaltyAmount ?? penaltyAmount,
    });
  };

  const counterFieldFor = (key: string) => {
    if (key === "early_days") return { label: lang === "uz" ? "kunlar" : "дней", value: earlyDays, set: (v: number) => { setEarlyDays(v); save({ earlyDays: v }); } };
    if (key === "late_5min") return { label: lang === "uz" ? "daqiqa" : "минут", value: lateMinutes, set: (v: number) => { setLateMinutes(v); save({ lateMinutes: v }); } };
    if (key === "absent_days") return { label: lang === "uz" ? "kunlar" : "дней", value: absentDays, set: (v: number) => { setAbsentDays(v); save({ absentDays: v }); } };
    return null;
  };

  return (
    <div
      className="p-3.5 rounded-xl flex flex-col gap-3 transition-all"
      style={{
        background: activeColor ? activeColor.bg : "var(--input-bg)",
        border: `1px solid ${activeColor ? activeColor.bd : "var(--card-border)"}`,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Title + live score */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-[12.5px] leading-tight" style={{ color: "var(--text-primary)" }}>
            {rule.nameUz || rule.name}
          </p>
          {rule.descriptionUz && (
            <p className="text-[10px] mt-1 leading-snug line-clamp-2" style={{ color: "var(--text-muted)" }}>
              {rule.descriptionUz}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="text-[13px] font-extrabold tabular-nums" style={{ color: activeColor ? activeColor.fg : "var(--text-muted)" }}>
            {fmtPct(pct)}
          </span>
          {base ? (
            <p className="text-[9px] font-bold tabular-nums mt-0.5" style={{ color: somImpact > 0 ? "var(--success)" : somImpact < 0 ? "var(--danger)" : "var(--text-muted)" }}>
              {somImpact > 0 ? "+" : ""}{fmtSom(somImpact)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Controls */}
      {(type === "select" || type === "checkbox_bonus" || type === "checkbox_penalty") && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const col = o.color ? C[o.color] : C.yellow;
            const isSel = selectedOption === o.key;
            return (
              <button
                key={o.key}
                type="button"
                disabled={disabled}
                onClick={() => { setSelectedOption(o.key); save({ selectedOption: o.key }); }}
                className="px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold transition-all"
                style={{
                  background: isSel ? col.fg : col.bg,
                  color: isSel ? "#fff" : col.fg,
                  border: `1px solid ${col.bd}`,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                {o.label_uz || o.key}
                {typeof o.coeff === "number" && o.coeff !== 0 ? ` (${fmtPct(o.coeff)})` : ""}
              </button>
            );
          })}
        </div>
      )}

      {type === "counter" && (
        <div className="flex flex-wrap gap-3">
          {options.map((o) => {
            const f = counterFieldFor(o.key);
            if (!f) return null;
            const per = o.coeff_per_unit ?? 0;
            return (
              <label key={o.key} className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: per >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {o.label_uz || o.key}
                </span>
                <input
                  type="number"
                  min={0}
                  disabled={disabled}
                  value={f.value || ""}
                  onChange={(e) => f.set(Math.max(0, Number(e.target.value) || 0))}
                  className="w-16 px-2 py-1.5 rounded-lg text-[12px] font-bold outline-none text-center tabular-nums"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                />
                <span className="text-[9px] font-bold" style={{ color: "var(--text-muted)" }}>{f.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {type === "amount_penalty" && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--danger)" }}>
            {lang === "uz" ? "Jarima summasi (so'm)" : "Сумма штрафа (сум)"}
          </span>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={penaltyAmount || ""}
            onChange={(e) => setPenaltyAmount(Math.max(0, Number(e.target.value) || 0))}
            onBlur={() => save({ penaltyAmount })}
            className="flex-1 px-2 py-1.5 rounded-lg text-[12px] font-bold outline-none tabular-nums"
            style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
            placeholder="0"
          />
          {penaltyAmount > 0 && (
            <button type="button" onClick={() => { setPenaltyAmount(0); save({ penaltyAmount: 0 }); }}
              className="text-[10px] font-bold px-2 py-1.5 rounded-lg" style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>
              {lang === "uz" ? "Xato yo'q" : "Нет ошибки"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default KpiEntryCard;
