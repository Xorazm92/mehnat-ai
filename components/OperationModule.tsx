"use client";
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Company, OperationEntry, Language, Staff } from '@/types';
import { translations } from '@/lib/translations';
import { ChevronDown, Download, Search, RefreshCw, Info, SlidersHorizontal, BarChart2, Sparkles, X } from 'lucide-react';
import { MonthPicker } from './ui/MonthPicker';
import { useConfirm } from './ui/ConfirmDialog';
import { useTableState } from '@/hooks/useTableState';
import { periodsEqual } from '@/lib/periods';
import { toast } from 'sonner';
import { upsertMonthlyReport, clearColumnForPeriod } from '@/server/operations';
import { createNotification } from '@/server/audit';
import { getReportProofsMeta } from '@/server/proofs';
import ReportProofModal, { ProofModalState } from './ReportProofModal';
import { BASE_REPORT_COLUMNS, type ReportColumn } from '@/lib/reportColumns';
import { allowedCellActions, canApproveCell, canEditMatrix, isCompanyReviewer, isReviewerOwnedValue, type CellAction } from '@/lib/reportPermissions';
import MatrixFilterPanel, { type MatrixFilterOptions } from './MatrixFilterPanel';
import ReportInsightModal, { type InsightRowInput } from './ReportInsightModal';
import type { InsightDimension } from '@/lib/reportInsight';
import {
  activeChips,
  filtersSignature,
  matchesColStatus,
  passesColumnSection,
  matchesFacets,
  matchesSearch,
  parseFilters,
  personFacetOptions,
  slotFacetOptions,
  EMPTY_FILTERS,
  FILTER_URL_KEYS,
  type MatrixFilters,
} from '@/lib/matrixFilters';
import { pendingCellKey, readRowCells, reconcilePendingCells } from '@/lib/matrixRows';
import { normalizeTaxRegime } from '@/lib/taxRegimes';
import { columnAppliesToRegime, regimeBlockReason } from '@/lib/reportApplicability';
import { serviceEnabled, paymentCodeFor, serviceFullLabel } from '@/lib/reportColumns';
import {
  addToTally,
  classifyCell,
  emptyTally,
  mergeTally,
  matchesStatusFilter,
  parseStatusFilter,
  settledRatio,
  MATRIX_STATUS_FILTERS,
  type CellStatus,
  type MatrixStatusFilter,
  type StatusTally,
} from '@/lib/reportStatus';
import { friendlyError } from '@/lib/actionError';
// DIQQAT: `@/lib/obligationBridge` dan EMAS — u `@/lib/prisma` ni tortadi va
// klient to'plamida prod build'ni yiqitadi ("Module not found: dns/fs/net/tls").
import { COL_KEY_TO_TEMPLATE_CODES } from '@/lib/reportTemplateMap';
import { companyRelations, type CompanyRelation } from '@/lib/access';
import { useDismissable } from '@/hooks/useDismissable';
import { Button } from "@/components/ui/Button";
import { Tooltip } from './ui/Tooltip';
// ── Report Column Definitions ──────────────────────────────────
// Ustunlar ta'rifi endi lib/reportColumns.ts da (BASE_REPORT_COLUMNS) — yagona manba.
// Amaldagi (config qo'llangan) ro'yxat `reportColumns` prop orqali keladi;
// prop bo'lmasa BASE_REPORT_COLUMNS ishlatiladi.

// ── Status Rendering ───────────────────────────────────────────
// Fon ranglari endi TEMA TOKENLARIDAN (color-mix orqali) — avval bu yerda
// eski "GitHub" temasidan qolgan qattiq rgba qiymatlar bor edi
// (#34D058, #FF6B6B, #FFD700, #4DA3FF), ular yumshatilgan palitraga mos
// kelmasdi. Bo'sh katak endi SHAFFOF: 212×46 li matritsada aksariyat
// kataklar bo'sh, shuning uchun ular chekinadi va TO'LDIRILGAN statuslar
// ajralib chiqadi (kulrang tabletkalar devori o'rniga).
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

// ── Kategoriya va Guruh ranglari (Visual Contrast System) ──────
export interface GroupStyle {
  headerBg: string;
  subHeaderBg: string;
  cellBg: string;
  text: string;
  border: string;
}

// Guruh ranglari TOKENLARDAN (`app/globals.css` → `--matrix-*`).
//
// Ilgari bu yerda Tailwind palitrasidan qattiq hex qiymatlar turardi
// (#3b82f6, #10b981, #f59e0b …), matn rangi esa tokenlardan olinardi:
// bitta sarlavhada FON bir ko'k, MATN boshqa ko'k bo'lardi. Qorong'u
// temada qattiq ranglar umuman aylanmasdi. Yana: "Soliq H/T" va
// "Komunalka" ikkalasi ham sariq edi va yonma-yon turganda farqlanmasdi.
//
// Endi fon ham, chegara ham, matn ham BITTA manbadan.
const GROUP_STYLE_MAP: Record<string, GroupStyle> = {
  // Guruh nomlari davriylikka ko'chdi ("Oylik" → "Oylik ish",
  // "Soliqlar"/"Soliq H/T" → "Oylik soliq"/"Kvartal soliq"). Eski kalitlar ham
  // qoldirilgan: admin `group` override bilan eski nomni yozib qo'ygan
  // bo'lsa, ustun rangsiz kulrangga tushib qolmasin.
  "Oylik ish": {
    headerBg: "color-mix(in srgb, var(--matrix-oylik) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-oylik) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-oylik) 3.5%, transparent)",
    text: "var(--matrix-oylik)",
    border: "color-mix(in srgb, var(--matrix-oylik) 45%, transparent)",
  },
  "Oylik soliq": {
    headerBg: "color-mix(in srgb, var(--matrix-soliq) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-soliq) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-soliq) 3.5%, transparent)",
    text: "var(--matrix-soliq)",
    border: "color-mix(in srgb, var(--matrix-soliq) 45%, transparent)",
  },
  "Kvartal soliq": {
    headerBg: "color-mix(in srgb, var(--matrix-soliq-ht) 22%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-soliq-ht) 12%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-soliq-ht) 4.5%, transparent)",
    text: "var(--matrix-soliq-ht)",
    border: "color-mix(in srgb, var(--matrix-soliq-ht) 50%, transparent)",
  },
  "Yillik hisobot": {
    headerBg: "color-mix(in srgb, var(--matrix-yillik) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-yillik) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-yillik) 3.5%, transparent)",
    text: "var(--matrix-yillik)",
    border: "color-mix(in srgb, var(--matrix-yillik) 45%, transparent)",
  },
  "Statistika": {
    headerBg: "color-mix(in srgb, var(--matrix-statistika) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-statistika) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-statistika) 3.5%, transparent)",
    text: "var(--matrix-statistika)",
    border: "color-mix(in srgb, var(--matrix-statistika) 45%, transparent)",
  },
  "IT Park": {
    headerBg: "color-mix(in srgb, var(--matrix-itpark) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-itpark) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-itpark) 3.5%, transparent)",
    text: "var(--matrix-itpark)",
    border: "color-mix(in srgb, var(--matrix-itpark) 45%, transparent)",
  },
  "Komunalka": {
    headerBg: "color-mix(in srgb, var(--matrix-komunal) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-komunal) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-komunal) 3.5%, transparent)",
    text: "var(--matrix-komunal)",
    border: "color-mix(in srgb, var(--matrix-komunal) 45%, transparent)",
  },
  "Maxsus": {
    headerBg: "color-mix(in srgb, var(--matrix-maxsus) 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, var(--matrix-maxsus) 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, var(--matrix-maxsus) 3.5%, transparent)",
    text: "var(--matrix-maxsus)",
    border: "color-mix(in srgb, var(--matrix-maxsus) 45%, transparent)",
  },
};

// Eski guruh nomlari — admin sozlamasidagi `group` override uchun taqlid.
GROUP_STYLE_MAP["Oylik"] = GROUP_STYLE_MAP["Oylik ish"];
GROUP_STYLE_MAP["Soliqlar"] = GROUP_STYLE_MAP["Oylik soliq"];
GROUP_STYLE_MAP["Soliq H/T"] = GROUP_STYLE_MAP["Kvartal soliq"];
GROUP_STYLE_MAP["Yillik"] = GROUP_STYLE_MAP["Yillik hisobot"];

const getGroupStyle = (groupName: string): GroupStyle => {
  return GROUP_STYLE_MAP[groupName] ?? {
    headerBg: "var(--surface-2)",
    subHeaderBg: "var(--surface-2)",
    cellBg: "transparent",
    text: "var(--text-secondary)",
    border: "var(--border)",
  };
};

const buildGroupEdges = (cols: readonly ReportColumn[]): Set<string> => {
  const edges = new Set<string>();
  cols.forEach((c, i) => {
    const next = cols[i + 1];
    if (next && c.group !== next.group) edges.add(c.key);
  });
  return edges;
};
/**
 * Katak ko'rinishi. Qaysi qiymat qaysi holat ekanini bu yer HAL QILMAYDI —
 * `lib/reportStatus.classifyCell` hal qiladi, bu yerda faqat rang va belgi.
 * Ilgari tasnif shu funksiyada VA yana uch joyda alohida yozilgani uchun ular
 * bir-biridan farq qilardi (masalan 'topshirmaydi' bu yerda izoh, statistikada
 * esa "shart emas" edi).
 */
const STATUS_STYLE: Record<CellStatus, { bg: string; text: string; icon: string; tooltip: string }> = {
  none: { bg: 'transparent', text: 'var(--text-muted)', icon: '—', tooltip: "Bo'sh" },
  // `missing` katakda HECH QACHON chizilmaydi (u faqat hisobda paydo bo'ladi),
  // lekin `Record<CellStatus, …>` to'liq bo'lishi shart.
  missing: { bg: tint('var(--danger)', 8), text: 'var(--danger)', icon: '—', tooltip: 'Talab qilinadi, belgilanmagan' },
  approved: { bg: tint('var(--success)', 13), text: 'var(--success)', icon: '✓', tooltip: 'Bajarildi (+)' },
  failed: { bg: tint('var(--danger)', 13), text: 'var(--danger)', icon: '✗', tooltip: 'Bajarilmadi (-)' },
  submitted: { bg: tint('var(--info)', 13), text: 'var(--info)', icon: '·', tooltip: 'Topshirildi (Kutilmoqda)' },
  blocked: { bg: tint('var(--warning)', 15), text: 'var(--warning)', icon: '!', tooltip: 'Kartoteka' },
  error: { bg: tint('var(--danger)', 13), text: 'var(--danger)', icon: '!', tooltip: 'Xatolik' },
  // NOL HISOBOT — topshirilgan, ichida raqam nol. "0" (shart emas) dan farqli:
  // u ish BAJARILGANINI bildiradi, shuning uchun belgisi ham boshqa.
  zero: { bg: tint('var(--brand)', 13), text: 'var(--brand)', icon: 'Ø', tooltip: 'Nol hisobot topshirildi' },
  /**
   * ERKIN MATN (izoh).
   *
   * Katakda matnning O'ZI qisqartirilib chiziladi, `icon` esa faqat ZAXIRA
   * (matn bo'sh bo'lib qolgan holat uchun).
   *
   * TARIX — ikkita qarama-qarshi xato:
   *   1. Avval to'liq matn chizilardi: uzun izoh ustunni cho'zib, butun jadval
   *      qatorini kengaytirib yuborardi.
   *   2. Keyin matn butunlay olib tashlanib, o'rniga faqat "✎" qo'yildi. Ammo
   *      izoh oynasi FAQAT o'qish huquqidagilar uchun ochilardi — tahrirlay
   *      oladigan odam katakni bossa, menyu chiqardi va matn hech qayerda
   *      ko'rinmasdi. Buxgalterlar buni "izoh yozsak uchib ketyapti" deb
   *      xabar qildi va bir izohni qayta-qayta yozib chiqdi.
   * Yechim ikkalasini ham qoplaydi: katakda `max-w` + `truncate` (ustun
   * cho'zilmaydi), to'liq matn esa menyuning tepasida turadi.
   */
  note: { bg: tint('var(--info)', 13), text: 'var(--info)', icon: '✎', tooltip: '', },
};

/**
 * Serverdan tasdiq kelmagan katak yozuvi shuncha vaqt ekranda ushlab turiladi.
 * Bu — himoya chegarasi: server umuman javob bermay qolsa, eskirgan optimistik
 * qiymat abadiy qotib qolmasligi kerak.
 */
const PENDING_TTL_MS = 60_000;

interface StatusStyle {
  bg: string;
  text: string;
  icon: string;
  tooltip: string;
  /** Erkin matnli katak — bosilganda to'liq matn oynasi ochiladi. */
  isNote?: boolean;
}

const getStatusStyle = (value: string): StatusStyle => {
  const status = classifyCell(value);
  const base = STATUS_STYLE[status];
  if (status === 'note') return { ...base, tooltip: value, isNote: true };
  return base;
};

// Katak amallarining ko'rinishi. Qaysi biri KIMGA ko'rinishi
// lib/reportPermissions.ts da hal qilinadi — bu yerda faqat vizual meta.
const STATUS_META: Record<CellAction, { label: string; icon: string; color: string }> = {
  '+': { label: 'Tasdiqlash (✓)', icon: '✓', color: 'text-[var(--success)]' },
  'topshirildi': { label: 'Topshirildi', icon: '·', color: 'text-[var(--brand)]' },
  '-': { label: 'Bajarilmadi (-)', icon: '✗', color: 'text-[var(--danger)]' },
  'kartoteka': { label: 'Kartoteka', icon: '!', color: 'text-[var(--warning)]' },
  'nol': { label: 'Nol hisobot (Ø)', icon: 'Ø', color: 'text-[var(--brand)]' },
  'izoh': { label: 'Matn yozish...', icon: '✎', color: 'text-[var(--brand)]' },
  '0': { label: 'Tozalash', icon: '—', color: 'text-[var(--text-muted)]' },
};

