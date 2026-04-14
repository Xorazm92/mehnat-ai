import React, { useMemo, useState, useEffect } from 'react';
import { Company, OperationEntry, Staff, Language, ReportStatus, MonthlyPerformance } from '../types';
import { translations } from '../lib/translations';
import { fetchMonthlyPerformance } from '../lib/supabaseData';
import { calculateCompanySalaries } from '../lib/kpiLogic';
import { User, Briefcase, TrendingUp, CheckCircle, Clock, AlertCircle, Star, Shield } from 'lucide-react';

interface StaffCabinetProps {
    currentStaff: Staff;
    companies: Company[];
    operations: OperationEntry[];
    staff: Staff[];
    lang: Language;
}

const StaffCabinet: React.FC<StaffCabinetProps> = ({ currentStaff, companies, operations, staff, lang }) => {
    const t = translations[lang];

    const [salarySummary, setSalarySummary] = useState<number>(0);
    const [performances, setPerformances] = useState<MonthlyPerformance[]>([]);

    const { personalCompanies, supervisedOnlyCompanies } = useMemo(() => {
        const personal = companies.filter(c => c.accountantId === currentStaff.id || c.bankClientId === currentStaff.id);
        const supervised = companies.filter(c => c.supervisorId === currentStaff.id && c.accountantId !== currentStaff.id && c.bankClientId !== currentStaff.id);
        return { personalCompanies: personal, supervisedOnlyCompanies: supervised };
    }, [companies, currentStaff]);

    useEffect(() => {
        const loadSalaryData = async () => {
            const currentMonth = new Date().toISOString().slice(0, 7);
            try {
                const isSuperior = currentStaff.role === 'super_admin' || currentStaff.role === 'chief_accountant' || currentStaff.role === 'supervisor';
                const perfData = await fetchMonthlyPerformance(`${currentMonth}-01`, undefined, isSuperior ? undefined : currentStaff.id);
                setPerformances(perfData);

                let totalBase = 0;
                let totalKpiBonus = 0;
                let totalKpiPenalty = 0;

                const targetCompanies = (currentStaff.role === 'super_admin' || currentStaff.role === 'chief_accountant')
                    ? companies
                    : personalCompanies;

                targetCompanies.forEach(c => {
                    const op = operations.find(o => o.companyId === c.id && o.period === currentMonth);
                    const results = calculateCompanySalaries(c, op, perfData);

                    results.filter(r => r.staffId === currentStaff.id).forEach(res => {
                        totalBase += res.baseAmount;
                        if (res.finalAmount < res.baseAmount) {
                            totalKpiPenalty += (res.baseAmount - res.finalAmount);
                        } else if (res.finalAmount > res.baseAmount) {
                            totalKpiBonus += (res.finalAmount - res.baseAmount);
                        }
                    });
                });

                setSalarySummary(totalBase - totalKpiPenalty + totalKpiBonus);
            } catch (e) {
                console.error(e);
            }
        };
        loadSalaryData();
    }, [currentStaff.id, personalCompanies, operations, companies]);

    const subordinates = useMemo(() => {
        if (currentStaff.role === 'super_admin' || currentStaff.role === 'chief_accountant') {
            return staff.filter(s => s.id !== currentStaff.id);
        }
        if (currentStaff.role === 'supervisor' || currentStaff.role === 'manager') {
            const managedCompanyIds = companies
                .filter(c => c.supervisorId === currentStaff.id)
                .map(c => c.id);

            return staff.filter(s =>
                s.id !== currentStaff.id &&
                companies.some(c =>
                    managedCompanyIds.includes(c.id) &&
                    (c.accountantId === s.id || c.bankClientId === s.id)
                )
            );
        }
        return [];
    }, [staff, companies, currentStaff]);

    const isSupervisor = currentStaff.role === 'supervisor' || currentStaff.role === 'chief_accountant' || currentStaff.role === 'super_admin';

    return (
        <div className="space-y-6 animate-fade-in pb-20 max-w-7xl mx-auto group/cabinet">
            {/* Header: User Information */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600 shrink-0 relative">
                        <User size={40} />
                        <div className="absolute -bottom-2 -right-2 h-6 w-6 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 border border-emerald-200 dark:border-emerald-800 rounded flex items-center justify-center">
                            <CheckCircle size={12} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded text-[9px] font-bold uppercase tracking-widest">
                                {currentStaff.role === 'super_admin' ? t.role_super_admin : currentStaff.role === 'supervisor' ? t.role_supervisor : currentStaff.role === 'chief_accountant' ? t.role_chief_accountant : t.role_accountant}
                            </span>
                            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">ID: {currentStaff.id.slice(0, 8)}</span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white uppercase leading-tight mb-2">
                            {t.welcome}, {currentStaff.name.split(' ')[0]}!
                        </h2>
                        <p className="text-gray-500 text-sm font-bold max-w-xl leading-snug">
                            {lang === 'uz' ? "Sizning bugungi nazorat va buxgalteriya hisoboti ko'rsatkichlaringiz." : "Ваши показатели контроля и бухгалтерской отчетности на сегодня."}
                        </p>
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-[#1e2025] p-6 rounded border border-gray-200 dark:border-gray-700 w-full lg:w-auto min-w-[280px]">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Taxminiy Maosh</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums flex items-baseline gap-2">
                        {salarySummary.toLocaleString()} <span className="text-xs font-bold uppercase text-gray-400">UZS</span>
                    </p>
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                        <TrendingUp size={12} /> KPI Bonusi
                    </div>
                </div>
            </div>

            {isSupervisor && subordinates.length > 0 && (
                <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm p-4">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="w-8 h-8 rounded bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800 text-emerald-600">
                            <TrendingUp size={16} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">
                            {t.teamStatus}
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: t.totalStaff, value: subordinates.length, color: 'indigo' },
                            { label: t.averageKpi, value: '94%', color: 'emerald' },
                            { label: t.tasks, value: '1.2k', color: 'sky' },
                            { label: t.activeFirms, value: '48', color: 'amber' }
                        ].map((stat, i) => (
                            <div key={i} className="bg-gray-50 dark:bg-[#1e2025] px-4 py-3 border border-gray-200 dark:border-gray-700 rounded flex flex-col justify-between">
                                <p className="text-[10px] font-bold text-gray-500 uppercase">{stat.label}</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums mt-1">{stat.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <div className="flex items-center justify-between bg-white dark:bg-[#22252B] p-4 border border-gray-200 dark:border-gray-700 rounded shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 border border-indigo-100 dark:border-indigo-800">
                            <Briefcase size={16} />
                        </div>
                        {t.personalCompanies}
                    </h3>
                    <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded text-[10px] font-bold uppercase">
                        {t.total}: {personalCompanies.length}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {personalCompanies.map(c => {
                        const op = operations.find(o => o.companyId === c.id);
                        const isDone = op?.profitTaxStatus === ReportStatus.ACCEPTED;
                        return (
                            <div key={c.id} className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden flex flex-col">
                                <div className={`p-4 border-b ${isDone ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800' : 'bg-gray-50 dark:bg-[#1e2025] border-gray-200 dark:border-gray-700'} flex justify-between items-start`}>
                                    <div className="font-bold text-sm text-gray-900 dark:text-white max-w-[200px] truncate">{c.name}</div>
                                    {isDone ? (
                                        <div className="w-6 h-6 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
                                            <CheckCircle size={12} />
                                        </div>
                                    ) : (
                                        <div className="w-6 h-6 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center border border-amber-200 dark:border-amber-800">
                                            <Clock size={12} />
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 flex-1 space-y-3">
                                    {[
                                        { label: 'Foyda Solig\'i', status: op?.profitTaxStatus },
                                        { label: 'Balans (F1)', status: op?.form1Status }
                                    ].map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-[10px] font-bold uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700 pb-2 last:border-0 last:pb-0">
                                            <span>{item.label}</span>
                                            <span className={item.status === ReportStatus.ACCEPTED ? 'text-emerald-600' : 'text-gray-400'}>{item.status || 'Kutilmoqda'}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e2025] flex justify-between items-center">
                                    <div className="px-2 py-1 bg-white dark:bg-[#22252B] rounded text-[9px] font-bold text-gray-500 uppercase border border-gray-200 dark:border-gray-700">
                                        {c.taxType}
                                    </div>
                                    <div className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                                        {c.contractAmount?.toLocaleString()} <span className="text-[9px] uppercase text-gray-400 ml-0.5">UZS</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Security Settings */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="w-8 h-8 rounded bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center border border-rose-100 dark:border-rose-800 text-rose-600">
                        <AlertCircle size={16} />
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">
                        {t.securitySettings}
                    </h3>
                </div>

                <form
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const newPass = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
                        const confirmPass = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;

                        if (newPass.length < 6) {
                            alert("Parol kamida 6 ta belgidan iborat bo'lishi kerak");
                            return;
                        }
                        if (newPass !== confirmPass) {
                            alert("Parollar mos kelmadi");
                            return;
                        }

                        const { supabase } = await import('../lib/supabaseClient');
                        const { error } = await supabase.auth.updateUser({ password: newPass });

                        if (error) alert("Xatolik: " + error.message);
                        else {
                            alert("Parol muvaffaqiyatli o'zgartirildi!");
                            form.reset();
                        }
                    }}
                    className="max-w-xl space-y-6"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            { name: 'newPassword', label: t.newPassword },
                            { name: 'confirmPassword', label: t.confirmPassword }
                        ].map((field) => (
                            <div key={field.name}>
                                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-2">{field.label}</label>
                                <input
                                    name={field.name}
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full bg-gray-50 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-all placeholder:text-gray-400"
                                    required
                                />
                            </div>
                        ))}
                    </div>
                    <button
                        type="submit"
                        className="px-6 py-2.5 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                    >
                        {t.updatePassword} <Shield size={14} />
                    </button>
                </form>

                <div className="mt-8 p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800 rounded flex items-start gap-4">
                    <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 flex items-center justify-center shrink-0">
                        <Star size={14} />
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed max-w-2xl mt-1">
                        Xavfsizlik protokoli: Barcha parollar shifrlangan holatda saqlanadi. Ma'lumotlaringiz xavfsizligi kafolatlangan.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default StaffCabinet;
