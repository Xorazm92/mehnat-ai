"use client";

import React from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import OperationModule from "@/components/OperationModule";
import HisobotlarModule from "@/components/HisobotlarModule";
import { upsertMonthlyReport } from "@/server/operations";
import { Company, Staff, OperationEntry } from "@/types";
import type { ReportColumn } from "@/lib/reportColumns";
import { FileText, Grid3x3 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { useTabParam, useUrlParam } from "@/hooks/useTabParam";
import { REPORTS_TAB_IDS, type ReportsTabId } from "@/lib/reportsTabs";

/**
 * HISOBOTLAR EKRANI — ikki xil narsani ushlab turadi va endi buni ochiq aytadi:
 *
 *   · Amallar matritsasi — kundalik ish yuzasi (firma × oy × ustun).
 *   · Moliyaviy hisobotlar — hujjatlar (foyda-zarar va h.k.).
 *
 * Uchta nuqson tuzatildi:
 *
 *   1. Sahifada `h1` UMUMAN yo'q edi — ekran yorliqlar qatoridan boshlanardi.
 *      Yon paneldan tashqari foydalanuvchiga qayerdaligini hech narsa
 *      aytmasdi (`OperationModule` ichidagi `h1` esa faqat matritsa
 *      yorlig'ida ko'rinardi va sahifa sarlavhasi vazifasini o'tay olmasdi).
 *
 *   2. Yorliq nomi sahifa nomi bilan bir xil edi: "Hisobotlar > Hisobotlar".
 *      Endi hujjatlar yorlig'i o'z nomi bilan — "Moliyaviy hisobotlar"
 *      (modulning o'zi ham shu sarlavhani chizadi).
 *
 *   3. Sukut bo'yicha kamdan-kam ochiladigan hujjatlar ro'yxati chiqardi,
 *      kundalik ish yuzasi esa ikkinchi yorliqda yashiringandi. Tartib
 *      almashtirildi.
 */

interface Props {
  companies: Company[];
  operations: OperationEntry[];
  staff: Staff[];
  userRole: string;
  currentUserId?: string;
  userName?: string;
  focusCompany?: string | null;
  focusCol?: string | null;
  /** Serverda hisoblangan/tekshirilgan davr ("YYYY-MM") — mijozda `new Date()` yo'q. */
  initialPeriod: string;
  reportColumns?: ReportColumn[];
  initialTab?: ReportsTabId;
  /** (companyId, shablon kodi) — matritsa foizining maxraji. */
  obligationCoverage?: { companyId: string; code: string }[];
}

export default function ReportsClient({
  companies,
  operations,
  staff,
  userRole,
  currentUserId,
  userName,
  focusCompany,
  focusCol,
  initialPeriod,
  reportColumns,
  obligationCoverage,
  initialTab = "matrix",
}: Props) {
  useAutoRefresh();
  const hasFocus = !!(focusCompany && focusCol);
  // Davr ham URL'da: "2026-07 matritsasiga qara" degan havolani yuborish
  // mumkin. Ilgari oy faqat komponent ichida yashardi va havola har doim
  // JORIY oyni ochardi.
  const [selectedPeriod, setSelectedPeriod] = useUrlParam("period", initialPeriod);
  // Skrinshot havolasi (`?company=&col=`) har doim matritsani ochadi — u
  // havolaning butun maqsadi.
  const [tab, setTab] = useTabParam<ReportsTabId>(
    "tab",
    REPORTS_TAB_IDS,
    hasFocus ? "matrix" : initialTab
  );

  /**
   * `OperationModule` katakni O'ZI saqlaydi (`upsertMonthlyReport`) va faqat
   * shundan keyin bu callback'ni chaqiradi. Ilgari bu yerda AYNAN o'sha yozuv
   * ikkinchi marta takrorlanardi: har bir katak uchun ikkita baza yozuvi va
   * ikkita majburiyat sinxronizatsiyasi ketardi, ikkinchisi esa `await`
   * qilinmagani uchun xatosi hech qayerda ushlanmasdi.
   *
   * Callback saqlanadi (modul shartnomasi), lekin endi u qayta yozmaydi.
   */
  const handleUpdate = async () => {};

  const tabs = [
    { id: "matrix" as const, label: "Amallar matritsasi", icon: Grid3x3, hint: "Firma × oy × amal — kundalik topshirish holati" },
    { id: "reports" as const, label: "Moliyaviy hisobotlar", icon: FileText, hint: "Foyda-zarar va boshqa hujjatlar" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* IXCHAM: matritsa — zich ish yuzasi va sarlavha ~64px joyni yeb qo'yardi.
          Uning ustiga matn uch marta takrorlanardi: yon panelda "Hisobotlar",
          bu yerda "Hisobotlar", modul ichida "Amallar Matritsasi". Endi faqat
          yorliqlar qoladi; `h1` ekran o'quvchi uchun saqlanib turadi. */}
      <PageHeader
        title="Hisobotlar"
        className="flex-shrink-0"
        compact
      >
        <Tabs items={tabs} value={tab} onChange={setTab} idBase="reports" ariaLabel="Hisobot bo'limlari" />
      </PageHeader>

      <TabPanel
        tabId={tab}
        idBase="reports"
        className={`flex-1 min-h-0 ${tab === "matrix" ? "flex flex-col" : "overflow-auto"}`}
      >
        {tab === "reports" ? (
          <HisobotlarModule companies={companies} staff={staff} lang="uz" userRole={userRole} />
        ) : (
          <OperationModule
            companies={companies}
            operations={operations}
            staff={staff}
            lang="uz"
            userRole={userRole}
            currentUserId={currentUserId}
            userName={userName}
            focusProof={hasFocus ? { companyId: focusCompany as string, colKey: focusCol as string } : null}
            reportColumns={reportColumns}
            obligationCoverage={obligationCoverage}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            onCompanySelect={() => {}}
            onUpdate={handleUpdate}
          />
        )}
      </TabPanel>
    </div>
  );
}
