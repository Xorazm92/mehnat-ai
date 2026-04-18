import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Company, OperationEntry, Language, Staff } from '../types';
import { createNotification, clearColumnForPeriod } from '../lib/supabaseData';
import { translations } from '../lib/translations';
import { ChevronDown, ChevronsUpDown, Download, Search, Filter, RefreshCw, Calendar, Loader2, Info } from 'lucide-react';
import { MonthPicker } from './ui/MonthPicker';
import { AVAILABLE_PERIODS, periodsEqual } from '../lib/periods';
import { toast } from 'sonner';
import { supabase } from '../lib/supabaseClient';


// ── Report Column Definitions ──────────────────────────────────
// isSplit columns have a paired _tolov key for the payment column
const REPORT_COLUMNS = [
  // ═══ OYLIK ═══
  { key: 'didox', label: 'Didox', short: 'DD', group: 'Oylik' },
  { key: 'xatlar', label: 'Xatlar', short: 'XT', group: 'Oylik' },
  { key: 'avtokameral', label: 'Avtokameral', short: 'AK', group: 'Oylik' },
  { key: 'my_mehnat', label: 'My Mehnat', short: 'MM', group: 'Oylik' },
  { key: 'one_c', label: '1C', short: '1C', group: 'Oylik' },
  { key: 'pul_oqimlari', label: 'Pul Oqimlari', short: 'PO', group: 'Oylik' },
  { key: 'chiqadigan_soliqlar', label: 'Chiq. Soliqlar', short: 'CS', group: 'Oylik' },
  { key: 'hisoblangan_oylik', label: 'His. Oylik', short: 'HO', group: 'Oylik' },
  { key: 'debitor_kreditor', label: 'Deb/Kred', short: 'DK', group: 'Oylik' },
  { key: 'foyda_va_zarar', label: 'Foyda/Zarar', short: 'FZ', group: 'Oylik' },
  { key: 'tovar_ostatka', label: 'Tovar Ost.', short: 'TO', group: 'Oylik' },

  // ═══ SOLIQLAR (Umumiy) ═══
  { key: 'yer_soligi', label: "Yer Solig'i", short: 'YS', group: 'Soliqlar' },
  { key: 'mol_mulk_soligi', label: "Mol-mulk Sol.", short: 'MS', group: 'Soliqlar' },
  { key: 'suv_soligi', label: "Suv Solig'i", short: 'SS', group: 'Soliqlar' },
  { key: 'bonak', label: "Bo'nak", short: 'BN', group: 'Soliqlar' },
  { key: 'aksiz_soligi', label: 'AKSIZ', short: 'AX', group: 'Soliqlar' },
  { key: 'nedro_soligi', label: 'NEDRO', short: 'ND', group: 'Soliqlar' },
  { key: 'norezident_foyda', label: 'Nor. Foyda', short: 'NF', group: 'Soliqlar' },
  { key: 'norezident_nds', label: 'Nor. NDS', short: 'NN', group: 'Soliqlar' },

  // ═══ SOLIQLAR (Hisobot + To'lov) ═══
  { key: 'aylanma_qqs', label: 'Aylanma Hisobot', short: 'AQh', group: 'Soliq H/T', isSplit: true, payKey: 'aylanma_qqs_tolov', payShort: 'AQt' },
  { key: 'daromad_soliq', label: 'DS Hisobot', short: 'DSh', group: 'Soliq H/T', isSplit: true, payKey: 'daromad_soliq_tolov', payShort: 'DSt' },
  { key: 'inps', label: 'INPS Hisobot', short: 'INh', group: 'Soliq H/T', isSplit: true, payKey: 'inps_tolov', payShort: 'INt' },
  { key: 'foyda_soliq', label: 'FS Hisobot', short: 'FSh', group: 'Soliq H/T', isSplit: true, payKey: 'foyda_soliq_tolov', payShort: 'FSt' },

  // ═══ YILLIK ═══
  { key: 'moliyaviy_natija', label: 'Mol. Natija', short: 'MN', group: 'Yillik' },
  { key: 'buxgalteriya_balansi', label: 'Bux. Balansi', short: 'BB', group: 'Yillik' },

  // ═══ STATISTIKA ═══
  { key: 'stat_12_invest', label: '12-invest', short: '12I', group: 'Statistika' },
  { key: 'stat_12_moliya', label: '12-moliya', short: '12M', group: 'Statistika' },
  { key: 'stat_12_korxona', label: '12-korxona', short: '12K', group: 'Statistika' },
  { key: 'stat_12_narx', label: '12-narx', short: '12N', group: 'Statistika' },
  { key: 'stat_4_invest', label: '4-invest', short: '4I', group: 'Statistika' },
  { key: 'stat_4_mehnat', label: '4-mehnat', short: '4M', group: 'Statistika' },
  { key: 'stat_4_korxona_miz', label: '4-korxona(miz)', short: '4KM', group: 'Statistika' },
  { key: 'stat_4_kb_qur_sav_xiz', label: '4-kb (q/s/x)', short: '4KB', group: 'Statistika' },
  { key: 'stat_4_kb_sanoat', label: '4-kb sanoat', short: '4KS', group: 'Statistika' },
  { key: 'stat_1_invest', label: '1-invest', short: '1I', group: 'Statistika' },
  { key: 'stat_1_ih', label: '1-ih', short: '1IH', group: 'Statistika' },
  { key: 'stat_1_energiya', label: '1-energiya', short: '1E', group: 'Statistika' },
  { key: 'stat_1_korxona', label: '1-korxona', short: '1KR', group: 'Statistika' },
  { key: 'stat_1_korxona_tif', label: '1-korxona(tif)', short: '1KT', group: 'Statistika' },
  { key: 'stat_1_moliya', label: '1-moliya', short: '1ML', group: 'Statistika' },
  { key: 'stat_1_akt', label: '1-akt', short: '1AK', group: 'Statistika' },

  // ═══ IT PARK ═══
  { key: 'itpark_oylik', label: 'IT Park Oylik', short: 'ITO', group: 'IT Park' },
  { key: 'itpark_chorak', label: 'IT Park Chorak', short: 'ITC', group: 'IT Park' },

  // ═══ KOMUNALKA ═══
  { key: 'kom_suv', label: 'Suv', short: 'S💧', group: 'Komunalka' },
  { key: 'kom_gaz', label: 'Gaz', short: 'G🔥', group: 'Komunalka' },
  { key: 'kom_svet', label: 'Svet', short: 'E⚡', group: 'Komunalka' },
] as const;

