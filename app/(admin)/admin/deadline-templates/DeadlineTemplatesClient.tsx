"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Periodicity, DeadlineAnchorType, WorkdayAdjustmentPolicy, TemplateLifecycle } from "@prisma/client";
import { formatUzDate } from "@/lib/format";
import {
  createDeadlineTemplate,
  setTemplateLifecycle,
  createNewVersion,
  addTemplateApplicability,
  removeTemplateApplicability,
} from "@/server/deadlineTemplates";

interface Applicability {
  id: string;
  criteriaType: string;
  criteriaValue: string;
}
interface Template {
  id: string;
  code: string;
  name: string;
  obligationType: string;
  periodicity: string;
  anchorType: string;
  dueDay: number | null;
  dueMonth: number | null;
  offsetDays: number | null;
  adjustmentPolicy: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  version: number;
  lifecycle: string;
  applicability: Applicability[];
  _count: { obligations: number };
}

const PERIODICITY: Record<string, string> = { monthly: "Oylik", quarterly: "Choraklik", annual: "Yillik" };
const ADJUST: Record<string, string> = { none: "Surilmaydi", next_workday: "Keyingi ish kuni", previous_workday: "Oldingi ish kuni" };
const LIFECYCLE: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Qoralama", bg: "var(--rule)", fg: "var(--text-secondary)" },
  approved: { label: "Tasdiqlangan", bg: "var(--info-bg)", fg: "var(--brand-deep)" },
  active: { label: "Faol", bg: "var(--success-bg)", fg: "var(--success)" },
  retired: { label: "Arxiv", bg: "var(--bg-sunken)", fg: "var(--text-muted)" },
};
const CRITERIA_TYPES = ["tax_regime", "vat_payer", "has_employees", "stats_type", "service_key", "company_status"];

const nextLifecycle = (lc: string): { label: string; to: TemplateLifecycle; danger?: boolean } | null => {
  if (lc === "draft") return { label: "Tasdiqlash", to: "approved" };
  if (lc === "approved") return { label: "Faollashtirish", to: "active" };
  if (lc === "active") return { label: "Arxivlash", to: "retired", danger: true };
  return null;
};

function ruleSummary(t: Template): string {
  if (t.anchorType === "fixed_day_of_month") {
    const mon = t.dueMonth ? `${t.dueMonth}-oy ` : "";
    return `${mon}${t.dueDay ?? "?"}-kun`;
  }
  return `Davr oxiridan +${t.offsetDays ?? 0} kun`;
}

const EMPTY = {
  code: "",
  name: "",
  obligationType: "tax_declaration",
  periodicity: "monthly" as Periodicity,
  anchorType: "fixed_day_of_month" as DeadlineAnchorType,
  dueDay: "20",
  dueMonth: "",
  offsetDays: "",
  adjustmentPolicy: "next_workday" as WorkdayAdjustmentPolicy,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: "",
};

