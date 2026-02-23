import React, { useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, Language } from '../types';
import { translations } from '../lib/translations';
import { periodsEqual } from '../lib/periods';
import { Building, CheckCircle, DollarSign, PieChart as PieChartIcon, ArrowRight, Activity, Clock } from 'lucide-react';

interface AccountantDashboardProps {
    companies: Company[];
    operations: OperationEntry[];
    selectedPeriod: string;
    lang: Language;
}

const AccountantDashboard: React.FC<AccountantDashboardProps> = ({ companies, operations, selectedPeriod, lang }) => {
    const t = translations[lang];

    const stats = useMemo(() => {
        let completed = 0;
        let delayed = 0;
        let blocked = 0;

        // O(1) Lookup
        const opMap = new Map<string, OperationEntry>();
        operations.forEach(o => {
            if (periodsEqual(o.period, selectedPeriod)) opMap.set(o.companyId, o);
        });

        companies.forEach(c => {
            const op = opMap.get(c.id);
            if (!op) {
                delayed++;
            } else {
                if (op.profitTaxStatus === ReportStatus.ACCEPTED && op.form1Status === ReportStatus.ACCEPTED) {
                    completed++;
                }
                if (op.profitTaxStatus === ReportStatus.NOT_SUBMITTED || op.form1Status === ReportStatus.NOT_SUBMITTED) {
                    delayed++;
                }
                if (op.statsStatus === ReportStatus.BLOCKED || op.form1Status === ReportStatus.BLOCKED) {
                    blocked++;
                }
            }
        });

        // New stats for the updated dashboard
        const activeCompanies = companies.length;
        const completionRate = activeCompanies > 0 ? (completed / activeCompanies) * 100 : 0;
        const projectedRevenue = 123456789; // Placeholder for projected revenue

        return { total: companies.length, completed, delayed, blocked, activeCompanies, completionRate, projectedRevenue };
    }, [companies, operations, selectedPeriod]);

    return (
        <div className="space-y-12 animate-macos">
            {/* Main Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="liquid-glass-sidebar p-12 rounded-[4rem] border border-white/20 dark:border-white/10 shadow-glass-xl flex flex-col items-center justify-center text-center group hover:-translate-y-2 transition-all duration-500 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all"></div>
                    <div className="h-20 w-20 rounded-3xl bg-blue-500/10 text-blue-600 flex items-center justify-center mb-8 shadow-glass border border-blue-500/10 group-hover:scale-110 transition-transform duration-500">
                        <Building size={36} strokeWidth={2.5} />
                    </div>
                    <div className="text-5xl font-black text-slate-800 dark:text-white mb-3 tabular-nums">{stats.activeCompanies}</div>
                    <div className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em]">Mening Firmalarim</div>
                </div>

                <div className="liquid-glass-sidebar p-12 rounded-[4rem] border border-white/20 dark:border-white/10 shadow-glass-xl flex flex-col items-center justify-center text-center group hover:-translate-y-2 transition-all duration-500 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/20 transition-all"></div>
                    <div className="h-20 w-20 rounded-3xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-8 shadow-glass border border-emerald-500/10 group-hover:scale-110 transition-transform duration-500">
                        <CheckCircle size={36} strokeWidth={2.5} />
                    </div>
                    <div className="text-5xl font-black text-emerald-500 mb-3 tabular-nums">{Math.round(stats.completionRate)}%</div>
                    <div className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em]">Umumiy Progress</div>
                </div>

                <div className="liquid-glass-sidebar p-12 rounded-[4rem] border border-white/20 dark:border-white/10 shadow-glass-xl flex flex-col items-center justify-center text-center group hover:-translate-y-2 transition-all duration-500 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-all"></div>
                    <div className="h-20 w-20 rounded-3xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center mb-8 shadow-glass border border-indigo-500/10 group-hover:scale-110 transition-transform duration-500">
                        <DollarSign size={36} strokeWidth={2.5} />
                    </div>
                    <div className="text-4xl font-black text-slate-800 dark:text-white mb-3 tabular-nums">
                        {stats.projectedRevenue.toLocaleString()} <span className="text-sm font-black text-slate-400">UZS</span>
                    </div>
                    <div className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em]">Kutilayotgan Maosh</div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
                {/* Reports Status Table */}
                <div className="xl:col-span-2 space-y-10">
                    <div className="liquid-glass-card p-12 rounded-[4rem] border border-white/20 dark:border-white/10 shadow-glass-2xl">
                        <div className="flex items-center justify-between mb-12">
                            <div className="flex items-center gap-6">
                                <div className="p-4 bg-apple-accent/10 rounded-2xl text-apple-accent shadow-glass border border-apple-accent/10">
                                    <PieChartIcon size={28} strokeWidth={3} />
                                </div>
                                <h3 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight uppercase">Hisobotlar Holati</h3>
                            </div>
                            <span className="px-6 py-2.5 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/20 dark:border-white/10 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] shadow-glass">
                                {selectedPeriod}
                            </span>
                        </div>
                        <div className="space-y-6">
                            {companies.slice(0, 6).map(company => {
                                const op = operations.find(o => o.companyId === company.id);
                                const isDone = op?.profitTaxStatus === ReportStatus.ACCEPTED;
                                return (
                                    <div key={company.id} className="flex items-center gap-8 p-6 bg-white/40 dark:bg-white/5 rounded-3xl border border-white/20 dark:border-white/10 group hover:bg-white/60 dark:hover:bg-white/10 transition-all duration-300">
                                        <div className="flex-1">
                                            <div className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight group-hover:text-apple-accent transition-colors">{company.name}</div>
                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1 italic">STIR: {company.inn || '—'}</div>
                                        </div>
                                        <div className="flex items-center gap-12">
                                            <div className="text-right min-w-[120px]">
                                                <div className={`text-xs font-black uppercase tracking-widest ${isDone ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                    {isDone ? 'Yakunlangan' : 'Jarayonda'}
                                                </div>
                                                <div className="w-24 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full mt-2 overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-1000 ${isDone ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: isDone ? '100%' : '65%' }}></div>
                                                </div>
                                            </div>
                                            <button className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-400 flex items-center justify-center hover:bg-apple-accent hover:text-white transition-all duration-300 shadow-glass border border-white/10">
                                                <ArrowRight size={20} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-12">
                    <div className="liquid-glass-card p-10 rounded-[3.5rem] border border-white/20 dark:border-white/10 shadow-glass-lg">
                        <div className="flex items-center gap-5 mb-10">
                            <div className="p-4 bg-indigo-500/10 rounded-2xl text-indigo-600 shadow-glass border border-indigo-500/10">
                                <Activity size={24} strokeWidth={3} />
                            </div>
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Samaradorlik</h3>
                        </div>
                        <div className="space-y-10">
                            <div className="text-center">
                                <div className="inline-flex items-center justify-center h-48 w-48 rounded-full border-[12px] border-emerald-500/10 relative">
                                    <div className="absolute inset-0 rounded-full border-[12px] border-emerald-500 border-r-transparent border-b-transparent -rotate-12"></div>
                                    <div className="text-center">
                                        <div className="text-5xl font-black text-slate-800 dark:text-white tracking-tighter">88%</div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Sifat ko'rsatkichi</div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6 pb-4">
                                <div className="p-6 bg-white/40 dark:bg-white/5 rounded-3xl border border-white/20 shadow-glass text-center">
                                    <div className="text-2xl font-black text-slate-800 dark:text-white">12</div>
                                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">O'z vaqtida</div>
                                </div>
                                <div className="p-6 bg-white/40 dark:bg-white/5 rounded-3xl border border-white/20 shadow-glass text-center">
                                    <div className="text-2xl font-black text-amber-500">2</div>
                                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Kechikkan</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="liquid-glass-card p-10 rounded-[3.5rem] border border-white/20 dark:border-white/10 shadow-glass-lg relative overflow-hidden group">
                        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight mb-8 flex items-center gap-4 relative z-10">
                            <Clock size={24} className="text-blue-500" />
                            So'nggi harakatlar
                        </h3>
                        <div className="space-y-6 relative z-10">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="flex gap-4 group/item">
                                    <div className="shrink-0 w-1.5 h-10 bg-blue-500/20 rounded-full group-hover/item:bg-blue-500 transition-colors"></div>
                                    <div>
                                        <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight line-clamp-1">Hisobot qabul qilindi</p>
                                        <p className="text-[10px] font-bold text-slate-400 mt-1 italic">Bugun, 09:45</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccountantDashboard;
