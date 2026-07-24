"use client";

import React, { useMemo, useState } from "react";
import { Plus, Search, Pencil, KeyRound, UserCheck, UserX, X } from "lucide-react";
import { ROLES, ROLE_LABELS, type UserRole } from "@/lib/permissions";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone?: string | null;
  department?: string | null;
  pinfl?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  education?: string | null;
  skillLevel?: string | null;
  hiredAt?: string | null;
  status?: string | null;
  isActive: boolean;
  createdAt?: string;
}

interface FormData {
  id?: string;
  fullName: string;
  email: string;
  phone?: string;
  role: string;
  password?: string;
  department?: string;
  pinfl?: string;
  gender?: string;
  birthDate?: string;
  education?: string;
  skillLevel?: string;
  hiredAt?: string;
  status?: string;
}

// DateTime ISO → input[type=date] uchun YYYY-MM-DD
const toDateInput = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

interface Props {
  users: AdminUser[];
  busy: boolean;
  onCreate: (d: FormData) => void;
  onUpdate: (id: string, d: FormData) => void;
  onToggleActive: (u: AdminUser) => void;
  onResetPassword: (id: string, pw: string) => void;
}

const ROLE_OPTIONS = Object.values(ROLES);

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };
const inputCls =
  "w-full px-3 py-2 rounded-lg text-body outline-none";
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--card-border)",
  color: "var(--text-primary)",
} as const;