type ReportColumnKey = typeof REPORT_COLUMNS[number]['key'];

// ── Status Rendering ───────────────────────────────────────────
const getStatusStyle = (value: string) => {
  const v = String(value || '').trim().toLowerCase();

  if (!v || v === '0' || v === 'not_required') return { bg: 'bg-[#F8F9FA] dark:bg-[#2A2D33]', text: 'text-[#ADB5BD] dark:text-[#6C757D]', icon: '—', tooltip: "Bo'sh" };
  if (v === '+' || v === 'accepted') return { bg: 'bg-[#EBFBF0] dark:bg-[#1C2F23]', text: 'text-[#28A745] dark:text-[#34D058]', icon: '✓', tooltip: 'Bajarildi (+)' };
  if (v === '-' || v === 'not_submitted') return { bg: 'bg-[#FEEBF0] dark:bg-[#311C21]', text: 'text-[#DC3545] dark:text-[#FF6B6B]', icon: '✗', tooltip: 'Bajarilmadi (-)' };
  if (v === 'topshirildi' || v === 'submitted') return { bg: 'bg-[#EBF5FF] dark:bg-[#1C2531]', text: 'text-[#007BFF] dark:text-[#4DA3FF]', icon: '⏳', tooltip: 'Topshirildi (Kutilmoqda)' };
  if (v === 'kartoteka' || v === 'blocked') return { bg: 'bg-[#FFF9EB] dark:bg-[#312B1C]', text: 'text-[#FFC107] dark:text-[#FFD700]', icon: '!', tooltip: 'Kartoteka' };
  if (v === 'error' || v === 'oshibka') return { bg: 'bg-[#FEEBF0]', text: 'text-[#DC3545]', icon: '!', tooltip: 'Xatolik' };

  return { bg: 'bg-[#EBF5FF] dark:bg-[#1C2531]', text: 'text-[#007BFF] dark:text-[#4DA3FF]', icon: value, tooltip: value };
};

