"use client";

import React, { useState } from "react";
import { useViewMode } from '@/hooks/useViewMode';
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  User as UserIcon,
  Building2,
  TrendingUp,
  CalendarCheck,
  ShieldCheck,
  Mail,
  GraduationCap,
  Briefcase,
  CalendarDays,
  Save,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  Award,
  Wallet,
  X,
  Trophy,
} from "lucide-react";
import { TableToolbar } from "@/components/ui/TableToolbar";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/Tabs";
import { useTabParam } from "@/hooks/useTabParam";
import { CABINET_TAB_IDS, type CabinetTabId as TabId } from "@/lib/cabinetTabs";
import KpiLeaderboard from "@/components/KpiLeaderboard";
import { updateUser, changePassword } from "@/server/users";
import { ROLE_LABELS, ROLE_COLORS, isSeniorRole, type UserRole } from "@/lib/permissions";
import { formatUzMonthYear, formatUzDateNumeric, formatUzTime, formatNum } from "@/lib/format";
import { kpiCategoryLabel, adjustmentTypeLabel } from "@/lib/kpiLabels";
import RiskBadge from "@/components/RiskBadge";
import { Button } from "@/components/ui/Button";
import { friendlyError } from "@/lib/actionError";

// ─── Tiplar ────────────────────────────────────────────────
interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarColor: string | null;
  phone: string | null;
  pinfl: string | null;
  department: string | null;
  gender: string | null;
  birthDate: string | null;
  education: string | null;
  skillLevel: string | null;
  hiredAt: string | null;
  status: string | null;
  rating: number | null;
  createdAt: string;
}
interface CabinetCompany {
  id: string;
  name: string;
  inn: string;
  taxRegime: string;
  riskLevel: string | null;
  companyStatus: string | null;
  myRole: string;
  contractAmount?: string | number;
  brandName?: string | null;
  directorName?: string | null;
  directorPhone?: string | null;
  accountantPerc?: number | null;
  accountantSum?: number | null;
  chiefAccountantPerc?: number | null;
  chiefAccountantSum?: number | null;
  supervisorPerc?: number | null;
  supervisorSum?: number | null;
  bankClientPerc?: number | null;
  bankClientSum?: number | null;
}
interface KpiRecord {
  id: string;
  calculatedScore: number;
  status: string;
  rule: { nameUz: string; category: string };
  month: string;
}
interface Adjustment {
  id: string;
  adjustmentType: string;
  amount: number;
  reason: string;
  isApproved: boolean;
}
interface AttendanceRow {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  notes: string | null;
}

export interface MyCabinetProps {
  profile: Profile;
  companies: CabinetCompany[];
  companiesCount: number;
  kpi: { totalScore: number; approvedCount: number; pendingCount: number; records: KpiRecord[] };
  adjustments: Adjustment[];
  payrollSummary: { bonusTotal: number; penaltyTotal: number; net: number };
  attendance: AttendanceRow[];
  attendanceSummary: { presentDays: number; lateDays: number; absentDays: number; total: number };
  currentMonth: string;
}

/**
 * MENING KABINETIM — shaxsiy ma'lumotning YAGONA manzili.
 *
 * Nega aynan shu yerda: buxgalter va bank-klient rollarida `/kpi` bo'limi
 * UMUMAN yo'q (lib/permissions.ts → ALLOWED_VIEWS). Ya'ni "mening KPI'm" ni
 * har bir rol ko'ra oladigan birdan-bir joy — shu kabinet. Shuning uchun
 * `/kpi` dagi "Xodim kabineti" yorlig'i olib tashlandi va u yerdan bu yerga
 * havola qo'yildi: bitta ish — bitta joy.
 *
 * "Xavfsizlik" — sozlash yorlig'i, kundalik ma'lumot emas: o'ng chetga,
 * ajratuvchi chiziq ortiga suriladi.
 */
