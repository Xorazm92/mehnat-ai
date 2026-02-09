import React, { useState, useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, Language, KPIMetrics } from '../types';
import { translations } from '../lib/translations';
import StatusBadge from './StatusBadge';
import { Search, Download, Filter, ChevronLeft, ChevronRight, FileBarChart, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  companies: Company[];
  operations: OperationEntry[];
  activeFilter?: string;
  selectedPeriod: string;
  onPeriodChange: (p: string) => void;
  lang: Language;
  onUpdate: (op: OperationEntry) => void;
  onCompanySelect: (c: Company) => void;
}

const OperationModule: React.FC<Props> = ({ companies, operations, activeFilter = 'all', selectedPeriod, onPeriodChange, lang, onUpdate, onCompanySelect }) => {
  const t = translations[lang];
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const years = ['2023', '2024', '2025'];
  const quarters = ['Yillik', 'Q1', 'Q2', 'Q3', 'Q4'];

  const handlePeriodChange = (val: string) => {
    onPeriodChange(val);
    setCurrentPage(1);
  };

  const filtered = useMemo(() => {
    return companies.filter(c => {
      const op = operations.find(o => o.companyId === c.id && o.period === selectedPeriod);
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.inn.includes(search);

      if (!matchesSearch) return false;
      if (activeFilter === 'all' || activeFilter === 'none') return true;

      if (!op) return false;

      if (activeFilter.includes(':')) {
        const [field, status] = activeFilter.split(':');
        return (op as any)[field] === status;
      }

      if (activeFilter === 'delayed') {
        if (!op) return true; // No record means not submitted yet
        return op.profitTaxStatus === ReportStatus.NOT_SUBMITTED ||
          op.form1Status === ReportStatus.NOT_SUBMITTED ||
          op.statsStatus === ReportStatus.NOT_SUBMITTED ||
          op.profitTaxStatus === ReportStatus.REJECTED;
      }
      if (activeFilter === 'blocked') {
        if (!op) return false;
        return op.form1Status === ReportStatus.BLOCKED ||
          op.profitTaxStatus === ReportStatus.BLOCKED ||
          op.form2Status === ReportStatus.BLOCKED;
      }
      if (activeFilter === 'progress') {
        if (!op) return false;
        return op.profitTaxStatus === ReportStatus.ACCEPTED && op.form1Status === ReportStatus.ACCEPTED;
      }

      return true;
    });
  }, [companies, operations, search, activeFilter, selectedPeriod]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const filterLabel = useMemo(() => {
    if (activeFilter === 'all' || activeFilter === 'none') return t.total;
    if (activeFilter === 'delayed') return t.debtors;
    if (activeFilter === 'blocked') return t.blocked;
    if (activeFilter === 'progress') return t.completedFirms;
    if (activeFilter.includes(':')) {
      const [field, status] = activeFilter.split(':');
      const fieldName = translations[lang][field as keyof typeof t] || field.replace('Status', '').toUpperCase();
      return `${fieldName} | ${status === '+' ? t.annualCompleted : status}`;
    }
    return activeFilter;
  }, [activeFilter, t, lang]);

  const handleStatusChange = async (op: OperationEntry, field: keyof OperationEntry, val: string) => {
    try {
      await onUpdate({ ...op, [field]: val as ReportStatus, updatedAt: new Date().toISOString() });
      toast.success(t.save + '!');
    } catch (e) {
      toast.error('Xatolik yuz berdi');
    }
  };

  const handleDeadlineChange = async (op: OperationEntry, field: 'profitTaxDeadline' | 'statsDeadline', val: string) => {
    try {
      await onUpdate({ ...op, [field]: val, updatedAt: new Date().toISOString() });
      toast.success(t.deadline + ' ' + t.save + '!');
    } catch (e) {
      toast.error('Xatolik yuz berdi');
    }
  };

  const [expandedKpiId, setExpandedKpiId] = useState<string | null>(null);

  const updateKpiMetric = (op: OperationEntry, field: keyof KPIMetrics, value: any) => {
    const currentKpi = op.kpi || {
      supervisorAttendance: true, bankClientAttendance: true, bankClientTgOk: true, bankClientTgMissed: 0,
      accTgOk: true, accTgMissed: 0, didox: true, letters: true, myMehnat: true, oneC: true,
      autoCameral: true, cashFlow: true, taxInfo: true, payroll: true, debt: true, pnl: true
    };
    onUpdate({ ...op, kpi: { ...currentKpi, [field]: value }, updatedAt: new Date().toISOString() });
  };

  return (
    <div className="space-y-8 md:space-y-10 animate-fade-in pb-20">
      <div className="bg-white dark:bg-apple-darkCard p-8 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-sm border border-apple-border dark:border-apple-darkBorder flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
        <div className="flex-1 w-full">
          <div className="flex flex-wrap items-center gap-4 md:gap-6 mb-3">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight">{t.reports}</h2>
            {activeFilter !== 'all' && (
              <div className="px-4 py-2 bg-apple-accent text-white text-[10px] md:text-xs font-black uppercase rounded-xl flex items-center gap-3 animate-bounce-subtle">
                <Filter size={12} /> {filterLabel}
              </div>
            )}
          </div>
          <p className="text-sm md:text-base font-semibold text-slate-400">
            <span className="tabular-nums text-apple-accent font-black">{filtered.length}</span> {t.firmCount}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
          <div className="flex bg-slate-100 dark:bg-white/5 p-1.5 rounded-2xl border border-apple-border dark:border-apple-darkBorder shadow-inner">
            <select
              value={selectedPeriod.split(' ')[0]}
              onChange={(e) => handlePeriodChange(`${e.target.value} ${selectedPeriod.split(' ')[1]}`)}
              className="bg-transparent border-none text-xs font-black text-slate-500 outline-none px-3 py-2 cursor-pointer appearance-none"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="w-px h-4 bg-apple-border dark:bg-apple-darkBorder self-center mx-1"></div>
            <select
              value={selectedPeriod.split(' ')[1]}
              onChange={(e) => handlePeriodChange(`${selectedPeriod.split(' ')[0]} ${e.target.value}`)}
              className="bg-transparent border-none text-xs font-black text-slate-500 outline-none px-3 py-2 cursor-pointer appearance-none"
            >
              {quarters.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          <div className="relative flex-1 xl:w-[350px] group min-w-0">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-apple-accent transition-colors" size={18} />
            <input
              type="text"
              placeholder={t.search}
              className="w-full pl-14 pr-6 py-4.5 md:py-5 bg-slate-50 dark:bg-white/5 border border-apple-border dark:border-apple-darkBorder rounded-2xl outline-none focus:bg-white dark:focus:bg-apple-darkBg focus:ring-4 focus:ring-apple-accent/5 transition-all font-bold text-sm md:text-base shadow-inner"
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <button className="p-4.5 md:p-5 bg-apple-accent text-white rounded-2xl md:rounded-[1.5rem] hover:bg-blue-600 transition-all shadow-2xl shadow-blue-500/20 active:scale-95 group">
            <Download size={20} className="group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] md:rounded-[3rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-2xl">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-apple-accent">
          <table className="w-full text-left border-collapse min-w-[1300px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/10 text-[11px] md:text-xs font-black uppercase tracking-widest text-slate-400 border-b dark:border-apple-darkBorder sticky top-0 z-30">
                <th className="px-10 md:px-12 py-8 md:py-10 sticky left-0 bg-slate-50 dark:bg-apple-darkCard z-40 w-80 md:w-96 shadow-sm border-r dark:border-apple-darkBorder">{t.organizations}</th>
                <th className="px-6 py-8 text-center bg-slate-50 dark:bg-apple-darkCard/80 backdrop-blur-md">KPI</th>
                <th className="px-6 py-8 text-center bg-slate-50 dark:bg-apple-darkCard/80 backdrop-blur-md">{t.profitTax}</th>
                <th className="px-6 py-8 text-center bg-slate-50 dark:bg-apple-darkCard/80 backdrop-blur-md">{t.form1}</th>
                <th className="px-6 py-8 text-center bg-slate-50 dark:bg-apple-darkCard/80 backdrop-blur-md">{t.form2}</th>
                <th className="px-6 py-8 text-center bg-slate-50 dark:bg-apple-darkCard/80 backdrop-blur-md">{t.stats}</th>
                <th className="px-10 py-10 bg-slate-50 dark:bg-apple-darkCard/80 backdrop-blur-md">{t.comment}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
              {paginated.map(c => {
                const op = operations.find(o => o.companyId === c.id && o.period === selectedPeriod) || {
                  id: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                    const r = Math.random() * 16 | 0;
                    const v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                  }),
                  companyId: c.id, period: selectedPeriod,
                  profitTaxStatus: ReportStatus.NOT_SUBMITTED, form1Status: ReportStatus.NOT_SUBMITTED,
                  form2Status: ReportStatus.NOT_SUBMITTED, statsStatus: ReportStatus.NOT_SUBMITTED,
                  comment: '', updatedAt: '', history: [], kpi: undefined
                };

                const isExpanded = expandedKpiId === c.id;

                return (
                  <React.Fragment key={c.id}>
                    <tr className={`hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all group ${isExpanded ? 'bg-apple-accent/5' : ''}`}>
                      <td
                        className="px-10 md:px-12 py-6 md:py-8 sticky left-0 bg-white dark:bg-apple-darkCard group-hover:bg-slate-50 dark:group-hover:bg-apple-darkBg z-20 shadow-sm transition-colors border-r dark:border-apple-darkBorder cursor-pointer"
                        onClick={() => onCompanySelect(c)}
                      >
                        <div className="font-extrabold text-slate-800 dark:text-white text-base md:text-lg truncate w-64 md:w-80 tracking-tighter leading-none mb-2 hover:text-apple-accent transition-colors">{c.name}</div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-[10px] font-black text-slate-400 font-mono tracking-tighter tabular-nums bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded shadow-inner">INN: {c.inn}</span>
                          <span className="px-2 py-1 bg-apple-accent/10 text-[9px] font-black text-apple-accent uppercase rounded-md tracking-wider border border-apple-accent/20">{c.accountantName}</span>
                        </div>
                      </td>

                      <td className="px-6 py-8 text-center bg-slate-50/30 dark:bg-white/5">
                        <button
                          onClick={() => setExpandedKpiId(isExpanded ? null : c.id)}
                          className={`p-3 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest ${isExpanded ? 'bg-apple-accent text-white shadow-lg' : 'bg-slate-100 dark:bg-white/10 text-slate-500 hover:bg-apple-accent/10 hover:text-apple-accent'}`}
                        >
                          {isExpanded ? 'Yopish' : 'KPI Kirish'}
                        </button>
                      </td>

                      {[
                        { field: 'profitTaxStatus', deadlineField: 'profitTaxDeadline', label: t.profitTax, dlLabel: t.deadlineProfit },
                        { field: 'form1Status', label: t.form1 },
                        { field: 'form2Status', label: t.form2 },
                        { field: 'statsStatus', deadlineField: 'statsDeadline', label: t.stats, dlLabel: t.deadlineStats }
                      ].map((item) => (
                        <td key={item.field} className="px-4 py-6 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <select
                              className="bg-transparent border-none text-[10px] font-black text-slate-400 hover:text-apple-accent outline-none cursor-pointer appearance-none text-center transition-colors focus:ring-0"
                              value={(op as any)[item.field]}
                              onChange={e => handleStatusChange(op as any, item.field as any, e.target.value)}
                            >
                              {Object.values(ReportStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <StatusBadge status={(op as any)[item.field]} />
                            {item.deadlineField && (
                              <div className="mt-2 flex flex-col items-center gap-1 group/dl">
                                <span className="text-[8px] font-black text-slate-400 transition-colors group-hover/dl:text-apple-accent uppercase">{item.dlLabel}</span>
                                <div className="relative">
                                  <Calendar size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 group-hover/dl:text-apple-accent transition-colors" />
                                  <input
                                    type="date"
                                    className="pl-6 pr-2 py-1 bg-slate-50 dark:bg-white/5 border border-apple-border dark:border-apple-darkBorder rounded-lg text-[10px] font-bold outline-none focus:ring-2 focus:ring-apple-accent/20 transition-all appearance-none cursor-pointer"
                                    value={(op as any)[item.deadlineField] || ''}
                                    onChange={e => handleDeadlineChange(op as any, item.deadlineField as any, e.target.value)}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      ))}
                      <td className="px-10 py-6">
                        <textarea
                          rows={1}
                          className="w-full min-w-[280px] bg-slate-50 dark:bg-white/5 border border-apple-border dark:border-apple-darkBorder rounded-2xl p-4 text-sm font-bold outline-none focus:bg-white dark:focus:bg-apple-darkBg focus:ring-4 focus:ring-apple-accent/10 transition-all resize-none shadow-sm"
                          placeholder={t.comment + "..."}
                          value={op.comment}
                          onChange={e => onUpdate({ ...op as any, comment: e.target.value })}
                        />
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50/50 dark:bg-black/20 animate-macos">
                        <td colSpan={7} className="px-10 py-10">
                          <div className="flex flex-col gap-10">
                            {/* Rule 1 & 2: Supervisor & Bank Client Toggles */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              <div className="p-6 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder shadow-sm">
                                <h4 className="text-[10px] font-black uppercase text-apple-accent mb-4 tracking-widest">Rule 1: Nazoratchi</h4>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-500">Ishga kelish (±0.5%)</span>
                                  <button
                                    onClick={() => updateKpiMetric(op as any, 'supervisorAttendance', !((op.kpi as any)?.supervisorAttendance))}
                                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${((op.kpi as any)?.supervisorAttendance) ? 'bg-emerald-500 text-white shadow-lg' : 'bg-rose-500 text-white'}`}
                                  >
                                    {((op.kpi as any)?.supervisorAttendance) ? '+0.5%' : '-0.5%'}
                                  </button>
                                </div>
                              </div>

                              <div className="p-6 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder shadow-sm">
                                <h4 className="text-[10px] font-black uppercase text-blue-500 mb-4 tracking-widest">Rule 2: Bank Klient</h4>
                                <div className="space-y-4 text-xs font-bold">
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500">Attendance (±1%)</span>
                                    <button
                                      onClick={() => updateKpiMetric(op as any, 'bankClientAttendance', !((op.kpi as any)?.bankClientAttendance))}
                                      className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${((op.kpi as any)?.bankClientAttendance) ? 'bg-emerald-500 text-white shadow-lg' : 'bg-rose-500 text-white'}`}
                                    >
                                      {((op.kpi as any)?.bankClientAttendance) ? '+1%' : '-1%'}
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500">TG Ok (+1%/0)</span>
                                    <button
                                      onClick={() => updateKpiMetric(op as any, 'bankClientTgOk', !((op.kpi as any)?.bankClientTgOk))}
                                      className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${((op.kpi as any)?.bankClientTgOk) ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-white/10 text-slate-400'}`}
                                    >
                                      {((op.kpi as any)?.bankClientTgOk) ? '+1%' : 'Yo\'q'}
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-between pt-2 border-t dark:border-apple-darkBorder">
                                    <span className="text-slate-400">TG Missed (ea -0.5%)</span>
                                    <input
                                      type="number"
                                      className="w-16 bg-slate-50 dark:bg-white/5 border-none rounded-lg text-center font-black py-1"
                                      value={(op.kpi as any)?.bankClientTgMissed || 0}
                                      onChange={e => updateKpiMetric(op as any, 'bankClientTgMissed', parseInt(e.target.value) || 0)}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Rule 3: Accountant Checklist */}
                            <div>
                              <h3 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-[0.2em]">Rule 3: Buxgalter Checklist (±% Metrics)</h3>
                              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {[
                                  { label: 'TG Javob', f: 'accTgOk', p: '+1%', m: '0' },
                                  { label: 'Didox', f: 'didox', p: '+0.25%', m: '-0.25%' },
                                  { label: 'Xatlar', f: 'letters', p: '+0.25%', m: '-0.25%' },
                                  { label: 'MyMehnat', f: 'myMehnat', p: '+0.25%', m: '-0.25%' },
                                  { label: '1C Baza', f: 'oneC', p: '+1%', m: '0' },
                                  { label: 'AvtoCam.', f: 'autoCameral', p: '+0.25%', m: '-0.25%' },
                                  { label: 'Pul Oqimi', f: 'cashFlow', p: '+0.2%', m: '-0.2%' },
                                  { label: 'Soliq Info', f: 'taxInfo', p: '+0.2%', m: '-0.2%' },
                                  { label: 'Oylik Hisob', f: 'payroll', p: '+0.2%', m: '-0.2%' },
                                  { label: 'Deb/Kred', f: 'debt', p: '+0.2%', m: '-0.2%' },
                                  { label: 'F&Z Hisob', f: 'pnl', p: '+0.2%', m: '-0.2%' }
                                ].map(item => (
                                  <div key={item.f} className="p-4 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder shadow-sm flex flex-col gap-3">
                                    <span className="text-[9px] font-black uppercase text-slate-400">{item.label}</span>
                                    <button
                                      onClick={() => updateKpiMetric(op as any, item.f as any, !((op.kpi as any)?.[item.f]))}
                                      className={`py-2 rounded-xl text-[9px] font-black transition-all ${((op.kpi as any)?.[item.f]) ? 'bg-emerald-500 text-white shadow-lg' : 'bg-rose-500 text-white'}`}
                                    >
                                      {((op.kpi as any)?.[item.f]) ? item.p : item.m}
                                    </button>
                                  </div>
                                ))}
                                <div className="p-4 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder shadow-sm flex flex-col gap-3">
                                  <span className="text-[9px] font-black uppercase text-rose-500">TG Kechikish</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-slate-400">Soni:</span>
                                    <input
                                      type="number"
                                      className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-lg text-center font-black py-1 text-xs"
                                      value={(op.kpi as any)?.accTgMissed || 0}
                                      onChange={e => updateKpiMetric(op as any, 'accTgMissed', parseInt(e.target.value) || 0)}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {paginated.length === 0 && (
            <div className="p-32 flex flex-col items-center justify-center text-slate-300">
              <FileBarChart size={64} className="mb-4 opacity-10" />
              <p className="font-black uppercase tracking-widest text-base">{t.noData}</p>
            </div>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t dark:border-apple-darkBorder pt-10">
          <p className="text-sm font-bold text-slate-400">
            {t.page} <span className="text-slate-800 dark:text-white font-black">{currentPage}</span> {t.of} {totalPages}
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-3 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder px-6 py-3.5 rounded-2xl disabled:opacity-30 font-black text-xs hover:border-apple-accent transition-all shadow-sm active:scale-95"
            >
              <ChevronLeft size={16} /> {t.prev}
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-3 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder px-6 py-3.5 rounded-2xl disabled:opacity-30 font-black text-xs hover:border-apple-accent transition-all shadow-sm active:scale-95"
            >
              {t.next} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationModule;
