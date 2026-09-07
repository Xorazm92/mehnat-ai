"use client";

import React from "react";
import Link from "next/link";
import {
  IdCard,
  Phone,
  User as UserIcon,
  CalendarDays,
  GraduationCap,
  Briefcase,
  Building,
  Building2,
  Mail,
  CheckCircle2,
  Award,
  Hash,
  Percent,
  Target,
  Wallet,
  CalendarCheck,
  ShieldCheck,
  Lock,
} from "lucide-react";

import { Staff } from "@/types";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/platform/permissions";
import { formatUzDate, formatUzDateTime, formatNum } from "@/lib/platform/format";
import { adjustmentMagnitude } from "@/lib/adjustments";
import { kpiCategoryLabel } from "@/lib/kpiLabels";
import { formatPeriodLabel } from "@/lib/periods";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabPanel } from "@/components/ui/Tabs";
import { Section, InfoRow } from "./InfoRow";
import { CredentialsSection } from "./CredentialsSection";
import type { EmployeeDossier, EmployeeTabId } from "./types";

interface Props {
  person: Staff;
  dossier: EmployeeDossier;
  activeTab: EmployeeTabId;
  onResetPassword?: (id: string, newPassword: string) => Promise<void>;
}

const EDUCATION_LABELS: Record<string, string> = {
  oliy: "Oliy",
  orta: "O'rta / O'rta-maxsus",
  magistratura: "Magistratura",
};
const GENDER_LABELS: Record<string, string> = { erkak: "Erkak", ayol: "Ayol" };

export const STATUS_LABELS: Record<string, string> = {
  active: "Faol (ishda)",
  vacation: "Mehnat ta'tilida",
  sick: "Betob / kasal",
  inactive: "Ishdan bo'shatilgan",
};

const ADJUSTMENT_LABELS: Record<string, string> = {
  bonus: "Mukofot",
  avans: "Avans",
  jarima: "Jarima",
  payment: "To'lov",
  manual: "Qo'lda",
  other: "Boshqa",
};

const ATTENDANCE_LABELS: Record<string, string> = {
  present: "Keldi",
  late: "Kechikdi",
  absent: "Kelmadi",
  excused: "Sababli",
};

const fmtDate = (s?: string | null) => (s ? formatUzDate(s) : "—");

/**
 * KO'RISH HUQUQI YO'Q bo'limi. Bo'sh jadval ko'rsatish YARAMAYDI: u
 * "ma'lumot yo'q" deb o'qiladi, holbuki ma'lumot bor — shunchaki bu odamga
 * ochilmaydi.
 */
function Restricted({ title }: { title: string }) {
  return (
    <EmptyState
      icon={<Lock size={26} />}
      title={title}
      description="Bu bo'lim faqat xodimning o'ziga va rahbariyatga (bosh buxgalter, nazoratchi, admin) ochiladi."
    />
  );
}