const TABS: TabItem<TabId>[] = [
  { id: "profile", label: "Profil", icon: UserIcon },
  { id: "companies", label: "Firmalarim", icon: Building2 },
  { id: "kpi", label: "KPI va oylik", icon: TrendingUp, hint: "Shaxsiy ko'rsatkich, tuzatmalar va oylik hisobi" },
  { id: "leaderboard", label: "Jamoa reytingi", icon: Trophy },
  { id: "attendance", label: "Davomat", icon: CalendarCheck },
  { id: "security", label: "Xavfsizlik", icon: ShieldCheck, trailing: true },
];

const EDUCATION_LABELS: Record<string, string> = {
  oliy: "Oliy",
  orta: "O'rta / O'rta-maxsus",
  magistratura: "Magistratura",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Faol (ishda)",
  vacation: "Mehnat ta'tilida",
  sick: "Betob / kasal",
};
const SKILL_LABELS: Record<string, string> = {
  stajyor: "Stajyor",
  orta: "O'rta malakali",
  tajribali: "Tajribali",
};

const fmtMoney = (n: number) => formatNum(n);
const fmtDate = (s: string | null) => (s ? formatUzDateNumeric(s) : "—");

/** Ishga kirgan sanadan ish stajini "X yil Y oy" ko'rinishida hisoblaydi. */
function formatTenure(hiredAt: string | null): string {
  if (!hiredAt) return "—";
  const start = new Date(hiredAt);
  if (isNaN(start.getTime())) return "—";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0 && rem === 0) return "1 oydan kam";
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yil`);
  if (rem > 0) parts.push(`${rem} oy`);
  return parts.join(" ");
}
const fmtTime = (s: string | null) => (s ? formatUzTime(s) : "—");

export default function MyCabinet(props: MyCabinetProps & { initialTab?: TabId }) {
  const { profile, companies, kpi, adjustments, payrollSummary, attendance, attendanceSummary, currentMonth, initialTab = "profile" } = props;
  const router = useRouter();
  const [tab, setTab] = useTabParam<TabId>("tab", CABINET_TAB_IDS, initialTab);

  const roleLabel = ROLE_LABELS[profile.role as UserRole] || profile.role;
  const roleColor = ROLE_COLORS[profile.role as UserRole] || "var(--text-muted)";
  const monthLabel = formatUzMonthYear(`${currentMonth}-01`);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* ─── HEADER ─────────────────────────────── */}
      <div className="dashboard-card p-5 flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div
            className="w-16 h-16 rounded-xl shrink-0 flex items-center justify-center text-2xl font-semibold text-white shadow-md"
            style={{ backgroundColor: profile.avatarColor || roleColor }}
          >
            {profile.fullName.charAt(0)}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight truncate" style={{ color: "var(--text)" }}>
              {profile.fullName}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className="text-micro font-semibold uppercase tracking-widest px-2.5 py-1 rounded-lg"
                style={{ color: roleColor, background: `${roleColor}1a`, border: `1px solid ${roleColor}40` }}
              >
                {roleLabel}
              </span>
              <span className="text-meta font-bold flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                <Mail size={12} /> {profile.email}
              </span>
            </div>
          </div>
        </div>

        {/* stat chips */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          <HeaderStat icon={Building2} value={companies.length} label="Firmalar" color="var(--accent-blue)" />
          <HeaderStat icon={Award} value={Math.round(kpi.totalScore)} label="KPI ball" color="var(--accent-purple)" />
          <HeaderStat icon={CalendarCheck} value={attendanceSummary.presentDays} label="Kelgan kun" color="var(--success)" />
          <HeaderStat icon={TrendingUp} value={profile.rating ?? 0} label="Reyting" color="var(--warning)" />
        </div>
      </div>

      {/* ─── TABS ───────────────────────────────── */}
      {/* Ilgari bular `Button variant="primary"` edi: OLTITA yorliqning
          hammasi asosiy amal ko'rinishida turardi va tanlangani faqat rang
          bilan farq qilardi. Yorliq — amal emas, ko'rinish almashtirgichi. */}
      <Tabs items={TABS} value={tab} onChange={setTab} idBase="cabinet" ariaLabel="Kabinet bo'limlari" />

      {/* ─── CONTENT ────────────────────────────── */}
      <TabPanel tabId={tab} idBase="cabinet">
        {tab === "profile" && <ProfileTab profile={profile} onSaved={() => router.refresh()} />}
        {tab === "companies" && <CompaniesTab companies={companies} />}
        {tab === "kpi" && (
          <KpiTab kpi={kpi} adjustments={adjustments} payrollSummary={payrollSummary} monthLabel={monthLabel} />
        )}
        {tab === "leaderboard" && <KpiLeaderboard lang="uz" hideBonus={true} />}
        {tab === "attendance" && <AttendanceTab attendance={attendance} summary={attendanceSummary} />}
        {tab === "security" && <SecurityTab userId={profile.id} />}
      </TabPanel>
    </div>
  );
}

// ─── Header stat chip ──────────────────────────────────────
function HeaderStat({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div
      className="px-4 py-2.5 rounded-xl flex flex-col items-center justify-center min-w-[92px]"
      style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
    >
      <Icon size={16} style={{ color }} />
      <span className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: "var(--text)" }}>
        {value}
      </span>
      <span className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );
}

// ─── PROFIL TAB ────────────────────────────────────────────

/** Rang tanlagich uchun zaxira qiymat (brend ko'ki, qat'iy hex). */
const DEFAULT_AVATAR_COLOR = "#0F66AE";

/** `#rgb`/`#rrggbb` bo'lsa `#rrggbb` qaytaradi, aks holda `null`. */
function normalizeHex(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return ("#" + s.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  }
  return null;
}

function ProfileTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [form, setForm] = useState({
    fullName: profile.fullName || "",
    phone: profile.phone || "",
    pinfl: profile.pinfl || "",
    department: profile.department || "",
    gender: profile.gender || "",
    birthDate: profile.birthDate ? new Date(profile.birthDate).toISOString().slice(0, 10) : "",
    education: profile.education || "",
    skillLevel: profile.skillLevel || "",
    // `<input type="color">` FAQAT `#rrggbb` ni tushunadi. Ilgari bu yerda
    // `"var(--brand)"` turardi va rang tanlagich uni o'qiy olmay jimgina
    // qora (#000000) ko'rsatardi — ya'ni rangi hali tanlanmagan xodim
    // saqlaganda avatari qorayib qolardi.
    avatarColor: normalizeHex(profile.avatarColor) ?? DEFAULT_AVATAR_COLOR,
  });
  // Malaka darajasini faqat rahbar rollar tahrirlaydi (server ham shuni tekshiradi).
  const canEditSkill = isSeniorRole(profile.role);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.fullName.trim()) {
      toast.error("F.I.SH bo'sh bo'lishi mumkin emas");
      return;
    }
    if (form.pinfl && !/^\d{14}$/.test(form.pinfl)) {
      toast.error("JSHSHIR 14 ta raqamdan iborat bo'lishi kerak");
      return;
    }
    setSaving(true);
    try {
      await updateUser(profile.id, form);
      toast.success("Profil saqlandi");
      onSaved();
    } catch (e) {
      toast.error(friendlyError(e, "Xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Editable card */}
      <div className="dashboard-card p-5 lg:col-span-2 space-y-5">
        <SectionTitle icon={UserIcon} title="Shaxsiy ma'lumotlar" hint="O'zingiz tahrirlashingiz mumkin" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="F.I.SH *">
            <input className="erp-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </FormField>
          <FormField label="Telefon">
            <input className="erp-input" placeholder="+998 90 123 45 67" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label="JSHSHIR (14 raqam)">
            <input
              className="erp-input font-mono tracking-wider"
              placeholder="12345678901234"
              maxLength={14}
              value={form.pinfl}
              onChange={(e) => setForm({ ...form, pinfl: e.target.value.replace(/\D/g, "") })}
            />
          </FormField>
          <FormField label="Bo'lim">
            <input className="erp-input" placeholder="Masalan: Buxgalteriya" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </FormField>
          <FormField label="Jinsi">
            <select className="erp-input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Tanlanmagan</option>
              <option value="erkak">Erkak</option>
              <option value="ayol">Ayol</option>
            </select>
          </FormField>
          <FormField label="Tug'ilgan sana">
            <input type="date" className="erp-input" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          </FormField>
          <FormField label="Ma'lumoti">
            <select className="erp-input" value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })}>
              <option value="">Tanlanmagan</option>
              <option value="orta">O&apos;rta / O&apos;rta-maxsus</option>
              <option value="oliy">Oliy</option>
              <option value="magistratura">Magistratura</option>
            </select>
          </FormField>
          {canEditSkill && (
            <FormField label="Malaka darajasi">
              <select className="erp-input" value={form.skillLevel} onChange={(e) => setForm({ ...form, skillLevel: e.target.value })}>
                <option value="">Tanlanmagan</option>
                <option value="stajyor">Stajyor</option>
                <option value="orta">O&apos;rta malakali</option>
                <option value="tajribali">Tajribali</option>
              </select>
            </FormField>
          )}
          <FormField label="Avatar rangi">
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="w-12 h-11 rounded-lg cursor-pointer border"
                style={{ borderColor: "var(--card-border)", background: "var(--input-bg)" }}
                value={form.avatarColor}
                onChange={(e) => setForm({ ...form, avatarColor: e.target.value })}
              />
              <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{form.avatarColor}</span>
            </div>
          </FormField>
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="primary" size="md" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        </div>
      </div>

      {/* Read-only card */}
      <div className="dashboard-card p-5 space-y-4 h-fit">
        <SectionTitle icon={ShieldCheck} title="Hisob ma'lumotlari" hint="Faqat admin o'zgartiradi" />
        <InfoRow icon={Mail} label="Login (email)" value={profile.email} />
        <InfoRow icon={Briefcase} label="Lavozim" value={ROLE_LABELS[profile.role as UserRole] || profile.role} />
        <InfoRow icon={CalendarDays} label="Ishga kirgan" value={fmtDate(profile.hiredAt)} />
        <InfoRow icon={Clock} label="Ish staji" value={formatTenure(profile.hiredAt)} />
        <InfoRow icon={TrendingUp} label="Malaka darajasi" value={profile.skillLevel ? SKILL_LABELS[profile.skillLevel] || profile.skillLevel : "—"} />
        <InfoRow icon={GraduationCap} label="Ma'lumoti" value={profile.education ? EDUCATION_LABELS[profile.education] || profile.education : "—"} />
        <InfoRow icon={CheckCircle2} label="Holati" value={profile.status ? STATUS_LABELS[profile.status] || profile.status : "—"} />
        <InfoRow icon={Award} label="Reyting" value={profile.rating != null ? String(profile.rating) : "—"} />
      </div>
    </div>
  );
}