const AVAILABLE_STATUSES = [
  { value: '+', label: 'Tasdiqlash (✓)', icon: '✓', color: 'text-[#28A745]' },
  { value: 'topshirildi', label: 'Topshirildi (⏳)', icon: '⏳', color: 'text-[#007BFF]' },
  { value: '-', label: 'Bajarilmadi (-)', icon: '✗', color: 'text-[#DC3545]' },
  { value: 'kartoteka', label: 'Kartoteka', icon: '!', color: 'text-[#FFC107]' },
  { value: 'izoh', label: 'Matn yozish...', icon: '✎', color: 'text-[#3366CC]' },
  { value: '0', label: 'Tozalash', icon: '—', color: 'text-[#ADB5BD]' },
];

interface StatusCellProps {
  value: string;
  onUpdate: (newValue: string) => void;
  readOnly?: boolean;
  userRole: string;
}

const StatusCell = React.memo<StatusCellProps>(({ value, onUpdate, readOnly, userRole }) => {
  const style = getStatusStyle(value);
  const [isOpen, setIsOpen] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

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

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (statusValue: string) => {
    if (statusValue === 'izoh') {
      setInputValue(value === '0' || value === '+' || value === '-' ? '' : value);
      setShowInput(true);
      return;
    }

    let finalValue = statusValue;

    // Role-based logic: Accountant cannot set "+" directly, it becomes "topshirildi"
    if (userRole === 'accountant' && statusValue === '+') {
      finalValue = 'topshirildi';
    }

    onUpdate(finalValue);
    setIsOpen(false);
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
    <div className="flex items-center justify-center w-full h-full p-0.5">
      <button
        ref={buttonRef}
        onClick={() => !readOnly && setIsOpen(!isOpen)}
        disabled={readOnly}
        className={`w-full h-6 min-w-[24px] px-1 rounded-sm flex items-center justify-center text-[10px] font-bold transition-all border border-black/5 dark:border-white/5 ${style.bg} ${style.text} hover:opacity-80 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
        title={style.tooltip}
      >
        <span className="truncate w-full text-center block uppercase">{style.icon}</span>
      </button>

      {isOpen && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            top: coords.top + 2,
            left: coords.left,
            transform: 'translateX(-50%)'
          }}
          className="z-[9999] min-w-[180px] bg-white dark:bg-[#22252B] p-1 shadow-md border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm"
        >
          {!showInput ? (
            <div className="grid grid-cols-1">
              {AVAILABLE_STATUSES.map((status) => (
                <button
                  key={status.value}
                  onClick={() => handleSelect(status.value)}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-[#F8F9FA] dark:hover:bg-[#2A2D33] transition-colors w-full text-left group"
                >
                  <span className={`font-bold text-xs w-5 h-5 flex items-center justify-center rounded-sm bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 ${status.color}`}>{status.icon}</span>
                  <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 group-hover:text-[#3366CC]">{status.label}</span>
                  {value === status.value && <div className="ml-auto w-1 h-1 rounded-full bg-[#3366CC]"></div>}
                </button>
              ))}
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
                <button type="button" onClick={() => setShowInput(false)} className="c1-btn c1-btn-secondary flex-1 py-1 px-2 text-[10px]">Bekor</button>
                <button type="submit" className="c1-btn c1-btn-primary flex-1 py-1 px-2 text-[10px]">Saqlash</button>
              </div>
            </form>
          )}

        </div>,
        document.body
      )}
    </div>
  );
}, (prev, next) => prev.value === next.value && prev.readOnly === next.readOnly);

// ── Memoized Table Row ─────────────────────────────────────────
const OperationRow = React.memo<{
  row: ReportRow;
  idx: number;
  visibleColumns: typeof REPORT_COLUMNS;
  userRole: string;
  activeServices: string[];
  onCellUpdate: (companyId: string, colKey: string, newValue: string) => void;
  onCompanySelect: (companyId: string) => void;
}>(({ row, idx, visibleColumns, userRole, activeServices, onCellUpdate, onCompanySelect }) => {
  const isServiceEnabled = (key: string) => !activeServices.length || activeServices.includes(key);

  return (
    <tr className="group hover:bg-[#F2F7FF] dark:hover:bg-[#2A2D33] transition-colors border-b border-[#DEE2E6] dark:border-[#3A3D44]">
      <td className="sticky left-0 z-20 bg-[#F8F9FA] dark:bg-[#1e2025] border-r border-[#DEE2E6] dark:border-[#3A3D44] px-2 py-1 text-center text-[10px] font-bold text-gray-500 w-10 min-w-[40px]">
        {idx + 1}
      </td>
      <td
        className="sticky left-10 z-20 bg-white dark:bg-[#22252B] group-hover:bg-[#F2F7FF] dark:group-hover:bg-[#2A2D33] border-r border-[#DEE2E6] dark:border-[#3A3D44] px-2 py-1 transition-colors w-48 min-w-[192px] cursor-pointer"
        onClick={() => row.companyId && onCompanySelect(row.companyId as string)}
      >
        <div className="max-w-[180px] truncate text-[11px] font-bold text-gray-800 dark:text-gray-200 group-hover:text-[#3366CC]" title={row.name}>
          {row.name}
        </div>
      </td>
      <td className="md:sticky md:left-[232px] z-20 bg-white dark:bg-[#22252B] group-hover:bg-[#F2F7FF] dark:group-hover:bg-[#2A2D33] border-r border-[#DEE2E6] dark:border-[#3A3D44] px-1 py-1 text-center text-[10px] font-bold text-gray-500 w-20 min-w-[80px]">
        {row.inn || '—'}
      </td>
      <td className="md:sticky md:left-[312px] z-20 bg-white dark:bg-[#22252B] group-hover:bg-[#F2F7FF] dark:group-hover:bg-[#2A2D33] border-r-2 border-[#ADB5BD] dark:border-[#495057] px-1 py-1 transition-colors w-24 min-w-[96px]">
        <div className="max-w-[90px] truncate text-[10px] font-bold text-gray-600 dark:text-gray-400" title={row.accountant}>
          {row.accountant || '—'}
        </div>
      </td>
      {visibleColumns.map(col => {
        const isReadOnly = !row.companyId || (userRole !== 'super_admin' && userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'accountant');
        const serviceDisabled = !isServiceEnabled(col.key);

        if ((col as any).isSplit) {
          const payKey = (col as any).payKey as string;
          const payDisabled = !isServiceEnabled(payKey);
          return (
            <React.Fragment key={col.key}>
              <td className={`border-r border-[#DEE2E6] dark:border-[#3A3D44] px-0.5 py-0.5 text-center h-8 ${serviceDisabled ? 'bg-[#F8F9FA] dark:bg-[#2A2D33]' : 'bg-[#EBFBF0] dark:bg-[#1C2F23]'}`}>
                {serviceDisabled ? (
                  <span className="text-[9px] text-gray-300 dark:text-gray-600">—</span>
                ) : (
                  <StatusCell
                    value={String(row[col.key] || '')}
                    onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId, col.key, newValue)}
                    readOnly={isReadOnly}
                    userRole={userRole}
                  />
                )}
              </td>
              <td className={`border-r border-[#DEE2E6] dark:border-[#3A3D44] px-0.5 py-0.5 text-center h-8 ${payDisabled ? 'bg-[#F8F9FA] dark:bg-[#2A2D33]' : 'bg-[#FFF9EB] dark:bg-[#312B1C]'}`}>
                {payDisabled ? (
                  <span className="text-[9px] text-gray-300 dark:text-gray-600">—</span>
                ) : (
                  <StatusCell
                    value={String(row[payKey] || '')}
                    onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId, payKey, newValue)}
                    readOnly={isReadOnly}
                    userRole={userRole}
                  />
                )}
              </td>
            </React.Fragment>
          );
        }

        return (
          <td key={col.key} className={`border-r border-[#DEE2E6] dark:border-[#3A3D44] px-0.5 py-0.5 text-center h-8 ${serviceDisabled ? 'bg-[#F8F9FA] dark:bg-[#2A2D33]' : ''}`}>
            {serviceDisabled ? (
              <span className="text-[9px] text-gray-300 dark:text-gray-600">—</span>
            ) : (
              <StatusCell
                value={String(row[col.key] || '')}
                onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId, col.key, newValue)}
                readOnly={isReadOnly}
                userRole={userRole}
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
}

