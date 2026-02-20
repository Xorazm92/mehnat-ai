import React, { useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, Language } from '../types';
import { translations } from '../lib/translations';
import { periodsEqual } from '../lib/periods';

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

        return { total: companies.length, completed, delayed, blocked };
    }, [companies, operations, selectedPeriod]);

    const progress = stats.total > 0 ? Math.round((stats.completed / (stats.total || 1)) * 100) : 0;

    const Card = ({ label, value, sub, icon }: any) => (
        <div className="dashboard-card p-6 md:p-9 text-left relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 text-6xl md:text-8xl opacity-[0.07] pointer-events-none group-hover:scale-110 transition-transform duration-500">{icon}</div>
            <p className="text-tiny md:text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 md:mb-5">{label}</p>
            <h3 className="text-4xl md:text-5xl font-extrabold tracking-tighter tabular-nums text-slate-800 dark:text-white premium-text-gradient">{value}</h3>
            <p className="text-xs md:text-sm font-semibold text-slate-500 dark:text-slate-400 mt-3 md:mt-5 line-clamp-1">{sub}</p>
        </div>
    );

    return (
        <div className="animate-macos">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight premium-text-gradient">
                    {lang === 'uz' ? 'Mening Ish Stolim' : 'Мой Рабочий Стол'}
                </h2>
                <span className="px-4 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 rounded-full text-xs font-bold uppercase tracking-wider">
                    {lang === 'uz' ? 'Buxgalter' : 'Бухгалтер'}
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-8 mb-10 md:mb-16">
                <Card label={lang === 'uz' ? 'Biriktirilgan' : 'Закреплено'} value={stats.total} sub={lang === 'uz' ? 'Firma' : 'Фирма'} icon="💼" />
                <Card label={lang === 'uz' ? 'Bajarildi' : 'Выполнено'} value={`${progress}%`} sub={lang === 'uz' ? `${stats.completed} ta hisobot topshirildi` : `${stats.completed} отчетов сдано`} icon="✅" />
                <Card label={lang === 'uz' ? 'Qarzdorlik' : 'Задолженность'} value={stats.delayed} sub={lang === 'uz' ? 'Topshirilmagan / Kechikkan' : 'Не сдано / Просрочено'} icon="🚨" />
                <Card label={lang === 'uz' ? 'Muammoli' : 'Проблемные'} value={stats.blocked} sub={lang === 'uz' ? 'Kartoteka / Bloklangan' : 'Картотека / Блокировано'} icon="🔒" />
            </div>

            <div className="dashboard-card p-8">
                <h3 className="text-lg font-bold mb-6 dark:text-white premium-text-gradient">
                    {lang === 'uz' ? 'Bugungi Vazifalar' : 'Задачи на сегодня'}
                </h3>
                {stats.delayed > 0 ? (
                    <div className="p-6 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800 rounded-[1.5rem] flex items-center gap-5 animate-pulse">
                        <span className="text-3xl text-rose-500">🔥</span>
                        <div>
                            <p className="font-black text-rose-700 dark:text-rose-400 text-lg">
                                {lang === 'uz' ? `${stats.delayed} ta firma hisoboti kechikmoqda!` : `${stats.delayed} отчетов фирм просрочено!`}
                            </p>
                            <p className="text-sm text-rose-500 font-bold">
                                {lang === 'uz' ? 'Iltimos, "Operatsiyalar" bo\'limini tekshiring.' : 'Пожалуйста, проверьте раздел "Операции".'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-10 opacity-60">
                        <p className="text-4xl mb-4">🎉</p>
                        <p className="text-slate-500 font-black uppercase tracking-widest text-sm">
                            {lang === 'uz' ? 'Barchasi joyida!' : 'Все в порядке!'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AccountantDashboard;