/** Ixcham ko'rsatkich — davomat va oylik yig'malari uchun. */
function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div
      className="rounded-xl p-3.5 min-w-0"
      style={{ background: "var(--bg-sunken)", border: "1px solid var(--card-border)" }}
    >
      <div className="text-micro font-bold uppercase tracking-widest truncate" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div
        className="font-mono text-xl font-semibold tabular-nums leading-none mt-2"
        style={{ color: tone || "var(--text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}

/** Ish (majburiyat/vazifa) qatori — ikkala ro'yxat ham bir xil ko'rinadi. */
function WorkList({ rows, empty }: { rows: EmployeeDossier["work"]["obligations"]; empty: string }) {
  if (rows.length === 0) {
    return (
      <p className="text-meta px-1 py-3" style={{ color: "var(--text-muted)" }}>
        {empty}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className="p-3.5 rounded-xl flex items-center justify-between gap-3"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <div className="min-w-0">
            <div className="text-body font-semibold truncate" style={{ color: "var(--text)" }}>
              {r.title}
            </div>
            <div className="text-meta mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              {r.companyName || "—"}
              {r.dueAt ? ` · muddat: ${fmtDate(r.dueAt)}` : ""}
            </div>
          </div>
          <Badge tone={r.isOverdue ? "danger" : "neutral"}>
            {r.isOverdue ? "Muddati o'tgan" : r.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export default function EmployeeProfilePanels({ person, dossier, activeTab, onResetPassword }: Props) {
  const status = person.status || "active";
  const roleColor = ROLE_COLORS[person.role as UserRole] || "var(--text-muted)";
  const monthLabel = formatPeriodLabel(dossier.month);

  return (
    <TabPanel tabId={activeTab} idBase="employee-profile" className="w-full space-y-6 pb-10">
      {activeTab === "shaxsiy" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 animate-fade-in">
          <Section title="Shaxsiy ma'lumotlar" icon={IdCard}>
            <InfoRow icon={IdCard} label="JSHSHIR" value={person.pinfl || "—"} mono />
            <InfoRow icon={Phone} label="Telefon" value={person.phone || "—"} />
            <InfoRow
              icon={UserIcon}
              label="Jinsi"
              value={person.gender ? GENDER_LABELS[person.gender] || person.gender : "—"}
            />
            <InfoRow icon={CalendarDays} label="Tug'ilgan sana" value={fmtDate(person.birthDate)} />
            <InfoRow
              icon={GraduationCap}
              label="Ma'lumoti"
              value={person.education ? EDUCATION_LABELS[person.education] || person.education : "—"}
            />
          </Section>

          <Section title="Ish va hisob ma'lumotlari" icon={Briefcase}>
            <InfoRow
              icon={Briefcase}
              label="Lavozim"
              value={ROLE_LABELS[person.role as UserRole] || person.role}
            />
            <InfoRow icon={Building} label="Bo'lim" value={person.department || "—"} />
            <InfoRow icon={Mail} label="Login (email)" value={person.email || "—"} />
            <InfoRow icon={CalendarDays} label="Ishga kirgan sana" value={fmtDate(person.hiredAt)} />
            <InfoRow icon={CheckCircle2} label="Holati" value={STATUS_LABELS[status] || status} />
            <InfoRow
              icon={Award}
              label="Reyting"
              value={person.rating != null ? String(person.rating) : "—"}
            />
            <InfoRow icon={Hash} label="Xodim ID" value={person.id} mono small />
          </Section>
        </div>
      )}

      {activeTab === "firmalar" && (
        <div className="animate-fade-in">
          {dossier.assigned.length === 0 ? (
            <EmptyState
              icon={<Building2 size={26} />}
              title="Firma biriktirilmagan"
              description="Bu xodim hech qaysi firmaga buxgalter, nazoratchi, bosh buxgalter yoki bank-klient sifatida biriktirilmagan."
            />
          ) : (
            <div className="space-y-2">
              {dossier.assigned.map((c) => (
                <Link
                  key={c.id}
                  href={`/organizations/${c.id}`}
                  className="p-3.5 rounded-xl flex items-center justify-between gap-3 transition-colors hover:brightness-[0.98]"
                  style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                >
                  <div className="min-w-0">
                    <div className="text-body font-semibold truncate" style={{ color: "var(--text)" }}>
                      {c.name}
                    </div>
                    <div className="text-meta font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
                      INN: {c.inn}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {c.roles.map((meta) => {
                      const rc = ROLE_COLORS[meta.role as UserRole] || "var(--text-muted)";
                      const share =
                        meta.sum && meta.sum > 0
                          ? `${formatNum(meta.sum)} so'm`
                          : meta.perc
                            ? `${meta.perc}%`
                            : "—";
                      return (
                        <span key={meta.role} className="flex items-center gap-2">
                          <span
                            className="text-micro font-semibold uppercase tracking-widest px-2 py-1 rounded-lg"
                            style={{ color: rc, background: `${rc}1a` }}
                          >
                            {ROLE_LABELS[meta.role as UserRole] || meta.role}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 text-meta font-semibold tabular-nums"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            <Percent size={11} style={{ opacity: 0.5 }} /> {share}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "kpi" && (
        <div className="space-y-6 animate-fade-in">
          <div className="dashboard-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target size={15} style={{ color: "var(--accent-blue)" }} />
              <h2 className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>
                Tasdiqlangan KPI · {monthLabel}
              </h2>
            </div>
            {dossier.kpi === null ? (
              <Restricted title="KPI yopiq" />
            ) : dossier.kpi.performance.length === 0 ? (
              <p className="text-meta px-1" style={{ color: "var(--text-muted)" }}>
                Bu oyda tasdiqlangan KPI yozuvi yo&apos;q.
              </p>
            ) : (
              <div className="space-y-2">
                {dossier.kpi.performance.map((r) => (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-xl flex items-center justify-between gap-3"
                    style={{ background: "var(--bg-sunken)", border: "1px solid var(--card-border)" }}
                  >
                    <div className="min-w-0">
                      <div className="text-body font-semibold truncate" style={{ color: "var(--text)" }}>
                        {r.ruleName}
                      </div>
                      <div className="text-meta mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {r.ruleCategory ? kpiCategoryLabel(r.ruleCategory) : "—"}
                        {r.recordedAt ? ` · ${formatUzDateTime(r.recordedAt)}` : ""}
                      </div>
                    </div>
                    <span
                      className="font-mono text-body font-semibold tabular-nums shrink-0"
                      style={{ color: (r.score ?? 0) < 0 ? "var(--danger)" : "var(--success)" }}
                    >
                      {r.score != null ? formatNum(r.score) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dashboard-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarCheck size={15} style={{ color: "var(--accent-blue)" }} />
              <h2 className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>
                Ochiq majburiyatlar
              </h2>
              <Badge tone="neutral">{dossier.work.obligations.length}</Badge>
            </div>
            <WorkList rows={dossier.work.obligations} empty="Bu xodimga ochiq majburiyat biriktirilmagan." />
          </div>

          <div className="dashboard-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target size={15} style={{ color: "var(--accent-blue)" }} />
              <h2 className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>
                Vazifalar
              </h2>
              <Badge tone="neutral">{dossier.work.tasks.length}</Badge>
            </div>
            <WorkList rows={dossier.work.tasks} empty="Bu xodimga vazifa tayinlanmagan." />
          </div>
        </div>
      )}

      {activeTab === "oylik" && (
        <div className="animate-fade-in">
          {dossier.payroll === null ? (
            <Restricted title="Oylik ma'lumoti yopiq" />
          ) : (
            <div className="dashboard-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Wallet size={15} style={{ color: "var(--accent-blue)" }} />
                <h2 className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>
                  Oylik tuzatmalari · {monthLabel}
                </h2>
              </div>

              {/* Yig'indi ATAYLAB `adjustmentMagnitude` orqali: bazada avans/jarima
                  qatorlari tarixan ikki xil ishorada saqlangan va oddiy SUM()
                  ularni bir-birini yeb qo'yadigan qilib qo'shardi
                  (lib/adjustments.ts). */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {(["bonus", "avans", "jarima", "payment"] as const).map((type) => {
                  const sum = dossier.payroll!.adjustments
                    .filter((a) => a.adjustmentType === type)
                    .reduce((acc, a) => acc + adjustmentMagnitude(a.amount), 0);
                  return <Stat key={type} label={ADJUSTMENT_LABELS[type]} value={formatNum(sum)} />;
                })}
              </div>

              {dossier.payroll.adjustments.length === 0 ? (
                <p className="text-meta px-1" style={{ color: "var(--text-muted)" }}>
                  Bu oyda tuzatma yozuvi yo&apos;q.
                </p>
              ) : (
                <div className="space-y-2">
                  {dossier.payroll.adjustments.map((a) => (
                    <div
                      key={a.id}
                      className="p-3.5 rounded-xl flex items-center justify-between gap-3"
                      style={{ background: "var(--bg-sunken)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="min-w-0">
                        <div className="text-body font-semibold" style={{ color: "var(--text)" }}>
                          {ADJUSTMENT_LABELS[a.adjustmentType] || a.adjustmentType}
                        </div>
                        <div className="text-meta mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                          {a.reason || "—"}
                          {a.createdAt ? ` · ${formatUzDate(a.createdAt)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className="font-mono text-body font-semibold tabular-nums"
                          style={{ color: "var(--text)" }}
                        >
                          {formatNum(adjustmentMagnitude(a.amount))}
                        </span>
                        <Badge tone={a.isApproved ? "success" : "warning"}>
                          {a.isApproved ? "Tasdiqlangan" : "Kutilmoqda"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "davomat" && (
        <div className="animate-fade-in">
          {dossier.attendance === null ? (
            <Restricted title="Davomat yopiq" />
          ) : (
            <div className="dashboard-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarCheck size={15} style={{ color: "var(--accent-blue)" }} />
                <h2 className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>
                  Davomat · {monthLabel}
                </h2>
                <span className="text-micro" style={{ color: "var(--text-muted)" }}>
                  · oyda {dossier.attendance.workdays} ish kuni
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
                <Stat label="Ishlangan kun" value={dossier.attendance.summary.workedDays} />
                <Stat
                  label="Erta kelgan"
                  value={dossier.attendance.summary.earlyDays}
                  tone="var(--success)"
                />
                <Stat
                  label="Kechikkan kun"
                  value={dossier.attendance.summary.lateDays}
                  tone={dossier.attendance.summary.lateDays > 0 ? "var(--warning)" : undefined}
                />
                <Stat
                  label="Kechikish (daq.)"
                  value={dossier.attendance.summary.lateMinutes}
                  tone={dossier.attendance.summary.lateMinutes > 0 ? "var(--warning)" : undefined}
                />
                <Stat
                  label="Kelmagan kun"
                  value={dossier.attendance.summary.absentDays}
                  tone={dossier.attendance.summary.absentDays > 0 ? "var(--danger)" : undefined}
                />
              </div>

              {dossier.attendance.rows.length === 0 ? (
                <p className="text-meta px-1" style={{ color: "var(--text-muted)" }}>
                  Bu oyda davomat yozuvi yo&apos;q.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  {/* `DataTable` EMAS, `.erp-table`: bu bir oylik STATIK ro'yxat
                      (≤23 qator) — saralash, tanlash, sahifalash va eksport
                      kerak emas. Davomatni tahrirlash ekrani alohida
                      (`/attendance`) va u DataTable ustida ishlaydi. */}
                  <table className="erp-table w-full text-body">
                    <caption className="sr-only">Kunlik davomat</caption>
                    <thead>
                      <tr style={{ color: "var(--text-muted)" }}>
                        <th className="text-left font-semibold text-micro uppercase tracking-widest py-2">Sana</th>
                        <th className="text-left font-semibold text-micro uppercase tracking-widest py-2">Holat</th>
                        <th className="text-right font-semibold text-micro uppercase tracking-widest py-2">Kelish</th>
                        <th className="text-right font-semibold text-micro uppercase tracking-widest py-2">Kechikish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dossier.attendance.rows.map((r) => (
                        <tr key={r.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                          <td className="py-2 tabular-nums" style={{ color: "var(--text)" }}>
                            {fmtDate(r.date)}
                          </td>
                          <td className="py-2">
                            <Badge
                              tone={
                                r.status === "absent"
                                  ? "danger"
                                  : r.status === "late"
                                    ? "warning"
                                    : r.status === "excused"
                                      ? "info"
                                      : "success"
                              }
                            >
                              {ATTENDANCE_LABELS[r.status] || r.status}
                            </Badge>
                          </td>
                          <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                            {r.checkIn ? formatUzDateTime(r.checkIn).slice(-5) : "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                            {r.lateMinutes ? `${r.lateMinutes} daq.${r.lateExcused ? " (uzrli)" : ""}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "ruxsatlar" && (
        <div className="space-y-6 animate-fade-in">
          <div className="dashboard-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={15} style={{ color: "var(--accent-blue)" }} />
              <h2 className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>
                Tizim roli va ekranlar
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span
                className="text-micro font-semibold uppercase tracking-widest px-2.5 py-1 rounded-lg"
                style={{ color: roleColor, background: `${roleColor}1a`, border: `1px solid ${roleColor}40` }}
              >
                {ROLE_LABELS[person.role as UserRole] || person.role}
              </span>
              <Badge tone={status === "active" ? "success" : "neutral"}>
                {STATUS_LABELS[status] || status}
              </Badge>
            </div>
            {/* Ekranlar ro'yxati = proxy darvozasi bilan BIR MANBA
                (`effectiveViewsForRole`): rol default'i + admin override'i +
                biriktiruv beradigan ekranlar. */}
            <p className="text-meta mb-3" style={{ color: "var(--text-muted)" }}>
              Ochiladigan ekranlar — lavozim, admin sozlamasi va firma biriktiruvlari birlashmasi:
            </p>
            <div className="flex flex-wrap gap-2">
              {dossier.access.views.map((v) => (
                <Badge key={v.id} tone="neutral">
                  {v.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="dashboard-card p-5">
            <CredentialsSection person={person} onResetPassword={onResetPassword} />
          </div>
        </div>
      )}
    </TabPanel>
  );
}
