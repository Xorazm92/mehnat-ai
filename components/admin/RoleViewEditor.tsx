"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Check, Lock } from "lucide-react";
import { ROLE_LABELS, VIEW_LABELS, type UserRole, type AppView } from "@/lib/permissions";
import { saveRoleViews, type RoleViewMatrix } from "@/server/rbac";
import { Button } from "@/components/ui/Button";

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

export default function RoleViewEditor({ initial }: { initial: RoleViewMatrix }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<Record<string, Record<string, boolean>>>(initial.enabled);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const toggle = (role: UserRole, view: AppView) => {
    if (role === "super_admin") return; // superadmin doim to'liq
    setEnabled((prev) => ({
      ...prev,
      [role]: { ...prev[role], [view]: !prev[role]?.[view] },
    }));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveRoleViews(enabled);
      toast.success("Ruxsatlar saqlandi");
      setDirty(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error)?.message || "Saqlashda xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Rollar & Ruxsatlar</h1>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Har bir rol qaysi bo&apos;limlarni (menyu) ko&apos;rishini belgilang. Superadmin doim hammasini ko&apos;radi.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={save} disabled={busy || !dirty}>
          <Save size={15} /> Saqlash
        </Button>
      </div>

      {dirty && (
        <div className="px-3 py-2 rounded-lg text-xs font-bold inline-block" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--warning)" }}>
          Saqlanmagan o&apos;zgarishlar bor
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={card}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                <th className="text-left px-4 py-3 font-bold uppercase tracking-widest text-micro sticky left-0" style={{ color: "var(--text-muted)", background: "var(--card-bg)" }}>Bo&apos;lim</th>
                {initial.roles.map((r) => (
                  <th key={r} className="px-3 py-3 font-bold text-micro text-center whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {ROLE_LABELS[r]}
                    {r === "super_admin" && <Lock size={9} className="inline ml-1" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initial.views.map((v) => (
                <tr key={v} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-2 font-semibold sticky left-0" style={{ color: "var(--text-primary)", background: "var(--card-bg)" }}>
                    {VIEW_LABELS[v]} <span className="text-micro font-mono" style={{ color: "var(--text-muted)" }}>{v}</span>
                  </td>
                  {initial.roles.map((r) => {
                    const on = !!enabled[r]?.[v];
                    const locked = r === "super_admin";
                    return (
                      <td key={r} className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggle(r, v)}
                          disabled={busy || locked}
                          className="w-6 h-6 rounded-lg inline-flex items-center justify-center transition-colors"
                          style={{
                            background: on ? "var(--success-bg)" : "var(--input-bg)",
                            border: `1px solid ${on ? "var(--success-border)" : "var(--card-border)"}`,
                            cursor: locked ? "not-allowed" : "pointer",
                            opacity: locked ? 0.7 : 1,
                          }}
                          aria-label={locked ? "Superadmin doim ko'radi" : on ? "Ko'radi — bosib o'chiring" : "Ko'rmaydi — bosib yoqing"}
                          aria-pressed={locked ? undefined : on}
                        >
                          {on && <Check size={14} style={{ color: "var(--success)" }} />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
