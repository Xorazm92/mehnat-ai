"use client";

import React, { useState } from "react";
import { ModalLayer } from "@/components/ui/ModalLayer";
import { Plus, Pencil, Power, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface ChiefOption {
  id: string;
  fullName: string;
}
export interface DeptRow {
  id: string;
  name: string;
  isActive: boolean;
  chiefAccountantId: string | null;
  chiefAccountant?: { id: string; fullName: string } | null;
  _count?: { companies: number };
}
interface DeptForm {
  id?: string;
  name: string;
  chiefAccountantId: string | null;
  isActive?: boolean;
}
interface Props {
  departments: DeptRow[];
  chiefs: ChiefOption[];
  busy: boolean;
  onCreate: (d: { name: string; chiefAccountantId?: string | null }) => void;
  onUpdate: (id: string, d: { name?: string; chiefAccountantId?: string | null; isActive?: boolean }) => void;
  onDeactivate: (id: string) => void;
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };
const inputCls = "w-full px-3 py-2 rounded-lg text-body outline-none";
const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" } as const;

export function AdminDepartments({ departments, chiefs, busy, onCreate, onUpdate, onDeactivate }: Props) {
  const [form, setForm] = useState<DeptForm | null>(null);

  const submit = () => {
    if (!form || !form.name.trim()) return;
    if (form.id) onUpdate(form.id, { name: form.name, chiefAccountantId: form.chiefAccountantId });
    else onCreate({ name: form.name, chiefAccountantId: form.chiefAccountantId });
    setForm(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Bo'limlar</h1>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{departments.length} ta bo'lim</p>
        </div>
        <Button variant="primary" size="md" onClick={() => setForm({ name: "", chiefAccountantId: null })} disabled={busy}>
          <Plus size={15} /> Yangi bo'lim
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {departments.map((d) => (
          <div key={d.id} className="p-4 rounded-xl" style={{ ...card, opacity: d.isActive ? 1 : 0.55 }}>
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}>
                <Building2 size={17} />
              </div>
              <div className="flex items-center gap-1">
                <button title="Tahrirlash" aria-label="Tahrirlash" onClick={() => setForm({ id: d.id, name: d.name, chiefAccountantId: d.chiefAccountantId })} disabled={busy} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--accent-blue)" }}><Pencil size={13} /></button>
                {d.isActive && (
                  <button title="Faolsizlantirish" aria-label="Faolsizlantirish" onClick={() => onDeactivate(d.id)} disabled={busy} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--danger)" }}><Power size={13} /></button>
                )}
              </div>
            </div>
            <div className="mt-2.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{d.name}</div>
            <div className="mt-1 text-meta" style={{ color: "var(--text-muted)" }}>
              Bosh buxgalter: <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{d.chiefAccountant?.fullName ?? "—"}</span>
            </div>
            <div className="mt-0.5 text-meta" style={{ color: "var(--text-muted)" }}>
              Firmalar: <span className="font-bold tabular-nums" style={{ color: "var(--text-secondary)" }}>{d._count?.companies ?? 0}</span>
            </div>
          </div>
        ))}
        {departments.length === 0 && (
          <div className="col-span-full text-center py-10 text-xs" style={{ color: "var(--text-muted)" }}>Hali bo'lim yo'q</div>
        )}
      </div>

      {form && (
        <ModalLayer open={form} onClose={() => setForm(null)} label="Bo'lim">
          <div className="w-full max-w-md rounded-xl p-5" style={card} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{form.id ? "Bo'limni tahrirlash" : "Yangi bo'lim"}</h3>
              <button onClick={() => setForm(null)} className="icon-btn-sm" style={{ color: "var(--text-muted)" }}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Bo'lim nomi</span>
                <input className={inputCls + " mt-1"} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </label>
              <label className="block">
                <span className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Bosh buxgalter</span>
                <select className={inputCls + " mt-1"} style={inputStyle} value={form.chiefAccountantId ?? ""} onChange={(e) => setForm({ ...form, chiefAccountantId: e.target.value || null })}>
                  <option value="">— tayinlanmagan —</option>
                  {chiefs.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>Bekor</button>
              <Button variant="primary" size="md" onClick={submit} disabled={busy || !form.name.trim()}>Saqlash</Button>
            </div>
          </div>
        </ModalLayer>
      )}
    </div>
  );
}