// ─── FIRMALARIM TAB ────────────────────────────────────────
function CompaniesTab({ companies }: { companies: CabinetCompany[] }) {
  // Standart — RO'YXAT; tanlov brauzerda saqlanadi (hooks/useViewMode).
  const [viewMode, setViewMode] = useViewMode('kabinet');
  const [selectedCompany, setSelectedCompany] = useState<CabinetCompany | null>(null);

  if (companies.length === 0) {
    return <EmptyState icon={Building2} text="Sizga hali firma biriktirilmagan" />;
  }

  const getMyShare = (c: CabinetCompany) => {
    let perc = 0;
    let sum = 0;
    if (c.myRole === 'accountant') { perc = Number(c.accountantPerc || 0); sum = Number(c.accountantSum || 0); }
    else if (c.myRole === 'chief_accountant') { perc = Number(c.chiefAccountantPerc || 0); sum = Number(c.chiefAccountantSum || 0); }
    else if (c.myRole === 'supervisor') { perc = Number(c.supervisorPerc || 0); sum = Number(c.supervisorSum || 0); }
    else if (c.myRole === 'bank_manager') { perc = Number(c.bankClientPerc || 0); sum = Number(c.bankClientSum || 0); }
    
    if (sum > 0) return { type: 'fixed', value: sum };
    if (perc > 0) {
        const contract = Number(c.contractAmount || 0);
        return { type: 'percent', perc, value: (contract * perc) / 100 };
    }
    return { type: 'none', value: 0 };
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TableToolbar view={viewMode} onViewChange={setViewMode} />
      </div>
      
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {companies.map((c) => {
            const roleC = ROLE_COLORS[c.myRole as UserRole] || "var(--text-muted)";
            return (
              <div key={c.id} onClick={() => setSelectedCompany(c)} className="dashboard-card p-5 flex flex-col gap-3 cursor-pointer hover:-translate-y-0.5 transition-all active:scale-[0.99]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{c.name}</div>
                    <div className="text-meta font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>INN: {c.inn}</div>
                  </div>
                  {c.riskLevel && (
                    <RiskBadge riskLevel={c.riskLevel} companyStatus={c.companyStatus} companyName={c.name} compact />
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-micro font-bold uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: "var(--text-secondary)", background: "var(--input-bg)", border: "1px solid var(--card-border)" }}>
                    {c.taxRegime === 'turnover' ? 'Aylanma' : c.taxRegime === 'fixed' ? 'Belgilangan' : c.taxRegime === 'nds_profit' ? 'QQS' : c.taxRegime}
                  </span>
                  <span className="text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: roleC, background: `${roleC}1a`, border: `1px solid ${roleC}40` }}>
                    {ROLE_LABELS[c.myRole as UserRole] || c.myRole}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dashboard-card overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                <th className="px-5 py-4 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Firma nomi</th>
                <th className="px-5 py-4 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>INN</th>
                <th className="px-5 py-4 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Soliq rejimi</th>
                <th className="px-5 py-4 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Sizning rolingiz</th>
                <th className="px-5 py-4 text-micro font-bold uppercase tracking-widest text-right" style={{ color: "var(--text-muted)" }}>Xavf darajasi</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c, i) => {
                const roleC = ROLE_COLORS[c.myRole as UserRole] || "var(--text-muted)";
                return (
                  <tr key={c.id} onClick={() => setSelectedCompany(c)} className="row-hover group cursor-pointer" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-5 py-3">
                      <div className="font-bold text-sm tracking-tight truncate max-w-[200px]" style={{ color: "var(--text)" }}>{c.name}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-meta font-bold" style={{ color: "var(--text-secondary)" }}>{c.inn}</td>
                    <td className="px-5 py-3">
                      <span className="text-micro font-bold uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: "var(--text-secondary)", background: "var(--input-bg)", border: "1px solid var(--card-border)" }}>
                        {c.taxRegime === 'turnover' ? 'Aylanma' : c.taxRegime === 'fixed' ? 'Belgilangan' : c.taxRegime === 'nds_profit' ? 'QQS' : c.taxRegime}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: roleC, background: `${roleC}1a`, border: `1px solid ${roleC}40` }}>
                        {ROLE_LABELS[c.myRole as UserRole] || c.myRole}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {c.riskLevel ? <RiskBadge riskLevel={c.riskLevel} companyStatus={c.companyStatus} companyName={c.name} compact /> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedCompany && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in" onClick={() => setSelectedCompany(null)}>
          <div className="w-full max-w-lg shadow-2xl relative overflow-hidden dashboard-card !p-0" onClick={(e) => e.stopPropagation()}>
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--accent-blue)" }}></div>
            <div className="px-6 py-5 flex justify-between items-start" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <div className="pr-4">
                <h3 className="text-lg font-semibold tracking-tight leading-tight" style={{ color: "var(--text)" }}>{selectedCompany.name}</h3>
                <p className="text-meta font-mono mt-1" style={{ color: "var(--text-muted)" }}>INN: {selectedCompany.inn}</p>
              </div>
              <button onClick={() => setSelectedCompany(null)} className="icon-btn-sm shrink-0" style={{ color: "var(--text-muted)", background: "var(--input-bg)" }}>
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Umumiy malumotlar */}
              <div className="space-y-4">
                <h4 className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Umumiy ma&apos;lumotlar</h4>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow icon={Building2} label="Soliq rejimi" value={selectedCompany.taxRegime === 'turnover' ? 'Aylanma' : selectedCompany.taxRegime === 'fixed' ? 'Belgilangan' : selectedCompany.taxRegime === 'nds_profit' ? 'QQS' : selectedCompany.taxRegime} />
                  <InfoRow icon={ShieldCheck} label="Xavf darajasi" value={selectedCompany.riskLevel === 'high' ? 'Yuqori' : selectedCompany.riskLevel === 'medium' ? 'O\'rta' : 'Past'} />
                  {selectedCompany.directorName && <InfoRow icon={UserIcon} label="Direktor" value={selectedCompany.directorName} />}
                  {selectedCompany.directorPhone && <InfoRow icon={Mail} label="Telefon" value={selectedCompany.directorPhone} />}
                  {selectedCompany.brandName && <InfoRow icon={Award} label="Brend nomi" value={selectedCompany.brandName} />}
                </div>
              </div>

              {/* Shartnoma va Ulush */}
              <div className="space-y-4 pt-4" style={{ borderTop: "1px solid var(--card-border)" }}>
                <h4 className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Shartnoma va Ulush</h4>
                <div className="p-4 rounded-xl flex items-center justify-between" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}>
                  <div>
                    <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Shartnoma summasi</div>
                    <div className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: "var(--text)" }}>
                      {formatNum(Number(selectedCompany.contractAmount || 0))} <span className="text-xs" style={{ color: "var(--text-muted)" }}>so&apos;m</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}>
                    <Wallet size={20} />
                  </div>
                </div>

                <div className="p-4 rounded-xl flex items-center justify-between" style={{ background: "color-mix(in srgb, var(--success) 12%, transparent)", border: "1px solid var(--success-border)" }}>
                  <div>
                    <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--success)" }}>Sizning ulushingiz ({ROLE_LABELS[selectedCompany.myRole as UserRole] || selectedCompany.myRole})</div>
                    <div className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: "var(--success)" }}>
                      {(() => {
                        const share = getMyShare(selectedCompany);
                        if (share.type === 'none') return "0 so'm";
                        return `${formatNum(share.value)} so'm ${share.type === 'percent' ? `(${share.perc}%)` : ''}`;
                      })()}
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-white shadow-sm" style={{ color: "var(--success)" }}>
                    <TrendingUp size={20} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KPI & OYLIK TAB ───────────────────────────────────────
