"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Periodicity, DeadlineAnchorType, WorkdayAdjustmentPolicy, TemplateLifecycle } from "@prisma/client";
import { formatUzDate } from "@/lib/platform/format";
import {
  createDeadlineTemplate,
  setTemplateLifecycle,
  createNewVersion,
  addTemplateApplicability,
  removeTemplateApplicability,
  setTemplateNormativeMinutes,
} from "@/server/deadlineTemplates";
import { Button } from "@/components/ui/Button";
import { friendlyError } from "@/lib/actionError";
import { DateField } from "@/components/ui/DateField";
import { TemplateOverridesPanel } from "@/components/admin/TemplateOverridesPanel";

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
  normativeMinutes: number | null;
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
  const [overridesFor, setOverridesFor] = useState<{ id: string; name: string } | null>(null);
  /** Tahrirlanayotgan normativ — `null` bo'lsa hech biri ochiq emas. */
  const [effortFor, setEffortFor] = useState<{ id: string; value: string } | null>(null);

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(friendlyError(e) || "Xatolik");
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
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Muddat shablonlari</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Takrorlanuvchi majburiyat qoidalari — versiyalash + lifecycle</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Bekor" : "+ Yangi shablon"}
        </Button>
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
            <DateField inputClassName={input} inputStyle={inputStyle} value={f.effectiveFrom} onChange={(v) => setF({ ...f, effectiveFrom: v })} />
          </label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Tugash (ixt.)
            <DateField inputClassName={input} inputStyle={inputStyle} value={f.effectiveTo} onChange={(v) => setF({ ...f, effectiveTo: v })} />
          </label>
          <div className="col-span-2 md:col-span-3">
            <Button variant="success" size="md" disabled={pending} onClick={submitCreate}>
              Qoralama yaratish
            </Button>
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
                    <button disabled={pending} onClick={() => setOverridesFor({ id: t.id, name: t.name })}
                      title="Qaysi firmalarga tegishli emas"
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50"
                      style={{ background: "var(--bg-hover, var(--bg-sunken))", color: "var(--text-secondary)" }}>
                      Istisnolar
                    </button>
                    {(t.lifecycle === "active" || t.lifecycle === "approved") && (
                      <button disabled={pending} onClick={() => run(() => createNewVersion(t.id), "Yangi versiya yaratildi")} className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ background: "var(--bg-hover, var(--accent-indigo-light))", color: "var(--accent-indigo)" }}>
                        Yangi versiya
                      </button>
                    )}
                  </div>
                </div>

                {/* Normativ mehnat — sig'im ballining yagona kirishi.
                    Lifecycle'dan qat'i nazar tahrirlanadi: u majburiyatga
                    ta'sir qilmaydi, faqat yuklama bahosiga. */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-meta" style={{ color: "var(--text-muted)" }}>Normativ mehnat:</span>
                  {effortFor?.id === t.id ? (
                    <span className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        max={1440}
                        value={effortFor.value}
                        onChange={(e) => setEffortFor({ id: t.id, value: e.target.value })}
                        placeholder="daqiqa"
                        aria-label="Normativ mehnat, daqiqada"
                        className="text-meta px-1 py-0.5 rounded-lg border w-20"
                        style={inputStyle}
                      />
                      <Button
                        variant="primary"
                        size="md"
                        disabled={pending}
                        onClick={() => {
                          const raw = effortFor.value.trim();
                          run(
                            () => setTemplateNormativeMinutes(t.id, raw === "" ? null : Number(raw)),
                            "Normativ saqlandi",
                          );
                          setEffortFor(null);
                        }}
                      >
                        ✓
                      </Button>
                      <button onClick={() => setEffortFor(null)} className="text-meta px-1" style={{ color: "var(--text-muted)" }}>
                        bekor
                      </button>
                    </span>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() => setEffortFor({ id: t.id, value: t.normativeMinutes ? String(t.normativeMinutes) : "" })}
                      className="text-meta px-1.5 py-0.5 rounded-lg"
                      style={{
                        background: "var(--bg-hover, var(--bg-sunken))",
                        color: t.normativeMinutes ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      {/* Bo'sh ustun "hali hal qilinmagan" degani va shundayligicha
                          ko'rinadi — standart raqamni yozib qo'yish uni qaror
                          bo'lib ko'rsatardi (ADR-0010). */}
                      {t.normativeMinutes ? `${t.normativeMinutes} daqiqa` : "belgilanmagan — turi bo'yicha standart"}
                    </button>
                  )}
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
                      <Button variant="primary" size="md" disabled={pending || !a.value.trim()} onClick={() => { run(() => addTemplateApplicability(t.id, a.type, a.value), "Qamrov qo'shildi"); setAppl({ ...appl, [t.id]: { ...a, value: "" } }); }}>+</Button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {overridesFor && (
        <TemplateOverridesPanel
          templateId={overridesFor.id}
          templateName={overridesFor.name}
          open
          onClose={() => setOverridesFor(null)}
        />
      )}
    </div>
  );
}