export default function DeadlineTemplatesClient({ initial }: { initial: Template[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ ...EMPTY });
  const [appl, setAppl] = useState<Record<string, { type: string; value: string }>>({});

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message || "Xatolik");
      }
    });

  const submitCreate = () => {
    if (!f.code.trim() || !f.name.trim()) return toast.error("Kod va nom majburiy");
    run(
      () =>
        createDeadlineTemplate({
          code: f.code,
          name: f.name,
          obligationType: f.obligationType,
          periodicity: f.periodicity,
          anchorType: f.anchorType,
          dueDay: f.dueDay ? Number(f.dueDay) : null,
          dueMonth: f.dueMonth ? Number(f.dueMonth) : null,
          offsetDays: f.offsetDays ? Number(f.offsetDays) : null,
          adjustmentPolicy: f.adjustmentPolicy,
          effectiveFrom: f.effectiveFrom,
          effectiveTo: f.effectiveTo || null,
        }),
      "Shablon yaratildi",
    );
    setF({ ...EMPTY });
    setShowForm(false);
  };

  const input = "px-2.5 py-1.5 rounded-lg border text-sm w-full";
  const inputStyle = { borderColor: "var(--border, var(--rule))", background: "transparent", color: "var(--text-primary)" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Muddat shablonlari</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Takrorlanuvchi majburiyat qoidalari — versiyalash + lifecycle</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: "var(--brand)" }}>
          {showForm ? "Bekor" : "+ Yangi shablon"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border p-4 grid grid-cols-2 md:grid-cols-3 gap-3" style={{ borderColor: "var(--border, var(--rule))" }}>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Kod
            <input className={input} style={inputStyle} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="QQS_DECLARATION" />
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Nom
            <input className={input} style={inputStyle} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="QQS deklaratsiyasi" />
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Turi
            <input className={input} style={inputStyle} value={f.obligationType} onChange={(e) => setF({ ...f, obligationType: e.target.value })} />
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Davriylik
            <select className={input} style={inputStyle} value={f.periodicity} onChange={(e) => setF({ ...f, periodicity: e.target.value as Periodicity })}>
              {Object.entries(PERIODICITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Muddat turi
            <select className={input} style={inputStyle} value={f.anchorType} onChange={(e) => setF({ ...f, anchorType: e.target.value as DeadlineAnchorType })}>
              <option value="fixed_day_of_month">Oy kuni</option>
              <option value="period_end_offset">Davr oxiridan offset</option>
            </select>
          </label>
          {f.anchorType === "fixed_day_of_month" ? (
            <div className="flex gap-2">
              <label className="text-xs flex-1" style={{ color: "var(--text-muted)" }}>Kun
                <input className={input} style={inputStyle} type="number" value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })} />
              </label>
              <label className="text-xs flex-1" style={{ color: "var(--text-muted)" }}>Oy (ixt.)
                <input className={input} style={inputStyle} type="number" value={f.dueMonth} onChange={(e) => setF({ ...f, dueMonth: e.target.value })} />
              </label>
            </div>
          ) : (
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Offset (kun)
              <input className={input} style={inputStyle} type="number" value={f.offsetDays} onChange={(e) => setF({ ...f, offsetDays: e.target.value })} />
            </label>
          )}
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Ish kuniga surish
            <select className={input} style={inputStyle} value={f.adjustmentPolicy} onChange={(e) => setF({ ...f, adjustmentPolicy: e.target.value as WorkdayAdjustmentPolicy })}>
              {Object.entries(ADJUST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Kuchga kirish
            <input className={input} style={inputStyle} type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Tugash (ixt.)
            <input className={input} style={inputStyle} type="date" value={f.effectiveTo} onChange={(e) => setF({ ...f, effectiveTo: e.target.value })} />
          </label>
          <div className="col-span-2 md:col-span-3">
            <button disabled={pending} onClick={submitCreate} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--success)" }}>
              Qoralama yaratish
            </button>
          </div>
        </div>
      )}

      {initial.length === 0 ? (
        <div className="rounded-xl border p-10 text-center text-sm" style={{ borderColor: "var(--border, var(--rule))", color: "var(--text-muted)" }}>
          Hozircha shablon yo'q. "Yangi shablon" bilan qoralama yarating → tasdiqlang → faollashtiring; generator faqat FAOL shablonlar bo'yicha ishlaydi.
        </div>
      ) : (
        <div className="space-y-3">
          {initial.map((t) => {
            const lc = LIFECYCLE[t.lifecycle] ?? LIFECYCLE.draft;
            const nx = nextLifecycle(t.lifecycle);
            const a = appl[t.id] ?? { type: CRITERIA_TYPES[0], value: "" };
            return (
              <div key={t.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border, var(--rule))" }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold" style={{ color: "var(--text-primary)" }}>{t.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-lg font-mono" style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-muted)" }}>{t.code} v{t.version}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: lc.bg, color: lc.fg }}>{lc.label}</span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {PERIODICITY[t.periodicity]} · {ruleSummary(t)} · {ADJUST[t.adjustmentPolicy]} · {formatUzDate(t.effectiveFrom)}
                      {t.effectiveTo ? ` – ${formatUzDate(t.effectiveTo)}` : ""} · {t._count.obligations} majburiyat
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {nx && (
                      <button disabled={pending} onClick={() => run(() => setTemplateLifecycle(t.id, nx.to), `${nx.label} ✓`)} className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ background: nx.danger ? "var(--danger-bg)" : "var(--success-bg)", color: nx.danger ? "var(--danger-dark)" : "var(--success)" }}>
                        {nx.label}
                      </button>
                    )}
                    {(t.lifecycle === "active" || t.lifecycle === "approved") && (
                      <button disabled={pending} onClick={() => run(() => createNewVersion(t.id), "Yangi versiya yaratildi")} className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ background: "var(--bg-hover, var(--accent-indigo-light))", color: "var(--accent-indigo)" }}>
                        Yangi versiya
                      </button>
                    )}
                  </div>
                </div>

                {/* Applicability */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-meta" style={{ color: "var(--text-muted)" }}>Qamrov:</span>
                  {t.applicability.length === 0 && <span className="text-meta italic" style={{ color: "var(--text-muted)" }}>universal (barcha yaroqli firma)</span>}
                  {t.applicability.map((ap) => (
                    <span key={ap.id} className="text-meta px-1.5 py-0.5 rounded-lg flex items-center gap-1" style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-primary)" }}>
                      {ap.criteriaType}={ap.criteriaValue}
                      {t.lifecycle === "draft" && (
                        <button disabled={pending} onClick={() => run(() => removeTemplateApplicability(ap.id), "O'chirildi")} className="text-[var(--danger)] font-bold">×</button>
                      )}
                    </span>
                  ))}
                  {t.lifecycle === "draft" && (
                    <span className="flex items-center gap-1">
                      <select value={a.type} onChange={(e) => setAppl({ ...appl, [t.id]: { ...a, type: e.target.value } })} className="text-meta px-1 py-0.5 rounded-lg border" style={inputStyle}>
                        {CRITERIA_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input value={a.value} onChange={(e) => setAppl({ ...appl, [t.id]: { ...a, value: e.target.value } })} placeholder="qiymat" className="text-meta px-1 py-0.5 rounded-lg border w-24" style={inputStyle} />
                      <button disabled={pending || !a.value.trim()} onClick={() => { run(() => addTemplateApplicability(t.id, a.type, a.value), "Qamrov qo'shildi"); setAppl({ ...appl, [t.id]: { ...a, value: "" } }); }} className="text-meta font-semibold px-1.5 py-0.5 rounded-lg disabled:opacity-50" style={{ background: "var(--brand)", color: "#fff" }}>+</button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
