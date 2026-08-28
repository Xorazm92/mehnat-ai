"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { upsertSystemSetting } from "@/server/system-settings";
import { Button } from "@/components/ui/Button";
import {
  ASSIGNMENT_ROLES,
  ASSIGNMENT_ROLE_LABELS,
  ROLE_LABELS,
  type AssignmentRole,
  type UserRole,
} from "@/lib/permissions";
import { STANDARD_TARIFF, resolveTariffPreset, type TariffPreset } from "@/lib/tariffPresets";
import {
  PAYROLL_BASIS_DEFAULT,
  PAYROLL_BASIS_LABELS,
  isPayrollBasis,
  type PayrollBasis,
} from "@/lib/payrollBasis";

interface Settings {
  appName: string;
  defaultUserPassword: string;
  features: Record<string, boolean>;
  tariffPresetStandard?: TariffPreset;
  oneCBaseOpeners?: string[];
  payrollBasis?: PayrollBasis;
}

interface StaffOption {
  id: string;
  fullName: string;
  role: string;
}

const FEATURE_LABELS: Record<string, string> = {
  eimzo: "E-imzo",
  integration_1c: "1C integratsiyasi",
  integration_didox: "Didox integratsiyasi",
  integration_soliq: "Soliq.uz integratsiyasi",
  integration_mysoliq: "My.soliq integratsiyasi",
  tasks: "Vazifalar moduli",
  invoices: "Hisob-fakturalar moduli",
};

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };
const inputCls = "w-full px-3 py-2 rounded-lg text-body outline-none";
const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" } as const;