/**
 * Rolga mos amallar ro'yxati + kontekstga qarab aniqroq nom.
 * - Buxgalter: "Tasdiqlash" YO'Q; "Topshirildi" → skrinshot oynasini ochadi.
 * - Nazoratchi, dalil kutilayotgan katakda: "+/-" → tekshirish oynasiga boradi.
 */
const statusesForRole = (role: string, relations: CompanyRelation[], hasPendingProof: boolean) => {
  // "isAccountant" = SHU firmada tasdiqlash huquqi yo'q degani.
  const isAccountant = !canApproveCell(role, relations);
  return allowedCellActions(role, relations).map((value) => {
    const meta = STATUS_META[value];
    if (isAccountant && value === 'topshirildi') {
      return { value, ...meta, label: 'Topshirish (skrinshot)' };
    }
    if (!isAccountant && hasPendingProof && value === '+') {
      return { value, ...meta, label: 'Tekshirib tasdiqlash' };
    }
    if (!isAccountant && hasPendingProof && value === '-') {
      return { value, ...meta, label: 'Tekshirib rad etish' };
    }
    return { value, ...meta };
  });
};

/** Katakdagi dalil haqida menyu uchun kerak bo'ladigan minimal ma'lumot. */
interface ProofMeta { status: string; mine: boolean }

interface StatusCellProps {
  value: string;
  onUpdate: (newValue: string) => void;
  readOnly?: boolean;
  userRole: string;
  /** Foydalanuvchining AYNAN SHU firmadagi mas'uliyatlari. */
  relations: CompanyRelation[];
  proofStatus?: string; // 'pending' | 'approved' | 'rejected'
  /** Kutilayotgan dalilni AYNAN shu foydalanuvchi topshirganmi. */
  proofMine?: boolean;
  onRequestSubmit?: () => void;
  onViewProof?: () => void;
}

const PROOF_DOT: Record<string, string> = {
  pending: 'var(--info)',
  approved: 'var(--success)',
  rejected: 'var(--danger)',
};

const StatusCell = React.memo<StatusCellProps>(({ value, onUpdate, readOnly, userRole, relations, proofStatus, proofMine, onRequestSubmit, onViewProof }) => {
  const style = getStatusStyle(value);
  // "isAccountant" = tasdiqlash huquqi YO'Q degani (server bilan bir xil qoida).
  // Nazoratchi o'zi buxgalteri bo'lgan firmada ham shu tarmoqqa tushadi.
  const isAccountant = !canApproveCell(userRole, relations);
  const menuStatuses = useMemo(
    () => statusesForRole(userRole, relations, proofStatus === 'pending'),
    [userRole, relations, proofStatus]
  );
  /**
   * Tasdiqlangan yoki tekshiruvda turgan katak buxgalter uchun QULFLANGAN —
   * server ham shuni rad etadi (lib/reportPermissions.checkCellWrite).
   *
   * ISTISNO: nazoratchi HALI KO'RMAGAN (`pending`) va topshirgan odam O'ZI
   * bo'lsa — katak ochiq qoladi. Busiz noto'g'ri ustunga yuborilgan
   * skrinshotni buxgalter tuzata olmasdi: menyu umuman ochilmasdi.
   */
  const canWithdrawOwn = proofStatus === 'pending' && proofMine === true;
  const lockedForAccountant = isAccountant && isReviewerOwnedValue(value) && !canWithdrawOwn;
  const effectiveReadOnly = readOnly || lockedForAccountant;
  const [isOpen, setIsOpen] = useState(false);
  // Izohni ko'rsatish oynasi — matn katakka sig'maydi, shuning uchun alohida.
  const [noteOpen, setNoteOpen] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Izoh oynasi ham shu koordinatalarga tayanadi, shuning uchun ikkalasidan
    // biri ochilsa hisoblanadi. Aks holda izoh (0,0) da — ekran burchagida —
    // paydo bo'lardi.
    if (!isOpen && !noteOpen) return;

    const updateCoords = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX + rect.width / 2,
          width: rect.width
        });
      }
    };

    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowInput(false);
      }
    };

    // M9: katak ochilmasi faqat sichqoncha bilan yopilardi. Klaviatura bilan
    // ishlaydigan buxgalter uni yopa olmasdi — Escape hech qanday ta'sir
    // qilmasdi (ustunlar paneli esa `useDismissable` orqali yopilardi).
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setShowInput(false);
      setIsOpen(false);
      setNoteOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen, noteOpen]);

  const handleSelect = (statusValue: string) => {
    if (statusValue === 'izoh') {
      /**
       * FAQAT haqiqiy izoh oldindan to'ldiriladi — tasniflagich hal qiladi.
       *
       * Ilgari bu yerda uchta qiymat qo'lda sanab o'tilgan edi ('0', '+', '-'),
       * ya'ni "nol"/"kartoteka"/"topshirildi" katagida "Matn yozish" bosilsa,
       * maydonga o'sha KOD SO'ZI tushardi. Foydalanuvchi uni saqlab qo'ysa
       * katak holatdan erkin matnga aylanib, hisobdan tushib qolardi.
       */
      setInputValue(classifyCell(value) === 'note' ? value : '');
      setShowInput(true);
      return;
    }

    // Buxgalter "Tasdiqlash"/"Topshirildi" ni tanlasa — to'g'ridan-to'g'ri
    // o'zgartirmaydi, avval skrinshot yuklash oynasini ochamiz. Faqat skrinshot
    // yuklangandan keyin katak "topshirildi" bo'ladi va nazoratchiga xabar boradi.
    if (isAccountant && (statusValue === '+' || statusValue === 'topshirildi')) {
      setIsOpen(false);
      onRequestSubmit?.();
      return;
    }

    // Nazoratchi kutilayotgan dalilli katakni "+" yoki "-" qilsa — bevosita
    // o'zgartirmasdan, tekshirish oynasini ochamiz. Shunda qaror reviewReportProof
    // orqali o'tadi: dalil holati yangilanadi va buxgalterga xabar boradi.
    if (!isAccountant && proofStatus === 'pending' && onViewProof && (statusValue === '+' || statusValue === '-')) {
      setIsOpen(false);
      onViewProof();
      return;
    }

    onUpdate(statusValue);
    setIsOpen(false);
  };

  const handleViewProof = () => {
    setIsOpen(false);
    onViewProof?.();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onUpdate(inputValue.trim());
    }
    setIsOpen(false);
    setShowInput(false);
  };

  return (
    <div className="relative flex items-center justify-center w-full h-full p-0.5">
      <button
        ref={buttonRef}
        onClick={() => {
          if (!effectiveReadOnly) setIsOpen(!isOpen);
          else if (proofStatus) handleViewProof();
          // Faqat o'qiy oladigan foydalanuvchi ham izohni ko'ra olishi kerak:
          // matn endi katakka chizilmaydi, shuning uchun yagona yo'l — ochish.
          else if (style.isNote) setNoteOpen(true);
        }}
        disabled={effectiveReadOnly && !proofStatus && !style.isNote}
        className={`w-full h-6 min-w-[24px] max-w-[52px] mx-auto px-1 rounded-lg flex items-center justify-center text-micro font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
          style.bg === 'transparent'
            ? 'border border-transparent hover:bg-[var(--bg-hover)] hover:border-[var(--rule)]'
            : 'border border-black/5 dark:border-white/5 hover:opacity-80'
        }`}
        style={{ background: style.bg, color: style.text }}
        title={
          lockedForAccountant
            ? `${style.tooltip} · Nazoratchi qaroridagi katak — o'zgartirib bo'lmaydi`
            : proofStatus ? `${style.tooltip} · Skrinshot biriktirilgan` : style.tooltip
        }
      >
        {/* Izohda MATN ko'rinadi (qisqartirilgan), boshqa holatlarda belgi.
            `truncate` overflow'ni yopgani uchun flex bolasi 0 gacha siqiladi
            va `max-w-[52px]` ustunni cho'zilishdan saqlaydi. */}
        <span
          className={`truncate w-full block ${style.isNote ? 'text-left normal-case font-semibold' : 'text-center uppercase'}`}
        >
          {style.isNote ? value : style.icon}
        </span>
      </button>
      {proofStatus && (
        <span
          className="absolute top-0 right-0 w-2 h-2 rounded-full ring-1 ring-white dark:ring-[var(--surface)] pointer-events-none"
          style={{ background: PROOF_DOT[proofStatus] || 'var(--info)' }}
          title="Skrinshot biriktirilgan"
        />
      )}

      {/* IZOH OYNASI — matn katakka chizilmaydi, shuning uchun bosilganda
          shu yerda to'liq ko'rinadi. Qator balandligi o'zgarmaydi. */}
      {noteOpen && createPortal(
        // Dialog EMAS: izoh popover'i. Escape, tashqi bosish va fokusni
        // qaytarish yuqoridagi `useEffect` da allaqachon bor ("M9" izohi).
        // eslint-disable-next-line no-restricted-syntax
        <div className="fixed inset-0 z-[120]" onClick={() => setNoteOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'color-mix(in srgb, var(--surface-2) 45%, transparent)' }} />
          <div
            className="absolute p-4 rounded-xl shadow-2xl max-w-[420px]"
            style={{
              top: Math.min(coords.top + 4, window.innerHeight - 200),
              left: Math.max(10, Math.min(coords.left, window.innerWidth - 430)),
              background: 'var(--card-bg)',
              border: '1px solid var(--rule)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-micro font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              Izoh
            </div>
            <p className="text-body whitespace-pre-wrap break-words" style={{ color: 'var(--text)' }}>
              {value}
            </p>
          </div>
        </div>,
        document.body
      )}

      {isOpen && createPortal(
        <div
          ref={popoverRef}
          /**
           * `role="dialog"` ATAYLAB: `useAutoRefresh` ochiq dialog ustida
           * `router.refresh()` ni to'xtatadi. Busiz katak menyusi ochiq
           * turganda — ya'ni aynan izoh yozilayotgan paytda — har 15 soniyada
           * sahifa server ma'lumoti bilan qayta to'ldirilardi.
           */
          role="dialog"
          aria-label="Katak amallari"
          style={{
            position: 'absolute',
            top: coords.top + 2,
            left: coords.left,
            transform: 'translateX(-50%)'
          }}
          className="z-[110] min-w-[180px] max-w-[280px] bg-[var(--card-bg)] dark:bg-[var(--surface-2)] p-1 shadow-md border border-[var(--rule)] dark:border-[var(--rule-strong)] rounded-lg"
        >
          {!showInput ? (
            <div className="grid grid-cols-1">
              {/* YOZILGAN IZOH — menyuning eng tepasida.
                  Tahrirlash huquqi bor odam katakni bosganda menyu ochiladi,
                  ya'ni `noteOpen` oynasiga hech qachon yetib bormaydi. Matn
                  shu sabab aynan SHU YERDA turishi shart: busiz izoh
                  yozilgandan keyin uni qayta o'qishning yo'li qolmaydi. */}
              {style.isNote && (
                <>
                  <div className="px-3 pt-2 pb-1.5">
                    <div className="text-2xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>
                      Yozilgan izoh
                    </div>
                    <p className="text-meta whitespace-pre-wrap break-words" style={{ color: 'var(--text)' }}>
                      {value}
                    </p>
                  </div>
                  <div className="h-px my-1" style={{ background: 'var(--border)' }} />
                </>
              )}
              {proofStatus && onViewProof && (
                <>
                  <button
                    onClick={handleViewProof}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-sunken)] dark:hover:bg-[var(--surface-2)] transition-colors w-full text-left group"
                  >
                    <span className="w-5 h-5 flex items-center justify-center rounded-lg" style={{ background: 'var(--primary-ghost)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: PROOF_DOT[proofStatus] || 'var(--info)' }} />
                    </span>
                    <span className="text-meta font-bold text-[var(--text-secondary)] group-hover:text-[var(--brand)]">Skrinshotni ko&apos;rish</span>
                  </button>
                  <div className="h-px my-1" style={{ background: 'var(--border)' }} />
                </>
              )}
              {menuStatuses.map((status) => (
                <button
                  key={status.value}
                  onClick={() => handleSelect(status.value)}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-sunken)] dark:hover:bg-[var(--surface-2)] transition-colors w-full text-left group"
                >
                  <span className={`font-bold text-xs w-5 h-5 flex items-center justify-center rounded-lg bg-[var(--bg-sunken)] dark:bg-white/5 border border-[var(--rule)] dark:border-white/10 ${status.color}`}>{status.icon}</span>
                  <span className="text-meta font-bold text-[var(--text-secondary)] group-hover:text-[var(--brand)]">
                    {status.value === 'izoh' && style.isNote ? 'Izohni tahrirlash' : status.label}
                  </span>
                  {value === status.value && <div className="ml-auto w-1 h-1 rounded-full bg-[var(--brand)]"></div>}
                </button>
              ))}
              {isAccountant && (
                <>
                  <div className="h-px my-1" style={{ background: 'var(--border)' }} />
                  <p className="px-3 py-1.5 text-2xs leading-snug" style={{ color: 'var(--text-3)' }}>
                    Tasdiqlashni nazoratchi bajaradi.
                  </p>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleCustomSubmit} className="p-2">
              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Matn kiriting..."
                className="c1-input w-full text-xs font-bold mb-2"
              />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowInput(false)} className="flex-1">Bekor</Button>
                <Button variant="primary" size="sm" type="submit" className="flex-1">Saqlash</Button>
              </div>
            </form>
          )}

        </div>,
        document.body
      )}
    </div>
  );
}, (prev, next) => prev.value === next.value && prev.readOnly === next.readOnly && prev.proofStatus === next.proofStatus && prev.proofMine === next.proofMine && prev.relations === next.relations);

