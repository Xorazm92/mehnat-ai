import React, { useState, useMemo } from 'react';
import { Company, OperationEntry, Staff, Language, KPIMetrics } from '../types';
import { translations } from '../lib/translations';
import {
    BarChart3,
    Wallet,
    TrendingUp,
    AlertCircle,
    ChevronRight,
    CheckCircle2,
    XCircle,
    Percent,
    Search,
    Users
} from 'lucide-react';

interface Props {
    companies: Company[];
    operations: OperationEntry[];
    staff: Staff[];
    lang: Language;
}

// Rule-based Calculation Engine
export const calculateStaffSalaryAndKPI = (c: Company, s: Staff, kpi?: KPIMetrics) => {
    const contract = c.contractAmount || 0;
    let baseAmount = 0;
    let kpiBonus = 0;
    let roleFinalPercent = 0;

    // Rule 1: Supervisor (Nazoratchi)
    // Base 2.5%, Attendance +/- 0.5%
    if (c.supervisorId === s.id) {
        const basePerc = 2.5;
        const attendanceImpact = kpi ? (kpi.supervisorAttendance ? 0.5 : -0.5) : 0;
        roleFinalPercent = basePerc + attendanceImpact;
        baseAmount = (contract * basePerc) / 100;
        kpiBonus = (contract * attendanceImpact) / 100;
    }

    // Rule 2: Bank Client
    // Base 5% (or fixed sum if provided), Attendance +/- 1%, TG Ok +1%, Missing TG -0.5% each
    if (c.bankClientId === s.id) {
        const basePerc = 5;
        let impact = 0;
        if (kpi) {
            impact += kpi.bankClientAttendance ? 1 : -1;
            impact += kpi.bankClientTgOk ? 1 : 0;
            impact -= (kpi.bankClientTgMissed || 0) * 0.5;
        }
        roleFinalPercent = basePerc + impact;
        const actualBase = c.bankClientSum > 0 ? c.bankClientSum : (contract * 5 / 100);
        baseAmount = actualBase;
        kpiBonus = (contract * impact) / 100;
    }

    // Rule 3: Accountant
    // Base % (e.g. 20%) + Checklist Impacts
    if (c.accountantId === s.id) {
        const basePerc = c.accountantPerc || 20;
        let impact = 0;
        if (kpi) {
            impact += kpi.accTgOk ? 1 : 0;
            impact -= (kpi.accTgMissed || 0) * 0.5;
            impact += kpi.didox ? 0.25 : -0.25;
            impact += kpi.letters ? 0.25 : -0.25;
            impact += kpi.myMehnat ? 0.25 : -0.25;
            impact += kpi.oneC ? 1 : 0;
            impact += kpi.autoCameral ? 0.25 : -0.25;
            impact += kpi.cashFlow ? 0.2 : -0.2;
            impact += kpi.taxInfo ? 0.2 : -0.2;
            impact += kpi.payroll ? 0.2 : -0.2;
            impact += kpi.debt ? 0.2 : -0.2;
            impact += kpi.pnl ? 0.2 : -0.2;
        }
        roleFinalPercent = basePerc + impact;
        baseAmount = (contract * basePerc) / 100;
        kpiBonus = (contract * impact) / 100;
    }

    return {
        baseAmount,
        kpiBonus,
        finalPercent: roleFinalPercent,
        finalSalary: baseAmount + kpiBonus
    };
};

