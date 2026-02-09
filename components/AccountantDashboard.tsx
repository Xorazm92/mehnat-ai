import React, { useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, Language } from '../types';
import { translations } from '../lib/translations';

interface AccountantDashboardProps {
    companies: Company[];
    operations: OperationEntry[];
    selectedPeriod: string;
    lang: Language;
}

const AccountantDashboard: React.FC<AccountantDashboardProps> = ({ companies, operations, selectedPeriod, lang }) => {
    const t = translations[lang];

    // Filter operations for these companies AND current period
    const myOpIds = new Set(companies.map(c => c.id));
    const myOperations = operations.filter(op => op.period === selectedPeriod && myOpIds.has(op.companyId));

    const stats = useMemo(() => {
        let completed = 0;
        let delayed = 0;
        let blocked = 0;

        companies.forEach(c => {
            const op = operations.find(o => o.companyId === c.id && o.period === selectedPeriod);
            if (!op) {
                delayed++; // No record = not submitted
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

        return { total: companies.length, completed, delayed, blocked };
    }, [companies, operations, selectedPeriod]);

    const progress = stats.total > 0 ? Math.round((stats.completed / (stats.total || 1)) * 100) : 0;

    const Card = ({ label, value, sub, icon }: any) => (
        <div className={`relative p-6 md:p-9 rounded-[2rem] border transition-all duration-300 text-left overflow-hidden bg-white dark:bg-apple-darkCard border-apple-border dark:border-apple-darkBorder shadow-sm hover:shadow-md`}>
            <div className="absolute -right-4 -top-4 text-6xl md:text-8xl opacity-[0.07] pointer-events-none">{icon}</div>
            <p className="text-tiny md:text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 md:mb-5">{label}</p>
            <h3 className={`text-4xl md:text-5xl font-extrabold tracking-tighter tabular-nums text-slate-800 dark:text-white`}>{value}</h3>
            <p className="text-xs md:text-sm font-semibold text-slate-500 dark:text-slate-400 mt-3 md:mt-5 line-clamp-1">{sub}</p>
        </div>
    );

    return (
        <div className="animate-macos">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Mening Ish Stolim</h2>
                <span className="px-4 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 rounded-full text-xs font-bold uppercase tracking-wider">Buxgalter</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-8 mb-10 md:mb-16">
                <Card label="Biriktirilgan" value={stats.total} sub="Firma" icon="💼" />
                <Card label="Bajarildi" value={`${progress}%`} sub={`${stats.completed} ta hisobot topshirildi`} icon="✅" />
                <Card label="Qarzdorlik" value={stats.delayed} sub="Topshirilmagan / Kechikkan" icon="🚨" />
                <Card label="Muammoli" value={stats.blocked} sub="Kartoteka / Bloklangan" icon="🔒" />
            </div>

            {/* Placeholder for Task Manager */}
            <div className="bg-white dark:bg-apple-darkCard rounded-[2rem] p-8 border border-apple-border dark:border-apple-darkBorder">
                <h3 className="text-lg font-bold mb-4 dark:text-white">Bugungi Vazifalar</h3>
                {stats.delayed > 0 ? (
                    <div className="p-4 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800 rounded-xl flex items-center gap-3">
                        <span className="text-xl">🔥</span>
                        <div>
                            <p className="font-bold text-rose-700 dark:text-rose-400">{stats.delayed} ta firma hisoboti kechikmoqda!</p>
                            <p className="text-xs text-rose-500">Iltimos, "Hisobotlar" bo'limini tekshiring.</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-slate-500">Barchasi joyida! 🎉</p>
                )}
            </div>
        </div>
    );
};

export default AccountantDashboard;
