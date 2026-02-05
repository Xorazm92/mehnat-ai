
import React, { useMemo } from 'react';
import { Company, OperationEntry, Staff, Language, ReportStatus } from '../types';
import { translations } from '../lib/translations';
import { User, Briefcase, TrendingUp, CheckCircle, Clock, AlertCircle } from 'lucide-react';


interface StaffCabinetProps {
    currentStaff: Staff;
    companies: Company[];
    operations: OperationEntry[];
    lang: Language;
}

const StaffCabinet: React.FC<StaffCabinetProps> = ({ currentStaff, companies, operations, lang }) => {
    const t = translations[lang];

    const [salarySummary, setSalarySummary] = React.useState<number>(0);

    const myCompanies = useMemo(() => {
        return companies.filter(c =>
            c.accountantId === currentStaff.id ||
            c.bankClientId === currentStaff.id ||
            c.supervisorId === currentStaff.id
        );
    }, [companies, currentStaff]);

    const stats = useMemo(() => {
        const total = myCompanies.length;
        const completed = operations.filter(op =>
            myCompanies.some(c => c.id === op.companyId) &&
            op.profitTaxStatus === ReportStatus.ACCEPTED
        ).length;

        return {
            total,
            completed,
            progress: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }, [myCompanies, operations]);

    // Async Fetch Salary
    React.useEffect(() => {
        const fetchSalary = async () => {
            const { calculateEmployeeSalary } = await import('../lib/supabaseData');
            const currentMonth = new Date().toISOString().slice(0, 7);
            const data = await calculateEmployeeSalary(currentStaff.id, `${currentMonth}-01`);
            if (data) setSalarySummary(data.totalSalary);
        };
        fetchSalary();
    }, [currentStaff.id]);

    return (
        <div className="space-y-8 animate-macos">
            {/* Welcome & Overview */}
            <div className="flex flex-col md:flex-row items-center gap-8 bg-white dark:bg-apple-darkCard p-10 rounded-[3rem] border border-slate-100 dark:border-apple-darkBorder shadow-sm">
                <div className="h-32 w-32 rounded-[2.5rem] bg-apple-accent text-white flex items-center justify-center shadow-2xl shadow-blue-500/20">
                    <User size={64} strokeWidth={2.5} />
                </div>
                <div className="text-center md:text-left flex-1">
                    <h2 className="text-4xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-3">Salom, {currentStaff.name}!</h2>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                        <span className="px-4 py-1.5 rounded-xl bg-blue-500/10 text-blue-600 text-[10px] font-black uppercase tracking-widest">{currentStaff.role}</span>
                        <span className="px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-apple-darkBg text-slate-500 text-[10px] font-black uppercase tracking-widest">ID: {currentStaff.id.slice(0, 8)}</span>
                    </div>
                </div>
                <div className="bg-slate-50 dark:bg-apple-darkBg p-6 rounded-[2rem] text-center border border-slate-100 dark:border-apple-darkBorder">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxminiy Maosh</p>
                    <p className="text-3xl font-black text-apple-accent tracking-tighter tabular-nums">{salarySummary.toLocaleString()} <span className="text-xs">UZS</span></p>
                </div>
            </div>

            {/* Progress Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-slate-100 dark:border-apple-darkBorder relative overflow-hidden group">
                    <div className="absolute right-0 top-0 h-32 w-32 bg-blue-500/5 rounded-full -translate-y-12 translate-x-12 group-hover:scale-150 transition-transform duration-700"></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Mening Progressim</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-slate-800 dark:text-white tracking-tighter">{stats.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-apple-darkBg h-2 rounded-full mt-6 overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full transition-all duration-1000" style={{ width: `${stats.progress}%` }}></div>
                    </div>
                </div>

                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-slate-100 dark:border-apple-darkBorder">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Tugallanganish</p>
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                            <CheckCircle size={28} />
                        </div>
                        <div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white leading-none">{stats.completed} / {stats.total}</div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Bitgan firmalar</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-slate-100 dark:border-apple-darkBorder">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Qolgan ishlar</p>
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                            <Clock size={28} />
                        </div>
                        <div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white leading-none">{stats.total - stats.completed}</div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Topshirilishi kerak</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Firm List */}
            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight ml-4 flex items-center gap-3">
                <Briefcase size={20} className="text-apple-accent" />
                Mening Korxonalarim
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myCompanies.map(c => {
                    const op = operations.find(o => o.companyId === c.id);
                    const isDone = op?.profitTaxStatus === ReportStatus.ACCEPTED;
                    return (
                        <div key={c.id} className="bg-white dark:bg-apple-darkCard p-6 rounded-[2rem] border border-slate-100 dark:border-apple-darkBorder hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="font-black text-slate-800 dark:text-white uppercase tracking-tight text-sm group-hover:text-apple-accent transition-colors">{c.name}</div>
                                {isDone ? (
                                    <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                                        <CheckCircle size={14} />
                                    </div>
                                ) : (
                                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-apple-darkBg text-slate-400 flex items-center justify-center shrink-0">
                                        <Clock size={14} />
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    <span>Soliq</span>
                                    <span className={op?.profitTaxStatus === ReportStatus.ACCEPTED ? 'text-emerald-500' : 'text-slate-500'}>{op?.profitTaxStatus || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    <span>Balans (F1)</span>
                                    <span className={op?.form1Status === ReportStatus.ACCEPTED ? 'text-emerald-500' : 'text-slate-500'}>{op?.form1Status || '-'}</span>
                                </div>
                            </div>
                            <div className="mt-6 pt-4 border-t border-slate-50 dark:border-apple-darkBorder flex justify-between items-center">
                                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{c.taxRegime}</span>
                                <span className="text-[10px] font-black text-apple-accent uppercase">{c.contractAmount?.toLocaleString()} UZS</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default StaffCabinet;
