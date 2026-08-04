import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Staff, Company } from "@/types";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/permissions";
import { formatUzDate, formatNum } from "@/lib/format";
import {
  X, Edit3, Phone, Mail, IdCard, Briefcase, Building, GraduationCap,
  CalendarDays, User as UserIcon, Award, CheckCircle2, Hash, Building2, Percent,
  KeyRound, Copy, Check, RefreshCw, Loader2,
} from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { Button } from "@/components/ui/Button";

interface Props {
  person: Staff;
  companies: Company[];
  onClose: () => void;
  onEdit: (person: Staff) => void;
  onResetPassword?: (id: string, newPassword: string) => Promise<void>;
}

const EDUCATION_LABELS: Record<string, string> = {
  oliy: "Oliy",
  orta: "O'rta / O'rta-maxsus",
  magistratura: "Magistratura",
};
const GENDER_LABELS: Record<string, string> = { erkak: "Erkak", ayol: "Ayol" };
const STATUS_META: Record<string, { label: string; c: string; bg: string }> = {
  active: { label: "Faol (ishda)", c: "var(--success)", bg: "rgba(16,185,129,.12)" },
  vacation: { label: "Mehnat ta'tilida", c: "var(--danger)", bg: "rgba(244,63,94,.12)" },
  sick: { label: "Betob / kasal", c: "var(--warning)", bg: "rgba(245,158,11,.12)" },
};

const fmtDate = (s?: string | null) => (s ? formatUzDate(s) : "—");
const fmtMoney = (n?: number) => formatNum(n);

/**
 * Xodimning firmadagi mas'uliyat(lar)i va ulushi.
 *
 * BIR firmada BIR NECHTA rol bo'lishi mumkin (masalan buxgalter + nazoratchi),
 * shuning uchun massiv qaytadi: ilgari birinchi moslik qaytarilib, qolgan
 * ulushlar "Firmalar" ro'yxatida umuman ko'rinmasdi.
 *
 * Solishtirish faqat ID bo'yicha — ism bo'yicha moslash bir xil ismli ikki
 * xodimni chalkashtirardi.
 */
function companyRolesFor(c: Company, personId: string): { role: UserRole; perc?: number; sum?: number }[] {
  const out: { role: UserRole; perc?: number; sum?: number }[] = [];
  if (c.accountantId === personId)
    out.push({ role: "accountant", perc: c.accountantPerc, sum: c.accountantSum });
  if (c.chiefAccountantId === personId)
    out.push({ role: "chief_accountant", perc: c.chiefAccountantPerc, sum: c.chiefAccountantSum });
  if (c.supervisorId === personId)
    out.push({ role: "supervisor", perc: c.supervisorPerc, sum: c.supervisorSum });
  if (c.bankClientId === personId)
    out.push({ role: "bank_manager", perc: c.bankClientPerc, sum: c.bankClientSum });
  return out;
}

type TabId = "login" | "shaxsiy" | "ish" | "firmalar";