const SalaryKPIModule: React.FC<Props> = ({ companies, operations, staff, lang }) => {
    const t = translations[lang];
    const [search, setSearch] = useState('');
    const [selectedStaff, setSelectedStaff] = useState<string | null>(null);

    const staffStats = useMemo(() => {
        return staff.map(s => {
            const myCompanies = companies.filter(c => c.accountantId === s.id || c.bankClientId === s.id || c.supervisorId === s.id);
            let totalBase = 0;
            let totalKPI = 0;

            myCompanies.forEach(c => {
                const op = operations.find(o => o.companyId === c.id);
                const { baseAmount, kpiBonus } = calculateStaffSalaryAndKPI(c, s, op?.kpi);
                totalBase += baseAmount;
                totalKPI += kpiBonus;
            });

            return {
                ...s,
                baseSalary: totalBase,
                kpiAmount: totalKPI,
                total: totalBase + totalKPI,
                companyCount: myCompanies.length
            };
        });
    }, [staff, companies, operations]);

    const filteredStaff = staffStats.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder flex flex-col justify-between group hover:shadow-xl transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="h-12 w-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
                            <Wallet size={24} />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Umumiy Oylik</span>
                    </div>
                    <div>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-white tabular-nums">
                            {staffStats.reduce((a, b) => a + b.baseSalary, 0).toLocaleString()} <span className="text-sm font-bold text-slate-400">UZS</span>
                        </h4>
                        <p className="text-xs font-bold text-slate-400 mt-1">Shtat bo'yicha asosiy to'lovlar</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder flex flex-col justify-between group hover:shadow-xl transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                            <TrendingUp size={24} />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">KPI Mukofotlar</span>
                    </div>
                    <div>
                        <h4 className="text-3xl font-black text-emerald-500 tabular-nums">
                            {staffStats.reduce((a, b) => a + b.kpiAmount, 0).toLocaleString()} <span className="text-sm font-bold text-slate-400">UZS</span>
                        </h4>
                        <p className="text-xs font-bold text-slate-400 mt-1">Ish unumdorligi uchun bonus/jarima</p>
                    </div>
                </div>

                <div className="bg-orange-500 p-8 rounded-[2.5rem] flex flex-col justify-between shadow-2xl shadow-orange-500/20 group hover:-translate-y-1 transition-all">
                    <div className="flex items-center justify-between mb-4 text-white/80">
                        <Percent size={24} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Oylik Fondi</span>
                    </div>
                    <div>
                        <h4 className="text-3xl font-black text-white tabular-nums">
                            {staffStats.reduce((a, b) => a + b.total, 0).toLocaleString()} <span className="text-sm font-bold text-white/60">UZS</span>
                        </h4>
                        <p className="text-xs font-bold text-white/70 mt-1">Jami to'lanishi kerak bo'lgan summa</p>
                    </div>
                </div>
            </div>

            {/* Main Table Section */}
            <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-sm">
                <div className="p-8 md:p-10 border-b border-apple-border dark:border-apple-darkBorder flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Xodimlar Oyligi va KPI</h3>
                        <p className="text-sm font-bold text-slate-400">Hisobot davri: Yanvar 2026</p>
                    </div>

                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Xodimni topish..."
                            className="w-full pl-12 pr-6 py-3.5 bg-slate-50 dark:bg-white/5 border border-transparent rounded-2xl focus:bg-white dark:focus:bg-apple-darkBg focus:border-apple-accent transition-all outline-none font-bold text-sm"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b dark:border-apple-darkBorder">
                                <th className="px-10 py-6">Xodim</th>
                                <th className="px-6 py-6 border-l dark:border-apple-darkBorder">Firmalar</th>
                                <th className="px-6 py-6 border-l dark:border-apple-darkBorder">Oylik (Base)</th>
                                <th className="px-6 py-6 border-l dark:border-apple-darkBorder">KPI (Bonus/Jarima)</th>
                                <th className="px-10 py-6 border-l dark:border-apple-darkBorder">Jami</th>
                                <th className="px-6 py-6"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
                            {filteredStaff.map(s => (
                                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all group">
                                    <td className="px-10 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-2xl flex items-center justify-center text-white font-black shadow-lg" style={{ backgroundColor: s.avatarColor }}>
                                                {s.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-extrabold text-slate-800 dark:text-white text-base tracking-tight">{s.name}</p>
                                                <p className="text-[10px] font-black text-apple-accent uppercase tracking-widest">{s.role}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 border-l dark:border-apple-darkBorder">
                                        <div className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-apple-accent"></span>
                                            <span className="font-bold text-slate-600 dark:text-slate-300">{s.companyCount} ta</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 border-l dark:border-apple-darkBorder tabular-nums font-bold text-slate-700 dark:text-slate-300">
                                        {s.baseSalary.toLocaleString()} UZS
                                    </td>
                                    <td className="px-6 py-6 border-l dark:border-apple-darkBorder">
                                        <div className="flex flex-col">
                                            <span className={`font-black tabular-nums ${s.kpiAmount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {s.kpiAmount >= 0 ? '+' : ''}{s.kpiAmount.toLocaleString()} UZS
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-10 py-6 border-l dark:border-apple-darkBorder">
                                        <div className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl inline-block font-black tabular-nums shadow-lg">
                                            {s.total.toLocaleString()} UZS
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <button className="p-3 bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-apple-accent hover:bg-apple-accent/10 rounded-xl transition-all active:scale-95">
                                            <ChevronRight size={20} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detailed KPI Logic Explanation (Premium Info Card) */}
            <div className="bg-slate-900 dark:bg-apple-darkCard p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
                    <BarChart3 size={200} />
                </div>

                <div className="relative z-10 max-w-3xl">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="h-1 w-10 bg-apple-accent rounded-full"></div>
                        <h3 className="text-2xl font-black uppercase tracking-tight">Oylik & KPI Hisoblash Algoritmi</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <h5 className="font-black text-apple-accent uppercase text-xs tracking-[0.2em]">Oylik Asosi</h5>
                            <ul className="space-y-4">
                                <li className="flex gap-3 text-sm text-slate-400">
                                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-apple-accent shrink-0"></div>
                                    <div><b className="text-white">Buxgalter:</b> Shartnoma summasidan belgilangan foiz (% бухгалтер)</div>
                                </li>
                                <li className="flex gap-3 text-sm text-slate-400">
                                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-apple-accent shrink-0"></div>
                                    <div><b className="text-white">Bank Client:</b> Shartnomada belgilangan qat'iy summa (% банк клиент)</div>
                                </li>
                                <li className="flex gap-3 text-sm text-slate-400">
                                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-apple-accent shrink-0"></div>
                                    <div><b className="text-white">Nazoratchi:</b> Shartnoma summasidan belgilangan foiz (Назоратчи %)</div>
                                </li>
                            </ul>
                        </div>

                        <div className="space-y-6">
                            <h5 className="font-black text-emerald-500 uppercase text-xs tracking-[0.2em]">KPI Bonus/Jarima</h5>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <p className="text-[10px] font-black text-slate-500 uppercase">Telegram</p>
                                    <p className="text-sm font-bold">+1% / -0.5%</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <p className="text-[10px] font-black text-slate-500 uppercase">Didox/Hatlar</p>
                                    <p className="text-sm font-bold">±0.25%</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <p className="text-[10px] font-black text-slate-500 uppercase">1C Baza</p>
                                    <p className="text-sm font-bold">+1%</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <p className="text-[10px] font-black text-slate-500 uppercase">Soliqlar/F&Z</p>
                                    <p className="text-sm font-bold">±0.2%</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalaryKPIModule;
