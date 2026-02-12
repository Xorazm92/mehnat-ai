import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Company, OperationEntry, Language } from '../types';
import { translations } from '../lib/translations';
import { Search, Download, ChevronDown, Info, RefreshCw, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabaseClient';


// ── Report Column Definitions ──────────────────────────────────
const REPORT_COLUMNS = [
  { key: 'didox', csvHeader: 'Didox', label: 'Didox', short: 'DD', group: 'Kundalik' },
  { key: 'xatlar', csvHeader: 'xatlar', label: 'Xatlar', short: 'XT', group: 'Kundalik' },
  { key: 'avtokameral', csvHeader: 'Avtokameral', label: 'Avtokameral', short: 'AK', group: 'Kundalik' },
  { key: 'my_mehnat', csvHeader: 'my mehnat', label: 'My Mehnat', short: 'MM', group: 'Kundalik' },
  { key: 'one_c', csvHeader: '1c', label: '1C', short: '1C', group: 'Kundalik' },
  { key: 'bank_klient', csvHeader: 'bank klient', label: 'Bank Klient', short: 'BK', group: 'Kundalik' },
  { key: 'pul_oqimlari', csvHeader: 'Pul oqimlari', label: 'Pul Oqimlari', short: 'PO', group: 'Oylik' },
  { key: 'chiqadigan_soliqlar', csvHeader: 'Chiqadigan soliqlar', label: 'Chiq. Soliqlar', short: 'CS', group: 'Oylik' },
  { key: 'hisoblangan_oylik', csvHeader: 'Hisoblangan oylik', label: 'His. Oylik', short: 'HO', group: 'Oylik' },
  { key: 'debitor_kreditor', csvHeader: 'Debitor kreditor', label: 'Deb/Kred', short: 'DK', group: 'Oylik' },
  { key: 'foyda_va_zarar', csvHeader: 'Foyda va zarar', label: 'Foyda/Zarar', short: 'FZ', group: 'Oylik' },
  { key: 'tovar_ostatka', csvHeader: 'Tovar ostatka', label: 'Tovar Ost.', short: 'TO', group: 'Oylik' },
  { key: 'nds_bekor_qilish', csvHeader: 'NDSNI BEKOR QILISH', label: 'NDS Bekor', short: 'NB', group: 'Soliq' },
  { key: 'aylanma_qqs', csvHeader: 'Aylanma/QQS', label: 'Aylanma/QQS', short: 'AQ', group: 'Soliq' },
  { key: 'daromad_soliq', csvHeader: 'Daromad soliq', label: 'Daromad Soliq', short: 'DS', group: 'Soliq' },
  { key: 'inps', csvHeader: 'INPS', label: 'INPS', short: 'IN', group: 'Soliq' },
  { key: 'foyda_soliq', csvHeader: 'Foyda soliq', label: 'Foyda Soliq', short: 'FS', group: 'Soliq' },
  { key: 'moliyaviy_natija', csvHeader: 'Moliyaviy natija', label: 'Mol. Natija', short: 'MN', group: 'Chorak' },
  { key: 'buxgalteriya_balansi', csvHeader: 'Buxgalteriya balansi', label: 'Bux. Balansi', short: 'BB', group: 'Chorak' },
  { key: 'statistika', csvHeader: 'Statistika', label: 'Statistika', short: 'ST', group: 'Chorak' },
  { key: 'bonak', csvHeader: "Bo'nak", label: "Bo'nak", short: 'BN', group: 'Boshqa' },
  { key: 'yer_soligi', csvHeader: "Yer solig'i", label: "Yer Solig'i", short: 'YS', group: 'Yillik' },
  { key: 'mol_mulk_soligi', csvHeader: "Mol mulk solig'i ma'lumotnoma", label: "Mol-mulk Sol.", short: 'MS', group: 'Yillik' },
  { key: 'suv_soligi', csvHeader: "Suv solig'i ma'lumotnoma", label: "Suv Solig'i", short: 'SS', group: 'Yillik' },
] as const;

type ReportColumnKey = typeof REPORT_COLUMNS[number]['key'];

// ── Status Rendering ───────────────────────────────────────────
const getStatusStyle = (value: string) => {
  const v = String(value || '').trim().toLowerCase();

  if (!v || v === '0') return { bg: 'bg-slate-100 dark:bg-slate-800/60', text: 'text-slate-400 dark:text-slate-500', icon: '—', tooltip: "Bo'sh" };
  if (v === '+') return { bg: 'bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-400', icon: '✓', tooltip: 'Bajarildi (+)' };
  if (v === '-') return { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', icon: '✗', tooltip: 'Bajarilmadi (-)' };

  if (v.includes('kartoteka')) return { bg: 'bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400', icon: 'Kartoteka', tooltip: 'Kartoteka' };

  // Custom text for any other value -> Blue
  return { bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300', icon: value, tooltip: value };
};

const AVAILABLE_STATUSES = [
  { value: '+', label: 'Bajarildi (+)', icon: '✓', color: 'text-emerald-600' },
  { value: '-', label: 'Bajarilmadi (-)', icon: '✗', color: 'text-rose-600' },
  { value: 'kartoteka', label: 'Kartoteka', icon: '⚠', color: 'text-amber-600' },
  { value: 'izoh', label: 'Matn yozish...', icon: '📝', color: 'text-blue-600' },
  { value: '0', label: 'Tozalash', icon: '—', color: 'text-slate-400' },
];

interface StatusCellProps {
  value: string;
  onUpdate: (newValue: string) => void;
  readOnly?: boolean;
}

const StatusCell = React.memo<StatusCellProps>(({ value, onUpdate, readOnly }) => {
  const style = getStatusStyle(value);
  const [isOpen, setIsOpen] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const popoverRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowInput(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (statusValue: string) => {
    if (statusValue === 'izoh') {
      setInputValue(value === '0' || value === '+' || value === '-' ? '' : value);
      setShowInput(true);
      return;
    }
    onUpdate(statusValue);
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
    <div className="relative flex items-center justify-center w-full h-full p-0.5" ref={popoverRef}>
      <button
        onClick={() => !readOnly && setIsOpen(!isOpen)}
        disabled={readOnly}
        className={`w-full h-7 min-w-[28px] px-1 rounded-md flex items-center justify-center text-[11px] font-bold transition-all duration-200 ${style.bg} ${style.text} hover:scale-[1.02] hover:shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ring-offset-1 focus:ring-2 ring-blue-500/30 outline-none overflow-hidden`}
        title={style.tooltip}
      >
        <span className="truncate w-full text-center block">{style.icon}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full mb-1 left-1/2 -translate-x-1/2 z-[100] min-w-[180px] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-1.5 animate-in fade-in zoom-in-95 duration-100 origin-top">
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
        </div>
      )}
    </div>
  );
}, (prev, next) => prev.value === next.value && prev.readOnly === next.readOnly);

// ── Memoized Table Row ─────────────────────────────────────────
const OperationRow = React.memo<{
  row: ReportRow;
  visibleColumns: typeof REPORT_COLUMNS;
  userRole: string;
  onCellUpdate: (companyId: string, colKey: string, newValue: string) => void;
}>(({ row, visibleColumns, userRole, onCellUpdate }) => {
  return (
    <tr className="group hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors border-b border-gray-100 dark:border-gray-800/40">
      <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/30 border-r border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center text-[10px] font-mono text-gray-400 transition-colors">
        {row.index}
      </td>
      <td className="sticky left-8 z-10 bg-white dark:bg-gray-900 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/30 border-r border-gray-200 dark:border-gray-700 px-2 py-1.5 transition-colors">
        <div className="max-w-[200px] truncate text-[11px] font-semibold text-gray-900 dark:text-gray-100" title={row.name}>
          {row.name}
        </div>
      </td>
      <td className="sticky left-[220px] z-10 bg-white dark:bg-gray-900 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/30 border-r border-gray-200 dark:border-gray-700 px-1 py-1.5 text-center text-[10px] font-mono text-gray-500 transition-colors">
        {row.inn || '—'}
      </td>
      <td className="sticky left-[290px] z-10 bg-white dark:bg-gray-900 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/30 border-r-2 border-gray-200 dark:border-gray-700 px-1 py-1.5 transition-colors">
        <div className="max-w-[75px] truncate text-[10px] font-medium text-gray-600 dark:text-gray-400" title={row.accountant}>
          {row.accountant || '—'}
        </div>
      </td>
      {visibleColumns.map(col => (
        <td key={col.key} className="border-r border-gray-100 dark:border-gray-800/30 px-0.5 py-0.5 text-center h-8">
          <StatusCell
            value={String(row[col.key] || '')}
            onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId, col.key, newValue)}
            readOnly={!row.companyId || (userRole !== 'super_admin' && userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'accountant')}
          />
        </td>
      ))}
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
  onUpdate: (op: OperationEntry) => void;
  onBatchUpdate?: (ops: OperationEntry[]) => void;
  onCompanySelect: (c: Company) => void;
  userRole: string;
  currentUserId?: string;
}

interface ReportRow {
  index: number;
  name: string;
  inn: string;
  accountant: string;
  taxType: string;
  login: string;
  password: string;
  [key: string]: string | number;
}

// ── Main Component ─────────────────────────────────────────────
const OperationModule: React.FC<Props> = ({
  companies,
  operations,
  activeFilter = 'all',
  selectedPeriod,
  onPeriodChange,
  lang,
  onUpdate,
  onBatchUpdate,
  onCompanySelect,
  userRole,
  currentUserId
}) => {
  const t = translations[lang];
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterAccountant, setFilterAccountant] = useState<string>('all');

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

  // Removed data loading logic for obsolete formats.


  // ── Handle Cell Update ───────────────────────────────────────
  const handleCellUpdate = useCallback(async (companyId: string, colKey: string, newValue: string) => {
    // 1. Optimistic Update (using functional update to avoid dependency on 'rows')
    setRows(prevRows => prevRows.map(row => {
      if (row.companyId === companyId) {
        return { ...row, [colKey]: newValue };
      }
      return row;
    }));

    try {
      // 2. Persist to DB
      const { error, count } = await supabase
        .from('company_monthly_reports')
        .update({ [colKey]: newValue, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('period', selectedPeriod)
        .select();

      if (error) throw error;

      // If no row updated (i.e. first time touch), insert full row
      if (!count && count !== undefined) {
        const payload: any = {
          company_id: companyId,
          period: selectedPeriod,
          updated_at: new Date().toISOString(),
          [colKey]: newValue
        };

        await supabase.from('company_monthly_reports').upsert(payload, { onConflict: 'company_id, period' });
      }

      // 3. Notify parent to refresh global state (for Dashboard, Analysis, etc.)
      await onUpdate({ companyId, period: selectedPeriod, [colKey]: newValue });

    } catch (e: any) {
      console.error('Update error:', e);
      toast.error('Saqlashda xatolik!');
    }
  }, [selectedPeriod]);

  // ── Computed data ────────────────────────────────────────────
  const accountants = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.accountant) set.add(r.accountant); });
    return [...set].sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (search) {
        const s = search.toLowerCase();
        if (!r.name.toLowerCase().includes(s) && !r.inn.includes(s) && !r.accountant.toLowerCase().includes(s)) return false;
      }
      if (filterAccountant !== 'all' && r.accountant !== filterAccountant) return false;
      return true;
    });
  }, [rows, search, filterAccountant]);

  const visibleColumns = useMemo(() => {
    if (filterGroup === 'all') return [...REPORT_COLUMNS];
    return REPORT_COLUMNS.filter(c => c.group === filterGroup);
  }, [filterGroup]);

  // Stats
  const stats = useMemo(() => {
    let done = 0, notDone = 0, na = 0, warning = 0, text = 0;
    filteredRows.forEach(row => {
      visibleColumns.forEach(col => {
        const v = String(row[col.key] || '').trim().toLowerCase();
        if (v === '+') done++;
        else if (v === '-') notDone++;
        else if (!v || v === '0' || v === 'topshirmaydi') na++;
        else if (v === 'kartoteka') warning++;
        else if (v.length > 1) text++;
      });
    });
    return { done, notDone, na, warning, text };
  }, [filteredRows, visibleColumns]);

  const uniqueGroups = [...new Set(REPORT_COLUMNS.map(c => c.group))];

  // Export
  const handleExport = async () => {
    try {
      const { utils, writeFile } = await import('xlsx');

      const header = ['#', 'Korxona', 'INN', 'Buxgalter', 'Soliq turi', ...visibleColumns.map(c => c.label)];
      const data = filteredRows.map(r => [
        r.index,
        r.name,
        r.inn,
        r.accountant,
        r.taxType,
        ...visibleColumns.map(c => String(r[c.key] || ''))
      ]);

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
            { icon: '⚠', label: 'Kartoteka', cls: 'text-amber-600' },
            { icon: '✓+', label: '+ariza/izoh', cls: 'text-teal-600' },
            { icon: '📝', label: 'Matn', cls: 'text-blue-600' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <span className={`font-black text-xs ${l.cls}`}>{l.icon}</span>
              <span className="text-[10px] text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Matrix ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
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
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-40 shadow-sm">
              {/* Group row */}
              <tr>
                <th colSpan={4} className="sticky top-0 left-0 z-50 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-r-2 border-gray-200 dark:border-gray-700 px-2 py-1 text-left text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                  Korxona
                </th>
                {(() => {
                  const groupCounts = new Map<string, number>();
                  visibleColumns.forEach(c => groupCounts.set(c.group, (groupCounts.get(c.group) || 0) + 1));
                  return [...groupCounts.entries()].map(([name, count]) => (
                    <th key={name} colSpan={count} className="sticky top-0 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-1 py-1 text-center text-[9px] font-bold uppercase tracking-wider text-gray-500">
                      {name}
                    </th>
                  ));
                })()}
              </tr>
              {/* Column header row */}
              <tr>
                <th className="sticky top-[25px] left-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-2 py-2 text-center font-bold text-gray-500 w-8">#</th>
                <th className="sticky top-[25px] left-8 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-2 py-2 text-left font-bold text-gray-700 dark:text-gray-300 min-w-[180px] max-w-[220px]">Korxona nomi</th>
                <th className="sticky top-[25px] left-[220px] z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-1.5 py-2 text-center font-bold text-gray-500 w-[70px]">INN</th>
                <th className="sticky top-[25px] left-[290px] z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r-2 border-gray-200 dark:border-gray-700 px-1.5 py-2 text-center font-bold text-gray-500 w-[80px]">Buxgalter</th>
                {visibleColumns.map(col => (
                  <th
                    key={col.key}
                    className="sticky top-[25px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-r border-gray-200 dark:border-gray-700 px-0.5 py-2 text-center w-10 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-help group/header"
                    title={col.label}
                  >
                    <span className="text-[10px] font-black text-gray-600 dark:text-gray-400 tracking-tight group-hover/header:text-blue-600 dark:group-hover/header:text-blue-400 transition-colors">
                      {col.short}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <OperationRow
                  key={`${row.index}-${row.inn}`}
                  row={row}
                  visibleColumns={visibleColumns}
                  userRole={userRole}
                  onCellUpdate={handleCellUpdate}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60 backdrop-blur-lg px-5 py-2">
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>Jami: <strong className="text-gray-700 dark:text-gray-200">{filteredRows.length}</strong> korxona · <strong>{visibleColumns.length}</strong> ustun</span>
          <span>Manba: <strong className="text-blue-600">Baza (Supabase)</strong></span>
        </div>
      </div>
    </div>
  );
};

export default OperationModule;