export function AdminUserManager({
  users,
  busy,
  onCreate,
  onUpdate,
  onToggleActive,
  onResetPassword,
}: Props) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [form, setForm] = useState<FormData | null>(null);
  const [pwTarget, setPwTarget] = useState<AdminUser | null>(null);
  const [pwValue, setPwValue] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchQ = !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchR = roleFilter === "all" || u.role === roleFilter;
      return matchQ && matchR;
    });
  }, [users, search, roleFilter]);

  const openCreate = () =>
    setForm({ fullName: "", email: "", phone: "", role: ROLES.ACCOUNTANT, password: "", department: "", pinfl: "", gender: "", birthDate: "", education: "", skillLevel: "", hiredAt: "", status: "active" });
  const openEdit = (u: AdminUser) =>
    setForm({
      id: u.id, fullName: u.fullName, email: u.email, phone: u.phone || "", role: u.role,
      department: u.department || "", pinfl: u.pinfl || "", gender: u.gender || "",
      birthDate: toDateInput(u.birthDate), education: u.education || "", skillLevel: u.skillLevel || "",
      hiredAt: toDateInput(u.hiredAt), status: u.status || "active",
    });

  const submit = () => {
    if (!form) return;
    if (!form.fullName.trim() || !form.email.trim()) return;
    if (form.id) onUpdate(form.id, form);
    else onCreate(form);
    setForm(null);
  };

  const submitPw = () => {
    if (!pwTarget || pwValue.length < 6) return;
    onResetPassword(pwTarget.id, pwValue);
    setPwTarget(null);
    setPwValue("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Foydalanuvchilar</h1>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {users.length} ta · {users.filter((u) => u.isActive).length} faol
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50"
          style={{ background: "var(--accent-blue)" }}
        >
          <Plus size={15} /> Yangi
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            className={inputCls + " pl-9"}
            style={inputStyle}
            placeholder="Ism yoki email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={inputCls + " max-w-[200px]"} style={inputStyle} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">Barcha rollar</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r as UserRole]}</option>
          ))}
        </select>
      </div>

      <div className="rounded-xl overflow-hidden" style={card}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)", color: "var(--text-muted)" }}>
                {["Ism", "Email", "Rol", "Holat", "Amallar"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-bold uppercase tracking-widest text-micro">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: "var(--text-primary)" }}>{u.fullName}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{u.email}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{ROLE_LABELS[u.role as UserRole] ?? u.role}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-micro font-bold px-2 py-0.5 rounded-full uppercase"
                      style={u.isActive
                        ? { background: "var(--success-bg)", color: "var(--success)" }
                        : { background: "var(--danger-bg)", color: "var(--danger)" }}
                    >
                      {u.isActive ? "Faol" : "Faolsiz"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button title="Tahrirlash" onClick={() => openEdit(u)} disabled={busy} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--accent-blue)" }}><Pencil size={14} /></button>
                      <button title="Parolni tiklash" onClick={() => { setPwTarget(u); setPwValue(""); }} disabled={busy} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--warning)" }}><KeyRound size={14} /></button>
                      <button title={u.isActive ? "Faolsizlantirish" : "Faollashtirish"} onClick={() => onToggleActive(u)} disabled={busy} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: u.isActive ? "var(--danger)" : "var(--success)" }}>
                        {u.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>Foydalanuvchi topilmadi</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit modal */}
      {form && (
        <Modal title={form.id ? "Foydalanuvchini tahrirlash" : "Yangi foydalanuvchi"} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <Field label="To'liq ism">
              <input className={inputCls} style={inputStyle} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className={inputCls} style={inputStyle} type="email" value={form.email} disabled={!!form.id} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <input className={inputCls} style={inputStyle} value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="JSHSHIR (PINFL)">
                <input className={inputCls} style={inputStyle} inputMode="numeric" maxLength={14} value={form.pinfl || ""} onChange={(e) => setForm({ ...form, pinfl: e.target.value })} />
              </Field>
              <Field label="Bo'lim">
                <input className={inputCls} style={inputStyle} value={form.department || ""} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </Field>
              <Field label="Jinsi">
                <select className={inputCls} style={inputStyle} value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">—</option>
                  <option value="erkak">Erkak</option>
                  <option value="ayol">Ayol</option>
                </select>
              </Field>
              <Field label="Ma'lumoti">
                <select className={inputCls} style={inputStyle} value={form.education || ""} onChange={(e) => setForm({ ...form, education: e.target.value })}>
                  <option value="">—</option>
                  <option value="orta">O&apos;rta</option>
                  <option value="orta_maxsus">O&apos;rta maxsus</option>
                  <option value="oliy">Oliy</option>
                  <option value="magistratura">Magistratura</option>
                </select>
              </Field>
              <Field label="Malaka darajasi">
                <select className={inputCls} style={inputStyle} value={form.skillLevel || ""} onChange={(e) => setForm({ ...form, skillLevel: e.target.value })}>
                  <option value="">—</option>
                  <option value="stajyor">Stajyor</option>
                  <option value="orta">O&apos;rta malakali</option>
                  <option value="tajribali">Tajribali</option>
                </select>
              </Field>
              <Field label="Tug'ilgan sana">
                <input type="date" className={inputCls} style={inputStyle} value={form.birthDate || ""} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
              </Field>
              <Field label="Ishga kirgan sana">
                <input type="date" className={inputCls} style={inputStyle} value={form.hiredAt || ""} onChange={(e) => setForm({ ...form, hiredAt: e.target.value })} />
              </Field>
            </div>
            <Field label="Holati">
              <select className={inputCls} style={inputStyle} value={form.status || "active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Faol (ishda)</option>
                <option value="vacation">Ta&apos;tilda</option>
                <option value="sick">Kasallik</option>
              </select>
            </Field>
            <Field label="Rol">
              <select className={inputCls} style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r as UserRole]}</option>
                ))}
              </select>
            </Field>
            {!form.id && (
              <Field label="Parol">
                <input className={inputCls} style={inputStyle} type="text" placeholder="Bo'sh qolsa: Password123!" value={form.password || ""} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
            )}
          </div>
          <ModalActions onCancel={() => setForm(null)} onSave={submit} busy={busy} />
        </Modal>
      )}

      {/* Reset password modal */}
      {pwTarget && (
        <Modal title={`Parolni tiklash — ${pwTarget.fullName}`} onClose={() => setPwTarget(null)}>
          <Field label="Yangi parol (kamida 6 belgi)">
            <input className={inputCls} style={inputStyle} type="text" value={pwValue} onChange={(e) => setPwValue(e.target.value)} autoFocus />
          </Field>
          <ModalActions onCancel={() => setPwTarget(null)} onSave={submitPw} busy={busy} disabled={pwValue.length < 6} />
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl p-5" style={card} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{title}</h3>
          <button onClick={onClose} className="icon-btn-sm" style={{ color: "var(--text-muted)" }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onSave, busy, disabled }: { onCancel: () => void; onSave: () => void; busy: boolean; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2 mt-5">
      <button onClick={onCancel} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>Bekor</button>
      <button onClick={onSave} disabled={busy || disabled} className="px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--accent-blue)" }}>Saqlash</button>
    </div>
  );
}
