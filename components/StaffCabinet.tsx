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
            <div className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-sm">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-[#FAFBFC] dark:bg-[#111318] rounded-sm border-2 border-[#DEE2E6] dark:border-[#3A3D44] flex items-center justify-center text-[#3366CC] shrink-0 relative shadow-inner">
                        <User size={32} />
                        <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-emerald-500 text-white rounded-sm flex items-center justify-center border-2 border-white dark:border-[#1A1D23] shadow-sm">
                            <CheckCircle size={10} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-[#EBF3FF] dark:bg-[#1C2531] text-[#3366CC] border border-[#DEE2E6] dark:border-[#3A3D44] px-3 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-widest">
                                {currentStaff.role === 'super_admin' ? t.role_super_admin : currentStaff.role === 'supervisor' ? t.role_supervisor : currentStaff.role === 'chief_accountant' ? t.role_chief_accountant : t.role_accountant}
                            </span>
                            <span className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em] bg-[#F8F9FA] dark:bg-[#111318] px-2 py-0.5 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm">ID: {currentStaff.id.slice(0, 8)}</span>
                        </div>
                        <h2 className="text-2xl font-black text-gray-800 dark:text-white uppercase leading-tight tracking-tight">
                            {t.welcome}, {currentStaff.name.split(' ')[0]}!
                        </h2>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">
                            {lang === 'uz' ? "Sizning bugungi nazorat va buxgalteriya hisoboti ko'rsatkichlaringiz." : "Ваши показатели контроля и бухгалтерской отчетности на сегодня."}
                        </p>
                    </div>
                </div>

                <div className="bg-[#F8F9FA] dark:bg-[#111318] p-5 border-l-4 border-l-[#3366CC] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm w-full lg:w-auto min-w-[300px] shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Taxminiy Maosh</p>
                    <p className="text-3xl font-black text-gray-800 dark:text-white tabular-nums flex items-baseline gap-2 leading-none">
                        {salarySummary.toLocaleString()} <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">UZS</span>
                    </p>
                    <div className="mt-3 pt-3 border-t border-[#DEE2E6] dark:border-[#3A3D44] text-[9px] font-black text-emerald-600 uppercase flex items-center gap-2 tracking-widest">
                        <TrendingUp size={12} /> KPI BONISI KIRITILGAN
                    </div>
                </div>
            </div>

            {isSupervisor && subordinates.length > 0 && (
                <div className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden">
                    <div className="bg-[#FAFBFC] dark:bg-[#111318] px-4 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex items-center gap-2">
                        <TrendingUp size={14} className="text-[#3366CC]" />
                        <h3 className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-widest">{t.teamStatus}</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5">
                        {[
                            { label: t.totalStaff, value: subordinates.length, color: 'text-[#3366CC]' },
                            { label: t.averageKpi, value: '94%', color: 'text-emerald-600' },
                            { label: t.tasks, value: '1.2k', color: 'text-blue-500' },
                            { label: t.activeFirms, value: '48', color: 'text-amber-600' }
                        ].map((stat, i) => (
                            <div key={i} className="bg-[#F8F9FA] dark:bg-[#111318] px-4 py-4 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm flex flex-col justify-between shadow-sm hover:border-[#3366CC] transition-colors group">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest group-hover:text-[#3366CC] transition-colors">{stat.label}</p>
                                <p className={`text-2xl font-black ${stat.color} tabular-nums mt-2 leading-none`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <div className="flex items-center justify-between bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-4 shadow-sm">
                    <h3 className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-widest flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#F8F9FA] dark:bg-[#111318] flex items-center justify-center text-[#3366CC] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-inner">
                            <Briefcase size={18} />
                        </div>
                        {t.personalCompanies}
                    </h3>
                    <div className="bg-[#F0F2F5] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] px-4 py-1.5 rounded-sm text-[10px] font-black text-[#3366CC] uppercase tracking-widest">
                        {t.total}: {personalCompanies.length}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {personalCompanies.map(c => {
                        const op = operations.find(o => o.companyId === c.id);
                        const isDone = op?.profitTaxStatus === ReportStatus.ACCEPTED;
                        return (
                            <div key={c.id} className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm flex flex-col shadow-sm hover:shadow-md transition-shadow group/comp border-t-4 border-t-gray-300 hover:border-t-[#3366CC]">
                                <div className={`p-4 border-b border-[#F0F2F5] dark:border-[#1e2025] ${isDone ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-[#FAFBFC] dark:bg-[#111318]'} flex justify-between items-center transition-colors`}>
                                    <div className="font-black text-[12px] text-gray-800 dark:text-white uppercase tracking-tight truncate flex-1">{c.name}</div>
                                    {isDone ? (
                                        <div className="w-6 h-6 bg-emerald-500 text-white flex items-center justify-center rounded-sm shadow-sm">
                                            <CheckCircle size={12} />
                                        </div>
                                    ) : (
                                        <div className="w-6 h-6 bg-amber-500 text-white flex items-center justify-center rounded-sm shadow-sm">
                                            <Clock size={12} />
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 flex-1 space-y-2.5">
                                    {[
                                        { label: 'Foyda Solig\'i', status: op?.profitTaxStatus },
                                        { label: 'Balans (F1)', status: op?.form1Status }
                                    ].map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-gray-500 border-b border-[#F0F2F5] dark:border-[#1e2025] pb-2 last:border-0 last:pb-0">
                                            <span>{item.label}</span>
                                            <span className={item.status === ReportStatus.ACCEPTED ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/10 px-2 rounded-sm border border-emerald-100' : 'text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-2 rounded-sm border border-gray-100'}>
                                                {item.status === ReportStatus.ACCEPTED ? 'QABUL QILINGAN' : 'KUTILMOQDA'}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-4 bg-[#F8F9FA] dark:bg-[#111318] flex justify-between items-center border-t border-[#DEE2E6] dark:border-[#3A3D44]">
                                    <div className="px-2 py-1 bg-white dark:bg-[#1A1D23] rounded-sm text-[8px] font-black text-gray-500 uppercase border border-[#DEE2E6] dark:border-[#3A3D44] tracking-widest">
                                        {c.taxType}
                                    </div>
                                    <div className="text-[14px] font-black text-gray-800 dark:text-white tabular-nums tracking-tighter">
                                        {c.contractAmount?.toLocaleString()} <span className="text-[9px] uppercase text-gray-400 font-black ml-0.5 tracking-widest">UZS</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Security Settings */}
            <div className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden">
                <div className="bg-[#FAFBFC] dark:bg-[#111318] px-4 py-3 border-b border-[#DEE2E6] dark:border-[#3A3D44] flex items-center gap-2">
                    <Shield size={14} className="text-gray-400" />
                    <h3 className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-widest">{t.securitySettings}</h3>
                </div>

                <div className="p-8">
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
                        className="max-w-2xl space-y-6"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[
                                { name: 'newPassword', label: t.newPassword },
                                { name: 'confirmPassword', label: t.confirmPassword }
                            ].map((field) => (
                                <div key={field.name}>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 tracking-widest">{field.label}</label>
                                    <input
                                        name={field.name}
                                        type="password"
                                        placeholder="••••••••"
                                        className="w-full bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm py-3 px-4 text-[12px] font-black tracking-[0.3em] text-[#3366CC] outline-none focus:border-[#3366CC] transition-all shadow-inner placeholder:tracking-normal placeholder:text-gray-300"
                                        required
                                    />
                                </div>
                            ))}
                        </div>
                        <button
                            type="submit"
                            className="bg-[#3366CC] text-white px-8 py-3 rounded-sm font-black text-[11px] uppercase tracking-widest flex items-center gap-3 hover:bg-[#2855AA] transition-all shadow-sm active:scale-95"
                        >
                            {t.updatePassword} <Shield size={16} />
                        </button>
                    </form>

                    <div className="mt-10 p-5 bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] border-l-4 border-l-blue-400 rounded-sm flex items-start gap-4 shadow-sm">
                        <div className="w-8 h-8 rounded-sm bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] text-blue-500 flex items-center justify-center shrink-0 shadow-sm">
                            <Star size={16} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-relaxed">
                                Xavfsizlik protokoli: Barcha parollar shifrlangan holatda saqlanadi. Ma'lumotlaringiz xavfsizligi kafolatlangan.
                            </p>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">ASOS ACCOUNTING • SECURITY SYSTEM v2.4</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StaffCabinet;
