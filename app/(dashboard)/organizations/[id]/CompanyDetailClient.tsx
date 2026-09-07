"use client";

import React, { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  RefreshCw,
  User,
  Users,
  Wallet,
  MapPin,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { ModalLayer } from "@/components/ui";
import OnboardingWizard from "@/components/OnboardingWizard";
import CompanyProfilePanels from "@/components/company-detail/CompanyProfilePanels";
import { COMPANY_TABS, TAB_LABELS, normalizeTabId } from "@/components/company-detail/tabs";
import { assignmentsFromCompany } from "@/components/company-detail/assignments";
import type { TabId } from "@/components/company-detail/types";
import { BreadcrumbTrail } from "@/components/BreadcrumbTrail";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { updateCompany } from "@/server/companies";
import { taxRegimeLabel } from "@/lib/taxRegimes";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import type { Company, Staff } from "@/types";
import type { TariffPreset } from "@/lib/tariffPresets";

interface Props {
  company: Company;
  staff: Staff[];
  tariffPreset: TariffPreset;
  internalContractors: { id: string; name: string }[];
  internalParties?: {
    id: string;
    label: string;
    type: string;
    employee?: { fullName: string } | null;
  }[];
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

export default function CompanyDetailClient({
  company,
  staff,
  tariffPreset,
  internalContractors,
  internalParties,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useAutoRefresh();

  /**
   * FAOL YORLIQ URL DA YASHAYDI.
   *
   * Panel ichida `useState` bo'lganda tanlangan bo'lim sahifa yangilanishi
   * bilan yo'qolardi va havolani ulashib bo'lmasdi. Endi manba — `?tab=`,
   * noma'lum qiymat "pasport" ga tushadi (`normalizeTabId`).
   */
  const activeTab = normalizeTabId(searchParams.get("tab"));
  const changeTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    // `replace` — yorliq almashtirish orqaga tugmasini tarixga to'ldirmasin;
    // `scroll: false` — sahifa yuqoriga sakramasin.
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  /**
   * Serverdan kelgan firma — asosiy manba. Lokal nusxa faqat saqlashdan keyin
   * `router.refresh()` javobi kelguncha yangi qiymatni ko'rsatib turadi
   * (kredensial kartalari va jamoa tahriri shu naqshda ishlaydi).
   */
  const [current, setCurrent] = useState<Company>(company);
  const [lastProp, setLastProp] = useState(company);
  if (company !== lastProp) {
    setLastProp(company);
    setCurrent(company);
  }

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  const handleSave = async (data: Partial<Company>, assignments?: any[]) => {
    await updateCompany(current.id, data as any, assignments);
    setCurrent((prev) => ({ ...prev, ...data }) as Company);
    router.refresh();
  };

  /** Sehrgardan kelgan to'liq forma — "Tahrirlash" modalining saqlashi. */
  const handleWizardSave = async (data: Partial<Company>, assignments: any[]) => {
    if (isSaving) return;
    if (!data.name || !data.inn) {
      toast.error("Iltimos, barcha majburiy maydonlarni to'ldiring");
      return;
    }
    setIsSaving(true);
    try {
      await handleSave({ ...data, id: current.id }, assignments);
      setIsEditing(false);
      toast.success("Firma tahrirlandi");
    } catch (error) {
      console.error("[CompanyDetail] saqlashda xato:", error);
      toast.error(friendlyError(error, "Saqlashda xatolik yuz berdi."));
    } finally {
      setIsSaving(false);
    }
  };

  const isArchived = current.isActive === false;

  return (
    <div className="w-full min-w-0 space-y-5 animate-fade-in">
      {/* Yo'l chizig'i sahifa qobig'ida chiziladi — bu yerda unga faqat
          "…" o'rniga firma nomi va joriy yorliq beriladi. */}
      <BreadcrumbTrail
        crumbs={[
          { label: current.name, href: pathname },
          { label: TAB_LABELS[activeTab] },
        ]}
      />

      <Button
        variant="ghost"
        size="sm"
        icon={<ArrowLeft size={14} />}
        onClick={() => router.push("/organizations")}
      >
        Ortga
      </Button>

      {/* ── Sarlavha ────────────────────────────────────────────────────── */}
      <header
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      >
        <div className="h-1" style={{ background: "var(--accent-blue)" }} aria-hidden="true" />
        <div className="p-4 sm:p-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4 items-start min-w-0">
            <div
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center text-2xl sm:text-3xl text-white font-semibold shrink-0 shadow-md"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--accent-blue-hover))" }}
              aria-hidden="true"
            >
              {current.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <h1
                className="text-xl font-semibold tracking-tight leading-tight break-words"
                style={{ color: "var(--text-primary)" }}
              >
                {current.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <Badge tone="neutral">INN: {current.inn}</Badge>
                <Badge tone="info">{taxRegimeLabel(current.taxRegime ?? current.taxType)}</Badge>
                <Badge tone={isArchived ? "neutral" : "success"}>
                  {isArchived ? "Arxiv" : "Faol"}
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
            <Button
              variant="primary"
              size="sm"
              icon={<Pencil size={14} />}
              onClick={() => setIsEditing(true)}
            >
              Tahrirlash
            </Button>
          </div>
        </div>

        {/* ── Tezkor ma'lumot ──────────────────────────────────────────── */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 px-4 sm:px-6 pb-5"
        >
          <InfoCard
            icon={<User size={14} />}
            label="Rahbar / Direktor"
            value={current.directorName || "—"}
            meta={
              current.directorPhone ? (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Phone size={11} /> {current.directorPhone}
                </span>
              ) : (
                "Telefon ko'rsatilmagan"
              )
            }
          />
          <InfoCard
            icon={<Users size={14} />}
            label="Mas'ul buxgalter"
            value={current.accountantName || "Biriktirilmagan"}
            meta={`Nazoratchi: ${current.supervisorName || "—"}`}
          />
          <InfoCard
            icon={<Wallet size={14} />}
            label="Shartnoma summasi"
            value={
              <span className="font-mono tabular-nums">
                {formatNum(Number(current.contractAmount || 0))}{" "}
                <span className="text-micro font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                  so&apos;m
                </span>
              </span>
            }
            meta={current.contractDate ? `Sana: ${formatUzDate(current.contractDate)}` : "Shartnoma sanasi yo'q"}
          />
          <InfoCard
            icon={<MapPin size={14} />}
            label="Yuridik manzil"
            value={current.legalAddress || "Manzil ko'rsatilmagan"}
          />
        </div>

        {/* ── Yorliqlar ────────────────────────────────────────────────── */}
        <div className="px-4 sm:px-6">
          <Tabs
            items={COMPANY_TABS}
            value={activeTab}
            onChange={changeTab}
            idBase="company-profile"
            ariaLabel="Firma ma'lumoti bo'limlari"
          />
        </div>
      </header>

      {/* ── Tanlangan bo'lim — to'liq kenglikda ──────────────────────────── */}
      <CompanyProfilePanels
        company={current}
        staff={staff}
        activeTab={activeTab}
        onTabChange={changeTab}
        onSave={handleSave}
      />

      {isEditing && (
        <ModalLayer
          open
          onClose={() => !isSaving && setIsEditing(false)}
          label="Firmani tahrirlash"
          align="start"
          dismissable={!isSaving}
        >
          <div
            className="relative w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden outline-none"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--card-border)" }}
          >
            <OnboardingWizard
              staff={staff}
              initialData={current}
              initialAssignments={assignmentsFromCompany(current)}
              tariffPreset={tariffPreset}
              internalContractors={internalContractors}
              internalParties={internalParties}
              onSave={handleWizardSave}
              onCancel={() => setIsEditing(false)}
            />
            {isSaving && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  zIndex: "var(--z-panel, 110)",
                  background: "color-mix(in srgb, var(--bg-primary) 60%, transparent)",
                }}
              >
                <div
                  className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: "var(--accent-blue)", borderTopColor: "transparent" }}
                />
              </div>
            )}
          </div>
        </ModalLayer>
      )}
    </div>
  );
}
