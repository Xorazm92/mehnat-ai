import React, { useState, useEffect } from 'react';
import { EmployeeSalarySummary, Language, MonthlyPerformance } from '../types';
import { calculateEmployeeSalary, fetchMonthlyPerformance } from '../lib/supabaseData';
import { translations } from '../lib/translations';
import { Wallet, TrendingUp, AlertCircle, Award, Star, TrendingDown } from 'lucide-react';

interface Props {
    currentUserId: string;
    lang: Language;
}

const EmployeeDashboard: React.FC<Props> = ({ currentUserId, lang }) => {
    const t = translations[lang];
    const [summary, setSummary] = useState<EmployeeSalarySummary | null>(null);
    const [performances, setPerformances] = useState<MonthlyPerformance[]>([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    useEffect(() => {
        loadData();
    }, [currentUserId, month]);

    const loadData = async () => {
        setLoading(true);
        const [salaryData, perfData] = await Promise.all([
            calculateEmployeeSalary(currentUserId, `${month}-01`),
            fetchMonthlyPerformance(`${month}-01`, undefined, currentUserId)
        ]);
        setSummary(salaryData);
        setPerformances(perfData);
        setLoading(false);
    };

    if (loading) {
        return <div className="p-20 text-center text-slate-400">Loading details...</div>;
    }

    if (!summary) {
        return <div className="p-20 text-center text-slate-400">Ma'lumot topilmadi</div>;
    }

    // Calculate efficiency percentage (gamification)
    // Max possible bonus is hard to know exactly without knowing all rules, 
    // but we can estimate based on performed / total potential
    const positiveperf = performances.filter(p => p.calculatedScore > 0).length;
    // Assume a base goal of 50 positive actions per month for gamification scaling
    const efficiency = Math.min(100, Math.round((positiveperf / 20) * 100));

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Estimated Salary */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-apple-darkCard dark:to-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col justify-between shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Wallet size={120} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs font-black uppercase tracking-widest text-white/50 mb-2">Joriy Oylik (Tahminiy)</p>
                        <h3 className="text-4xl font-black tabular-nums tracking-tight">
                            {summary.totalSalary.toLocaleString()} <span className="text-lg text-white/50">UZS</span>
                        </h3>
                        <div className="mt-4 flex gap-4 text-xs font-bold text-white/60">
                            <span>Bazaviy: {summary.baseSalary.toLocaleString()}</span>
                            <span className="text-emerald-400">Bonus: +{summary.kpiBonus.toPrecision(3)}</span>
                        </div>
                    </div>
                </div>

                {/* Efficiency Score */}
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder flex flex-col justify-between shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Star size={120} />
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
                            <Award size={24} strokeWidth={3} />
                        </div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Samaradorlik</p>
                    </div>
                    <div>
                        <div className="flex items-end gap-2 mb-2">
                            <h3 className="text-5xl font-black text-slate-800 dark:text-white tabular-nums">{efficiency}%</h3>
                            <span className="text-sm font-bold text-slate-400 mb-2">natija</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-white/5 h-3 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-orange-400 to-pink-500 transition-all duration-1000" style={{ width: `${efficiency}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Penalties Alert */}
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder flex flex-col justify-between shadow-lg">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                            <AlertCircle size={24} strokeWidth={3} />
                        </div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Jarimalar</p>
                    </div>
                    <div>
                        <h3 className="text-3xl font-black text-rose-500 tabular-nums">
                            {summary.kpiPenalty.toLocaleString()} <span className="text-sm text-slate-400">UZS</span>
                        </h3>
                        <p className="text-xs font-bold text-slate-400 mt-2">
                            {performances.filter(p => p.calculatedScore < 0).length} ta qoidabuzarlik
                        </p>
                    </div>
                </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Positive Actions */}
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder">
                    <h4 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                        <TrendingUp className="text-emerald-500" /> Bajarilgan Vazifalar (Bonus)
                    </h4>
                    <div className="space-y-4">
                        {performances.filter(p => p.calculatedScore > 0).map(p => (
                            <div key={p.id} className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-500/5 rounded-2xl">
                                <div>
                                    <p className="font-bold text-slate-700 dark:text-white text-sm">{p.ruleNameUz || p.ruleName}</p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">{p.companyName}</p>
                                </div>
                                <span className="font-black text-emerald-600 bg-white dark:bg-white/10 px-3 py-1 rounded-lg text-xs">
                                    +{p.calculatedScore.toFixed(0)}%
                                </span>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore > 0).length === 0 && (
                            <p className="text-center text-slate-400 text-sm py-4">Hozircha bonuslar yo'q</p>
                        )}
                    </div>
                </div>

                {/* Negative Actions */}
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder">
                    <h4 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                        <TrendingDown className="text-rose-500" /> Jarimalar va Kechikishlar
                    </h4>
                    <div className="space-y-4">
                        {performances.filter(p => p.calculatedScore < 0).map(p => (
                            <div key={p.id} className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-500/5 rounded-2xl">
                                <div>
                                    <p className="font-bold text-slate-700 dark:text-white text-sm">{p.ruleNameUz || p.ruleName}</p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">{p.companyName}</p>
                                </div>
                                <span className="font-black text-rose-500 bg-white dark:bg-white/10 px-3 py-1 rounded-lg text-xs">
                                    {p.calculatedScore.toFixed(0)}%
                                </span>
                            </div>
                        ))}
                        {performances.filter(p => p.calculatedScore < 0).length === 0 && (
                            <p className="text-center text-slate-400 text-sm py-4">Qoidabuzarliklar yo'q! 🎉</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmployeeDashboard;
