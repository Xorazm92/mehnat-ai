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
        <div className="space-y-8 animate-fade-in">
            {/* Main Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-6 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden transition-colors">
                    <div className="h-12 w-12 rounded-sm bg-[#3366CC] text-white flex items-center justify-center mb-4 shadow-sm">
                        <Building size={22} />
                    </div>
                    <div className="text-4xl font-black text-gray-800 dark:text-white mb-2 tabular-nums tracking-tighter">{stats.activeCompanies}</div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mening Firmalarim</div>
                </div>

                <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-6 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden transition-colors">
                    <div className="h-12 w-12 rounded-sm bg-emerald-600 text-white flex items-center justify-center mb-4 shadow-sm">
                        <CheckCircle size={22} />
                    </div>
                    <div className="text-4xl font-black text-emerald-600 mb-2 tabular-nums tracking-tighter">{Math.round(stats.completionRate)}%</div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Umumiy Progress</div>
                </div>

                <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-6 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden transition-colors">
                    <div className="h-12 w-12 rounded-sm bg-indigo-600 text-white flex items-center justify-center mb-4 shadow-sm">
                        <DollarSign size={22} />
                    </div>
                    <div className="text-3xl font-black text-gray-800 dark:text-white mb-2 tabular-nums tracking-tighter">
                        {stats.projectedRevenue.toLocaleString()} <span className="text-[10px] font-bold text-gray-400 ml-1">sum</span>
                    </div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kutilayotgan Maosh</div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Reports Status Table */}
                <div className="xl:col-span-2 space-y-8">
                    <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm">
                        <div className="flex items-center justify-between p-5 border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#F0F2F5] dark:bg-[#1A1D23] text-[#3366CC] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44]">
                                    <PieChartIcon size={18} />
                                </div>
                                <h3 className="text-[13px] font-bold text-gray-800 dark:text-white uppercase tracking-wider">Hisobotlar Holati</h3>
                            </div>
                            <span className="px-3 py-1 bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] text-gray-500 dark:text-gray-400 text-[9px] font-black uppercase tracking-widest rounded-sm">
                                {selectedPeriod}
                            </span>
                        </div>
                        <div className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                            {companies.slice(0, 6).map(company => {
                                const op = operations.find(o => o.companyId === company.id);
                                const isDone = op?.profitTaxStatus === ReportStatus.ACCEPTED;
                                return (
                                    <div key={company.id} className="flex items-center gap-6 p-5 hover:bg-[#F8F9FA] dark:hover:bg-[#111318] transition-colors group">
                                        <div className="flex-1">
                                            <div className="text-[11px] font-bold text-gray-800 dark:text-white uppercase tracking-tight group-hover:text-[#3366CC] transition-colors">{company.name}</div>
                                            <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1">ИНН: {company.inn || '—'}</div>
                                        </div>
                                        <div className="flex items-center gap-10">
                                            <div className="text-right min-w-[120px]">
                                                <div className={`text-[9px] font-black uppercase tracking-widest ${isDone ? 'text-emerald-600' : 'text-amber-500'}`}>
                                                    {isDone ? 'Muvaffaqiyatli' : 'Kutilmoqda'}
                                                </div>
                                                <div className="w-24 h-1.5 bg-[#F0F2F5] dark:bg-[#1A1D23] rounded-sm mt-2 border border-[#DEE2E6] dark:border-[#3A3D44] overflow-hidden">
                                                    <div className={`h-full transition-all duration-1000 ${isDone ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: isDone ? '100%' : '65%' }}></div>
                                                </div>
                                            </div>
                                            <button className="h-8 w-8 rounded-sm bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] text-gray-400 flex items-center justify-center hover:bg-[#3366CC] hover:text-white transition-all shadow-sm">
                                                <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm p-6">
                        <div className="flex items-center gap-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] pb-4 mb-6">
                            <div className="p-2 bg-[#F0F2F5] dark:bg-[#1A1D23] text-indigo-600 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44]">
                                <Activity size={18} />
                            </div>
                            <h3 className="text-[12px] font-bold text-gray-800 dark:text-white uppercase tracking-wider">Samaradorlik</h3>
                        </div>
                        <div className="space-y-8">
                            <div className="text-center">
                                <div className="inline-flex items-center justify-center h-40 w-40 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] bg-[#F8F9FA] dark:bg-[#111318] relative shadow-inner">
                                    <div className="text-center px-4">
                                        <div className="text-4xl font-black text-gray-800 dark:text-white tracking-tighter">88%</div>
                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1 leading-tight">Sifat Ko'rsatkichi</div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-center shadow-sm">
                                    <div className="text-xl font-bold text-gray-800 dark:text-white tabular-nums">12</div>
                                    <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1">O'z Vaqtida</div>
                                </div>
                                <div className="p-4 bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-center shadow-sm">
                                    <div className="text-xl font-bold text-amber-500 tabular-nums">2</div>
                                    <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1">Kechikkan</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm p-6">
                        <h3 className="text-[12px] font-bold text-gray-800 dark:text-white uppercase tracking-wider pb-4 mb-6 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex items-center gap-2">
                            <Clock size={16} className="text-[#3366CC]" />
                            Harajotlar va Amallar
                        </h3>
                        <div className="space-y-5">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="flex gap-4 group/item items-center border-b border-[#F0F2F5] dark:border-[#1A1D23] last:border-0 pb-3">
                                    <div className="shrink-0 w-1 h-8 bg-[#DEE2E6] dark:bg-[#3A3D44] rounded-sm group-hover/item:bg-[#3366CC] transition-colors"></div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight line-clamp-1">Hisobot Qabul Qilindi</p>
                                        <p className="text-[8px] font-black text-gray-400 mt-1 uppercase">BUGUN, 09:45</p>
                                    </div>
                                    <ArrowRight size={10} className="text-gray-300 group-hover/item:text-[#3366CC] transition-all" />
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
