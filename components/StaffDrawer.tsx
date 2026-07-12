"use client";

import React from "react";
import { Staff, Company } from "@/types";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/permissions";
import {
  X, Edit3, Phone, Mail, IdCard, Briefcase, Building, GraduationCap,
  CalendarDays, User as UserIcon, Award, CheckCircle2, Hash, Building2, Percent,
} from "lucide-react";

interface Props {
  person: Staff;
  companies: Company[];
  onClose: () => void;
  onEdit: (person: Staff) => void;
}

const EDUCATION_LABELS: Record<string, string> = {
  oliy: "Oliy",
  orta: "O'rta / O'rta-maxsus",
  magistratura: "Magistratura",
};
const GENDER_LABELS: Record<string, string> = { erkak: "Erkak", ayol: "Ayol" };
const STATUS_META: Record<string, { label: string; c: string; bg: string }> = {
  active: { label: "Faol (ishda)", c: "#10b981", bg: "rgba(16,185,129,.12)" },
  vacation: { label: "Mehnat ta'tilida", c: "#f43f5e", bg: "rgba(244,63,94,.12)" },
  sick: { label: "Betob / kasal", c: "#f59e0b", bg: "rgba(245,158,11,.12)" },
};

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("uz-UZ", { day: "2-digit", month: "long", year: "numeric" }) : "—";
const fmtMoney = (n?: number) => (n ? new Intl.NumberFormat("uz-UZ").format(Math.round(n)) : "0");

// Xodimning firmadagi roli va ulushini aniqlash
function companyRoleFor(c: Company, personId: string, personName: string): { role: UserRole; perc?: number; sum?: number } | null {
  if (c.accountantId === personId || c.accountantName === personName)
    return { role: "accountant", perc: c.accountantPerc, sum: c.accountantSum };
  if (c.chiefAccountantId === personId || c.chiefAccountantName === personName)
    return { role: "chief_accountant", perc: c.chiefAccountantPerc, sum: c.chiefAccountantSum };
  if (c.supervisorId === personId || c.supervisorName === personName)
    return { role: "supervisor", perc: c.supervisorPerc, sum: c.supervisorSum };
  if (c.bankClientId === personId || c.bankClientName === personName)
    return { role: "bank_manager", perc: c.bankClientPerc, sum: c.bankClientSum };
  return null;
}

