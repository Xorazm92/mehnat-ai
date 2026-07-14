import React from "react";
import { Check, Minus } from "lucide-react";
import {
  ROLES,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type UserRole,
  type Capability,
} from "@/lib/permissions";

const CAP_LABELS: Record<Capability, string> = {
  view_all_companies: "Barcha firmalar",
  edit_contracts: "Shartnoma tahrirlash",
  manage_staff: "Xodim boshqaruvi",
  view_salaries: "Oyliklarni ko'rish",
  approve_kpi: "KPI tasdiqlash",
  process_payments: "To'lovlar",
  view_audit_logs: "Audit jurnali",
  manage_users: "Foydalanuvchi boshqaruvi",
  manage_system: "Tizim boshqaruvi",
  view_bank_operations: "Bank operatsiyalari",
  view_own_kpi: "Shaxsiy KPI",
  submit_reports: "Hisobot topshirish",
};

const ROLE_LIST = Object.values(ROLES) as UserRole[];
const CAP_LIST = Object.keys(CAP_LABELS) as Capability[];
const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

export function RolePermissionMatrix() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Qobiliyatlar (server xavfsizligi)</h2>
        <p className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          Kod bilan belgilangan RBAC — ma&apos;lumot uchun. Bu qobiliyatlar server tekshiruvlarini ta&apos;minlaydi
          (<span className="font-mono">lib/permissions.ts</span>). Menyu ko&apos;rinishini yuqoridagi jadvaldan sozlang.
        </p>
      </div>

      <div className="rounded-xl overflow-hidden" style={card}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                <th className="text-left px-4 py-3 font-bold uppercase tracking-widest text-[10px] sticky left-0" style={{ color: "var(--text-muted)", background: "var(--card-bg)" }}>Ruxsat</th>
                {ROLE_LIST.map((r) => (
                  <th key={r} className="px-3 py-3 font-bold text-[10px] text-center" style={{ color: "var(--text-muted)" }}>
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAP_LIST.map((cap) => (
                <tr key={cap} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-2.5 font-semibold sticky left-0" style={{ color: "var(--text-primary)", background: "var(--card-bg)" }}>{CAP_LABELS[cap]}</td>
                  {ROLE_LIST.map((r) => {
                    const has = ROLE_PERMISSIONS[r]?.includes(cap);
                    return (
                      <td key={r} className="px-3 py-2.5 text-center">
                        {has ? (
                          <Check size={15} className="inline" style={{ color: "var(--success)" }} />
                        ) : (
                          <Minus size={13} className="inline" style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                        )}
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
