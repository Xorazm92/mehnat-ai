import React from "react";
import { Construction } from "lucide-react";
import { findAdminModule } from "@/lib/admin/registry";

/** Consistent "coming soon" panel for registry modules with status:'soon'. */
export function AdminModulePlaceholder({
  moduleId,
  enabled,
}: {
  moduleId: string;
  enabled?: boolean;
}) {
  const mod = findAdminModule(moduleId);
  const Icon = mod?.icon ?? Construction;

  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}
      >
        <Icon size={30} />
      </div>
      <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>
        {mod?.labelUz ?? "Modul"}
      </h1>
      <p className="mt-2 max-w-md text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
        {mod?.descUz ?? "Bu modul hali ishlab chiqilmoqda."}
      </p>
      <div
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest"
        style={{
          background: enabled ? "var(--success-bg)" : "var(--warning-bg)",
          color: enabled ? "var(--success)" : "var(--warning)",
        }}
      >
        {enabled ? "Yoqilgan — integratsiya kutilmoqda" : "Tez orada"}
      </div>
      {mod?.featureFlag && (
        <p className="mt-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Tizim sozlamalaridan <span className="font-bold">{mod.featureFlag}</span> bayrog'ini yoqing.
        </p>
      )}
    </div>
  );
}
