"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { upsertSystemSetting } from "@/server/system-settings";

interface Settings {
  appName: string;
  defaultUserPassword: string;
  features: Record<string, boolean>;
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
const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none";
const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" } as const;

export default function AdminSettingsClient({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [appName, setAppName] = useState(settings.appName);
  const [defaultPw, setDefaultPw] = useState(settings.defaultUserPassword);
  const [features, setFeatures] = useState<Record<string, boolean>>(settings.features || {});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await upsertSystemSetting("appName", appName);
      await upsertSystemSetting("defaultUserPassword", defaultPw);
      await upsertSystemSetting("features", features);
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
        <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Tizim sozlamalari</h1>
        <p className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>Global konfiguratsiya va modul bayroqlari</p>
      </div>

      <div className="p-5 rounded-xl space-y-3" style={card}>
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Umumiy</div>
        <label className="block">
          <span className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>Ilova nomi</span>
          <input className={inputCls + " mt-1"} style={inputStyle} value={appName} onChange={(e) => setAppName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>Yangi foydalanuvchi uchun standart parol</span>
          <input className={inputCls + " mt-1"} style={inputStyle} value={defaultPw} onChange={(e) => setDefaultPw(e.target.value)} />
        </label>
      </div>

      <div className="p-5 rounded-xl" style={card}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Modullar & integratsiyalar</div>
        <div className="space-y-1">
          {Object.keys(FEATURE_LABELS).map((key) => (
            <label key={key} className="flex items-center justify-between py-2 cursor-pointer" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{FEATURE_LABELS[key]}</span>
              <button
                type="button"
                onClick={() => setFeatures({ ...features, [key]: !features[key] })}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{ background: features[key] ? "var(--accent-blue)" : "var(--card-border)" }}
              >
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: features[key] ? "translateX(20px)" : "none" }} />
              </button>
            </label>
          ))}
        </div>
        <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
          Yoqilgan modullar &quot;Tez orada&quot; sahifasida &quot;yoqilgan&quot; deb ko&apos;rsatiladi; backend tayyor bo&apos;lgach ular to&apos;liq ishga tushadi.
        </p>
      </div>

      <button onClick={save} disabled={busy} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-widest text-white disabled:opacity-50" style={{ background: "var(--accent-blue)" }}>
        <Save size={15} /> Saqlash
      </button>
    </div>
  );
}
