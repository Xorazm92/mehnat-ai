"use client";

import React, { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil, RefreshCw, Phone, Building, Building2, CalendarDays } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Tabs } from "@/components/ui/Tabs";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { ModalLayer } from "@/components/ui";
import { BreadcrumbTrail } from "@/components/BreadcrumbTrail";
import EmployeeForm from "@/components/employee-detail/EmployeeForm";
import EmployeeProfilePanels, { STATUS_LABELS } from "@/components/employee-detail/EmployeeProfilePanels";
import { EMPLOYEE_TABS, EMPLOYEE_TAB_LABELS, normalizeEmployeeTabId } from "@/components/employee-detail/tabs";
import { saveEmployee } from "@/components/employee-detail/saveEmployee";
import type { EmployeeDossier, EmployeeTabId } from "@/components/employee-detail/types";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { resetUserPassword } from "@/server/users";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/platform/permissions";
import { formatUzDate } from "@/lib/platform/format";
import { normalizePeriodKey } from "@/lib/periods";
import { friendlyError } from "@/lib/actionError";
import type { Staff } from "@/types";

interface Props {
  person: Staff;
  /** Faolsizlantirilganmi — "Ishdan bo'shatilgan" nishoni uchun. */
  isActive: boolean;
  /** "3 yil 2 oy" — serverda hisoblangan (gidratatsiya farqi bo'lmasin). */
  tenure: string | null;
  dossier: EmployeeDossier;
  /** Anketani tahrirlash va parol tiklash — server sharti bilan bir xil (admin). */
  canManageStaff: boolean;
}