function KpiTab({
  kpi,
  adjustments,
  payrollSummary,
  monthLabel,
}: {
  kpi: MyCabinetProps["kpi"];
  adjustments: Adjustment[];
  payrollSummary: MyCabinetProps["payrollSummary"];
  monthLabel: string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} value={Math.round(kpi.totalScore)} label={`KPI ball · ${monthLabel}`} color="var(--accent-purple)" />
        <StatCard icon={CheckCircle2} value={kpi.approvedCount} label="Tasdiqlangan" color="var(--success)" />
        <StatCard icon={Clock} value={kpi.pendingCount} label="Kutilmoqda" color="var(--warning)" />
        <StatCard icon={Wallet} value={fmtMoney(payrollSummary.net)} label="Bonus − jarima (so'm)" color="var(--accent-blue)" small />
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <SectionTitle icon={TrendingUp} title="KPI ko'rsatkichlari" hint={monthLabel} />
        </div>
        {kpi.records.length === 0 ? (
          <EmptyState icon={TrendingUp} text="Bu oy uchun KPI yozuvi yo'q" inline />
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
            {kpi.records.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5 gap-4">
                <div className="min-w-0">
                  <div className="text-body font-bold truncate" style={{ color: "var(--text)" }}>{r.rule?.nameUz || "—"}</div>
                  <div className="text-micro font-bold uppercase tracking-widest mt-0.5" style={{ color: "var(--text-muted)" }}>{kpiCategoryLabel(r.rule?.category)}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: Number(r.calculatedScore) >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {Number(r.calculatedScore) > 0 ? "+" : ""}{Number(r.calculatedScore)}
                  </span>
                  <KpiStatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <SectionTitle icon={Wallet} title="Oylik tuzatmalari" hint="Bonus · avans · jarima" />
        </div>
        {adjustments.length === 0 ? (
          <EmptyState icon={Wallet} text="Bu oy uchun tuzatma yo'q" inline />
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
            {adjustments.map((a) => {
              const isNeg = a.adjustmentType === "jarima" || a.adjustmentType === "avans";
              return (
                <div key={a.id} className="flex items-center justify-between px-5 py-3.5 gap-4">
                  <div className="min-w-0">
                    <div className="text-body font-bold" style={{ color: "var(--text)" }}>{adjustmentTypeLabel(a.adjustmentType)}</div>
                    <div className="text-meta truncate" style={{ color: "var(--text-muted)" }}>{a.reason || "Sabab ko'rsatilmagan"}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-body font-semibold tabular-nums" style={{ color: isNeg ? "var(--danger)" : "var(--success)" }}>
                      {isNeg ? "−" : "+"}{fmtMoney(a.amount)}
                    </span>
                    <span
                      className="text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg"
                      style={a.isApproved ? { color: "var(--success)", background: "color-mix(in srgb, var(--success) 12%, transparent)" } : { color: "var(--warning)", background: "color-mix(in srgb, var(--warning) 12%, transparent)" }}
                    >
                      {a.isApproved ? "Tasdiqlangan" : "Kutilmoqda"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DAVOMAT TAB ───────────────────────────────────────────
function AttendanceTab({
  attendance,
  summary,
}: {
  attendance: AttendanceRow[];
  summary: MyCabinetProps["attendanceSummary"];
}) {
  const statusMap: Record<string, { label: string; c: string; bg: string; Icon: React.ElementType }> = {
    present: { label: "Kelgan", c: "var(--success)", bg: "color-mix(in srgb, var(--success) 12%, transparent)", Icon: CheckCircle2 },
    late: { label: "Kechikkan", c: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 12%, transparent)", Icon: Clock },
    absent: { label: "Kelmagan", c: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 12%, transparent)", Icon: XCircle },
    excused: { label: "Uzrli", c: "var(--accent-indigo)", bg: "rgba(99,102,241,.12)", Icon: CalendarCheck },
  };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={CheckCircle2} value={summary.presentDays} label="Kelgan kun" color="var(--success)" />
        <StatCard icon={Clock} value={summary.lateDays} label="Kechikkan" color="var(--warning)" />
        <StatCard icon={XCircle} value={summary.absentDays} label="Kelmagan" color="var(--danger)" />
      </div>
      <div className="dashboard-card overflow-hidden">
        <div className="p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <SectionTitle icon={CalendarCheck} title="Davomat tarixi" hint="So'nggi 60 kun" />
        </div>
        {attendance.length === 0 ? (
          <EmptyState icon={CalendarCheck} text="Davomat yozuvi yo'q" inline />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[520px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                  {["Sana", "Kelish", "Ketish", "Holat"].map((h) => (
                    <th key={h} className="px-5 py-3 text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--card-border)" }}>
                {attendance.map((a) => {
                  const st = statusMap[a.status] || statusMap.present;
                  const StIcon = st.Icon;
                  return (
                    <tr key={a.id}>
                      <td className="px-5 py-3 text-xs font-bold" style={{ color: "var(--text)" }}>{fmtDate(a.date)}</td>
                      <td className="px-5 py-3 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmtTime(a.checkIn)}</td>
                      <td className="px-5 py-3 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmtTime(a.checkOut)}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-micro font-semibold uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: st.c, background: st.bg }}>
                          <StIcon size={12} /> {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── XAVFSIZLIK TAB ────────────────────────────────────────
function SecurityTab({ userId }: { userId: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (next.length < 6) {
      toast.error("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
      return;
    }
    if (next !== confirm) {
      toast.error("Yangi parollar mos kelmadi");
      return;
    }
    setSaving(true);
    try {
      await changePassword(userId, current, next);
      toast.success("Parol muvaffaqiyatli o'zgartirildi");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      toast.error(friendlyError(e, "Xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-card p-5 max-w-lg space-y-5">
      <SectionTitle icon={ShieldCheck} title="Parolni o'zgartirish" hint="Xavfsizlik uchun kuchli parol tanlang" />
      <FormField label="Hozirgi parol">
        <input type="password" className="erp-input" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" />
      </FormField>
      <FormField label="Yangi parol">
        <input type="password" className="erp-input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Kamida 6 ta belgi" />
      </FormField>
      <FormField label="Yangi parolni takrorlang">
        <input type="password" className="erp-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
      </FormField>
      <div className="flex justify-end">
        <Button variant="primary" size="md" onClick={submit} disabled={saving || !current || !next}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {saving ? "O'zgartirilmoqda..." : "Parolni yangilash"}
        </Button>
      </div>
    </div>
  );
}

// ─── Umumiy kichik komponentlar ────────────────────────────
function SectionTitle({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}>
        <Icon size={18} />
      </div>
      <div>
        <h3 className="text-body font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
        {hint && <p className="text-micro font-bold uppercase tracking-widest mt-0.5" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={{ color: "var(--text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</div>
        <div className="text-body font-bold truncate" style={{ color: "var(--text)" }}>{value}</div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, value, label, color, small }: { icon: React.ElementType; value: number | string; label: string; color: string; small?: boolean }) {
  return (
    <div className="dashboard-card p-5 flex flex-col gap-2">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color === "var(--accent-blue)" ? "var(--accent-blue-light)" : color + "1a"}`, color }}>
        <Icon size={18} />
      </div>
      <div className={`${small ? "text-lg" : "text-2xl"} font-semibold tabular-nums`} style={{ color: "var(--text)" }}>{value}</div>
      <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function KpiStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; c: string; bg: string }> = {
    approved: { label: "Tasdiqlangan", c: "var(--success)", bg: "color-mix(in srgb, var(--success) 12%, transparent)" },
    submitted: { label: "Yuborilgan", c: "var(--brand)", bg: "color-mix(in srgb, var(--brand) 12%, transparent)" },
    draft: { label: "Qoralama", c: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 12%, transparent)" },
    rejected: { label: "Rad etilgan", c: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 12%, transparent)" },
  };
  const s = map[status] || map.draft;
  return (
    <span className="text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: s.c, background: s.bg }}>
      {s.label}
    </span>
  );
}

function EmptyState({ icon: Icon, text, inline }: { icon: React.ElementType; text: string; inline?: boolean }) {
  const body = (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={40} className="opacity-20 mb-3" style={{ color: "var(--text-muted)" }} />
      <span className="text-meta font-semibold uppercase tracking-[0.2em] opacity-60" style={{ color: "var(--text-muted)" }}>{text}</span>
    </div>
  );
  return inline ? body : <div className="dashboard-card">{body}</div>;
}
