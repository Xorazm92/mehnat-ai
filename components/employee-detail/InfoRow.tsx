"use client";

/**
 * Xodim kartasidagi "yorliq → qiymat" qatori va uni o'rab turgan bo'lim.
 * Panel bo'limlari orasida takrorlanmasligi uchun alohida faylda.
 */
import React from "react";

export function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} style={{ color: "var(--accent-blue)" }} />
        <span className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>{title}</span>
        <div className="flex-1 h-px ml-1" style={{ background: "var(--card-border)" }} />
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        {children}
      </div>
    </div>
  );
}

export function InfoRow({ icon: Icon, label, value, mono, small }: { icon: React.ElementType; label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--card-border)" }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>
        <Icon size={15} />
      </div>
      <div className="text-micro font-bold uppercase tracking-widest w-36 shrink-0" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className={`${mono ? "font-mono" : ""} ${small ? "text-meta" : "text-body"} font-bold truncate flex-1 text-right`} style={{ color: "var(--text)" }}>{value}</div>
    </div>
  );
}
