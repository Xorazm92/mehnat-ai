"use client";
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Company, OperationEntry, Language, Staff } from '@/types';
import { translations } from '@/lib/translations';
import { ChevronDown, Download, Search, RefreshCw, Info, SlidersHorizontal, BarChart2, PieChart, TrendingUp, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
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
import { tryGetColumnCategory, CATEGORY_LABEL_UZ, type ReportCategory } from '@/lib/reportGroups';
import { allowedCellActions, canApproveCell, canEditMatrix, isReviewerOwnedValue, type CellAction } from '@/lib/reportPermissions';
import { companyRelations, type CompanyRelation } from '@/lib/access';
import { useDismissable } from '@/hooks/useDismissable';
import { Button } from "@/components/ui/Button";
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

const GROUP_STYLE_MAP: Record<string, GroupStyle> = {
  "Oylik": {
    headerBg: "color-mix(in srgb, #3b82f6 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, #3b82f6 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, #3b82f6 3.5%, transparent)",
    text: "var(--accent-blue)",
    border: "color-mix(in srgb, #3b82f6 45%, transparent)",
  },
  "Soliqlar": {
    headerBg: "color-mix(in srgb, #10b981 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, #10b981 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, #10b981 3.5%, transparent)",
    text: "var(--success)",
    border: "color-mix(in srgb, #10b981 45%, transparent)",
  },
  "Soliq H/T": {
    headerBg: "color-mix(in srgb, #f59e0b 22%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, #f59e0b 12%, var(--surface-2))",
    cellBg: "color-mix(in srgb, #f59e0b 4.5%, transparent)",
    text: "var(--warning)",
    border: "color-mix(in srgb, #f59e0b 50%, transparent)",
  },
  "Yillik": {
    headerBg: "color-mix(in srgb, #8b5cf6 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, #8b5cf6 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, #8b5cf6 3.5%, transparent)",
    text: "var(--accent-purple)",
    border: "color-mix(in srgb, #8b5cf6 45%, transparent)",
  },
  "Statistika": {
    headerBg: "color-mix(in srgb, #ec4899 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, #ec4899 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, #ec4899 3.5%, transparent)",
    text: "var(--danger)",
    border: "color-mix(in srgb, #ec4899 45%, transparent)",
  },
  "IT Park": {
    headerBg: "color-mix(in srgb, #06b6d4 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, #06b6d4 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, #06b6d4 3.5%, transparent)",
    text: "var(--info)",
    border: "color-mix(in srgb, #06b6d4 45%, transparent)",
  },
  "Komunalka": {
    headerBg: "color-mix(in srgb, #eab308 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, #eab308 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, #eab308 3.5%, transparent)",
    text: "var(--warning)",
    border: "color-mix(in srgb, #eab308 45%, transparent)",
  },
  "Maxsus": {
    headerBg: "color-mix(in srgb, #6366f1 18%, var(--surface-2))",
    subHeaderBg: "color-mix(in srgb, #6366f1 10%, var(--surface-2))",
    cellBg: "color-mix(in srgb, #6366f1 3.5%, transparent)",
    text: "var(--accent-indigo)",
    border: "color-mix(in srgb, #6366f1 45%, transparent)",
  },
};

const getGroupStyle = (groupName: string): GroupStyle => {
  return GROUP_STYLE_MAP[groupName] ?? {
    headerBg: "var(--surface-2)",
    subHeaderBg: "var(--surface-2)",
    cellBg: "transparent",
    text: "var(--text-secondary)",
    border: "var(--border)",
  };
};

const CATEGORY_COLOR: Record<ReportCategory, string> = {
  OPERATSION: 'var(--brand)',
  SOLIQ: 'var(--warning)',
  STATISTIKA: 'var(--info)',
  MAXSUS: 'var(--accent-purple)',
};

const categoryOf = (key: string): ReportCategory | null => tryGetColumnCategory(key);

const buildGroupEdges = (cols: readonly ReportColumn[]): Set<string> => {
  const edges = new Set<string>();
  cols.forEach((c, i) => {
    const next = cols[i + 1];
    if (next && c.group !== next.group) edges.add(c.key);
  });
  return edges;
};
const getStatusStyle = (value: string) => {
  const v = String(value || '').trim().toLowerCase();

  if (!v || v === '0' || v === 'not_required') return { bg: 'transparent', text: 'var(--text-muted)', icon: '—', tooltip: "Bo'sh" };
  if (v === '+' || v === 'accepted') return { bg: tint('var(--success)', 13), text: 'var(--success)', icon: '✓', tooltip: 'Bajarildi (+)' };
  if (v === '-' || v === 'not_submitted') return { bg: tint('var(--danger)', 13), text: 'var(--danger)', icon: '✗', tooltip: 'Bajarilmadi (-)' };
  if (v === 'topshirildi' || v === 'submitted') return { bg: tint('var(--info)', 13), text: 'var(--info)', icon: '·', tooltip: 'Topshirildi (Kutilmoqda)' };
  if (v === 'kartoteka' || v === 'blocked') return { bg: tint('var(--warning)', 15), text: 'var(--warning)', icon: '!', tooltip: 'Kartoteka' };
  if (v === 'error' || v === 'oshibka') return { bg: tint('var(--danger)', 13), text: 'var(--danger)', icon: '!', tooltip: 'Xatolik' };
  // NOL HISOBOT — topshirilgan, ichida raqam nol. "0" (shart emas) dan farqli:
  // u ish BAJARILGANINI bildiradi, shuning uchun belgisi ham boshqa.
  if (v === 'nol') return { bg: tint('var(--brand)', 13), text: 'var(--brand)', icon: 'Ø', tooltip: 'Nol hisobot topshirildi' };

  // ERKIN MATN (izoh). Matnning O'ZI katakka chizilmaydi — ilgari shunday
  // qilingani uchun uzun izoh ustunni cho'zib, butun jadval qatorini
  // kengaytirib yuborardi. Endi faqat belgi turadi, to'liq matn bosilganda
  // ochiladi (va tooltipda ko'rinadi).
  return { bg: tint('var(--info)', 13), text: 'var(--info)', icon: '✎', tooltip: value, isNote: true };
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

interface StatusCellProps {
  value: string;
  onUpdate: (newValue: string) => void;
  readOnly?: boolean;
  userRole: string;
  /** Foydalanuvchining AYNAN SHU firmadagi mas'uliyatlari. */
  relations: CompanyRelation[];
  proofStatus?: string; // 'pending' | 'approved' | 'rejected'
  onRequestSubmit?: () => void;
  onViewProof?: () => void;
}

const PROOF_DOT: Record<string, string> = {
  pending: 'var(--info)',
  approved: 'var(--success)',
  rejected: 'var(--danger)',
};

const StatusCell = React.memo<StatusCellProps>(({ value, onUpdate, readOnly, userRole, relations, proofStatus, onRequestSubmit, onViewProof }) => {
  const style = getStatusStyle(value);
  // "isAccountant" = tasdiqlash huquqi YO'Q degani (server bilan bir xil qoida).
  // Nazoratchi o'zi buxgalteri bo'lgan firmada ham shu tarmoqqa tushadi.
  const isAccountant = !canApproveCell(userRole, relations);
  const menuStatuses = useMemo(
    () => statusesForRole(userRole, relations, proofStatus === 'pending'),
    [userRole, relations, proofStatus]
  );
  // Tasdiqlangan yoki tekshiruvda turgan katak buxgalter uchun QULFLANGAN —
  // server ham shuni rad etadi (lib/reportPermissions.checkCellWrite), shuning
  // uchun bu yerda ham urinishga yo'l qo'ymaymiz.
  const lockedForAccountant = isAccountant && isReviewerOwnedValue(value);
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
      setInputValue(value === '0' || value === '+' || value === '-' ? '' : value);
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
        <span className="truncate w-full text-center block uppercase">{style.icon}</span>
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
          style={{
            position: 'absolute',
            top: coords.top + 2,
            left: coords.left,
            transform: 'translateX(-50%)'
          }}
          className="z-[110] min-w-[180px] bg-[var(--card-bg)] dark:bg-[var(--surface-2)] p-1 shadow-md border border-[var(--rule)] dark:border-[var(--rule-strong)] rounded-lg"
        >
          {!showInput ? (
            <div className="grid grid-cols-1">
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
                  <span className="text-meta font-bold text-[var(--text-secondary)] group-hover:text-[var(--brand)]">{status.label}</span>
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
}, (prev, next) => prev.value === next.value && prev.readOnly === next.readOnly && prev.proofStatus === next.proofStatus && prev.relations === next.relations);

// ── Memoized Table Row ─────────────────────────────────────────
const OperationRow = React.memo<{
  row: ReportRow;
  idx: number;
  visibleColumns: ReportColumn[];
  userRole: string;
  relations: CompanyRelation[];
  activeServices: string[];
  proofMeta: Map<string, string>;
  onCellUpdate: (companyId: string, colKey: string, newValue: string) => void;
  onCompanySelect: (companyId: string) => void;
  onRequestSubmit: (companyId: string, colKey: string) => void;
  onViewProof: (companyId: string, colKey: string) => void;
}>(({ row, idx, visibleColumns, userRole, relations, activeServices, proofMeta, onCellUpdate, onCompanySelect, onRequestSubmit, onViewProof }) => {
  const isServiceEnabled = (key: string) => !activeServices.length || activeServices.includes(key);
  const proofOf = (colKey: string) => (row.companyId ? proofMeta.get(`${row.companyId}::${colKey}`) : undefined);
  const groupEdges = useMemo(() => buildGroupEdges(visibleColumns), [visibleColumns]);

  return (
    <tr className="group transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
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
        const serviceDisabled = !isServiceEnabled(col.key);
        const st = getGroupStyle(col.group);
        const isEdge = groupEdges.has(col.key);
        const borderRightStyle = isEdge ? `2px solid ${st.border}` : '1px solid var(--border)';

        if ((col as any).isSplit) {
          const payKey = (col as any).payKey as string;
          const payDisabled = !isServiceEnabled(payKey);
          return (
            <React.Fragment key={col.key}>
              <td className="px-0.5 py-0.5 text-center h-8" style={{ borderRight: '1px solid var(--border)', background: serviceDisabled ? 'var(--bg-sunken)' : `color-mix(in srgb, var(--success) 6%, ${st.cellBg})` }}>
                {serviceDisabled ? (
                  <span className="text-micro" style={{ color: 'var(--text-3)' }}>—</span>
                ) : (
                  <StatusCell
                    value={String(row[col.key] || '')}
                    onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId as string, col.key as string, String(newValue))}
                    readOnly={isReadOnly}
                    userRole={userRole}
                    relations={relations}
                    proofStatus={proofOf(col.key)}
                    onRequestSubmit={() => row.companyId && onRequestSubmit(row.companyId as string, col.key as string)}
                    onViewProof={() => row.companyId && onViewProof(row.companyId as string, col.key as string)}
                  />
                )}
              </td>
              <td className="px-0.5 py-0.5 text-center h-8" style={{ borderRight: borderRightStyle, background: payDisabled ? 'var(--bg-sunken)' : `color-mix(in srgb, var(--warning) 6%, ${st.cellBg})` }}>
                {payDisabled ? (
                  <span className="text-micro" style={{ color: 'var(--text-3)' }}>—</span>
                ) : (
                  <StatusCell
                    value={String(row[payKey] || '')}
                    onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId as string, payKey as string, String(newValue))}
                    readOnly={isReadOnly}
                    userRole={userRole}
                    relations={relations}
                    proofStatus={proofOf(payKey)}
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
              <span className="text-micro" style={{ color: 'var(--text-3)' }}>—</span>
            ) : (
              <StatusCell
                value={String(row[col.key] || '')}
                onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId as string, col.key as string, String(newValue))}
                readOnly={isReadOnly}
                userRole={userRole}
                relations={relations}
                proofStatus={proofOf(col.key)}
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
}

interface ReportRow {
  index: number;
  name: string;
  inn: string;
  accountant: string;
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
  reportColumns
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
    defaultFilters: { acc: 'all', grp: 'all' },
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
  const setFilterGroup = (v: string) => table.setFilter('grp', v);
  /**
   * M6: statistika oynasidagi kategoriya plitkalari uchun ALOHIDA filtr.
   *
   * Avval plitka `setFilterGroup(cat.category)` chaqirardi, ya'ni "SOLIQ"
   * (ReportCategory enum) qiymatini `c.group` bilan solishtirardi — u yerda esa
   * "Soliqlar", "Oylik", "Statistika" kabi BOSHQA taksonomiya bor. Ular hech
   * qachon mos kelmasdi, natijada `visibleColumns` BO'SH qolib, foydalanuvchi
   * plitkani bosgach butun matritsa yo'qolardi.
   */
  const [filterCategory, setFilterCategory] = useState<ReportCategory | 'all'>('all');
  const filterAccountant = table.filters.acc;
  const setFilterAccountant = (v: string) => table.setFilter('acc', v);
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
  const skipNextSyncRef = useRef(false);

  useEffect(() => { companiesRef.current = companies; }, [companies]);
  useEffect(() => { staffRef.current = staff; }, [staff]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);

  // ── Report Proofs (skrinshot dalillari) ───────────────────────
  const [proofMeta, setProofMeta] = useState<Map<string, string>>(new Map());
  const [proofModal, setProofModal] = useState<ProofModalState | null>(null);
  const canReview = userRole === 'super_admin' || userRole === 'admin' || userRole === 'chief_accountant' || userRole === 'supervisor';

  const reloadProofMeta = useCallback(async () => {
    try {
      const list = await getReportProofsMeta(selectedPeriod);
      const m = new Map<string, string>();
      (list as Array<{ companyId: string; colKey: string; status: string }>).forEach((p) => {
        m.set(`${p.companyId}::${p.colKey}`, p.status);
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

  const handleProofSubmitted = useCallback((companyId: string, colKey: string) => {
    skipNextSyncRef.current = true;
    setRows(prev => prev.map(r => (r.companyId === companyId ? { ...r, [colKey]: 'topshirildi' } : r)));
    setProofMeta(prev => new Map(prev).set(`${companyId}::${colKey}`, 'pending'));
  }, []);

  const handleProofReviewed = useCallback((companyId: string, colKey: string, cellValue: string) => {
    skipNextSyncRef.current = true;
    setRows(prev => prev.map(r => (r.companyId === companyId ? { ...r, [colKey]: cellValue } : r)));
    setProofMeta(prev => new Map(prev).set(`${companyId}::${colKey}`, cellValue === '+' ? 'approved' : 'rejected'));
  }, []);

  // Notifikatsiyadan kelgan chuqur havola: bevosita shu katak dalilini ochamiz.
  const focusHandledRef = useRef(false);
  useEffect(() => {
    if (focusHandledRef.current) return;
    if (!focusProof || !companies.length) return;
    focusHandledRef.current = true;
    openViewModal(focusProof.companyId, focusProof.colKey);
  }, [focusProof, companies.length, openViewModal]);

  // ── Build Rows from DB Props (companies + operations) ──────────
  // ── Build Rows from DB Props (companies + operations) ──────────
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    // Optimization: Create a map of current period's operations for O(1) lookup
    const opsMap = new Map<string, OperationEntry>();
    operations.forEach(op => {
      if (periodsEqual(op.period, selectedPeriod)) {
        opsMap.set(op.companyId, op);
      }
    });

    const newRows: ReportRow[] = companies.map((comp, index) => {
      const op = opsMap.get(comp.id);

      const row: ReportRow = {
        index: index + 1,
        name: comp.name,
        inn: comp.inn,
        accountant: op?.assigned_accountant_name || comp.accountantName || (comp as any).accountant?.fullName || '—',
        taxType: comp.taxType || '',
        login: comp.login || '',       // From DB company profile
        password: comp.password || '', // From DB company profile
        companyId: comp.id,
        activeServices: comp.activeServices || [],
      };

      // Fill columns from OperationEntry (or '0' / default)
      for (const col of REPORT_COLUMNS) {
        if (op && (op as any)[col.key] !== undefined && (op as any)[col.key] !== null) {
          row[col.key] = String((op as any)[col.key]);
        } else {
          row[col.key] = '';
        }
      }
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

    try {
      skipNextSyncRef.current = true;
      const company = companiesRef.current.find(c => c.id === companyId);
      await upsertMonthlyReport({
        companyId,
        period: selectedPeriod,
        [colKey]: newValue
      });

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
      setRows(prevRows => prevRows.map(row =>
        row.companyId === companyId ? { ...row, [colKey]: prevValue } : row
      ));
      // Server sababni o'zbekcha qaytaradi (masalan "Tasdiqlash faqat
      // nazoratchi huquqida") — uni yashirmasdan ko'rsatamiz.
      toast.error(e?.message || 'Saqlashda xatolik!');
    }
  }, [selectedPeriod, onUpdate, REPORT_COLUMNS]); // Minimal dependencies

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

    try {
      skipNextSyncRef.current = true;
      setRows(prev => prev.map(r => ({ ...r, [colKey]: '' })));
      await clearColumnForPeriod(selectedPeriod, colKey);
      await onUpdate({});
      toast.success('Ustun tozalandi');
    } catch (e) {
      console.error(e);
      setRows(prev => prev.map(r =>
        snapshot.has(r.companyId) ? { ...r, [colKey]: snapshot.get(r.companyId) } : r
      ));
      toast.error('Ustun tozalanmadi — qiymatlar qaytarildi');
    }
  }, [selectedPeriod, userRole, onUpdate, REPORT_COLUMNS, rows, confirm]);

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

  const visibleColumns = useMemo(() => {
    let base = filterGroup === 'all' ? REPORT_COLUMNS : REPORT_COLUMNS.filter(c => c.group === filterGroup);
    if (filterCategory !== 'all') {
      base = base.filter(c => (tryGetColumnCategory(c.key as never) || 'OPERATSION') === filterCategory);
    }
    return base.filter(c => !hiddenCols.has(c.key));
  }, [filterGroup, filterCategory, REPORT_COLUMNS, hiddenCols]);

  /** Qator bo'yicha bajarilish: talab qilingan kataklardan nechtasi yopilgan. */
  const rowCompletion = useCallback((row: ReportRow) => {
    let total = 0, done = 0;
    for (const col of visibleColumns) {
      const check = (v: unknown) => {
        const val = String(v ?? '').trim().toLowerCase();
        if (!val || val === '0' || val === 'topshirmaydi') return;
        total++;
        if (val === '+' || val === 'topshirildi') done++;
      };
      check(row[col.key]);
      if ((col as { isSplit?: boolean }).isSplit) check(row[(col as unknown as { payKey: string }).payKey]);
    }
    return total > 0 ? done / total : 0;
  }, [visibleColumns]);

  const filteredRows = useMemo(() => {
    const out = rows.filter(r => {
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        if (!r.name.toLowerCase().includes(s) && !r.inn.includes(s) && !r.accountant.toLowerCase().includes(s)) return false;
      }
      if (filterAccountant !== 'all' && r.accountant !== filterAccountant) return false;
      return true;
    });

    // M3: matritsada saralash umuman yo'q edi — nazoratchi "eng ko'p qolgan
    // firmalar" yoki "eng orqada qolgan buxgalter" bo'yicha tartiblay olmasdi.
    const key = table.sortKey;
    if (!key) return out;
    const dir = table.sortDir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => {
      if (key === 'completion') return (rowCompletion(a) - rowCompletion(b)) * dir;
      const av = String(a[key] ?? ''), bv = String(b[key] ?? '');
      if (key === 'inn') return av.localeCompare(bv, undefined, { numeric: true }) * dir;
      return av.localeCompare(bv, 'uz') * dir;
    });
  }, [rows, debouncedSearch, filterAccountant, table.sortKey, table.sortDir, rowCompletion]);

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
    const bands: { name: string; category: ReportCategory | null; span: number }[] = [];
    visibleColumns.forEach(c => {
      const visualCols = (c as any).isSplit ? 2 : 1;
      const last = bands[bands.length - 1];
      if (last && last.name === c.group) last.span += visualCols;
      else bands.push({ name: c.group, category: categoryOf(c.key), span: visualCols });
    });
    return bands;
  }, [visibleColumns]);

  // Guruh chegarasi: shu ustundan KEYIN yangi guruh boshlanadi.
  const groupEdges = useMemo(() => buildGroupEdges(visibleColumns), [visibleColumns]);

  const [showStatsModal, setShowStatsModal] = useState(false);

  // Real-time % stats calculation
  const stats = useMemo(() => {
    let done = 0, notDone = 0, na = 0, warning = 0, text = 0;
    const countValue = (v: string) => {
      const val = v.trim().toLowerCase();
      if (val === '+') done++;
      else if (val === '-') notDone++;
      else if (!val || val === '0' || val === 'topshirmaydi') na++;
      else if (val === 'kartoteka') warning++;
      else if (val === 'topshirildi') done++; // count pending as done for stats
      else if (val.length > 1) text++;
    };
    filteredRows.forEach(row => {
      visibleColumns.forEach(col => {
        countValue(String(row[col.key] || ''));
        if ((col as any).isSplit) {
          countValue(String(row[(col as any).payKey] || ''));
        }
      });
    });

    const totalRequired = done + notDone + warning + text;
    const percent = totalRequired > 0 ? Math.round((done / totalRequired) * 100) : 0;
    const exactPercent = totalRequired > 0 ? Number(((done / totalRequired) * 100).toFixed(1)) : 0;

    return { done, notDone, na, warning, text, totalRequired, percent, exactPercent };
  }, [filteredRows, visibleColumns]);

  // Per-accountant real-time progress
  const accountantProgress = useMemo(() => {
    const map = new Map<string, { total: number; done: number; notDone: number; warning: number }>();
    rows.forEach(row => {
      const acc = row.accountant && row.accountant !== '—' ? row.accountant : 'Biriktirilmagan';
      if (!map.has(acc)) map.set(acc, { total: 0, done: 0, notDone: 0, warning: 0 });
      const entry = map.get(acc)!;

      visibleColumns.forEach(col => {
        const val = String(row[col.key] || '').trim().toLowerCase();
        if (val && val !== '0' && val !== 'topshirmaydi') {
          entry.total++;
          if (val === '+' || val === 'topshirildi') entry.done++;
          else if (val === '-') entry.notDone++;
          else if (val === 'kartoteka') entry.warning++;
        }
        if ((col as any).isSplit) {
          const pVal = String(row[(col as any).payKey] || '').trim().toLowerCase();
          if (pVal && pVal !== '0' && pVal !== 'topshirmaydi') {
            entry.total++;
            if (pVal === '+' || pVal === 'topshirildi') entry.done++;
            else if (pVal === '-') entry.notDone++;
            else if (pVal === 'kartoteka') entry.warning++;
          }
        }
      });
    });

    return Array.from(map.entries()).map(([name, data]) => ({
      name,
      total: data.total,
      done: data.done,
      notDone: data.notDone,
      warning: data.warning,
      percent: data.total > 0 ? Math.round((data.done / data.total) * 100) : 0
    })).sort((a, b) => b.percent - a.percent);
  }, [rows, visibleColumns]);

  // Per-category real-time progress
  const categoryProgress = useMemo(() => {
    const map = new Map<ReportCategory, { total: number; done: number }>();
    visibleColumns.forEach(col => {
      const cat = tryGetColumnCategory(col.key as any) || 'OPERATSION';
      if (!map.has(cat)) map.set(cat, { total: 0, done: 0 });
      const entry = map.get(cat)!;

      filteredRows.forEach(row => {
        const val = String(row[col.key] || '').trim().toLowerCase();
        if (val && val !== '0' && val !== 'topshirmaydi') {
          entry.total++;
          if (val === '+' || val === 'topshirildi') entry.done++;
        }
        if ((col as any).isSplit) {
          const pVal = String(row[(col as any).payKey] || '').trim().toLowerCase();
          if (pVal && pVal !== '0' && pVal !== 'topshirmaydi') {
            entry.total++;
            if (pVal === '+' || pVal === 'topshirildi') entry.done++;
          }
        }
      });
    });

    return (['OPERATSION', 'SOLIQ', 'STATISTIKA', 'MAXSUS'] as ReportCategory[]).map(cat => {
      const data = map.get(cat) || { total: 0, done: 0 };
      return {
        category: cat,
        label: CATEGORY_LABEL_UZ[cat],
        total: data.total,
        done: data.done,
        percent: data.total > 0 ? Math.round((data.done / data.total) * 100) : 0
      };
    });
  }, [filteredRows, visibleColumns]);

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
        visibleColumns.forEach(c => {
          vals.push(String(r[c.key] || ''));
          if ((c as any).isSplit) vals.push(String(r[(c as any).payKey] || ''));
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
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 z-10 border-b transition-all duration-300 py-3 px-6 dashboard-card !rounded-none !border-x-0 !border-t-0 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div>
              {/* `h1` emas, `h2`: sahifaning yagona `h1` i endi `PageHeader`
                  da — ekran o'quvchi uchun ikkita birinchi darajali sarlavha
                  hujjat tuzilmasini buzardi. */}
              <h2 className="text-base font-semibold leading-tight" style={{ color: 'var(--text)' }}>{t.matrixTitle}</h2>
              <p className="text-micro font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-3)' }}>
                {filteredRows.length} / {rows.length} {t.taKorxona} · <span style={{ color: 'var(--primary)' }}>{selectedPeriod}</span>
              </p>
            </div>
            {/* Real-Time Percentage Progress Widget */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowStatsModal(true)}
                className="flex items-center gap-3.5 px-3.5 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface)] border border-[var(--border)] transition-all cursor-pointer group shadow-sm"
                title="Batafsil topshirish % statistikasini ko'rish"
              >
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2">
                    <span className="text-micro font-semibold uppercase tracking-wider text-[var(--text-3)]">
                      Topshirildi:
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
                    <span
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-micro font-bold"
                      style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}
                      title="Sahifa har 15 soniyada yangilanadi"
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
                      AVTO-YANGILANISH
                    </span>
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

            {/* Bajarilish bo'yicha saralash. Matritsada bo'sh ustun yo'q, shuning
                uchun bu tartib asboblar panelidan boshqariladi. Nazoratchi uchun
                eng kerakli savol shu: "qaysi firmalar eng orqada?" */}
            <button
              onClick={() => table.toggleSort('completion')}
              aria-pressed={table.sortKey === 'completion'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-meta font-bold uppercase tracking-widest shadow-sm"
              style={
                table.sortKey === 'completion'
                  ? { background: 'var(--primary-ghost)', border: '1px solid var(--primary)', color: 'var(--primary)' }
                  : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }
              }
              title="Bajarilish foizi bo'yicha saralash"
            >
              Bajarilish
              {table.sortKey === 'completion' && (table.sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>

            {/* Faol kategoriya chipi — statistika oynasidan qo'yilgan filtr
                ko'rinmas bo'lib qolmasligi uchun. Busiz foydalanuvchi ustunlar
                nega kamayganini bilmasdi va uni tozalay olmasdi. */}
            {filterCategory !== 'all' && (
              <button
                onClick={() => setFilterCategory('all')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-meta font-bold uppercase tracking-widest shadow-sm"
                style={{ background: 'var(--primary-ghost)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                title="Kategoriya filtrini olib tashlash"
              >
                {CATEGORY_LABEL_UZ[filterCategory]}
                <X size={13} />
              </button>
            )}

            {/* Accountant Filter */}
            <div className="relative">
              <select value={filterAccountant} onChange={e => setFilterAccountant(e.target.value)}
                className="pl-4 pr-9 py-2 rounded-xl text-meta font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 appearance-none min-w-[130px] cursor-pointer"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="all">{t.allAccountants}</option>
                {accountants.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }} />
            </div>

            {/* Group Filter */}
            <div className="relative">
              <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
                className="pl-4 pr-9 py-2 rounded-xl text-meta font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 appearance-none min-w-[120px] cursor-pointer"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="all">{t.allColumns}</option>
                {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }} />
            </div>

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
                        <button
                          onClick={() => setHiddenCols(prev => {
                            const next = new Set(prev);
                            // Guruh to'liq ochiq bo'lsa — hammasini yashir, aks holda — hammasini ko'rsat
                            groupCols.forEach(c => { if (allShown) next.add(c.key); else next.delete(c.key); });
                            return next;
                          })}
                          className="w-full flex items-center justify-between text-micro font-semibold uppercase tracking-widest mb-1 hover:opacity-80"
                          style={{ color: 'var(--text-3)' }}
                          title={allShown ? "Guruhni yashirish" : "Guruhni ko'rsatish"}
                        >
                          <span>{g}</span>
                          <span style={{ color: allShown ? 'var(--primary)' : 'var(--text-3)' }}>{allShown ? '✓' : '○'}</span>
                        </button>
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

        {/* Legend */}
        <div className="flex items-center gap-5 mt-4 pt-3 overflow-x-auto scrollbar-hide" style={{ borderTop: '1px solid var(--border)' }}>
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
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Info size={40} className="mx-auto mb-2 text-[var(--text-muted)]" />
              <p className="text-[var(--text-secondary)] text-sm font-medium">{t.noData}</p>
            </div>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-xs">
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
                          title={`${col.label} to'lov`}
                        >
                          <span className="text-micro font-bold tracking-widest" style={{ color: 'var(--warning)' }}>{(col as any).payShort}</span>
                          <div className="text-2xs font-bold uppercase tracking-tighter" style={{ color: 'var(--warning)', opacity: 0.85 }}>To&apos;l</div>
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
                      title={`${col.label} (${col.group})` + (userRole === 'super_admin' ? ' (o\'ng tugma = tozalash)' : '')}
                      onContextMenu={(e) => {
                        if (userRole === 'super_admin' || userRole === 'admin') {
                          e.preventDefault();
                          handleClearColumn(col.key);
                        }
                      }}
                    >
                      <span className="text-micro font-extrabold uppercase tracking-wider transition-colors" style={{ color: st.text }}>
                        {col.short}
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
      {showStatsModal && createPortal(
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowStatsModal(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] flex flex-col dashboard-card !p-0 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-wider text-[var(--text)] flex items-center gap-2">
                    <span>Hisobotlar Topshirish Statistikasi</span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold"
                      style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
                      AVTO-YANGILANISH
                    </span>
                  </h3>
                  <p className="text-micro font-bold text-[var(--text-3)] mt-0.5">
                    {selectedPeriod} davri bo'yicha topshirilish holati
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowStatsModal(false)}
                className="p-2 rounded-xl text-[var(--text-3)] hover:bg-[var(--surface)] transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Overall Progress Large Banner */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-[var(--surface-2)] to-[var(--surface)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wider text-[var(--text-2)]">
                    Umumiy Bajarilish Ko'rsatkichi
                  </span>
                  <span className="text-2xl font-semibold tabular-nums text-[var(--primary)]">
                    {stats.exactPercent}%
                  </span>
                </div>
                <div className="w-full h-3 bg-[var(--border)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${stats.percent}%`,
                      background:
                        stats.percent >= 80
                          ? 'var(--success)'
                          : stats.percent >= 50
                          ? 'var(--warning)'
                          : 'var(--danger)',
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-xl" style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success)' }}>
                    <span className="text-micro font-bold uppercase tracking-wider block">Topshirildi</span>
                    <span className="text-base font-semibold tabular-nums">{stats.done} ta</span>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500">
                    <span className="text-micro font-bold uppercase tracking-wider block">Qolib ketgan (-)</span>
                    <span className="text-base font-semibold tabular-nums">{stats.notDone} ta</span>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                    <span className="text-micro font-bold uppercase tracking-wider block">Kartoteka</span>
                    <span className="text-base font-semibold tabular-nums">{stats.warning} ta</span>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500">
                    <span className="text-micro font-bold uppercase tracking-wider block">Topshirilishi kutilgan</span>
                    <span className="text-base font-semibold tabular-nums">{stats.totalRequired} ta</span>
                  </div>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold tracking-wider text-[var(--text-2)] flex items-center gap-2">
                  <PieChart size={16} className="text-[var(--primary)]" />
                  <span>Kategoriyalar bo'yicha % topshirilishi</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categoryProgress.map((cat) => (
                    <div
                      key={cat.category}
                      onClick={() => {
                        setFilterCategory(cat.category);
                        setShowStatsModal(false);
                      }}
                      className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--primary)] transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[var(--text)] group-hover:text-[var(--primary)]">
                          {cat.label}
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-[var(--primary)]">
                          {cat.percent}% ({cat.done}/{cat.total})
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${cat.percent}%`,
                            background:
                              cat.percent >= 80 ? 'var(--success)' : cat.percent >= 50 ? 'var(--warning)' : 'var(--danger)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Accountant Leaderboard Progress */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold tracking-wider text-[var(--text-2)] flex items-center gap-2">
                  <BarChart2 size={16} className="text-[var(--primary)]" />
                  <span>Buxgalterlar bo'yicha topshirish foizi (%)</span>
                </h4>
                <div className="space-y-2">
                  {accountantProgress.map((acc) => (
                    <div
                      key={acc.name}
                      onClick={() => {
                        setFilterAccountant(acc.name);
                        setShowStatsModal(false);
                      }}
                      className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--primary)] transition-all cursor-pointer flex items-center justify-between gap-4 group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-xs font-bold truncate text-[var(--text)] group-hover:text-[var(--primary)]">
                          {acc.name}
                        </span>
                        <div className="flex-1 max-w-[200px] h-2 bg-[var(--border)] rounded-full overflow-hidden hidden sm:block">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${acc.percent}%`,
                              background:
                                acc.percent >= 80 ? 'var(--success)' : acc.percent >= 50 ? 'var(--warning)' : 'var(--danger)',
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-micro font-mono text-[var(--text-3)]">
                          {acc.done}/{acc.total} bajarildi
                        </span>
                        <span className="text-xs font-semibold tabular-nums px-2.5 py-0.5 rounded-lg bg-[var(--surface)] text-[var(--primary)] border border-[var(--border)]">
                          {acc.percent}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-2)] flex justify-end">
              <button
                onClick={() => setShowStatsModal(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[var(--surface)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-all"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ReportProofModal
        state={proofModal}
        period={selectedPeriod}
        canReview={canReview}
        onClose={() => setProofModal(null)}
        onSubmitted={handleProofSubmitted}
        onReviewed={handleProofReviewed}
      />
    </div>
  );
};

export default OperationModule;