interface ReportRow {
  index: number;
  name: string;
  inn: string;
  accountant: string;
  taxType: string;
  login: string;
  password: string;
  activeServices: string[];
  [key: string]: string | number | string[];
}

// ── Main Component ─────────────────────────────────────────────
const OperationModule: React.FC<Props> = ({
  companies,
  operations,
  selectedPeriod,
  lang,
  onUpdate,
  staff = [],
  activeFilter = 'all',
  onPeriodChange,
  onBatchUpdate,
  onCompanySelect,
  userRole,
  currentUserId,
  userName
}) => {
  const t = translations[lang as keyof typeof translations];
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterAccountant, setFilterAccountant] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 100;

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
        accountant: op?.assigned_accountant_name || comp.accountantName || '—',
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
  }, [companies, operations, selectedPeriod]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Removed data loading logic for obsolete formats.


  // ── Handle Cell Update ───────────────────────────────────────
  const handleCellUpdate = useCallback(async (companyId: string, colKey: string, newValue: string) => {
    // 1. Optimistic Update
    setRows(prevRows => prevRows.map(row => {
      if (row.companyId === companyId) {
        return { ...row, [colKey]: newValue };
      }
      return row;
    }));

    try {
      skipNextSyncRef.current = true;
      const company = companiesRef.current.find(c => c.id === companyId);
      const { error } = await supabase
        .from('company_monthly_reports')
        .upsert({
          company_id: companyId,
          period: selectedPeriod,
          [colKey]: newValue,
          assigned_accountant_id: company?.accountantId || null,
          assigned_accountant_name: userNameRef.current || company?.accountantName || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'company_id,period' });

      if (error) throw error;

      onUpdate({ companyId, period: selectedPeriod, [colKey]: newValue });

      // Notifications logic (non-blocking)
      const activeUserName = userNameRef.current || 'Buxgalter';
      const colLabel = REPORT_COLUMNS.find(c => c.key === colKey)?.label || colKey;
      const supervisors = (staffRef.current || []).filter(s => s.role === 'supervisor' || s.role === 'super_admin');

      for (const supervisor of supervisors) {
        if (supervisor.id === currentUserIdRef.current) continue;

        let title = 'Yangi amal bajarildi';
        let message = `${activeUserName} "${company?.name}" firmasining "${colLabel}" holatini "${newValue}" qilib o'zgartirdi.`;

        if (newValue === 'topshirildi') {
          title = 'Tasdiqlash kutilmoqda ⏳';
          message = `${activeUserName} "${company?.name}" firmasining "${colLabel}" vazifasini topshirdi. Iltimos, tekshirib tasdiqlang.`;
        } else if (newValue === '+') {
          title = 'Vazifa tasdiqlandi ✅';
          message = `${company?.name}: "${colLabel}" vazifasini ${activeUserName} tasdiqladi.`;
        }

        createNotification({
          userId: supervisor.id,
          type: 'approval_request',
          title: title,
          message: message,
          link: '/reports'
        });
      }

    } catch (e: any) {
      console.error('Update error:', e);
      toast.error('Saqlashda xatolik!');
    }
  }, [selectedPeriod, onUpdate]); // Minimal dependencies

  // ── Handle Column Clear (Superadmin only) ─────────────────────
  const handleClearColumn = useCallback(async (colKey: string) => {
    if (userRole !== 'super_admin') return;
    const colLabel = REPORT_COLUMNS.find(c => c.key === colKey)?.label || colKey;
    if (!window.confirm(`Haqiqatdan ham "${colLabel}" ustunini "${selectedPeriod}" oy uchun tozalab tashlamoqchimisiz?`)) return;

    try {
      skipNextSyncRef.current = true;
      setRows(prev => prev.map(r => ({ ...r, [colKey]: '' })));
      await clearColumnForPeriod(selectedPeriod, colKey);
      await onUpdate({});
      toast.success('Ustun tozalandi');
    } catch (e) {
      console.error(e);
      toast.error('Xatolik yuz berdi');
    }
  }, [selectedPeriod, userRole, onUpdate]);

  // ── Computed data ────────────────────────────────────────────
  const accountants = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.accountant) set.add(r.accountant); });
    return [...set].sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        if (!r.name.toLowerCase().includes(s) && !r.inn.includes(s) && !r.accountant.toLowerCase().includes(s)) return false;
      }
      if (filterAccountant !== 'all' && r.accountant !== filterAccountant) return false;
      return true;
    });
  }, [rows, debouncedSearch, filterAccountant]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage]);

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);

  // Reset page on search/filter
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterAccountant, filterGroup, selectedPeriod]);

  const visibleColumns = useMemo(() => {
    if (filterGroup === 'all') return [...REPORT_COLUMNS];
    return REPORT_COLUMNS.filter(c => c.group === filterGroup);
  }, [filterGroup]);

  // Stats
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
    return { done, notDone, na, warning, text };
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
    <div className="flex flex-col h-full bg-[#F0F2F5] dark:bg-[#1A1D23]">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white dark:bg-[#22252B] border-b border-[#DEE2E6] dark:border-[#3A3D44] px-4 py-2 z-40 shadow-sm transition-all duration-300">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold text-gray-800 dark:text-white uppercase tracking-tight">{t.matrixTitle}</h1>
              <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">
                {filteredRows.length} / {rows.length} {t.taKorxona} · {selectedPeriod}
              </p>
            </div>
            {/* Mini Stats */}
            <div className="hidden lg:flex items-center gap-2">
              {[
                { icon: '✓', count: stats.done, color: 'blue' },
                { icon: '✗', count: stats.notDone, color: 'red' },
                { icon: '!', count: stats.warning, color: 'amber' },
                { icon: '✎', count: stats.text, color: 'blue' },
              ].map(s => (
                <div key={s.icon} className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-[#F8F9FA] dark:bg-[#2A2D33] border border-[#DEE2E6] dark:border-[#3A3D44]">
                  <span className={`${s.color === 'blue' ? 'text-[#3366CC]' : s.color === 'red' ? 'text-[#DC3545]' : 'text-[#FFC107]'} font-bold text-[10px]`}>{s.icon}</span>
                  <span className="text-gray-800 dark:text-gray-200 font-bold text-[10px] tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder} className="c1-input w-40 pl-8" />
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>

            {/* Accountant Filter */}
            <div className="relative">
              <select value={filterAccountant} onChange={e => setFilterAccountant(e.target.value)}
                className="c1-input pr-6 cursor-pointer text-[11px]">
                <option value="all">{t.allAccountants}</option>
                {accountants.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Group Filter */}
            <div className="relative">
              <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
                className="c1-input pr-6 cursor-pointer text-[11px]">
                <option value="all">{t.allColumns}</option>
                {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Period Selector */}
            <MonthPicker
              selectedPeriod={selectedPeriod}
              onChange={(p) => onPeriodChange?.(p)}
              className="z-20"
            />

            <button onClick={handleExport} className="c1-btn c1-btn-secondary px-3 py-1.5 flex items-center gap-2 uppercase tracking-tight">
              <Download size={12} /> Excel
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-[#DEE2E6] dark:border-[#3A3D44] overflow-x-auto scrollbar-hide">
          {[
            { icon: '✓', label: `${t.approved} (+)` },
            { icon: '✗', label: `${t.rejected} (-)` },
            { icon: '—', label: `${t.not_required} (0)` },
            { icon: '⏳', label: t.pending },
            { icon: '!', label: t.kartoteka },
            { icon: '✎', label: t.comment },
            { icon: 'Xis.', label: t.reportLegend },
            { icon: 'To\'l', label: t.paymentLegend },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5 shrink-0">
              <span className={`font-bold text-[10px] w-4 h-4 flex items-center justify-center rounded-sm bg-[#F8F9FA] dark:bg-[#2A2D33] border border-[#DEE2E6] dark:border-[#495057] text-gray-500`}>{l.icon}</span>
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tighter">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Matrix ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto relative rounded-sm bg-white dark:bg-[#1e2025] mx-4 my-2 shadow-sm border border-[#DEE2E6] dark:border-[#3A3D44]">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={28} className="animate-spin text-blue-500" />
              <span className="text-xs text-gray-500">{t.loading}</span>
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Info size={40} className="mx-auto mb-2 text-gray-300" />
              <p className="text-gray-500 text-sm font-medium">{t.noData}</p>
            </div>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-[60]">
              {/* Group row */}
              <tr className="h-6">
                <th colSpan={4} className="sticky top-0 left-0 z-[80] bg-[#F8F9FA] dark:bg-[#1e2025] border-b border-r-2 border-[#ADB5BD] dark:border-[#495057] px-2 py-1 text-left text-[9px] font-bold text-gray-500 uppercase tracking-widest w-[408px] min-w-[408px]">
                  {t.firmTable}
                </th>
                {(() => {
                  const groupCounts = new Map<string, number>();
                  visibleColumns.forEach(c => {
                    const visualCols = (c as any).isSplit ? 2 : 1;
                    groupCounts.set(c.group, (groupCounts.get(c.group) || 0) + visualCols);
                  });

                  const groupColors: Record<string, string> = {
                    'Oylik': 'bg-[#F2F7FF] dark:bg-[#1C2531] text-[#3366CC]',
                    'Soliqlar': 'bg-[#FFF9EB] dark:bg-[#312B1C] text-[#FFC107]',
                    'Soliq H/T': 'bg-[#FBF2FF] dark:bg-[#2B1C31] text-[#9933CC]',
                    'Yillik': 'bg-[#F2FFF7] dark:bg-[#1C3123] text-[#28A745]',
                    'Statistika': 'bg-[#F2FEFF] dark:bg-[#1C3131] text-[#17A2B8]',
                    'IT Park': 'bg-[#F7F2FF] dark:bg-[#231C31] text-[#6F42C1]',
                    'Komunalka': 'bg-[#FFF2F2] dark:bg-[#311C1C] text-[#DC3545]',
                  };

                  return [...groupCounts.entries()].map(([name, count]) => (
                    <th key={name} colSpan={count} className={`sticky top-0 border-b border-r border-[#DEE2E6] dark:border-[#3A3D44] px-1 py-1 text-center text-[9px] font-bold uppercase tracking-wider ${groupColors[name] || 'bg-gray-100 text-gray-500'}`}>
                      {name}
                    </th>
                  ));
                })()}
              </tr>
              {/* Column header row */}
              <tr className="h-8">
                <th className="sticky top-[24px] left-0 z-[70] bg-[#F8F9FA] dark:bg-[#1e2025] border-b border-r border-[#DEE2E6] dark:border-[#3A3D44] px-2 py-2 text-center text-[10px] font-bold text-gray-500 w-10 min-w-[40px]">#</th>
                <th className="sticky top-[24px] left-10 z-[70] bg-[#F8F9FA] dark:bg-[#1e2025] border-b border-r border-[#DEE2E6] dark:border-[#3A3D44] px-2 py-2 text-left text-[10px] font-bold text-gray-700 dark:text-gray-300 w-48 min-w-[192px] uppercase">{t.companyName}</th>
                <th className="md:sticky md:top-[24px] md:left-[232px] z-[70] bg-[#F8F9FA] dark:bg-[#1e2025] border-b border-r border-[#DEE2E6] dark:border-[#3A3D44] px-1.5 py-2 text-center text-[10px] font-bold text-gray-500 w-20 min-w-[80px]">INN</th>
                <th className="md:sticky md:top-[24px] md:left-[312px] z-[70] bg-[#F8F9FA] dark:bg-[#1e2025] border-b border-r-2 border-[#ADB5BD] dark:border-[#495057] px-1.5 py-2 text-left text-[10px] font-bold text-gray-500 w-24 min-w-[96px] uppercase">BUXGALTER</th>
                {visibleColumns.map(col => {
                  if ((col as any).isSplit) {
                    return (
                      <React.Fragment key={col.key}>
                        <th
                          className="sticky top-[24px] bg-[#EBFBF0] dark:bg-[#1C2F23] border-b border-r border-[#DEE2E6] dark:border-[#3A3D44] px-0.5 py-2 text-center w-10 text-[9px] cursor-help"
                          title={col.label}
                        >
                          <span className="text-[9px] font-bold text-[#28A745] dark:text-[#34D058] tracking-widest">{col.short}</span>
                          <div className="text-[7px] font-bold text-[#28A745]/70 uppercase tracking-tighter">Xis.</div>
                        </th>
                        <th
                          className="sticky top-[24px] bg-[#FFF9EB] dark:bg-[#312B1C] border-b border-r border-[#DEE2E6] dark:border-[#3A3D44] px-0.5 py-2 text-center w-10 cursor-help"
                          title={`${col.label} to'lov`}
                        >
                          <span className="text-[9px] font-bold text-[#FFC107] dark:text-[#FFD700] tracking-widest">{(col as any).payShort}</span>
                          <div className="text-[7px] font-bold text-[#FFC107]/70 uppercase tracking-tighter">To'l</div>
                        </th>
                      </React.Fragment>
                    );
                  }
                  return (
                    <th
                      key={col.key}
                      className="sticky top-[24px] bg-white dark:bg-[#22252B] border-b border-r border-[#DEE2E6] dark:border-[#3A3D44] px-0.5 py-2 text-center w-10 hover:bg-[#F8F9FA] dark:hover:bg-[#2A2D33] transition-colors cursor-help group/header"
                      title={col.label + (userRole === 'super_admin' ? ' (o\'ng tugma = tozalash)' : '')}
                      onContextMenu={(e) => {
                        if (userRole === 'super_admin' || userRole === 'admin') {
                          e.preventDefault();
                          handleClearColumn(col.key);
                        }
                      }}
                    >
                      <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest group-hover/header:text-[#3366CC] transition-colors">
                        {col.short}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => (
                <OperationRow
                  key={row.companyId}
                  row={row}
                  idx={row.index - 1}
                  visibleColumns={visibleColumns}
                  userRole={userRole}
                  activeServices={row.activeServices}
                  onCellUpdate={handleCellUpdate}
                  onCompanySelect={(id) => {
                    const comp = companies.find(c => c.id === id);
                    if (comp) onCompanySelect(comp);
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-[#DEE2E6] dark:border-[#3A3D44] bg-white dark:bg-[#22252B] px-6 py-2 mt-auto shadow-inner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-sm bg-[#3366CC]/50"></span>
              <span>{t.totalFirms}: <strong className="text-gray-900 dark:text-white">{filteredRows.length}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-sm bg-[#007AFF]/50"></span>
              <span><strong>{visibleColumns.length}</strong> {t.reports.toLowerCase()}</span>
            </div>
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-800"></div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-widest opacity-70">SINXRON:</span>
              <strong className="text-[#3366CC] dark:text-[#4DA3FF]">AKTIV</strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCurrentPage(p => Math.max(1, p - 1));
                const matrix = document.querySelector('.overflow-auto');
                if (matrix) matrix.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={currentPage === 1}
              className="c1-btn c1-btn-secondary px-3 py-1.5 text-[10px] flex items-center gap-1 uppercase tracking-widest"
            >
              ← Oldingi
            </button>

            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#F8F9FA] dark:bg-[#2A2D33] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm">
              <span className="text-[10px] font-bold text-gray-900 dark:text-white tabular-nums">
                {currentPage}
              </span>
              <span className="text-[10px] font-bold text-gray-400">/</span>
              <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                {totalPages || 1}
              </span>
            </div>

            <button
              onClick={() => {
                setCurrentPage(p => Math.min(totalPages, p + 1));
                const matrix = document.querySelector('.overflow-auto');
                if (matrix) matrix.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={currentPage === totalPages || totalPages === 0}
              className="c1-btn c1-btn-primary px-3 py-1.5 text-[10px] flex items-center gap-1 uppercase tracking-widest"
            >
              Keyingi →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationModule;
