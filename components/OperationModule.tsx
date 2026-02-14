import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Company, OperationEntry, Language, Staff } from '../types';
import { createNotification, clearColumnForPeriod } from '../lib/supabaseData';
import { translations } from '../lib/translations';
import { ChevronDown, ChevronsUpDown, Download, Search, Filter, RefreshCw, Calendar, Loader2, Info } from 'lucide-react';
import { MonthPicker } from './ui/MonthPicker';
import { AVAILABLE_PERIODS } from '../lib/periods';
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
  { key: 'aylanma_qqs', label: 'AQ Hisobot', short: 'AQh', group: 'Soliq H/T', isSplit: true, payKey: 'aylanma_qqs_tolov', payShort: 'AQt' },
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

  if (!v || v === '0') return { bg: 'bg-slate-100 dark:bg-slate-800/60', text: 'text-slate-400 dark:text-slate-500', icon: '—', tooltip: "Bo'sh" };
  if (v === '+') return { bg: 'bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-400', icon: '✓', tooltip: 'Bajarildi (+)' };
  if (v === '-') return { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', icon: '✗', tooltip: 'Bajarilmadi (-)' };
  if (v === 'topshirildi') return { bg: 'bg-blue-500/20 animate-pulse', text: 'text-blue-700 dark:text-blue-400', icon: '⏳', tooltip: 'Topshirildi (Kutilmoqda)' };

  if (v.includes('kartoteka')) return { bg: 'bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400', icon: 'Kartoteka', tooltip: 'Kartoteka' };

  // Custom text for any other value -> Blue
  return { bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300', icon: value, tooltip: value };
};

const AVAILABLE_STATUSES = [
  { value: '+', label: 'Tasdiqlash (✓)', icon: '✓', color: 'text-emerald-600' },
  { value: 'topshirildi', label: 'Topshirildi (⏳)', icon: '⏳', color: 'text-blue-600' },
  { value: '-', label: 'Bajarilmadi (-)', icon: '✗', color: 'text-rose-600' },
  { value: 'kartoteka', label: 'Kartoteka', icon: '⚠', color: 'text-amber-600' },
  { value: 'izoh', label: 'Matn yozish...', icon: '📝', color: 'text-blue-600' },
  { value: '0', label: 'Tozalash', icon: '—', color: 'text-slate-400' },
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
        className={`w-full h-7 min-w-[28px] px-1 rounded-md flex items-center justify-center text-[11px] font-bold transition-all duration-200 ${style.bg} ${style.text} hover:scale-[1.02] hover:shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ring-offset-1 focus:ring-2 ring-blue-500/30 outline-none overflow-hidden`}
        title={style.tooltip}
      >
        <span className="truncate w-full text-center block">{style.icon}</span>
      </button>

      {isOpen && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            top: coords.top + 5,
            left: coords.left,
            transform: 'translateX(-50%)'
          }}
          className="z-[9999] min-w-[180px] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-1.5 animate-in fade-in zoom-in-95 duration-100 origin-top"
        >
          {!showInput ? (
            <div className="grid grid-cols-1 gap-0.5">
              {AVAILABLE_STATUSES.map((status) => (
                <button
                  key={status.value}
                  onClick={() => handleSelect(status.value)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors w-full text-left group"
                >
                  <span className={`font-black text-xs w-5 text-center ${status.color}`}>{status.icon}</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">{status.label}</span>
                  {value === status.value && <span className="ml-auto text-blue-500 text-[10px]">●</span>}
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={handleCustomSubmit} className="p-1">
              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Matn kiriting..."
                className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 mb-2"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowInput(false)} className="flex-1 px-2 py-1.5 text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200">Bekor qilish</button>
                <button type="submit" className="flex-1 px-2 py-1.5 text-[10px] font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-500/30">Saqlash</button>
              </div>
            </form>
          )}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-gray-800 border-t border-l border-gray-100 dark:border-gray-700 transform rotate-45 rounded-[1px]" />
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
}>(({ row, idx, visibleColumns, userRole, activeServices, onCellUpdate }) => {
  // If activeServices is non-empty, only those keys are enabled
  const isServiceEnabled = (key: string) => !activeServices.length || activeServices.includes(key);

  return (
    <tr className="group hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors border-b border-gray-100 dark:border-gray-800/40">
      <td className="sticky left-0 z-20 bg-white dark:bg-gray-900 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/30 border-r border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center text-[10px] font-mono text-gray-400 transition-colors w-10 min-w-[40px]">
        {idx + 1}
      </td>
      <td className="sticky left-10 z-20 bg-white dark:bg-gray-900 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/30 border-r border-gray-200 dark:border-gray-700 px-2 py-1.5 transition-colors w-48 min-w-[192px]">
        <div className="max-w-[180px] truncate text-[11px] font-semibold text-gray-900 dark:text-gray-100" title={row.name}>
          {row.name}
        </div>
      </td>
      <td className="sticky left-[232px] z-20 bg-white dark:bg-gray-900 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/30 border-r border-gray-200 dark:border-gray-700 px-1 py-1.5 text-center text-[10px] font-mono text-gray-500 transition-colors w-20 min-w-[80px]">
        {row.inn || '—'}
      </td>
      <td className="sticky left-[312px] z-20 bg-white dark:bg-gray-900 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/30 border-r-2 border-gray-200 dark:border-gray-700 px-1 py-1.5 transition-colors w-24 min-w-[96px]">
        <div className="max-w-[90px] truncate text-[10px] font-medium text-gray-600 dark:text-gray-400" title={row.accountant}>
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
              <td className={`border-r border-gray-100 dark:border-gray-800/30 px-0.5 py-0.5 text-center h-8 ${serviceDisabled ? 'bg-gray-100 dark:bg-gray-800/50' : 'bg-emerald-50/30 dark:bg-emerald-950/10'}`}>
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
              <td className={`border-r border-gray-100 dark:border-gray-800/30 px-0.5 py-0.5 text-center h-8 ${payDisabled ? 'bg-gray-100 dark:bg-gray-800/50' : 'bg-amber-50/30 dark:bg-amber-950/10'}`}>
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
          <td key={col.key} className={`border-r border-gray-100 dark:border-gray-800/30 px-0.5 py-0.5 text-center h-8 ${serviceDisabled ? 'bg-gray-100 dark:bg-gray-800/50' : ''}`}>
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
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterAccountant, setFilterAccountant] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  // Stable refs for background logic to prevent callback churn
  const companiesRef = useRef(companies);
  const staffRef = useRef(staff);
  const userNameRef = useRef(userName);
  const currentUserIdRef = useRef(currentUserId);

  useEffect(() => { companiesRef.current = companies; }, [companies]);
  useEffect(() => { staffRef.current = staff; }, [staff]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);

  // ── Build Rows from DB Props (companies + operations) ──────────
  // ── Build Rows from DB Props (companies + operations) ──────────
  useEffect(() => {
    // Optimization: Create a map of current period's operations for O(1) lookup
    const opsMap = new Map<string, OperationEntry>();
    operations.forEach(op => {
      if (op.period === selectedPeriod) {
        opsMap.set(op.companyId, op);
      }
    });

    const newRows: ReportRow[] = companies.map((comp, index) => {
      const op = opsMap.get(comp.id);

      const row: ReportRow = {
        index: index + 1,
        name: comp.name,
        inn: comp.inn,
        accountant: comp.accountantName || '—',
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
          // Default values based on logic? Or just empty strings/0?
          // If no operation entry exists, it means nothing happened yet.
          // Show '0' or empty?
          // Existing logic showed '0' for empty.
          row[col.key] = ''; // Empty string lets StatusCell decide (it handles empty as '—')
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
    const colLabel = REPORT_COLUMNS.find(c => c.key === colKey)?.label || colKey;
    if (!confirm(`"${colLabel}" ustunidagi barcha ma'lumotlarni "${selectedPeriod}" oy uchun o'chirmoqchimisiz?`)) return;

    try {
      await clearColumnForPeriod(selectedPeriod, colKey);
      // Optimistic: clear locally
      setRows(prev => prev.map(row => ({ ...row, [colKey]: '' })));
      await onUpdate({});
      toast.success(`"${colLabel}" ustuni tozalandi!`);
    } catch (e) {
      console.error('Clear column error:', e);
      toast.error('Tozalashda xatolik!');
    }
  }, [selectedPeriod, onUpdate]);

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
  }, [debouncedSearch, filterAccountant, filterGroup]);

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
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-gray-950 dark:to-blue-950/10">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200/80 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl px-5 py-3.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">Operatsiyalar Matritsasi</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {filteredRows.length} / {rows.length} ta korxona · {selectedPeriod}
              </p>
            </div>
            {/* Mini Stats */}
            <div className="hidden lg:flex items-center gap-2">
              {[
                { icon: '✓', count: stats.done, color: 'emerald' },
                { icon: '✗', count: stats.notDone, color: 'red' },
                { icon: '⚠', count: stats.warning, color: 'amber' },
                { icon: '📝', count: stats.text, color: 'blue' },
              ].map(s => (
                <div key={s.icon} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg bg-${s.color}-50 dark:bg-${s.color}-500/10`}>
                  <span className={`text-${s.color}-600 dark:text-${s.color}-400 font-black text-xs`}>{s.icon}</span>
                  <span className={`text-${s.color}-700 dark:text-${s.color}-300 font-bold text-[11px]`}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Qidirish..." className="pl-8 pr-3 py-1.5 w-48 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>

            {/* Accountant Filter */}
            <div className="relative">
              <select value={filterAccountant} onChange={e => setFilterAccountant(e.target.value)}
                className="appearance-none pl-2.5 pr-7 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer">
                <option value="all">Barcha buxgalterlar</option>
                {accountants.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Group Filter */}
            <div className="relative">
              <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
                className="appearance-none pl-2.5 pr-7 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer">
                <option value="all">Barcha ustunlar</option>
                {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Period Selector */}
            {/* Period Selector */}
            <MonthPicker
              selectedPeriod={selectedPeriod}
              onChange={(p) => onPeriodChange?.(p)}
              className="z-20"
            />

            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-95">
              <Download size={14} /> Export
            </button>


          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-gray-100 dark:border-gray-800">
          {[
            { icon: '✓', label: 'Bajarildi (+)', cls: 'text-emerald-600' },
            { icon: '✗', label: 'Bajarilmadi (-)', cls: 'text-red-600' },
            { icon: '—', label: 'Bo\'sh (0)', cls: 'text-gray-400' },
            { icon: '⏳', label: 'Kutilmoqda', cls: 'text-blue-600 animate-pulse' },
            { icon: '⚠', label: 'Kartoteka', cls: 'text-amber-600' },
            { icon: '📝', label: 'Matn', cls: 'text-blue-600' },
            { icon: 'Xis.', label: 'Hisobot', cls: 'text-emerald-600 font-mono' },
            { icon: 'To\'l', label: 'To\'lov', cls: 'text-amber-600 font-mono' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <span className={`font-black text-xs ${l.cls}`}>{l.icon}</span>
              <span className="text-[10px] text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Matrix ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto relative border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 shadow-sm" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={28} className="animate-spin text-blue-500" />
              <span className="text-xs text-gray-500">Ma'lumotlar yuklanmoqda...</span>
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Info size={40} className="mx-auto mb-2 text-gray-300" />
              <p className="text-gray-500 text-sm font-medium">Ma'lumot topilmadi</p>
            </div>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-[60] shadow-sm">
              {/* Group row */}
              <tr className="h-6">
                <th colSpan={4} className="sticky top-0 left-0 z-[80] bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-r-2 border-gray-200 dark:border-gray-700 px-2 py-1 text-left text-[9px] font-bold text-gray-400 uppercase tracking-widest w-[408px] min-w-[408px]">
                  Korxona
                </th>
                {(() => {
                  const groupCounts = new Map<string, number>();
                  visibleColumns.forEach(c => {
                    const visualCols = (c as any).isSplit ? 2 : 1;
                    groupCounts.set(c.group, (groupCounts.get(c.group) || 0) + visualCols);
                  });

                  const groupColors: Record<string, string> = {
                    'Oylik': 'bg-blue-50/95 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
                    'Soliqlar': 'bg-orange-50/95 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
                    'Soliq H/T': 'bg-purple-50/95 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
                    'Yillik': 'bg-emerald-50/95 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
                    'Statistika': 'bg-cyan-50/95 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
                    'IT Park': 'bg-violet-50/95 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
                    'Komunalka': 'bg-rose-50/95 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
                  };

                  return [...groupCounts.entries()].map(([name, count]) => (
                    <th key={name} colSpan={count} className={`sticky top-0 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-1 py-1.5 text-center text-[9px] font-black uppercase tracking-wider ${groupColors[name] || 'bg-gray-50/95 text-gray-500'}`}>
                      {name}
                    </th>
                  ));
                })()}
              </tr>
              {/* Column header row (24px height roughly for the first row) */}
              <tr className="h-8">
                <th className="sticky top-[24px] left-0 z-[70] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-2 py-2 text-center font-bold text-gray-500 w-10 min-w-[40px]">#</th>
                <th className="sticky top-[24px] left-10 z-[70] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-2 py-2 text-left font-bold text-gray-700 dark:text-gray-300 w-48 min-w-[192px]">Korxona nomi</th>
                <th className="sticky top-[24px] left-[232px] z-[70] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-1.5 py-2 text-center font-bold text-gray-500 w-20 min-w-[80px]">INN</th>
                <th className="sticky top-[24px] left-[312px] z-[70] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r-2 border-gray-200 dark:border-gray-700 px-1.5 py-2 text-center font-bold text-gray-500 w-24 min-w-[96px]">Buxgalter</th>
                {visibleColumns.map(col => {
                  if ((col as any).isSplit) {
                    return (
                      <React.Fragment key={col.key}>
                        <th
                          className="sticky top-[24px] bg-emerald-50/95 dark:bg-emerald-950/50 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-0.5 py-2 text-center w-10 cursor-help"
                          title={col.label}
                        >
                          <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-400 tracking-tight">{col.short}</span>
                          <div className="text-[7px] font-bold text-emerald-500">Xis.</div>
                        </th>
                        <th
                          className="sticky top-[24px] bg-amber-50/95 dark:bg-amber-950/50 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-0.5 py-2 text-center w-10 cursor-help"
                          title={`${col.label} to'lov`}
                        >
                          <span className="text-[9px] font-black text-amber-700 dark:text-amber-400 tracking-tight">{(col as any).payShort}</span>
                          <div className="text-[7px] font-bold text-amber-500">To'l</div>
                        </th>
                      </React.Fragment>
                    );
                  }
                  return (
                    <th
                      key={col.key}
                      className="sticky top-[24px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-0.5 py-2 text-center w-10 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-help group/header"
                      title={col.label + (userRole === 'super_admin' ? ' (o\'ng tugma = tozalash)' : '')}
                      onContextMenu={(e) => {
                        if (userRole === 'super_admin' || userRole === 'admin') {
                          e.preventDefault();
                          handleClearColumn(col.key);
                        }
                      }}
                    >
                      <span className="text-[10px] font-black text-gray-600 dark:text-gray-400 tracking-tight group-hover/header:text-blue-600 dark:group-hover/header:text-blue-400 transition-colors">
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
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60 backdrop-blur-lg px-5 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-[11px] text-gray-500">
            <span>Jami: <strong className="text-gray-700 dark:text-gray-200">{filteredRows.length}</strong> korxona · <strong>{visibleColumns.length}</strong> ustun</span>
            <div className="h-3 w-px bg-gray-300 dark:bg-gray-700"></div>
            <span>Manba: <strong className="text-blue-600">Baza (Supabase)</strong></span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px] font-bold text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-gray-50 transition-colors"
            >
              Oldingi
            </button>
            <span className="text-[10px] font-black text-gray-700 dark:text-gray-300">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px] font-bold text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-gray-50 transition-colors"
            >
              Keyingi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationModule;