// ── Memoized Table Row ─────────────────────────────────────────
const OperationRow = React.memo<{
  row: ReportRow;
  idx: number;
  visibleColumns: ReportColumn[];
  userRole: string;
  relations: CompanyRelation[];
  activeServices: string[];
  proofMeta: Map<string, ProofMeta>;
  onCellUpdate: (companyId: string, colKey: string, newValue: string) => void;
  onCompanySelect: (companyId: string) => void;
  onRequestSubmit: (companyId: string, colKey: string) => void;
  onViewProof: (companyId: string, colKey: string) => void;
}>(({ row, idx, visibleColumns, userRole, relations, activeServices, proofMeta, onCellUpdate, onCompanySelect, onRequestSubmit, onViewProof }) => {
  /**
   * Xizmat yoqilganmi. To'lov yarmi HISOBOT yarmidan meros oladi — uning o'z
   * katakchasi hech qaysi sozlash ekranida yo'q (lib/reportColumns.ts).
   */
  const isServiceEnabled = (key: string, parentKey?: string) =>
    serviceEnabled(activeServices, key, parentKey);
  /**
   * SOLIQ REJIMI bo'yicha yopish.
   *
   * QQS to'lovchi firmada "Aylanma" ustuni, aylanma rejimidagi firmada esa
   * "QQS" ustuni yopiq turadi. Ilgari ikkalasi bitta `aylanma_qqs` katagi edi
   * va kim nimani topshirishi kerakligi matritsadan ko'rinmasdi.
   */
  const regimeOf = String((row as { regime?: string }).regime ?? '');
  const isRegimeEnabled = (key: string) => columnAppliesToRegime(key, regimeOf);
  const proofOf = (colKey: string) => (row.companyId ? proofMeta.get(`${row.companyId}::${colKey}`) : undefined);
  const proofStatusOf = (colKey: string) => proofOf(colKey)?.status;
  const proofMineOf = (colKey: string) => proofOf(colKey)?.mine === true;
  const groupEdges = useMemo(() => buildGroupEdges(visibleColumns), [visibleColumns]);

  return (
    // Gorizontal chiziq `<tr>` da EMAS, `.matrix-grid td` da (globals.css).
    // Jadval `border-separate` rejimida — bu yopishqoq (sticky) sarlavha va
    // muzlatilgan ustunlar uchun zarur — lekin o'sha rejimda `<tr>` ga
    // qo'yilgan ramka brauzer tomonidan UMUMAN chizilmaydi. Shuning uchun
    // matritsada vertikal chiziqlar bor edi, gorizontallari esa yo'q.
    <tr className="group transition-colors">
      <td className="sticky left-0 z-20 px-2 py-1.5 text-center text-micro font-bold w-10 min-w-[40px] transition-colors" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderRight: '1px solid var(--border)' }}>
        {idx + 1}
      </td>
      <td
        className="sticky left-10 z-20 px-3 py-1.5 transition-colors w-48 min-w-[192px] cursor-pointer"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
        onClick={() => row.companyId && onCompanySelect(row.companyId as string)}
      >
        <div className="max-w-[180px] truncate text-meta font-bold transition-colors icon-btn-accent" style={{ color: 'var(--text)' }} title={row.name}>
          {row.name}
        </div>
      </td>
      <td className="md:sticky md:left-[232px] z-20 px-1.5 py-1.5 text-center text-micro font-bold w-20 min-w-[80px] transition-colors group-hover:bg-[var(--surface-2)]" style={{ background: 'var(--surface)', color: 'var(--text-3)', borderRight: '1px solid var(--border)' }}>
        {row.inn || '—'}
      </td>
      <td className="md:sticky md:left-[312px] z-20 px-2 py-1.5 transition-colors w-24 min-w-[96px] group-hover:bg-[var(--surface-2)]" style={{ background: 'var(--surface)', borderRight: '2px solid var(--border)' }}>
        <div className="max-w-[90px] truncate text-micro font-bold" style={{ color: 'var(--text-2)' }} title={row.accountant}>
          {row.accountant || '—'}
        </div>
      </td>
      {visibleColumns.map(col => {
        const isReadOnly = !row.companyId || !canEditMatrix(userRole, relations);
        // Xizmat o'chirilgan YOKI bu hisobot firma rejimiga tegishli emas.
        const serviceDisabled = !isServiceEnabled(col.key) || !isRegimeEnabled(col.key);
        const blockReason = regimeBlockReason(col.key, regimeOf);
        const st = getGroupStyle(col.group);
        const isEdge = groupEdges.has(col.key);
        const borderRightStyle = isEdge ? `2px solid ${st.border}` : '1px solid var(--border)';

        if ((col as any).isSplit) {
          const payKey = (col as any).payKey as string;
          const payDisabled = !isServiceEnabled(payKey, col.key) || !isRegimeEnabled(payKey);
          const payBlockReason = regimeBlockReason(payKey, regimeOf);
          return (
            <React.Fragment key={col.key}>
              <td className="px-0.5 py-0.5 text-center h-8" style={{ borderRight: '1px solid var(--border)', background: serviceDisabled ? 'var(--bg-sunken)' : `color-mix(in srgb, var(--success) 6%, ${st.cellBg})` }}>
                {serviceDisabled ? (
                  <Tooltip label={blockReason ?? undefined} wrapDisabled>
                    <span className="text-micro" style={{ color: 'var(--text-3)' }} aria-label={blockReason ? `Yopiq: ${blockReason}` : undefined}>—</span>
                  </Tooltip>
                ) : (
                  <StatusCell
                    value={String(row[col.key] || '')}
                    onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId as string, col.key as string, String(newValue))}
                    readOnly={isReadOnly}
                    userRole={userRole}
                    relations={relations}
                    proofStatus={proofStatusOf(col.key)}
                    proofMine={proofMineOf(col.key)}
                    onRequestSubmit={() => row.companyId && onRequestSubmit(row.companyId as string, col.key as string)}
                    onViewProof={() => row.companyId && onViewProof(row.companyId as string, col.key as string)}
                  />
                )}
              </td>
              <td className="px-0.5 py-0.5 text-center h-8" style={{ borderRight: borderRightStyle, background: payDisabled ? 'var(--bg-sunken)' : `color-mix(in srgb, var(--warning) 6%, ${st.cellBg})` }}>
                {payDisabled ? (
                  <Tooltip label={payBlockReason ?? undefined} wrapDisabled>
                    <span className="text-micro" style={{ color: 'var(--text-3)' }} aria-label={payBlockReason ? `Yopiq: ${payBlockReason}` : undefined}>—</span>
                  </Tooltip>
                ) : (
                  <StatusCell
                    value={String(row[payKey] || '')}
                    onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId as string, payKey as string, String(newValue))}
                    readOnly={isReadOnly}
                    userRole={userRole}
                    relations={relations}
                    proofStatus={proofStatusOf(payKey)}
                    proofMine={proofMineOf(payKey)}
                    onRequestSubmit={() => row.companyId && onRequestSubmit(row.companyId as string, payKey as string)}
                    onViewProof={() => row.companyId && onViewProof(row.companyId as string, payKey as string)}
                  />
                )}
              </td>
            </React.Fragment>
          );
        }

        return (
          <td key={col.key} className="px-0.5 py-0.5 text-center h-8 transition-colors group-hover:opacity-90" style={{ borderRight: borderRightStyle, background: serviceDisabled ? 'var(--surface-2)' : st.cellBg }}>
            {serviceDisabled ? (
              <Tooltip label={blockReason ?? undefined} wrapDisabled>
                    <span className="text-micro" style={{ color: 'var(--text-3)' }} aria-label={blockReason ? `Yopiq: ${blockReason}` : undefined}>—</span>
                  </Tooltip>
            ) : (
              <StatusCell
                value={String(row[col.key] || '')}
                onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId as string, col.key as string, String(newValue))}
                readOnly={isReadOnly}
                userRole={userRole}
                relations={relations}
                proofStatus={proofStatusOf(col.key)}
                proofMine={proofMineOf(col.key)}
                onRequestSubmit={() => row.companyId && onRequestSubmit(row.companyId as string, col.key as string)}
                onViewProof={() => row.companyId && onViewProof(row.companyId as string, col.key as string)}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
});

// ── Props ──────────────────────────────────────────────────────
interface Props {
  companies: Company[];
  operations: OperationEntry[];
  activeFilter?: string;
  selectedPeriod: string;
  onPeriodChange: (p: string) => void;
  lang: Language;
  onUpdate: (data: any) => Promise<void>;
  staff: Staff[];
  onBatchUpdate?: (ops: OperationEntry[]) => void;
  onCompanySelect: (c: Company) => void;
  userRole: string;
  currentUserId?: string;
  userName?: string;
  focusProof?: { companyId: string; colKey: string } | null;
  /** Admin config qo'llangan effektiv ustunlar; berilmasa BASE_REPORT_COLUMNS. */
  reportColumns?: ReportColumn[];
  /**
   * (companyId, shablon kodi) — shu davrda kimdan qaysi hisobot TALAB
   * QILINISHI. Foizning maxraji shundan chiqadi.
   */
  obligationCoverage?: { companyId: string; code: string }[];
}

interface ReportRow {
  index: number;
  name: string;
  inn: string;
  accountant: string;
  /**
   * Qolgan mas'ullar va firma xossalari — FILTR uchun.
   *
   * Avval qatorda faqat `accountant` bor edi, shuning uchun "Go'zaloy nazorat
   * qiladigan firmalar" yoki "QQS to'lovchilar" kabi savollarga matritsada
   * javob topib bo'lmasdi — ma'lumot `companies` propida bor edi, lekin
   * qatorga o'tkazilmagan.
   */
  supervisor: string;
  chief: string;
  bank: string;
  regime: string;
  department: string;
  director: string;
  taxType: string;
  login: string;
  password: string;
  companyId?: string;
  activeServices: string[];
  [key: string]: string | number | string[] | undefined;
}