export default function StaffDrawer({ person, companies, onClose, onEdit, onResetPassword }: Props) {
  // Dialog semantikasi + fokus tuzog'i + Escape.
  const panelRef = useModalA11y<HTMLDivElement>({ open: Boolean(person), onClose });
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const roleColor = ROLE_COLORS[person.role as UserRole] || "var(--text-muted)";
  const status = person.status || "active";
  const sm = STATUS_META[status] || STATUS_META.active;
  const [activeTab, setActiveTab] = useState<TabId>("login");

  const assigned = companies
    .flatMap((c) => companyRolesFor(c, person.id).map((meta) => ({ company: c, meta })));

  const tabs: { id: TabId; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "login", label: "Login", icon: KeyRound },
    { id: "shaxsiy", label: "Shaxsiy", icon: IdCard },
    { id: "ish", label: "Ish & hisob", icon: Briefcase },
    { id: "firmalar", label: "Firmalar", icon: Building2, count: assigned.length },
  ];

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${person.name} — xodim kartasi`}
        tabIndex={-1}
        className="fixed right-0 top-0 h-full w-full max-w-[560px] z-[110] overflow-hidden animate-in slide-in-from-right duration-300 flex flex-col shadow-2xl outline-none"
        style={{ background: "var(--input-bg)" }}
      >
        <div className="absolute top-0 left-0 right-0 h-1 z-20" style={{ background: roleColor }} />

        {/* Header */}
        <div className="shrink-0 relative z-10" style={{ background: "var(--card-bg)", borderBottom: "1px solid var(--card-border)" }}>
          <div className="p-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="w-16 h-16 rounded-xl shrink-0 flex items-center justify-center text-2xl font-semibold text-white shadow-md"
                style={{ backgroundColor: person.avatarColor || roleColor }}
              >
                {person.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight truncate" style={{ color: "var(--text)" }}>{person.name}</h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-micro font-semibold uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: roleColor, background: `${roleColor}1a`, border: `1px solid ${roleColor}40` }}>
                    {ROLE_LABELS[person.role as UserRole] || person.role}
                  </span>
                  <span className="text-micro font-semibold uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: sm.c, background: sm.bg }}>
                    {sm.label}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onEdit(person)}
                className="h-10 px-4 flex items-center gap-2 rounded-xl text-meta font-semibold uppercase tracking-widest transition-all shadow-sm"
                style={{ background: "var(--accent-blue-light)", border: "1px solid var(--accent-blue)", color: "var(--accent-blue)" }}
                title="Tahrirlash"
              >
                <Edit3 size={15} /> Tahrirlash
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-sm icon-btn-danger"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tablar */}
          <div className="flex px-6 overflow-x-auto gap-2 pb-5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <Button variant="primary" size="md" key={tab.id} onClick={() => setActiveTab(tab.id)} className="whitespace-nowrap border" style={active ? { background: "var(--accent-blue)", color: "#fff", borderColor: "var(--accent-blue)" } : { background: "var(--input-bg)", color: "var(--text-secondary)", borderColor: "var(--card-border)" }}>
                  <Icon size={14} className="shrink-0" />
                  {tab.label}
                  {tab.count != null && (
                    <span className="text-micro font-semibold tabular-nums px-1.5 py-0.5 rounded-lg" style={active ? { background: "rgba(255,255,255,.25)", color: "#fff" } : { background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}>
                      {tab.count}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Body — faol tab */}
        <div className="p-6 flex-1 overflow-y-auto">
          {activeTab === "login" && (
            <div className="animate-fade-in">
              {/* Login va parol — xodim tizimga shu bilan kiradi */}
              <CredentialsSection person={person} onResetPassword={onResetPassword} />
            </div>
          )}

          {activeTab === "shaxsiy" && (
            <div className="animate-fade-in">
              <Section title="Shaxsiy ma'lumotlar" icon={IdCard}>
                <InfoRow icon={IdCard} label="JSHSHIR" value={person.pinfl || "—"} mono />
                <InfoRow icon={Phone} label="Telefon" value={person.phone || "—"} />
                <InfoRow icon={UserIcon} label="Jinsi" value={person.gender ? GENDER_LABELS[person.gender] || person.gender : "—"} />
                <InfoRow icon={CalendarDays} label="Tug'ilgan sana" value={fmtDate(person.birthDate)} />
                <InfoRow icon={GraduationCap} label="Ma'lumoti" value={person.education ? EDUCATION_LABELS[person.education] || person.education : "—"} />
              </Section>
            </div>
          )}

          {activeTab === "ish" && (
            <div className="animate-fade-in">
              <Section title="Ish va hisob ma'lumotlari" icon={Briefcase}>
                <InfoRow icon={Briefcase} label="Lavozim" value={ROLE_LABELS[person.role as UserRole] || person.role} />
                <InfoRow icon={Building} label="Bo'lim" value={person.department || "—"} />
                <InfoRow icon={Mail} label="Login (email)" value={person.email || "—"} />
                <InfoRow icon={CalendarDays} label="Ishga kirgan sana" value={fmtDate(person.hiredAt)} />
                <InfoRow icon={CheckCircle2} label="Holati" value={sm.label} />
                <InfoRow icon={Award} label="Reyting" value={person.rating != null ? String(person.rating) : "—"} />
                <InfoRow icon={Hash} label="Xodim ID" value={person.id} mono small />
              </Section>
            </div>
          )}

          {activeTab === "firmalar" && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={15} style={{ color: "var(--accent-blue)" }} />
                <span className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>
                  Biriktirilgan firmalar
                </span>
                <span className="text-meta font-semibold tabular-nums px-2 py-0.5 rounded-lg" style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}>
                  {assigned.length}
                </span>
                <div className="flex-1 h-px ml-1" style={{ background: "var(--card-border)" }} />
              </div>
              {assigned.length === 0 ? (
                <div className="text-center py-8 rounded-xl" style={{ background: "var(--card-bg)", border: "1px dashed var(--card-border)" }}>
                  <Building2 size={30} className="mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
                  <span className="text-meta font-bold uppercase tracking-widest opacity-60" style={{ color: "var(--text-muted)" }}>Firma biriktirilmagan</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {assigned.map(({ company: c, meta }) => {
                    const rc = ROLE_COLORS[meta.role] || "var(--text-muted)";
                    const share = meta.sum && meta.sum > 0 ? `${fmtMoney(meta.sum)} so'm` : meta.perc ? `${meta.perc}%` : "—";
                    return (
                      <div key={`${c.id}::${meta.role}`} className="p-3.5 rounded-xl flex items-center justify-between gap-3" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                        <div className="min-w-0">
                          <div className="text-body font-semibold truncate" style={{ color: "var(--text)" }}>{c.name}</div>
                          <div className="text-meta font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>INN: {c.inn}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: rc, background: `${rc}1a` }}>
                            {ROLE_LABELS[meta.role]}
                          </span>
                          <span className="inline-flex items-center gap-1 text-meta font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                            <Percent size={11} style={{ opacity: 0.5 }} /> {share}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Yordamchi komponentlar ────────────────────────────────
// Login va parol boshqaruvi — admin xodimga kirish ma'lumotini beradi
function CredentialsSection({ person, onResetPassword }: { person: Staff; onResetPassword?: (id: string, pw: string) => Promise<void> }) {
  const [mode, setMode] = useState<"idle" | "editing" | "saved">("idle");
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const genPw = () => {
    const base = (person.name.split(" ")[0] || "asro").replace(/[^a-zA-Z]/g, "") || "Asro";
    const cap = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
    return `${cap}${Math.floor(1000 + Math.random() * 9000)}!`;
  };
  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  const startReset = () => { setPw(genPw()); setMode("editing"); };
  const save = async () => {
    if (!onResetPassword) return;
    if (pw.length < 6) { toast.error("Parol kamida 6 ta belgidan iborat bo'lishi kerak"); return; }
    setSaving(true);
    try {
      await onResetPassword(person.id, pw);
      setMode("saved");
      toast.success("Parol o'rnatildi — xodimga bering");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={15} style={{ color: "var(--accent-blue)" }} />
        <span className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>Login va parol</span>
        <span className="text-micro font-bold" style={{ color: "var(--text-muted)" }}>· xodim shu bilan kiradi</span>
        <div className="flex-1 h-px ml-1" style={{ background: "var(--card-border)" }} />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        {/* Login (email) */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--card-border)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}><Mail size={15} /></div>
          <div className="text-micro font-bold uppercase tracking-widest w-24 shrink-0" style={{ color: "var(--text-muted)" }}>Login</div>
          <div className="text-body font-bold font-mono truncate flex-1" style={{ color: "var(--text)" }}>{person.email || "—"}</div>
          {person.email && (
            <button onClick={() => copy(person.email!, "login")} className="shrink-0 p-1.5 rounded-lg transition-colors" style={{ color: copied === "login" ? "var(--success)" : "var(--text-muted)" }} title="Nusxa olish">
              {copied === "login" ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>

        {/* Parol */}
        <div className="px-4 py-3">
          {mode === "idle" && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}><KeyRound size={15} /></div>
              <div className="text-micro font-bold uppercase tracking-widest flex-1" style={{ color: "var(--text-muted)" }}>Parol · ••••••••</div>
              {onResetPassword && (
                <button onClick={startReset} className="shrink-0 text-meta font-semibold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all" style={{ color: "var(--accent-blue)", background: "var(--accent-blue-light)", border: "1px solid var(--accent-blue)" }}>
                  Parol o&apos;rnatish
                </button>
              )}
            </div>
          )}

          {mode === "editing" && (
            <div className="space-y-2.5">
              <label className="text-micro font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Yangi parol</label>
              <div className="flex items-center gap-2">
                <input value={pw} onChange={(e) => setPw(e.target.value)} className="erp-input font-mono tracking-wider" placeholder="Kamida 6 ta belgi" />
                <button onClick={() => setPw(genPw())} className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }} title="Yangi parol taklif qilish">
                  <RefreshCw size={15} />
                </button>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setMode("idle")} className="px-4 py-2 rounded-lg text-meta font-semibold uppercase tracking-widest" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>Bekor</button>
                <Button variant="primary" size="md" onClick={save} disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Saqlash
                </Button>
              </div>
            </div>
          )}

          {mode === "saved" && (
            <div className="rounded-lg p-3" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
              <div className="text-micro font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--success)" }}>Parol o&apos;rnatildi — xodimga bering</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono font-bold px-3 py-2 rounded-lg" style={{ background: "var(--card-bg)", color: "var(--text)", border: "1px solid var(--card-border)" }}>{pw}</code>
                <button onClick={() => copy(pw, "pw")} className="shrink-0 px-3 py-2 rounded-lg flex items-center gap-1.5 text-meta font-bold" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: copied === "pw" ? "var(--success)" : "var(--text-secondary)" }}>
                  {copied === "pw" ? <Check size={13} /> : <Copy size={13} />} {copied === "pw" ? "Olindi" : "Nusxa"}
                </button>
              </div>
              <button onClick={() => setMode("idle")} className="text-micro font-bold uppercase tracking-widest mt-2" style={{ color: "var(--text-muted)" }}>Yopish</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
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

function InfoRow({ icon: Icon, label, value, mono, small }: { icon: React.ElementType; label: string; value: string; mono?: boolean; small?: boolean }) {
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