export default function StaffDrawer({ person, companies, onClose, onEdit }: Props) {
  const roleColor = ROLE_COLORS[person.role as UserRole] || "#64748b";
  const status = person.status || "active";
  const sm = STATUS_META[status] || STATUS_META.active;

  const assigned = companies
    .map((c) => ({ company: c, meta: companyRoleFor(c, person.id, person.name) }))
    .filter((x) => x.meta !== null) as { company: Company; meta: NonNullable<ReturnType<typeof companyRoleFor>> }[];

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full w-full max-w-[560px] z-[101] overflow-y-auto animate-in slide-in-from-right duration-300 flex flex-col shadow-2xl"
        style={{ background: "var(--input-bg)" }}
      >
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: roleColor }} />

        {/* Header */}
        <div className="p-6 flex items-start justify-between gap-4 sticky top-0 z-10" style={{ background: "var(--card-bg)", borderBottom: "1px solid var(--card-border)" }}>
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="w-16 h-16 rounded-2xl shrink-0 flex items-center justify-center text-2xl font-black text-white shadow-md"
              style={{ backgroundColor: person.avatarColor || roleColor }}
            >
              {person.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black tracking-tight truncate" style={{ color: "var(--text)" }}>{person.name}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: roleColor, background: `${roleColor}1a`, border: `1px solid ${roleColor}40` }}>
                  {ROLE_LABELS[person.role as UserRole] || person.role}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: sm.c, background: sm.bg }}>
                  {sm.label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onEdit(person)}
              className="h-10 px-4 flex items-center gap-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm"
              style={{ background: "var(--accent-blue-light)", border: "1px solid var(--accent-blue)", color: "var(--accent-blue)" }}
              title="Tahrirlash"
            >
              <Edit3 size={15} /> Tahrirlash
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-sm"
              style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.borderColor = "var(--card-border)"; }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-7 flex-1">
          {/* Shaxsiy */}
          <Section title="Shaxsiy ma'lumotlar" icon={IdCard}>
            <InfoRow icon={IdCard} label="JSHSHIR" value={person.pinfl || "—"} mono />
            <InfoRow icon={Phone} label="Telefon" value={person.phone || "—"} />
            <InfoRow icon={UserIcon} label="Jinsi" value={person.gender ? GENDER_LABELS[person.gender] || person.gender : "—"} />
            <InfoRow icon={CalendarDays} label="Tug'ilgan sana" value={fmtDate(person.birthDate)} />
            <InfoRow icon={GraduationCap} label="Ma'lumoti" value={person.education ? EDUCATION_LABELS[person.education] || person.education : "—"} />
          </Section>

          {/* Ish / hisob */}
          <Section title="Ish va hisob ma'lumotlari" icon={Briefcase}>
            <InfoRow icon={Briefcase} label="Lavozim" value={ROLE_LABELS[person.role as UserRole] || person.role} />
            <InfoRow icon={Building} label="Bo'lim" value={person.department || "—"} />
            <InfoRow icon={Mail} label="Login (email)" value={person.email || "—"} />
            <InfoRow icon={CalendarDays} label="Ishga kirgan sana" value={fmtDate(person.hiredAt)} />
            <InfoRow icon={CheckCircle2} label="Holati" value={sm.label} />
            <InfoRow icon={Award} label="Reyting" value={person.rating != null ? String(person.rating) : "—"} />
            <InfoRow icon={Hash} label="Xodim ID" value={person.id} mono small />
          </Section>

          {/* Biriktirilgan firmalar */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={15} style={{ color: "var(--accent-blue)" }} />
              <span className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>
                Biriktirilgan firmalar
              </span>
              <span className="text-[11px] font-black tabular-nums px-2 py-0.5 rounded-md" style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}>
                {assigned.length}
              </span>
              <div className="flex-1 h-px ml-1" style={{ background: "var(--card-border)" }} />
            </div>
            {assigned.length === 0 ? (
              <div className="text-center py-8 rounded-xl" style={{ background: "var(--card-bg)", border: "1px dashed var(--card-border)" }}>
                <Building2 size={30} className="mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
                <span className="text-[11px] font-bold uppercase tracking-widest opacity-60" style={{ color: "var(--text-muted)" }}>Firma biriktirilmagan</span>
              </div>
            ) : (
              <div className="space-y-2">
                {assigned.map(({ company: c, meta }) => {
                  const rc = ROLE_COLORS[meta.role] || "#64748b";
                  const share = meta.sum && meta.sum > 0 ? `${fmtMoney(meta.sum)} so'm` : meta.perc ? `${meta.perc}%` : "—";
                  return (
                    <div key={c.id} className="p-3.5 rounded-xl flex items-center justify-between gap-3" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                      <div className="min-w-0">
                        <div className="text-[13px] font-black truncate" style={{ color: "var(--text)" }}>{c.name}</div>
                        <div className="text-[11px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>INN: {c.inn}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md" style={{ color: rc, background: `${rc}1a` }}>
                          {ROLE_LABELS[meta.role]}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-black tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          <Percent size={11} style={{ opacity: 0.5 }} /> {share}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Yordamchi komponentlar ────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} style={{ color: "var(--accent-blue)" }} />
        <span className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>{title}</span>
        <div className="flex-1 h-px ml-1" style={{ background: "var(--card-border)" }} />
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        {children}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono, small }: { icon: React.ElementType; label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--card-border)" }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>
        <Icon size={15} />
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest w-36 shrink-0" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className={`${mono ? "font-mono" : ""} ${small ? "text-[11px]" : "text-[13px]"} font-bold truncate flex-1 text-right`} style={{ color: "var(--text)" }}>{value}</div>
    </div>
  );
}