export default function AdminSettingsClient({
  settings,
  staff = [],
}: {
  settings: Settings;
  staff?: StaffOption[];
}) {
  const router = useRouter();
  const [appName, setAppName] = useState(settings.appName);
  const [defaultPw, setDefaultPw] = useState(settings.defaultUserPassword);
  const [features, setFeatures] = useState<Record<string, boolean>>(settings.features || {});
  const [tariff, setTariff] = useState<TariffPreset>(
    resolveTariffPreset(settings.tariffPresetStandard)
  );
  const [oneCOpeners, setOneCOpeners] = useState<string[]>(settings.oneCBaseOpeners ?? []);
  const [payrollBasis, setPayrollBasis] = useState<PayrollBasis>(
    isPayrollBasis(settings.payrollBasis) ? settings.payrollBasis : PAYROLL_BASIS_DEFAULT
  );
  const [busy, setBusy] = useState(false);

  const tariffTotal = ASSIGNMENT_ROLES.reduce((sum, r) => sum + (Number(tariff[r]) || 0), 0);

  const toggleOpener = (id: string) =>
    setOneCOpeners((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (ASSIGNMENT_ROLES.some((r) => !(tariff[r] >= 0 && tariff[r] <= 100))) {
      toast.error("Har bir foiz 0 va 100 orasida bo'lishi kerak");
      return;
    }
    setBusy(true);
    try {
      await upsertSystemSetting("appName", appName);
      await upsertSystemSetting("defaultUserPassword", defaultPw);
      await upsertSystemSetting("features", features);
      await upsertSystemSetting("tariffPresetStandard", tariff);
      await upsertSystemSetting("oneCBaseOpeners", oneCOpeners);
      await upsertSystemSetting("payrollBasis", payrollBasis);
      toast.success("Sozlamalar saqlandi");
      router.refresh();
    } catch (e) {
      toast.error((e as Error)?.message || "Xatolik yuz berdi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Tizim sozlamalari</h1>
        <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Global konfiguratsiya va modul bayroqlari</p>
      </div>

      <div className="p-5 rounded-xl space-y-3" style={card}>
        <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Umumiy</div>
        <label className="block">
          <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Ilova nomi</span>
          <input className={inputCls + " mt-1"} style={inputStyle} value={appName} onChange={(e) => setAppName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Yangi foydalanuvchi uchun standart parol</span>
          <input className={inputCls + " mt-1"} style={inputStyle} value={defaultPw} onChange={(e) => setDefaultPw(e.target.value)} />
        </label>
      </div>

      <div className="p-5 rounded-xl space-y-3" style={card}>
        <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Oylik bazasi</div>
        <p className="text-meta" style={{ color: "var(--text-muted)" }}>
          Xodim ulushi va KPI bonusi qaysi summadan hisoblanadi. &laquo;Tushum&raquo; rejimida
          mijoz to&apos;lamagan oy uchun gonorar hisoblanmaydi — to&apos;lovning qancha qismi
          tushgan bo&apos;lsa, ulush ham shuncha bo&apos;ladi.
        </p>
        <label className="block">
          <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Hisoblash bazasi</span>
          <select
            className={inputCls + " mt-1"}
            style={inputStyle}
            value={payrollBasis}
            onChange={(e) => setPayrollBasis(e.target.value as PayrollBasis)}
          >
            <option value="accrual">{PAYROLL_BASIS_LABELS.accrual}</option>
            <option value="cash">{PAYROLL_BASIS_LABELS.cash}</option>
          </select>
        </label>
      </div>

      <div className="p-5 rounded-xl space-y-3" style={card}>
        <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Standart tarif taqsimoti</div>
        <p className="text-meta" style={{ color: "var(--text-muted)" }}>
          Firma biriktirishdagi &quot;Standart taqsimot&quot; tugmasi shu foizlarni qo&apos;yadi.
          Shartnoma summasidan hisoblanadi.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ASSIGNMENT_ROLES.map((role: AssignmentRole) => (
            <label key={role} className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>
                {ASSIGNMENT_ROLE_LABELS[role]}
              </span>
              <div className="relative mt-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls + " text-right tabular-nums !pr-8"}
                  style={inputStyle}
                  value={tariff[role]}
                  onChange={(e) => setTariff({ ...tariff, [role]: Number(e.target.value) })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-meta" style={{ color: "var(--text-muted)" }}>%</span>
              </div>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between text-meta">
          <span style={{ color: "var(--text-muted)" }}>
            Jami: <b className="tabular-nums" style={{ color: tariffTotal > 100 ? "var(--danger)" : "var(--text-primary)" }}>{tariffTotal}%</b>
          </span>
          <button
            type="button"
            className="font-semibold"
            style={{ color: "var(--accent-blue)" }}
            onClick={() => setTariff({ ...STANDARD_TARIFF })}
          >
            Zavod qiymatlariga qaytarish
          </button>
        </div>
      </div>

      <div className="p-5 rounded-xl space-y-3" style={card}>
        <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>1C baza ochish xabarnomasi</div>
        <p className="text-meta" style={{ color: "var(--text-muted)" }}>
          Yangi firma qo&apos;shilganda tanlangan xodimlar saytda va Telegramda xabar oladi.
          Hech kim tanlanmasa — barcha admin va superadminga boradi.
        </p>
        <div className="max-h-56 overflow-y-auto rounded-lg" style={{ border: "1px solid var(--card-border)" }}>
          {staff.length === 0 ? (
            <p className="p-3 text-meta" style={{ color: "var(--text-muted)" }}>Faol xodim topilmadi</p>
          ) : (
            staff.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                style={{ borderBottom: "1px solid var(--card-border)" }}
              >
                <input
                  type="checkbox"
                  checked={oneCOpeners.includes(s.id)}
                  onChange={() => toggleOpener(s.id)}
                />
                <span className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>{s.fullName}</span>
                <span className="text-meta ml-auto" style={{ color: "var(--text-muted)" }}>{ROLE_LABELS[s.role as UserRole] ?? s.role}</span>
              </label>
            ))
          )}
        </div>
        <p className="text-meta" style={{ color: "var(--text-muted)" }}>
          Tanlangan: <b style={{ color: "var(--text-primary)" }}>{oneCOpeners.length}</b> ta
        </p>
      </div>

      <div className="p-5 rounded-xl" style={card}>
        <div className="text-micro font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Modullar & integratsiyalar</div>
        <div className="space-y-1">
          {Object.keys(FEATURE_LABELS).map((key) => (
            <label key={key} className="flex items-center justify-between py-2 cursor-pointer" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <span className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>{FEATURE_LABELS[key]}</span>
              <button
                type="button"
                onClick={() => setFeatures({ ...features, [key]: !features[key] })}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{ background: features[key] ? "var(--accent-blue)" : "var(--card-border)" }}
              >
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[var(--card-bg)] transition-transform" style={{ transform: features[key] ? "translateX(20px)" : "none" }} />
              </button>
            </label>
          ))}
        </div>
        <p className="text-meta mt-3" style={{ color: "var(--text-muted)" }}>
          Yoqilgan modullar &quot;Tez orada&quot; sahifasida &quot;yoqilgan&quot; deb ko&apos;rsatiladi; backend tayyor bo&apos;lgach ular to&apos;liq ishga tushadi.
        </p>
      </div>

      <Button variant="primary" size="md" onClick={save} disabled={busy}>
        <Save size={15} /> Saqlash
      </Button>
    </div>
  );
}