// ── Main Component ─────────────────────────────────────────────
const OperationModule: React.FC<Props> = ({
  companies,
  operations,
  selectedPeriod,
  lang,
  onUpdate,
  staff = [],
  onPeriodChange,
  onCompanySelect,
  userRole,
  currentUserId,
  userName,
  focusProof,
  reportColumns,
  obligationCoverage
}) => {
  // Amaldagi ustunlar: admin config qo'llangan ro'yxat yoki baza.
  // useMemo — barqaror referens (faqat prop o'zgarganda yangilanadi).
  const REPORT_COLUMNS = useMemo<ReportColumn[]>(() => reportColumns ?? BASE_REPORT_COLUMNS, [reportColumns]);
  const t = translations[lang as keyof typeof translations];
  const confirm = useConfirm();
  /**
   * M5: matritsa holati endi URL'da — qidiruv, buxgalter filtri, guruh, sahifa.
   * Nazoratchi "shu buxgalterning kechikkanlari" ko'rinishini havola qilib
   * yubora oladi; avval barcha filtr faqat React state'da edi va sahifa
   * yangilansa yo'qolardi.
   */
  const table = useTableState({
    ns: 'mx',
    // Barcha filtrlar URL'da: nazoratchi "mana bu firmalar kartotekada"
    // ko'rinishini havola qilib yubora oladi.
    //   st  — bajarilish holati (lib/reportStatus.ts)
    //   grp — ustun guruhi (ko'rinish, qator filtri emas)
    //   qolganlari — lib/matrixFilters.ts (FILTER_URL_KEYS bilan bir xil)
    defaultFilters: {
      grp: 'all', st: 'all',
      [FILTER_URL_KEYS.person]: 'all',
      [FILTER_URL_KEYS.accountant]: 'all',
      [FILTER_URL_KEYS.supervisor]: 'all',
      [FILTER_URL_KEYS.chief]: 'all',
      [FILTER_URL_KEYS.bank]: 'all',
      [FILTER_URL_KEYS.regime]: 'all',
      [FILTER_URL_KEYS.department]: 'all',
      [FILTER_URL_KEYS.colKey]: 'all',
      [FILTER_URL_KEYS.colStatus]: 'any',
    },
    debounceMs: 300,
  });
  const search = table.search;
  const setSearch = table.setSearch;
  const debouncedSearch = table.debouncedSearch;
  const [rows, setRows] = useState<ReportRow[]>([]);
  /**
   * M7: sahifalash tugmalari `document.querySelector('.overflow-auto')` bilan
   * hujjatdagi BIRINCHI mos elementni olardi — bu matritsa bo'lishi shart emas.
   * Endi konteynerga to'g'ridan-to'g'ri ref beriladi.
   */
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const filterGroup = table.filters.grp;
  /**
   * "Aqlli filtrlar" — mas'ul, firma xossasi va USTUN KESIMI.
   * Mantiqi `lib/matrixFilters.ts` da (sof, sinovdan o'tgan), bu yerda faqat
   * URL bilan bog'lash.
   */
  // Bog'liqlik obyekt EMAS, imzo satri: `useTableState` har renderda yangi
  // `filters` obyektini qaytaradi va uni to'g'ridan-to'g'ri bog'liqlik qilsak
  // 263 qator har renderda qayta filtrlanardi.
  const filterSig = filtersSignature((k) => table.filters[k]);
  const filters = useMemo(
    () => parseFilters((k) => table.filters[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterSig]
  );
  const setFilter = useCallback(
    (key: keyof MatrixFilters, value: string) => table.setFilter(FILTER_URL_KEYS[key], value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table.setFilter]
  );
  /**
   * BITTA yozuv — `setFilter` ni sakkiz marta chaqirib bo'lmaydi: har chaqiruv
   * URL'ni o'sha renderdagi nusxadan qayta quradi va oldingisini bekor qiladi,
   * natijada faqat oxirgi filtr tozalanardi.
   */
  const resetFilters = useCallback(() => {
    const patch: Record<string, string> = {};
    for (const k of Object.keys(EMPTY_FILTERS) as (keyof MatrixFilters)[]) {
      patch[FILTER_URL_KEYS[k]] = EMPTY_FILTERS[k];
    }
    table.setFilters(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.setFilters]);

  /**
   * "Hammasini tozalash" — aqlli filtrlar VA bajarilish holati birga.
   * `st` ham bitta yozuvga qo'shiladi, aks holda u chetda qolib ketardi.
   */
  const resetAllFilters = useCallback(() => {
    const patch: Record<string, string> = { st: 'all' };
    for (const k of Object.keys(EMPTY_FILTERS) as (keyof MatrixFilters)[]) {
      patch[FILTER_URL_KEYS[k]] = EMPTY_FILTERS[k];
    }
    table.setFilters(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.setFilters]);

  /** Ustun kesimi — ustun va holat birga tozalanadi (bitta yozuvda). */
  const clearColumnFilter = useCallback(() => {
    table.setFilters({
      [FILTER_URL_KEYS.colKey]: EMPTY_FILTERS.colKey,
      [FILTER_URL_KEYS.colStatus]: EMPTY_FILTERS.colStatus,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.setFilters]);
  /**
   * Bajarilish holati filtri. `parseStatusFilter` — URL'dan kelgan xom matn
   * uchun qo'riqchi: noto'g'ri qiymat butun matritsani bo'sh qoldirmaydi.
   */
  const filterStatus = parseStatusFilter(table.filters.st);
  const setFilterStatus = (v: MatrixStatusFilter) => table.setFilter('st', v);
  // Per-user column show/hide, persisted per browser (no DB needed).
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [colPanelOpen, setColPanelOpen] = useState(false);
  // Tashqi bosish / Escape'da yopiladi; profil menyusi kabi boshqa popover
  // ochilganда bu ham avtomatik yopiladi (bir vaqtda faqat bittasi ochiq).
  const colPanelRef = useDismissable<HTMLDivElement>(colPanelOpen, () => setColPanelOpen(false));
  const currentPage = table.page;
  const setCurrentPage = (p: number) => table.setPage(p);
  /**
   * Virtualizatsiyadan keyin sahifalash deyarli keraksiz: DOM'da baribir ~34
   * qator turadi. Chegara 250 ga ko'tarildi — 212 ta firma bitta uzluksiz
   * ro'yxatga sig'adi va nazoratchi sahifa aylantirmasdan pastga suradi.
   * Ma'lumot 250 dan oshsa, pager avtomatik qaytadi (himoya chegarasi).
   */
  const rowsPerPage = 250;

  // Stable refs for background logic to prevent callback churn
  const companiesRef = useRef(companies);
  const staffRef = useRef(staff);
  const userNameRef = useRef(userName);
  const currentUserIdRef = useRef(currentUserId);
  /**
   * O'ZIMIZ YOZGAN, LEKIN SERVERDAN HALI QAYTMAGAN KATAKLAR.
   *
   * Kalit `companyId::colKey`, qiymat — biz kutayotgan katak qiymati.
   *
   * NIMA UCHUN KERAK: ilgari bu yerda bitta martalik `skipNextSync` bayrog'i
   * turardi va u POYGADA yutqazardi. `useAutoRefresh` har 15 soniyada
   * `router.refresh()` chaqiradi; yozuvdan bir lahza OLDIN boshlangan
   * yangilanish server javobini yozuvdan KEYIN olib keladi va u ESKI
   * ma'lumotga tayanadi (`getCachedOperations` 5 daqiqalik keshda). Bayroq
   * esa allaqachon birinchi (yozuvning o'z) yangilanishida sarflangan bo'lardi,
   * shuning uchun kechikkan eski javob katakni bo'shatib ketardi. Ekranda bu
   * "yozdim — o'chib ketdi" bo'lib ko'rinardi; keyingi yangilanish qiymatni
   * qaytarardi, lekin foydalanuvchi bunga qadar hammasini qaytadan yozgan
   * bo'lardi.
   *
   * Endi yozuv server ma'lumoti bilan MOS KELMAGUNCHA saqlanadi va har
   * qayta qurishda uning ustiga qo'yiladi.
   */
  const pendingCellsRef = useRef(new Map<string, { value: string; at: number }>());

  useEffect(() => { companiesRef.current = companies; }, [companies]);
  useEffect(() => { staffRef.current = staff; }, [staff]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);

  // ── Report Proofs (skrinshot dalillari) ───────────────────────
  const [proofMeta, setProofMeta] = useState<Map<string, ProofMeta>>(new Map());
  const [proofModal, setProofModal] = useState<ProofModalState | null>(null);
  /**
   * Dalilni tekshirish huquqi — LAVOZIM bo'yicha emas, AYNAN SHU FIRMA
   * bo'yicha (`isCompanyReviewer`).
   *
   * Ilgari bu yerda faqat rol tekshirilardi va natija butun matritsa uchun
   * BITTA qiymat edi. Server esa har firmani alohida tekshiradi
   * (`server/proofs.ts` → `isReviewerOn`) va o'z-o'zini nazorat blokini
   * qo'llaydi: nazoratchi O'ZI BUXGALTERLIK QILADIGAN firmada tasdiqlay
   * olmaydi.
   *
   * Natijada Go'zaloy (lavozimi nazoratchi, lekin 10 ta firmada buxgalter)
   * o'sha 10 firmada "Tasdiqlash" tugmasini KO'RARDI, bosardi, server esa
   * "Bu firmada tasdiqlash huquqingiz yo'q" deb rad etardi va katak eski
   * holatiga qaytardi. Foydalanuvchi buni "tasdiqladim, lekin yana
   * tasdiqlanmagan bo'lib qoldi" deb ko'rardi.
   *
   * Katak menyusi allaqachon shu qoidaga amal qilardi (`allowedCellActions`) —
   * faqat dalil oynasi undan ajralib qolgan edi.
   */
  // Hisoblash `relationsByCompany` yonida — dalil oynasi chizilgan joyda.

  const reloadProofMeta = useCallback(async () => {
    try {
      const list = await getReportProofsMeta(selectedPeriod);
      const m = new Map<string, ProofMeta>();
      (list as Array<{ companyId: string; colKey: string; status: string; submittedById: string | null }>).forEach((p) => {
        // `mine` — o'z topshirig'ini qaytarib olish huquqi shunga bog'liq.
        m.set(`${p.companyId}::${p.colKey}`, { status: p.status, mine: p.submittedById === currentUserId });
      });
      setProofMeta(m);
    } catch (e) {
      console.error('Proof meta load error:', e);
    }
  }, [selectedPeriod]);

  useEffect(() => { reloadProofMeta(); }, [reloadProofMeta]);

  const colLabelFor = (colKey: string) => {
    const col = REPORT_COLUMNS.find(c => c.key === colKey || (c as any).payKey === colKey);
    if (!col) return colKey;
    return col.key === colKey ? col.label : `${col.label} (to'lov)`;
  };

  const openSubmitModal = useCallback((companyId: string, colKey: string) => {
    const company = companiesRef.current.find(c => c.id === companyId);
    setProofModal({ mode: 'upload', companyId, companyName: company?.name || '', colKey, colLabel: colLabelFor(colKey) });
  }, []);

  const openViewModal = useCallback((companyId: string, colKey: string) => {
    const company = companiesRef.current.find(c => c.id === companyId);
    setProofModal({ mode: 'review', companyId, companyName: company?.name || '', colKey, colLabel: colLabelFor(colKey) });
  }, []);

  /** Katakni ekranda ham, "kutilayotganlar" ro'yxatida ham belgilaydi. */
  const markPendingCell = useCallback((companyId: string, colKey: string, value: string) => {
    pendingCellsRef.current.set(pendingCellKey(companyId, colKey), { value, at: Date.now() });
  }, []);

  /**
   * Davr almashsa kuzatuv tozalanadi.
   *
   * Kalitda davr yo'q (`companyId::colKey`), shuning uchun iyul oyida yozilgan
   * qiymat avgust matritsasidagi o'sha katak ustiga tushib qolardi.
   */
  useEffect(() => { pendingCellsRef.current.clear(); }, [selectedPeriod]);

  const handleProofSubmitted = useCallback((companyId: string, colKey: string) => {
    markPendingCell(companyId, colKey, 'topshirildi');
    setRows(prev => prev.map(r => (r.companyId === companyId ? { ...r, [colKey]: 'topshirildi' } : r)));
    setProofMeta(prev => new Map(prev).set(`${companyId}::${colKey}`, { status: 'pending', mine: true }));
  }, [markPendingCell]);

  const handleProofReviewed = useCallback((companyId: string, colKey: string, cellValue: string) => {
    markPendingCell(companyId, colKey, cellValue);
    setRows(prev => prev.map(r => (r.companyId === companyId ? { ...r, [colKey]: cellValue } : r)));
    setProofMeta(prev => new Map(prev).set(`${companyId}::${colKey}`, { status: cellValue === '+' ? 'approved' : 'rejected', mine: false }));
  }, [markPendingCell]);

  // Notifikatsiyadan kelgan chuqur havola: bevosita shu katak dalilini ochamiz.
  const focusHandledRef = useRef(false);
  useEffect(() => {
    if (focusHandledRef.current) return;
    if (!focusProof || !companies.length) return;
    focusHandledRef.current = true;
    openViewModal(focusProof.companyId, focusProof.colKey);
  }, [focusProof, companies.length, openViewModal]);

  // ── Build Rows from DB Props (companies + operations) ──────────
  useEffect(() => {
    // Optimization: Create a map of current period's operations for O(1) lookup
    const opsMap = new Map<string, OperationEntry>();
    operations.forEach(op => {
      if (periodsEqual(op.period, selectedPeriod)) {
        opsMap.set(op.companyId, op);
      }
    });

    /**
     * KUTILAYOTGAN YOZUVLARNI SERVER MA'LUMOTI BILAN SOLISHTIRISH.
     *
     * Server bizning qiymatimizga yetgan bo'lsa — kuzatuv tugaydi. Yetmagan
     * bo'lsa (kechikkan yoki keshdan kelgan javob) — bizning qiymatimiz
     * ustun turadi, aks holda foydalanuvchi yozgani ekrandan yo'qoladi.
     */
    const pending = pendingCellsRef.current;
    const { overrides, settled } = reconcilePendingCells(
      pending,
      (companyId, colKey) => String((opsMap.get(companyId) as any)?.[colKey] ?? ''),
      Date.now(),
      PENDING_TTL_MS,
    );
    for (const key of settled) pending.delete(key);

    const newRows: ReportRow[] = companies.map((comp, index) => {
      const op = opsMap.get(comp.id);

      // Mas'ul ismini olishning ikki yo'li bor: Prisma relation (`comp.supervisor`)
      // yoki tekislangan `*Name` maydoni. Ikkalasi ham to'ldirilishi shart emas,
      // shuning uchun har biri uchun zaxira zanjiri.
      const nameOf = (rel: unknown, flat?: string) =>
        (rel as { fullName?: string } | undefined)?.fullName || flat || '—';
      const c = comp as unknown as {
        supervisor?: unknown; chiefAccountant?: unknown; bankClient?: unknown;
        departmentRef?: { name?: string };
        directorName?: string; taxRegime?: string;
      };

      const row: ReportRow = {
        index: index + 1,
        name: comp.name,
        inn: comp.inn,
        accountant: op?.assigned_accountant_name || comp.accountantName || (comp as any).accountant?.fullName || '—',
        supervisor: nameOf(c.supervisor, comp.supervisorName),
        chief: nameOf(c.chiefAccountant, comp.chiefAccountantName),
        bank: nameOf(c.bankClient, comp.bankClientName),
        // Rejim NORMALIZATSIYA qilinadi: bazada `turnover_percent` /
        // `turnover_fixed` kabi endi mavjud bo'lmagan shakllar yotibdi va
        // ular filtr ro'yxatida "Aylanma (foiz)", "Aylanma (qat'iy)" bo'lib
        // alohida qatorlar yaratardi — foydalanuvchi uchun uch xil "aylanma".
        regime: c.taxRegime ? normalizeTaxRegime(c.taxRegime) : '',
        department: c.departmentRef?.name || comp.department || '',
        director: c.directorName || '',
        taxType: comp.taxType || '',
        login: comp.login || '',       // From DB company profile
        password: comp.password || '', // From DB company profile
        companyId: comp.id,
        activeServices: comp.activeServices || [],
      };

      // Katak qiymatlari — `payKey` bilan birga (qarang: lib/matrixRows.ts).
      Object.assign(row, readRowCells(op as Record<string, unknown> | undefined, REPORT_COLUMNS));

      // O'zimiz yozgan, serverda hali ko'rinmagan kataklar — server ustidan.
      const byCol = overrides.get(comp.id);
      if (byCol) for (const [colKey, value] of byCol) row[colKey] = value;

      return row;
    });

    setRows(newRows);
    setIsLoading(false);
  }, [companies, operations, selectedPeriod, REPORT_COLUMNS]);

  // Removed data loading logic for obsolete formats.


  // ── Handle Cell Update ───────────────────────────────────────
  /** Nazoratchilarga xabarnoma — parallel va katak yozuvidan mustaqil. */
  const notifySupervisors = useCallback(async (colKey: string, newValue: string, companyName?: string) => {
    const activeUserName = userNameRef.current || 'Buxgalter';
    const colLabel = REPORT_COLUMNS.find(c => c.key === colKey)?.label || colKey;
    const supervisors = (staffRef.current || [])
      .filter(sv => (sv.role === 'supervisor' || sv.role === 'super_admin') && sv.id !== currentUserIdRef.current);
    if (supervisors.length === 0) return;

    let title = 'Yangi amal bajarildi';
    let message = `${activeUserName} "${companyName}" firmasining "${colLabel}" holatini "${newValue}" qilib o'zgartirdi.`;
    if (newValue === 'topshirildi') {
      title = 'Tasdiqlash kutilmoqda';
      message = `${activeUserName} "${companyName}" firmasining "${colLabel}" vazifasini topshirdi. Iltimos, tekshirib tasdiqlang.`;
    } else if (newValue === '+') {
      title = 'Vazifa tasdiqlandi';
      message = `${companyName}: "${colLabel}" vazifasini ${activeUserName} tasdiqladi.`;
    }

    const results = await Promise.allSettled(
      supervisors.map(sv => createNotification({
        userId: sv.id, type: 'approval_request', title, message, link: '/reports',
      }))
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) console.error(`[matrix] ${failed}/${supervisors.length} ta xabarnoma yuborilmadi`);
  }, [REPORT_COLUMNS]);

  const handleCellUpdate = useCallback(async (companyId: string, colKey: string, newValue: string) => {
    // 1. Optimistic Update — eski qiymatni saqlab qolamiz, chunki server
    // rad etishi mumkin (masalan buxgalter tasdiqlangan katakni o'zgartirsa).
    let prevValue: string | number | string[] | undefined;
    setRows(prevRows => prevRows.map(row => {
      if (row.companyId === companyId) {
        prevValue = row[colKey];
        return { ...row, [colKey]: newValue };
      }
      return row;
    }));
    // Server javob qaytarib, ma'lumot ekranga yetib kelmaguncha bu qiymat
    // har qanday qayta qurishdan omon qoladi.
    markPendingCell(companyId, colKey, newValue);

    try {
      const company = companiesRef.current.find(c => c.id === companyId);
      const res = await upsertMonthlyReport({
        companyId,
        period: selectedPeriod,
        [colKey]: newValue
      });

      /**
       * KUTILGAN qoida rad etishi — `throw` emas, natija (server/operations.ts).
       *
       * Ilgari server bu holatda `throw` qilardi va Next PRODUCTION'da xato
       * MATNINI yashirardi. Natijada buxgalter "Bu katakni o'zgartirib
       * bo'lmaydi" o'rniga "An error occurred in the Server Components
       * render…" degan to'rt qatorlik inglizcha matnni ko'rardi.
       */
      if (res && res.ok === false) {
        // Yozuv qabul qilinmadi — kuzatuvni ham bekor qilamiz, aks holda
        // rad etilgan qiymat server ma'lumoti ustidan turib qolardi.
        pendingCellsRef.current.delete(pendingCellKey(companyId, colKey));
        setRows(prevRows => prevRows.map(row =>
          row.companyId === companyId ? { ...row, [colKey]: prevValue } : row
        ));
        toast.error(res.error);
        return;
      }

      onUpdate({ companyId, period: selectedPeriod, [colKey]: newValue });

      /**
       * M10: xabarnomalar.
       *
       * Ikkita muammo bor edi. Birinchisi — izoh "non-blocking" deb yozilgan,
       * lekin bu KETMA-KET `await` halqasi edi: har bir nazoratchi uchun alohida
       * server chaqiruvi, katakni bosgan odam esa hammasini kutib turardi.
       * Ikkinchisi va jiddiyrog'i — halqa `try` ICHIDA turardi, ya'ni bitta
       * xabarnoma yuborilmasa `catch` ishga tushib, ALLAQACHON SAQLANGAN
       * katakni ortga qaytarardi va xato ko'rsatardi.
       *
       * Endi ular parallel ketadi va yozuvdan keyin, alohida — xabarnoma
       * xatosi hisobot yozuvining natijasiga ta'sir qilmaydi.
       */
      void notifySupervisors(colKey, newValue, company?.name);

    } catch (e: any) {
      console.error('Update error:', e);
      // Optimistik o'zgarishni ORQAGA QAYTARISH — aks holda katak saqlanmagan
      // qiymatni ko'rsatib turaveradi va foydalanuvchi ishonib qoladi.
      pendingCellsRef.current.delete(pendingCellKey(companyId, colKey));
      setRows(prevRows => prevRows.map(row =>
        row.companyId === companyId ? { ...row, [colKey]: prevValue } : row
      ));
      // Bu yerga faqat KUTILMAGAN xato tushadi (ruxsat yo'q, tarmoq, baza).
      // Qoida rad etishlari yuqorida `res.ok === false` bilan hal qilinadi.
      // `friendlyError` — Next prod'da matnni yashirganda inglizcha texnik
      // matn o'rniga o'zbekcha xabar chiqishi uchun.
      toast.error(friendlyError(e, 'Saqlashda xatolik. Qaytadan urinib ko\'ring.'));
    }
  }, [selectedPeriod, onUpdate, REPORT_COLUMNS, markPendingCell]); // Minimal dependencies

  // ── Handle Column Clear (Superadmin only) ─────────────────────
  const handleClearColumn = useCallback(async (colKey: string) => {
    if (userRole !== 'super_admin') return;
    const colLabel = REPORT_COLUMNS.find(c => c.key === colKey)?.label || colKey;

    // Ko'lam AYTIB beriladi: brauzerning `confirm` oynasi nechta katak
    // yo'qolishini ko'rsata olmasdi. Ustun nomini qo'lda yozdirish esa
    // tasodifan Enter bosib yuborishning oldini oladi.
    const affected = rows.filter(r => String(r[colKey] ?? '').trim() !== '').length;
    const ok = await confirm({
      title: `"${colLabel}" ustuni tozalansinmi?`,
      description: (
        <>
          <strong>{selectedPeriod}</strong> davri uchun{' '}
          <strong>{affected} ta firmada</strong> to&apos;ldirilgan qiymat o&apos;chiriladi.
          Bu amalni ortga qaytarib bo&apos;lmaydi.
        </>
      ),
      confirmText: colLabel,
      confirmLabel: 'Tozalash',
      tone: 'danger',
    });
    if (!ok) return;

    // Optimistik tozalashdan OLDIN eski qiymatlarni saqlab qolamiz: server rad etsa,
    // qaytarish uchun. Busiz muvaffaqiyatsiz tozalash ekranda bo'sh ustunni qoldirardi,
    // bazada esa ma'lumot joyida turardi — xodim yo'q hisobotni "topshirilmagan" deb
    // o'qib, butun oyni qayta kiritishga tushardi.
    const snapshot = new Map(rows.map(r => [r.companyId, r[colKey]]));

    // Butun ustun kuzatuvga olinadi: tozalash ham yozuv, uni ham kechikkan
    // server javobi qaytarib qo'yishi mumkin.
    const clearedKeys = rows.map(r => pendingCellKey(String(r.companyId), colKey));
    try {
      for (const r of rows) if (r.companyId) markPendingCell(String(r.companyId), colKey, '');
      setRows(prev => prev.map(r => ({ ...r, [colKey]: '' })));
      await clearColumnForPeriod(selectedPeriod, colKey);
      await onUpdate({});
      toast.success('Ustun tozalandi');
    } catch (e) {
      console.error(e);
      for (const key of clearedKeys) pendingCellsRef.current.delete(key);
      setRows(prev => prev.map(r =>
        snapshot.has(r.companyId) ? { ...r, [colKey]: snapshot.get(r.companyId) } : r
      ));
      toast.error('Ustun tozalanmadi — qiymatlar qaytarildi');
    }
  }, [selectedPeriod, userRole, onUpdate, REPORT_COLUMNS, rows, confirm, markPendingCell]);

  // ── Computed data ────────────────────────────────────────────
  const accountants = useMemo(() => {
    const set = new Set<string>();
    if (staff && Array.isArray(staff)) {
      staff.forEach(s => {
        const name = (s.name || (s as any).fullName)?.trim();
        if (name && name !== '—') set.add(name);
      });
    }
    rows.forEach(r => {
      if (r.accountant && r.accountant !== '—') set.add(r.accountant.trim());
    });
    return [...set].sort();
  }, [staff, rows]);

  /**
   * Filtr tanlagichlaridagi variantlar — MAVJUD qatorlardan yig'iladi.
   *
   * Ataylab butun xodimlar ro'yxatidan emas: nazoratchi ro'yxatida hech qachon
   * firmasi bo'lmagan odam turishi foydalanuvchini "nega bo'sh chiqdi?" degan
   * savolga olib boradi. Buxgalter ro'yxati esa istisno — u yuqorida
   * `accountants` da xodimlar bilan birga yig'iladi (biriktirilmagan xodimga
   * firma berish uchun kerak edi).
   */
  const filterOptions = useMemo<MatrixFilterOptions>(() => {
    const uniq = (pick: (r: ReportRow) => string) => {
      const set = new Set<string>();
      for (const r of rows) {
        const v = (pick(r) ?? '').trim();
        if (v && v !== '—') set.add(v);
      }
      return [...set].sort((a, b) => a.localeCompare(b, 'uz'));
    };

    // `matchesFacets` bilan BIR XIL maydonlar: sanoq filtr natijasidan
    // farq qilmasligi kerak, aks holda "Ruslan — 12" yozilib, jadval bo'sh
    // chiqadi.
    const facetRows = rows.map(r => ({
      accountant: r.accountant, supervisor: r.supervisor, chief: r.chief,
      bank: r.bank, regime: r.regime, department: r.department,
    }));

    // Ustunlar: bo'linadigan ustunning to'lov juftligi ham alohida tanlanadi —
    // "AQt (to'lov) bajarilmagan" mustaqil savol.
    const columns: { key: string; label: string }[] = [];
    for (const c of REPORT_COLUMNS) {
      columns.push({ key: c.key, label: c.label });
      const split = c as { isSplit?: boolean; payKey?: string };
      if (split.isSplit && split.payKey) {
        columns.push({ key: split.payKey, label: `${c.label} — to'lov` });
      }
    }

    return {
      // Xodimlar ro'yxati BUTUN shtatdan — matritsada bitta ham firmasi
      // yo'q odam ham ko'rinadi, lekin sanog'i "0" bo'lib turadi.
      people: personFacetOptions(facetRows, accountants),
      accountants: slotFacetOptions(facetRows, r => r.accountant, accountants),
      supervisors: slotFacetOptions(facetRows, r => r.supervisor),
      chiefs: slotFacetOptions(facetRows, r => r.chief),
      banks: slotFacetOptions(facetRows, r => r.bank),
      regimes: uniq(r => r.regime),
      departments: uniq(r => r.department),
      columns,
    };
  }, [rows, accountants, REPORT_COLUMNS]);

  /** Yoqilgan filtrlarning chiplari — panel yopiq bo'lsa ham ko'rinadi. */
  const chips = useMemo(
    () => activeChips(filters, (key) => filterOptions.columns.find(c => c.key === key)?.label ?? key),
    [filters, filterOptions.columns]
  );

  /**
   * Mavjud ustunlar — guruh + qo'lda yashirilganlar. Ustun KESIMIDAN mustaqil:
   * "Tahlil" oynasi va ustun tanlagichi shu to'liq ro'yxatga tayanadi.
   */
  const availableColumns = useMemo(() => {
    // Guruh tanlovi endi "Ustunlar" paneli ichida (alohida tanlagich olib
    // tashlandi — u shu panel bilan bir vazifani bajarardi).
    const base = filterGroup === 'all' ? REPORT_COLUMNS : REPORT_COLUMNS.filter(c => c.group === filterGroup);
    return base.filter(c => !hiddenCols.has(c.key));
  }, [filterGroup, REPORT_COLUMNS, hiddenCols]);

  /**
   * BITTA HISOBOT REJIMI — ustun tanlangan va "faqat shu ustun" yoqilgan.
   *
   * Yoqilganda butun ekran o'sha hisobotga qaraydi: jadvalda bitta ustun,
   * foiz o'sha ustunniki, "bajarilish" sanoqlari ham o'sha ustun bo'yicha.
   * Avval ustun kesimi FAQAT qatorlarni filtrlardi — foydalanuvchi INPS ni
   * tanlab, ekranda 47 ta ustunni va umumiy foizni ko'rar edi.
   */
  const focusKey = filters.colKey !== 'all' && filters.colOnly === '1' ? filters.colKey : null;

  const focusColumn = useMemo(
    () => (focusKey
      ? REPORT_COLUMNS.find(c => c.key === focusKey || (c as { payKey?: string }).payKey === focusKey) ?? null
      : null),
    [focusKey, REPORT_COLUMNS]
  );

  const visibleColumns = useMemo(
    () => (focusColumn ? [focusColumn] : availableColumns),
    [focusColumn, availableColumns]
  );

  /**
   * MAXRAJ MANBAI: ustun kaliti → shu hisobot talab qilinadigan firmalar.
   *
   * `COL_KEY_TO_TEMPLATE_CODES` matritsa ustunini majburiyat shabloniga
   * bog'laydi; majburiyat esa firma va davrga qarab farqlanadi (masalan
   * QQS_DECL faqat QQS to'lovchilarda). Shablon topilmasa — bu ustun uchun
   * dvigatel hech narsa bilmaydi va eski qoida amal qiladi: faqat belgilangan
   * kataklar sanaladi.
   */
  const requiredByColumn = useMemo(() => {
    const byCode = new Map<string, Set<string>>();
    for (const { companyId, code } of obligationCoverage ?? []) {
      let set = byCode.get(code);
      if (!set) { set = new Set(); byCode.set(code, set); }
      set.add(companyId);
    }
    const out = new Map<string, Set<string>>();
    for (const [colKey, codes] of Object.entries(COL_KEY_TO_TEMPLATE_CODES)) {
      const merged = new Set<string>();
      for (const code of codes) {
        const set = byCode.get(code);
        if (set) for (const id of set) merged.add(id);
      }
      if (merged.size > 0) out.set(colKey, merged);
    }
    return out;
  }, [obligationCoverage]);

  /** Shu katak (firma × ustun) majburiyat bo'yicha talab qilinadimi. */
  const isCellRequired = useCallback(
    (companyId: string | undefined, colKey: string) =>
      !!companyId && (requiredByColumn.get(colKey)?.has(companyId) ?? false),
    [requiredByColumn]
  );

  /**
   * Har bir qatorning katak hisobi — BIR MARTA hisoblanadi.
   *
   * Avval `rowCompletion` saralash komparatorining ichidan chaqirilardi, ya'ni
   * 265 qator × ~47 ustun O(n log n) marta qayta o'qilardi. Endi hisob bitta
   * o'tishda tayyorlanadi va filtr, saralash hamda menyudagi sanoqlar shu
   * bitta manbadan oziqlanadi.
   */
  /** Qatordagi firma soliq rejimi (ustun tegishliligini hal qiladi). */
  const regimeOfRow = (row: ReportRow) => String((row as { regime?: string }).regime ?? '');

  const tallyByRow = useMemo(() => {
    const map = new Map<ReportRow, StatusTally>();
    for (const row of rows) {
      const t = emptyTally();
      /**
        * REJIMGA TEGISHLI BO'LMAGAN USTUN HISOBGA UMUMAN KIRMAYDI.
        *
        * QQS to'lovchida "Aylanma" katagi (va aksincha) na suratga, na
        * maxrajga qo'shiladi — u shu firma uchun mavjud emas, "bajarilmagan"
        * ham emas. Amalda katak bo'sh bo'lgani uchun natija ko'pincha bir xil
        * chiqadi, lekin bu ATAYLAB aniq qilingan: majburiyat qamrovi bilan
        * firma rejimi bir-biriga zid ma'lumot bersa (masalan rejim
        * o'zgartirilgan, majburiyat esa eski davrdan qolgan), foiz jimgina
        * buzilib ketmasin.
        */
      const countable = (key: string) => columnAppliesToRegime(key, regimeOfRow(row));
      if (focusKey) {
        // Fokus rejimida AYNAN tanlangan katak — bo'linadigan ustunning
        // juftligi qo'shilsa "AQh foizi" AQt ni ham qamrab olardi.
        if (countable(focusKey)) {
          addToTally(t, row[focusKey], isCellRequired(row.companyId, focusKey));
        }
      } else {
        for (const col of visibleColumns) {
          if (countable(col.key)) {
            addToTally(t, row[col.key], isCellRequired(row.companyId, col.key));
          }
          if ((col as { isSplit?: boolean }).isSplit) {
            const pk = (col as unknown as { payKey: string }).payKey;
            if (countable(pk)) {
              addToTally(t, row[pk], isCellRequired(row.companyId, pk));
            }
          }
        }
      }
      map.set(row, t);
    }
    return map;
  }, [rows, visibleColumns, focusKey, isCellRequired]);

  const tallyOf = useCallback(
    (row: ReportRow): StatusTally => tallyByRow.get(row) ?? emptyTally(),
    [tallyByRow]
  );

  /**
   * Qidiruv + aqlli filtrlar (bajarilish holatidan OLDINGI ro'yxat).
   *
   * Qidiruv endi direktor, nazoratchi va bank-klient bo'yicha ham topadi —
   * avval faqat nom/INN/buxgalter edi.
   */
  const searchedRows = useMemo(() => rows.filter(r => {
    if (!matchesSearch(
      [r.name, r.inn, r.accountant, r.supervisor, r.bank, r.chief, r.director],
      debouncedSearch
    )) return false;

    if (!matchesFacets(
      {
        accountant: r.accountant, supervisor: r.supervisor, chief: r.chief,
        bank: r.bank, regime: r.regime, department: r.department,
      },
      filters
    )) return false;

    // Ustun kesimi — rejim + holat birga (lib/matrixFilters.ts).
    if (!passesColumnSection({
      colKey: filters.colKey,
      colStatus: filters.colStatus,
      regime: r.regime,
      value: r[filters.colKey],
    })) return false;
    return true;
  }), [rows, debouncedSearch, filters]);

  /**
   * Menyudagi sanoqlar. ATAYLAB holat filtri QO'LLANMAGAN ro'yxatdan
   * hisoblanadi — aks holda "Kartoteka (13)" ni tanlagach sanoq o'zgarib,
   * qolgan variantlar nolga tushib qolardi va menyu boshqarib bo'lmas edi.
   */
  const statusCounts = useMemo(() => {
    const out = {} as Record<MatrixStatusFilter, number>;
    for (const opt of MATRIX_STATUS_FILTERS) {
      out[opt.value] = opt.value === 'all'
        ? searchedRows.length
        : searchedRows.reduce((n, r) => n + (matchesStatusFilter(tallyOf(r), opt.value) ? 1 : 0), 0);
    }
    return out;
  }, [searchedRows, tallyOf]);

  const activeStatusOption = useMemo(
    () => MATRIX_STATUS_FILTERS.find(o => o.value === filterStatus) ?? MATRIX_STATUS_FILTERS[0],
    [filterStatus]
  );

  const filteredRows = useMemo(() => {
    const out = filterStatus === 'all'
      ? searchedRows
      : searchedRows.filter(r => matchesStatusFilter(tallyOf(r), filterStatus));

    // M3: matritsada saralash umuman yo'q edi — nazoratchi "eng ko'p qolgan
    // firmalar" yoki "eng orqada qolgan buxgalter" bo'yicha tartiblay olmasdi.
    const key = table.sortKey;
    if (!key) return out;
    const dir = table.sortDir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => {
      if (key === 'completion') return (settledRatio(tallyOf(a)) - settledRatio(tallyOf(b))) * dir;
      const av = String(a[key] ?? ''), bv = String(b[key] ?? '');
      if (key === 'inn') return av.localeCompare(bv, undefined, { numeric: true }) * dir;
      return av.localeCompare(bv, 'uz') * dir;
    });
  }, [searchedRows, filterStatus, tallyOf, table.sortKey, table.sortDir]);

  // ── Hisobot tahlili oynasi ───────────────────────────────────
  const [insightOpen, setInsightOpen] = useState(false);

  /** Afsona yopiq/ochiq — tanlov shu brauzerda saqlanadi. */
  const [legendOpen, setLegendOpen] = useState(false);
  useEffect(() => {
    try { setLegendOpen(localStorage.getItem('opmatrix-legend') === '1'); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('opmatrix-legend', legendOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [legendOpen]);

  /**
   * Tahlil oynasi uchun manba. ATAYLAB `searchedRows` — ya'ni qidiruv va
   * yoqilgan filtrlar hisobga olinadi, "bajarilish holati" esa YO'Q: aks holda
   * "Bajarilmaganlar" filtri yoqilgan bo'lsa foiz doim 0% chiqardi.
   */
  const insightRows = useMemo<InsightRowInput[]>(
    () => searchedRows.map(r => {
      // Har katak uchun qiymat + "talab qilinadimi" birga uzatiladi —
      // Tahlil foizi matritsa foizi bilan bir xil maxrajdan chiqishi kerak.
      const values: Record<string, { value: unknown; required: boolean }> = {};
      const put = (key: string) => {
        // Firma rejimiga tegishli bo'lmagan ustun Tahlilga ham kirmaydi —
        // aks holda "Aylanma Hisobot" kesimida QQS to'lovchilar maxrajga
        // qo'shilib, foizni pasaytirardi.
        if (!columnAppliesToRegime(key, regimeOfRow(r))) return;
        values[key] = { value: r[key], required: isCellRequired(r.companyId, key) };
      };
      for (const c of availableColumns) {
        put(c.key);
        const split = c as { isSplit?: boolean; payKey?: string };
        if (split.isSplit && split.payKey) put(split.payKey);
      }
      return {
        companyId: r.companyId, name: r.name, inn: r.inn,
        accountant: r.accountant, supervisor: r.supervisor, chief: r.chief,
        bank: r.bank, department: r.department, values,
      };
    }),
    [searchedRows, availableColumns, isCellRequired]
  );

  const insightColumns = useMemo(
    () => filterOptions.columns.map(c => ({
      ...c,
      group: REPORT_COLUMNS.find(rc => rc.key === c.key || (rc as { payKey?: string }).payKey === c.key)?.group ?? 'Boshqa',
    })),
    [filterOptions.columns, REPORT_COLUMNS]
  );

  /** Tahlildagi "Matritsada ochish" — kesimni matritsa filtriga o'tkazadi. */
  const applyInsight = useCallback(
    ({ colKey, dimension, groupKey }: { colKey: string; dimension: InsightDimension; groupKey: string | null }) => {
      const patch: Record<string, string> = {
        [FILTER_URL_KEYS.colKey]: colKey,
        // Ustun tanlangan bo'lsa, savol doim "kim topshirmagan" — shuni ko'rsatamiz.
        [FILTER_URL_KEYS.colStatus]: colKey === 'all' ? 'any' : 'outstanding',
      };
      if (groupKey && dimension !== 'company') {
        patch[FILTER_URL_KEYS[dimension as keyof MatrixFilters]] = groupKey;
      }
      table.setFilters(patch);
      if (dimension === 'company' && groupKey) setSearch(groupKey);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table.setFilters, setSearch]
  );

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage]);

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);

  /**
   * M2 — VIRTUALIZATSIYA.
   *
   * Sahifada 100 qator × ~57 katak ≈ 5,700 ta `StatusCell` bir vaqtda DOM'da
   * turardi, har biri o'z `useState` ×3 va `useRef` ×2 bilan. `React.memo`
   * yordam berardi, lekin komponentlar baribir yaratilardi va ilk render
   * sezilarli sekin edi.
   *
   * Endi faqat ko'rinadigan qatorlar chiziladi (~20 + overscan). Yopishqoq
   * sarlavha `<thead>` da qolgani uchun buzilmaydi; muzlatilgan ustunlar ham
   * ta'sirlanmaydi, chunki virtualizatsiya faqat VERTIKAL.
   *
   * Qator balandligi qat'iy 32px (`h-8`), shuning uchun o'lchash shart emas.
   */
  /**
   * Barqaror callback. Avval bu `<OperationRow>` ga inline arrow sifatida
   * berilardi, ya'ni HAR renderda yangi havola bo'lardi va `React.memo`
   * taqqoslashi doim `false` qaytarardi — memo umuman ishlamasdi.
   */
  const handleCompanySelect = useCallback((id: string) => {
    const comp = companies.find(c => c.id === id);
    if (comp) onCompanySelect(comp);
  }, [companies, onCompanySelect]);

  /**
   * Firma → foydalanuvchining SHU firmadagi mas'uliyatlari.
   *
   * Huquq rolning o'zidan emas, biriktiruvdan kelib chiqadi: nazoratchi o'zi
   * buxgalteriyasini yuritadigan firmada tasdiqlay olmaydi. Massiv havolasi
   * barqaror bo'lishi kerak — `StatusCell` memo taqqoslashi shunga tayanadi.
   */
  const relationsByCompany = useMemo(() => {
    const map = new Map<string, CompanyRelation[]>();
    if (!currentUserId) return map;
    for (const c of companies) {
      map.set(c.id, [...companyRelations(c, currentUserId)]);
    }
    return map;
  }, [companies, currentUserId]);
  const EMPTY_RELATIONS = useRef<CompanyRelation[]>([]).current;

  /**
   * `<thead>` scroll konteynerida joy egallaydi (u `sticky`, `fixed` emas).
   * Shu sababli tbody'ning birinchi qatori 0 dan emas, sarlavha balandligidan
   * keyin boshlanadi. `scrollMargin` busiz virtualizer qaysi qatorni
   * ko'rsatishni ~2 qatorga xato hisoblaydi.
   */
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    const measure = () => {
      const tb = tbodyRef.current;
      const sc = matrixScrollRef.current;
      if (!tb || !sc) return;
      setScrollMargin(tb.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isLoading, visibleColumns.length]);

  const rowVirtualizer = useVirtualizer({
    count: paginatedRows.length,
    getScrollElement: () => matrixScrollRef.current,
    estimateSize: () => 32,
    overscan: 6,
    scrollMargin,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const padTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0;
  const padBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  // Load / persist the hidden-column set for this browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('opmatrix-hidden-cols');
      if (saved) setHiddenCols(new Set(JSON.parse(saved) as string[]));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('opmatrix-hidden-cols', JSON.stringify([...hiddenCols])); } catch { /* ignore */ }
  }, [hiddenCols]);

  const toggleCol = useCallback((key: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);



  // Sarlavha bandlari: KETMA-KET kelgan bir xil guruhli ustunlar bitta band.
  // Avval guruh bo'yicha JAMI hisoblanardi va har guruhga bitta <th> chiqarilardi
  // — admin ustunlarni aralashtirib tartiblasa (applyColumnConfig `order`), band
  // colSpan'i pastdagi ustunlardan siljib ketardi. Endi band doim o'z ustunlari
  // ustida turadi.
  const headerBands = useMemo(() => {
    // `category` maydoni OLIB TASHLANDI: u faqat hisoblanardi, hech qayerda
    // o'qilmasdi (kategoriya taksonomiyasi bilan birga ketdi).
    const bands: { name: string; span: number }[] = [];
    visibleColumns.forEach(c => {
      const visualCols = (c as any).isSplit ? 2 : 1;
      const last = bands[bands.length - 1];
      if (last && last.name === c.group) last.span += visualCols;
      else bands.push({ name: c.group, span: visualCols });
    });
    return bands;
  }, [visibleColumns]);



  /**
   * Umumiy statistika — endi qator hisoblarining yig'indisi.
   *
   * TUZATILDI: maxraj avval `done + notDone + warning + text` edi va 'nol'
   * `text` ga tushardi, ya'ni nol hisobot BAJARILMAGAN deb sanalardi. Endi
   * maxraj `required`, surat esa `settled` (+, topshirildi, nol).
   */
  const stats = useMemo(() => {
    const total = emptyTally();
    for (const row of filteredRows) mergeTally(total, tallyOf(row));
    const ratio = settledRatio(total);
    return {
      ...total,
      // Eski nomlar — shablonlarda ishlatiladi.
      done: total.settled,
      notDone: total.failed,
      warning: total.blocked,
      text: total.note,
      totalRequired: total.required,
      percent: Math.round(ratio * 100),
      exactPercent: Number((ratio * 100).toFixed(1)),
    };
  }, [filteredRows, tallyOf]);

  const uniqueGroups = [...new Set(REPORT_COLUMNS.map(c => c.group))];

  // Export
  const handleExport = async () => {
    try {
      const { utils, writeFile } = await import('xlsx');

      const headerCols: string[] = [];
      visibleColumns.forEach(c => {
        headerCols.push(c.label);
        if ((c as any).isSplit) headerCols.push(`${c.label} To'lov`);
      });
      const header = ['#', 'Korxona', 'INN', 'Buxgalter', 'Soliq turi', ...headerCols];
      const data = filteredRows.map(r => {
        const vals: string[] = [];
        // Rejimga tegishli bo'lmagan katak ekranda "—" bo'lib turadi; eksportda
        // ham shunday chiqishi kerak, aks holda u "hali to'ldirilmagan" bo'sh
        // katakdan ajralmay qolardi.
        const cellFor = (key: string) =>
          columnAppliesToRegime(key, regimeOfRow(r)) ? String(r[key] || '') : '—';
        visibleColumns.forEach(c => {
          vals.push(cellFor(c.key));
          if ((c as any).isSplit) vals.push(cellFor((c as any).payKey));
        });
        return [
          r.index,
          r.name,
          r.inn,
          r.accountant,
          r.taxType,
          ...vals
        ];
      });

      const ws = utils.aoa_to_sheet([header, ...data]);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Operatsiyalar");

      // Auto-size columns (rough approximation)
      const colWidths = header.map((h, i) => {
        let max = h.length;
        data.forEach(row => {
          const val = String(row[i] || '');
          if (val.length > max) max = val.length;
        });
        return { wch: Math.min(max + 2, 50) };
      });
      ws['!cols'] = colWidths;

      writeFile(wb, `operatsiyalar_${selectedPeriod}.xlsx`);
      toast.success('Excel fayl yuklab olindi');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export qilishda xatolik yuz berdi');
    }
  };



  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 z-10 border-b transition-all duration-300 py-3 px-6 dashboard-card !rounded-none !border-x-0 !border-t-0 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            {/* Sarlavha OLIB TASHLANDI: ustidagi yorliq allaqachon "Amallar
                matritsasi" deb turibdi, davr esa o'ngdagi davr tugmasida.
                Qoladigani — filtr natijasi, ya'ni YAGONA takrorlanmaydigan
                ma'lumot. */}
            <p className="text-meta font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
              <span className="tabular-nums" style={{ color: 'var(--text)' }}>{filteredRows.length}</span>
              {filteredRows.length !== rows.length && (
                <span className="tabular-nums"> / {rows.length}</span>
              )}
              {' '}{t.taKorxona}
            </p>
            {/* Real-Time Percentage Progress Widget */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setInsightOpen(true)}
                className="flex items-center gap-3.5 px-3.5 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface)] border border-[var(--border)] transition-all cursor-pointer group shadow-sm"
                title="Hisobot tahlilini ochish — foiz va topshirmaganlar"
              >
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2">
                    {/* Fokus rejimida foiz UMUMIY emas, tanlangan hisobotniki —
                        yorliq ham shuni aytishi kerak, aks holda raqam nimaga
                        tegishli ekani noaniq qolardi. */}
                    <span
                      className="text-micro font-semibold uppercase tracking-wider max-w-[160px] truncate"
                      style={{ color: focusColumn ? 'var(--primary)' : 'var(--text-3)' }}
                      title={focusColumn ? `"${focusColumn.label}" bo'yicha topshirilish` : undefined}
                    >
                      {focusColumn ? focusColumn.label : 'Topshirildi'}:
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-[var(--primary)]">
                      {stats.exactPercent}%
                    </span>
                    {/* Avval bu yerda "REAL-VAQT" yozuvi va pulsatsiyalanuvchi
                        nuqta turardi. Bu noto'g'ri edi: ma'lumot `unstable_cache`
                        orqali 5 daqiqagacha eskirgan bo'lishi mumkin, sahifa esa
                        har 15 soniyada yangilanadi. Endi yorliq nimani anglatsa,
                        shuni yozadi. `py-0.2` ham olib tashlandi — Tailwind'da
                        bunday qadam yo'q, u jim ravishda hech narsa bermasdi. */}
                    {/* Matn o'rniga nuqta: "AVTO-YANGILANISH" har doim bir xil
                        edi va ~120px joyni olardi. Ma'nosi tooltipda qoldi. */}
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: 'var(--success)' }}
                      title="Avto-yangilanish yoqilgan — sahifa har 15 soniyada yangilanadi"
                    />
                  </div>
                  {/* Progress bar */}
                  <div className="w-32 sm:w-44 h-2 bg-[var(--border)] rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${stats.percent}%`,
                        // Xom hex o'rniga tokenlar: qorong'i rejimda palitra
                        // qiymatlari fon bilan yetarli kontrast bermasdi.
                        background:
                          stats.percent >= 80
                            ? 'var(--success)'
                            : stats.percent >= 50
                            ? 'var(--warning)'
                            : 'var(--danger)',
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--primary-ghost)] text-[var(--primary)] group-hover:scale-110 transition-transform">
                  <BarChart2 size={16} />
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative group">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder} 
                className="w-48 pl-10 pr-4 py-2 rounded-xl text-meta font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 placeholder:text-[var(--text-3)]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-3)' }} />
            </div>

            {/* HISOBOT TAHLILI — filtrdan farqli, u JAVOB beradi:
                "INPS bo'yicha Go'zaloyning foizi qancha va kim topshirmagan?" */}
            <button
              onClick={() => setInsightOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-meta font-bold uppercase tracking-widest shadow-sm"
              style={{ background: 'var(--primary)', border: '1px solid var(--primary)', color: 'var(--surface)' }}
              title="Bitta hisobot bo'yicha foiz va topshirmaganlar ro'yxati"
            >
              <Sparkles size={14} /> Tahlil
            </button>

            {/* AQLLI FILTRLAR. Bitta buxgalter tanlagichi o'rniga: to'rtala
                mas'ul + soliq rejimi + bo'lim + USTUN KESIMI. Oxirgisi eng
                muhimi — "AQh ni kim topshirmagan?" degan savolga bungacha
                matritsada javob beradigan vosita umuman yo'q edi. */}
            <MatrixFilterPanel
              filters={filters}
              options={filterOptions}
              onChange={setFilter}
              onClearColumn={clearColumnFilter}
              onReset={resetFilters}
              shown={filteredRows.length}
              total={rows.length}
              status={filterStatus}
              statusCounts={statusCounts}
              onStatusChange={setFilterStatus}
              sortActive={table.sortKey === 'completion'}
              sortDir={table.sortDir}
              onToggleSort={() => table.toggleSort('completion')}
            />

            {/* Period Selector */}
            <MonthPicker
              selectedPeriod={selectedPeriod}
              onChange={(p) => onPeriodChange?.(p)}
              className="z-20 h-full"
            />

            {/* Column visibility (per-user, saved in this browser) */}
            <div className="relative" ref={colPanelRef}>
              <button onClick={() => setColPanelOpen(o => !o)}
                aria-expanded={colPanelOpen}
                className="font-bold px-4 py-2 rounded-xl text-meta flex items-center justify-center gap-2 transition-all shadow-sm uppercase tracking-widest"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                <SlidersHorizontal size={14} /> Ustunlar{hiddenCols.size > 0 ? ` (${hiddenCols.size})` : ''}
              </button>
              {colPanelOpen && (
                <div className="absolute right-0 mt-2 z-[200] w-64 flex flex-col max-h-[70vh] rounded-xl layer-overlay overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--rule-strong)' }}>
                  {/* Header — doim tepada, scroll qilinmaydi */}
                  <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>Ustunlar</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHiddenCols(new Set())}
                        className="text-micro font-bold uppercase px-2 py-1 rounded-lg transition-colors"
                        style={{ color: 'var(--primary)', background: 'var(--primary-ghost)' }}
                        title="Barcha ustunlarni ko'rsatish"
                      >Barchasi</button>
                      <button
                        onClick={() => setHiddenCols(new Set(REPORT_COLUMNS.map(c => c.key)))}
                        className="text-micro font-bold uppercase px-2 py-1 rounded-lg transition-colors"
                        style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
                        title="Barcha ustunlarni yashirish"
                      >Hech biri</button>
                    </div>
                  </div>
                  {/* Body — faqat shu qism scroll bo'ladi */}
                  <div className="flex-1 overflow-y-auto scrollbar-styled p-3">
                    {uniqueGroups.map(g => {
                      const groupCols = REPORT_COLUMNS.filter(c => c.group === g);
                      const allShown = groupCols.every(c => !hiddenCols.has(c.key));
                      return (
                      <div key={g} className="mb-2">
                        <div className="flex items-center gap-1 mb-1">
                          <button
                            onClick={() => setHiddenCols(prev => {
                              const next = new Set(prev);
                              // Guruh to'liq ochiq bo'lsa — hammasini yashir, aks holda — hammasini ko'rsat
                              groupCols.forEach(c => { if (allShown) next.add(c.key); else next.delete(c.key); });
                              return next;
                            })}
                            className="flex-1 flex items-center justify-between text-micro font-semibold uppercase tracking-widest hover:opacity-80"
                            style={{ color: 'var(--text-3)' }}
                            title={allShown ? "Guruhni yashirish" : "Guruhni ko'rsatish"}
                          >
                            <span>{g}</span>
                            <span style={{ color: allShown ? 'var(--primary)' : 'var(--text-3)' }}>{allShown ? '✓' : '○'}</span>
                          </button>
                          {/* "FAQAT" — olib tashlangan guruh tanlagichining o'rni:
                              bitta bosishda shu guruhdan boshqasi yashiriladi. */}
                          <button
                            onClick={() => setHiddenCols(new Set(
                              REPORT_COLUMNS.filter(c => c.group !== g).map(c => c.key)
                            ))}
                            className="text-micro font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{ color: 'var(--primary)', background: 'var(--primary-ghost)' }}
                            title={`Faqat "${g}" guruhini ko'rsatish`}
                          >
                            faqat
                          </button>
                        </div>
                        {groupCols.map(c => (
                          <label key={c.key} className="flex items-center gap-2 py-1 px-1 rounded-lg cursor-pointer text-meta" style={{ color: 'var(--text)' }}>
                            <input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => toggleCol(c.key)} />
                            <span className="truncate">{c.label}</span>
                          </label>
                        ))}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button onClick={handleExport}
              className="font-bold px-4 py-2 rounded-xl text-meta flex items-center justify-center gap-2 transition-all shadow-sm uppercase tracking-widest icon-btn-success"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
            >
              <Download size={14} /> Excel
            </button>
          </div>
        </div>

        {/* YOQILGAN FILTRLAR — panel yopilgach ular ko'rinmas bo'lib qolmasin.
            Foydalanuvchi "nega faqat 12 ta firma chiqdi?" degan savolga
            javobni ekranning o'zidan topsin va bitta bosishda olib tashlasin. */}
        {(chips.length > 0 || filterStatus !== 'all') && (
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
              Filtr:
            </span>
            {/* Bajarilish holati chipi — u `activeChips` da yo'q, chunki
                `lib/matrixFilters` bajarilish holatini bilmaydi (u
                `lib/reportStatus` ning mas'uliyati). */}
            {filterStatus !== 'all' && (
              <button
                onClick={() => setFilterStatus('all')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-micro font-bold shadow-sm"
                style={{ background: 'var(--primary-ghost)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                title="Bajarilish filtrini olib tashlash"
              >
                <span style={{ opacity: 0.75 }}>Bajarilish:</span>
                {activeStatusOption.label}
                <span className="tabular-nums" style={{ opacity: 0.75 }}>{statusCounts[filterStatus]}</span>
                <X size={12} />
              </button>
            )}
            {chips.map(chip => (
              <button
                key={chip.key}
                onClick={() => {
                  // Ustun chipi IKKI maydonni tozalaydi (ustun + holat), shuning
                  // uchun bitta yozuvda — ketma-ket chaqiruvda ikkinchisi
                  // birinchisini bekor qilardi.
                  table.setFilters(
                    chip.key === 'colKey'
                      ? {
                          [FILTER_URL_KEYS.colKey]: EMPTY_FILTERS.colKey,
                          [FILTER_URL_KEYS.colStatus]: EMPTY_FILTERS.colStatus,
                        }
                      : { [FILTER_URL_KEYS[chip.key]]: EMPTY_FILTERS[chip.key] }
                  );
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-micro font-bold shadow-sm"
                style={{ background: 'var(--primary-ghost)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                title={`"${chip.label}" filtrini olib tashlash`}
              >
                <span style={{ opacity: 0.75 }}>{chip.label}:</span>
                {chip.value}
                <X size={12} />
              </button>
            ))}
            <button
              onClick={resetAllFilters}
              className="px-2.5 py-1 rounded-lg text-micro font-bold uppercase tracking-widest transition-colors"
              style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
            >
              Hammasini tozalash
            </button>
          </div>
        )}

        {/* AFSONA — endi YIG'ILADIGAN va sukut bo'yicha yopiq.
            To'qqizta element butun bir qatorni egallaydi, lekin uni kunda
            o'nlab marta ochadigan xodim yodlab bo'lgan. Yangi xodim uchun esa
            bitta bosishda ochiladi va tanlovi brauzerda saqlanadi. */}
        <button
          onClick={() => setLegendOpen(o => !o)}
          aria-expanded={legendOpen}
          className="flex items-center gap-1.5 mt-3 pt-2.5 text-micro font-bold uppercase tracking-widest w-full"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}
        >
          <ChevronDown
            size={12}
            className="transition-transform"
            style={{ transform: legendOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
          Belgilar izohi
        </button>
        <div
          className="flex items-center gap-5 mt-2 overflow-x-auto scrollbar-hide"
          style={{ display: legendOpen ? undefined : 'none' }}
        >
          {[
            { icon: '✓', label: `${t.approved} (+)`, color: 'var(--success)', bg: tint('var(--success)', 12) },
            { icon: '✗', label: `${t.rejected} (-)`, color: 'var(--danger)', bg: tint('var(--danger)', 12) },
            { icon: '—', label: `${t.not_required} (0)`, color: 'var(--text-3)', bg: 'var(--surface-2)' },
            { icon: '·', label: t.pending, color: 'var(--info)', bg: tint('var(--info)', 12) },
            { icon: '!', label: t.kartoteka, color: 'var(--warning)', bg: tint('var(--warning)', 12) },
            { icon: 'Ø', label: 'Nol hisobot', color: 'var(--brand)', bg: tint('var(--brand)', 12) },
            { icon: '✎', label: t.comment, color: 'var(--primary)', bg: 'var(--primary-ghost)' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2 shrink-0">
              <span className="font-bold text-micro w-5 h-5 flex items-center justify-center rounded-lg border" style={{ color: l.color, background: l.bg, borderColor: 'var(--border)' }}>{l.icon}</span>
              <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{l.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 shrink-0 ml-4 border-l pl-4" style={{ borderColor: 'var(--border)' }}>
            <span className="text-micro font-bold px-1.5 py-0.5 rounded-lg uppercase tracking-tighter" style={{ background: tint('var(--success)', 12), color: 'var(--success)', border: `1px solid ${tint('var(--success)', 24)}` }}>Xis.</span>
            <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.reportLegend}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-micro font-bold px-1.5 py-0.5 rounded-lg uppercase tracking-tighter" style={{ background: tint('var(--warning)', 12), color: 'var(--warning)', border: `1px solid ${tint('var(--warning)', 24)}` }}>To&apos;l</span>
            <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{t.paymentLegend}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-micro font-bold px-1.5 py-0.5 rounded-lg tracking-tighter" style={{ background: tint('var(--warning)', 12), color: 'var(--warning)', border: `1px solid ${tint('var(--warning)', 24)}` }}>#100</span>
            <span className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Byudjet to&apos;lov kodi</span>
          </div>
        </div>
      </div>

      {/* ── Matrix ──────────────────────────────────────────────
          `isolate`: jadvalning yopishqoq sarlavhasi z-[100] da — bu qiymat
          stacking-context'siz yuqoriga "sizib chiqib", ustidagi toolbar
          (z-40) va uning USTUNLAR ochilma menyusidan oldinga o'tib ketardi
          (menyu o'rtasidan sarlavha teshib chiqardi). isolation:isolate
          jadvalning ichki z-indekslarini shu quti ichida ushlaydi. */}
      <div ref={matrixScrollRef} className="flex-1 overflow-auto relative isolate dashboard-card mx-4 my-4 !shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={28} className="animate-spin text-[var(--brand)]" />
              <span className="text-xs text-[var(--text-secondary)]">{t.loading}</span>
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          /**
           * BO'SH NATIJA O'ZINI TUSHUNTIRSIN.
           *
           * Avval bu yerda faqat "Ma'lumot topilmadi" turardi. Filtrda o'zi
           * mas'ul bo'lmagan o'rinni tanlagan odam (masalan bank-klientni
           * "Buxgalter" ro'yxatidan qidirgan) buni "firmalar yo'qolib qoldi"
           * deb o'qirdi. Endi ekran nima yoqilganini aytadi va bitta bosishda
           * ortga qaytaradi.
           */
          <div className="flex items-center justify-center h-64 px-4">
            <div className="text-center max-w-md">
              <Info size={40} className="mx-auto mb-2 text-[var(--text-muted)]" />
              <p className="text-[var(--text-secondary)] text-sm font-medium">{t.noData}</p>
              {rows.length > 0 && (
                <>
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
                    {rows.length} ta firmadan hech biri joriy filtrga mos kelmadi.
                    {filters.person !== 'all' && ' Xodim boshqa o\'rinda biriktirilgan bo\'lishi mumkin.'}
                  </p>
                  {(chips.length > 0 || filterStatus !== 'all' || debouncedSearch.trim() !== '') && (
                    <button
                      onClick={() => { resetAllFilters(); setSearch(''); }}
                      className="mt-3 px-3 py-1.5 rounded-lg text-meta font-bold uppercase tracking-widest"
                      style={{ background: 'var(--primary-ghost)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                    >
                      Filtrlarni tozalash
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-xs matrix-grid">
            <thead className="sticky top-0 z-50">
              {/* Group row */}
              <tr className="h-7">
                <th colSpan={4} className="sticky top-0 left-0 z-[100] px-3 py-1.5 text-left text-micro font-semibold uppercase tracking-widest w-[408px] min-w-[408px]" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', borderRight: '2px solid var(--border)', color: 'var(--text-3)' }}>
                  {t.firmTable}
                </th>
                {headerBands.map((band, i) => {
                  const st = getGroupStyle(band.name);
                  const isLastBand = i === headerBands.length - 1;
                  return (
                    <th
                      key={`${band.name}-${i}`}
                      colSpan={band.span}
                      className="sticky top-0 px-1 py-1.5 text-center text-micro font-extrabold uppercase tracking-wider"
                      style={{
                        background: st.headerBg,
                        color: st.text,
                        borderBottom: `2px solid ${st.border}`,
                        borderRight: isLastBand ? '1px solid var(--border)' : `2px solid ${st.border}`,
                      }}
                      title={band.name}
                    >
                      {band.name}
                    </th>
                  );
                })}
              </tr>
              {/* Column header row */}
              <tr className="h-9">
                <th className="sticky top-[28px] left-0 z-[100] px-2 py-2 text-center text-micro font-bold w-10 min-w-[40px]" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>#</th>
                <th className="sticky top-[28px] left-10 z-[100] px-3 py-2 text-left text-micro font-bold w-48 min-w-[192px] uppercase" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} aria-sort={table.sortKey === 'name' ? (table.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => table.toggleSort('name')} className="inline-flex items-center gap-1 hover:opacity-75" title="Saralash">{t.companyName}{table.sortKey === 'name' && (table.sortDir === 'asc' ? ' \u2191' : ' \u2193')}</button></th>
                <th className="md:sticky md:top-[28px] md:left-[232px] z-[100] px-1.5 py-2 text-center text-micro font-bold w-20 min-w-[80px]" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} aria-sort={table.sortKey === 'inn' ? (table.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => table.toggleSort('inn')} className="inline-flex items-center gap-1 hover:opacity-75" title="Saralash">INN{table.sortKey === 'inn' && (table.sortDir === 'asc' ? ' \u2191' : ' \u2193')}</button></th>
                <th className="md:sticky md:top-[28px] md:left-[312px] z-[100] px-2 py-2 text-left text-micro font-bold w-24 min-w-[96px] uppercase" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', borderRight: '2px solid var(--border)' }} aria-sort={table.sortKey === 'accountant' ? (table.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => table.toggleSort('accountant')} className="inline-flex items-center gap-1 hover:opacity-75" title="Saralash">BUXGALTER{table.sortKey === 'accountant' && (table.sortDir === 'asc' ? ' \u2191' : ' \u2193')}</button></th>
                {visibleColumns.map(col => {
                  const st = getGroupStyle(col.group);
                  const groupEdges = buildGroupEdges(visibleColumns);
                  const isEdge = groupEdges.has(col.key);
                  const borderRightStyle = isEdge ? `2px solid ${st.border}` : '1px solid var(--border)';

                  const payCode = paymentCodeFor(col.key);

                  if ((col as any).isSplit) {
                    return (
                      <React.Fragment key={col.key}>
                        <th
                          className="sticky top-[28px] px-0.5 py-2 text-center w-10 text-micro cursor-help"
                          style={{ background: `color-mix(in srgb, var(--success) 12%, ${st.subHeaderBg})`, borderBottom: `2px solid ${st.border}`, borderRight: '1px solid var(--border)' }}
                          title={col.label}
                        >
                          <span className="text-micro font-bold tracking-widest" style={{ color: 'var(--success)' }}>{col.short}</span>
                          <div className="text-2xs font-bold uppercase tracking-tighter" style={{ color: 'var(--success)', opacity: 0.85 }}>Xis.</div>
                        </th>
                        <th
                          className="sticky top-[28px] px-0.5 py-2 text-center w-10 cursor-help"
                          style={{ background: `color-mix(in srgb, var(--warning) 12%, ${st.subHeaderBg})`, borderBottom: `2px solid ${st.border}`, borderRight: borderRightStyle }}
                          title={payCode ? `${col.label} to'lov \u2014 byudjet kodi ${payCode}` : `${col.label} to'lov`}
                        >
                          <span className="text-micro font-bold tracking-widest" style={{ color: 'var(--warning)' }}>{(col as any).payShort}</span>
                          {/* To'lov topshiriqnomasiga yoziladigan byudjet kodi.
                              Buxgalter uni tashqi ro'yxatdan qidirardi; kod
                              adashsa pul boshqa soliqqa tushib ketardi. */}
                          <div className="text-2xs font-bold uppercase tracking-tighter" style={{ color: 'var(--warning)', opacity: 0.85 }}>{payCode ? `#${payCode}` : "To'l"}</div>
                        </th>
                      </React.Fragment>
                    );
                  }
                  return (
                    <th
                      key={col.key}
                      className="sticky top-[28px] px-0.5 py-2 text-center w-10 transition-colors cursor-help group/header"
                      style={{
                        background: st.subHeaderBg,
                        borderBottom: `2px solid ${st.border}`,
                        borderRight: borderRightStyle,
                      }}
                      title={((col as any).isPaymentOnly ? serviceFullLabel(col.key) : `${col.label} (${col.group})` + (payCode ? ` \u2014 byudjet kodi ${payCode}` : '')) + (userRole === 'super_admin' ? ' (o\'ng tugma = tozalash)' : '')}
                      onContextMenu={(e) => {
                        if (userRole === 'super_admin' || userRole === 'admin') {
                          e.preventDefault();
                          handleClearColumn(col.key);
                        }
                      }}
                    >
                      {/* Faqat-to'lov ustuni (mol-mulk / yer / suv avansi) —
                          yorlig'i kod, rangi to'lov rangi: u hisobot emas. */}
                      <span className="text-micro font-extrabold uppercase tracking-wider transition-colors" style={{ color: (col as any).isPaymentOnly ? 'var(--warning)' : st.text }}>
                        {(col as any).isPaymentOnly ? `#${payCode}` : col.short}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {/* Yuqoridagi ko'rinmas qatorlar o'rnini bo'sh balandlik egallaydi —
                  scrollbar uzunligi to'g'ri qoladi. */}
              {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }} />}
              {virtualRows.map((v) => {
                const row = paginatedRows[v.index];
                if (!row) return null;
                return (
                  <OperationRow
                    key={String(row.companyId || row.index)}
                    row={row}
                    idx={row.index - 1}
                    visibleColumns={visibleColumns as any}
                    userRole={userRole}
                    relations={(row.companyId && relationsByCompany.get(row.companyId)) || EMPTY_RELATIONS}
                    activeServices={row.activeServices}
                    proofMeta={proofMeta}
                    onCellUpdate={handleCellUpdate}
                    onCompanySelect={handleCompanySelect}
                    onRequestSubmit={openSubmitModal}
                    onViewProof={openViewModal}
                  />
                );
              })}
              {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }} />}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 dashboard-card !rounded-none !border-x-0 !border-b-0 px-6 py-3 mt-auto !shadow-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-lg bg-[var(--primary)] opacity-50"></span>
              <span>{t.totalFirms}: <strong style={{ color: 'var(--text)' }}>{filteredRows.length}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-lg opacity-50" style={{ background: 'var(--success)' }}></span>
              <span><strong style={{ color: 'var(--text)' }}>{visibleColumns.length}</strong> {t.reports.toLowerCase()}</span>
            </div>
            <div className="h-4 w-px" style={{ background: 'var(--border)' }}></div>
            <div className="flex items-center gap-2">
              <span className="text-micro uppercase tracking-widest opacity-70">SINXRON:</span>
              <strong style={{ color: 'var(--primary)' }}>AKTIV</strong>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCurrentPage(Math.max(1, currentPage - 1));
                matrixScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl text-micro font-bold uppercase tracking-widest transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
            >
              ← Oldingi
            </button>

            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span className="text-meta font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                {currentPage}
              </span>
              <span className="text-meta font-bold" style={{ color: 'var(--text-3)' }}>/</span>
              <span className="text-meta font-bold tabular-nums" style={{ color: 'var(--text-3)' }}>
                {totalPages || 1}
              </span>
            </div>

            <button
              onClick={() => {
                setCurrentPage(Math.min(totalPages, currentPage + 1));
                matrixScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-4 py-2 rounded-xl text-micro font-bold uppercase tracking-widest transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: 'white' }}
            >
              Keyingi →
            </button>
          </div>
        </div>
      </div>

      {/* ── Real-Time Progress Details Modal ── */}
      <ReportProofModal
        state={proofModal}
        period={selectedPeriod}
        // Huquq AYNAN SHU FIRMA bo'yicha — server ham shunday tekshiradi.
        canReview={
          !!proofModal &&
          isCompanyReviewer(userRole, relationsByCompany.get(proofModal.companyId))
        }
        onClose={() => setProofModal(null)}
        onSubmitted={handleProofSubmitted}
        onReviewed={handleProofReviewed}
      />

      <ReportInsightModal
        open={insightOpen}
        onClose={() => setInsightOpen(false)}
        period={selectedPeriod}
        columns={insightColumns}
        rows={insightRows}
        onApply={applyInsight}
      />
    </div>
  );
};

export default OperationModule;