/** Sarlavha ostidagi ixcham ma'lumot plitkasi (matn uchun — raqam uchun emas). */
function InfoCard({
  icon,
  label,
  value,
  meta,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 min-w-0"
      style={{ background: "var(--bg-sunken)", border: "1px solid var(--card-border)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: "var(--text-muted)" }} className="flex-shrink-0">
          {icon}
        </span>
        <span
          className="text-meta font-bold uppercase tracking-widest truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-body font-semibold leading-snug break-words"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </div>
      {meta && (
        <p className="text-micro mt-1.5 break-words" style={{ color: "var(--text-muted)" }}>
          {meta}
        </p>
      )}
    </div>
  );
}

export default function EmployeeDetailClient({
  person,
  isActive,
  tenure,
  dossier,
  canManageStaff,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useAutoRefresh();

  /**
   * FAOL YORLIQ URL DA YASHAYDI — firma kartasi bilan bir xil naqsh.
   * `useState` bo'lganda tanlangan bo'lim sahifa yangilanishi bilan yo'qolardi
   * va havolani ulashib bo'lmasdi.
   */
  const activeTab = normalizeEmployeeTabId(searchParams.get("tab"));
  const changeTab = (tab: EmployeeTabId) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  /** Oylik kesimdagi yorliqlar — ular uchun sarlavhada oy tanlagich chiqadi. */
  const isMonthly = activeTab === "kpi" || activeTab === "oylik" || activeTab === "davomat";
  const changeMonth = (period: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("oy", normalizePeriodKey(period));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const [isEditing, setIsEditing] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  const roleColor = ROLE_COLORS[person.role as UserRole] || "var(--text-muted)";
  const status = person.status || "active";
  // Faolsizlantirilgan xodimda ish holati ("ta'tilda") ahamiyatsiz —
  // sarlavhada eng kuchli fakt turishi kerak.
  const statusLabel = isActive ? STATUS_LABELS[status] || status : "Ishdan bo'shatilgan";

  const handleSave = async (s: Staff) => {
    await saveEmployee(s);
    router.refresh();
    toast.success("Xodim yangilandi");
  };

  const handleResetPassword = canManageStaff
    ? async (id: string, newPassword: string) => {
        try {
          await resetUserPassword(id, newPassword);
        } catch (e) {
          toast.error(friendlyError(e, "Parolni o'rnatib bo'lmadi"));
          throw e;
        }
      }
    : undefined;

  const mainRole = dossier.assigned[0]?.roles[0]?.role;

  return (
    <div className="w-full min-w-0 space-y-5 animate-fade-in">
      {/* Yo'l chizig'i sahifa qobig'ida chiziladi — bu yerda unga faqat
          "…" o'rniga xodim nomi va joriy yorliq beriladi. */}
      <BreadcrumbTrail
        crumbs={[
          { label: person.name, href: pathname },
          { label: EMPLOYEE_TAB_LABELS[activeTab] },
        ]}
      />

      <Button
        variant="ghost"
        size="sm"
        icon={<ArrowLeft size={14} />}
        onClick={() => router.push("/staff")}
      >
        Ortga
      </Button>

      {/* ── Sarlavha ────────────────────────────────────────────────────── */}
      <header
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      >
        <div className="h-1" style={{ background: roleColor }} aria-hidden="true" />
        <div className="p-4 sm:p-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4 items-center min-w-0">
            <Avatar
              name={person.name}
              color={person.avatarColor}
              userId={person.id}
              avatarRef={person.avatarRef}
              size="xl"
              className="shadow-md"
            />
            <div className="min-w-0">
              <h1
                className="text-xl font-semibold tracking-tight leading-tight break-words"
                style={{ color: "var(--text-primary)" }}
              >
                {person.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <span
                  className="text-micro font-semibold uppercase tracking-widest px-2.5 py-1 rounded-lg"
                  style={{ color: roleColor, background: `${roleColor}1a`, border: `1px solid ${roleColor}40` }}
                >
                  {ROLE_LABELS[person.role as UserRole] || person.role}
                </span>
                <Badge
                  tone={!isActive ? "neutral" : status === "active" ? "success" : status === "sick" ? "warning" : "info"}
                >
                  {statusLabel}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} className={isRefreshing ? "animate-spin" : undefined} />}
              disabled={isRefreshing}
              onClick={() => startRefresh(() => router.refresh())}
            >
              Yangilash
            </Button>
            {/* Tugma faqat serverda o'ta oladigan odamga: `updateUser` anketa
                bilan `role` ni ham yuboradi, uni esa faqat admin o'zgartira
                oladi (server/users.ts). */}
            {canManageStaff && (
              <Button
                variant="primary"
                size="sm"
                icon={<Pencil size={14} />}
                onClick={() => setIsEditing(true)}
              >
                Tahrirlash
              </Button>
            )}
          </div>
        </div>

        {/* ── Tezkor ma'lumot ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 px-4 sm:px-6 pb-5">
          <InfoCard
            icon={<Phone size={14} />}
            label="Aloqa"
            value={person.phone || "Telefon yo'q"}
            meta={person.email || "Email yo'q"}
          />
          <InfoCard
            icon={<Building size={14} />}
            label="Bo'lim"
            value={person.department || "Belgilanmagan"}
            meta={ROLE_LABELS[person.role as UserRole] || person.role}
          />
          <InfoCard
            icon={<Building2 size={14} />}
            label="Biriktirilgan firmalar"
            value={
              <span className="font-mono tabular-nums">
                {dossier.assigned.length}{" "}
                <span className="text-micro font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                  ta
                </span>
              </span>
            }
            meta={
              mainRole
                ? `Asosiy vazifa: ${ROLE_LABELS[mainRole as UserRole] || mainRole}`
                : "Vazifa biriktirilmagan"
            }
          />
          <InfoCard
            icon={<CalendarDays size={14} />}
            label="Ishga qabul"
            value={person.hiredAt ? formatUzDate(person.hiredAt) : "Sana yo'q"}
            meta={tenure ? `Staj: ${tenure}` : undefined}
          />
        </div>

        {/* ── Yorliqlar ────────────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 flex items-end gap-3">
          <Tabs
            items={EMPLOYEE_TABS}
            value={activeTab}
            onChange={changeTab}
            idBase="employee-profile"
            ariaLabel="Xodim ma'lumoti bo'limlari"
            className="flex-1 min-w-0"
          />
          {/* Oy tanlagich faqat oylik kesimdagi yorliqlarda: "Shaxsiy" yoki
              "Firmalar" ustida u hech narsani o'zgartirmaydi va yolg'on
              boshqaruv bo'lib qolardi. */}
          {isMonthly && (
            <div className="pb-1 shrink-0">
              <MonthPicker selectedPeriod={dossier.month} onChange={changeMonth} />
            </div>
          )}
        </div>
      </header>

      {/* ── Tanlangan bo'lim — to'liq kenglikda ──────────────────────────── */}
      <EmployeeProfilePanels
        person={person}
        dossier={dossier}
        activeTab={activeTab}
        onResetPassword={handleResetPassword}
      />

      {isEditing && (
        <ModalLayer open onClose={() => setIsEditing(false)} label="Xodim anketasini tahrirlash" align="start">
          <div className="w-full max-w-4xl">
            <EmployeeForm
              initial={person}
              onSave={handleSave}
              onResetPassword={handleResetPassword}
              onCancel={() => setIsEditing(false)}
            />
          </div>
        </ModalLayer>
      )}
    </div>
  );
}
