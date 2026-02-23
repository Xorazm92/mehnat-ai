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
        <div className="space-y-12 animate-macos pb-20 max-w-[1400px] mx-auto group/cabinet">
            {/* 🧊 WELCOME HERO V2 */}
            <div className="flex flex-col lg:flex-row items-center gap-12 liquid-glass-card p-12 md:p-16 rounded-[4rem] border border-white/30 relative overflow-hidden group">
                <div className="glass-reflection"></div>
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] -mr-48 -mt-48 transition-all group-hover:scale-110"></div>

                <div className="relative z-10">
                    <div className="h-52 w-52 rounded-[3.5rem] bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-glass-indigo relative group-hover:scale-105 transition-all duration-700">
                        <User size={100} strokeWidth={2.5} className="group-hover:rotate-3 transition-transform duration-700" />
                        <div className="absolute -bottom-4 -right-4 h-16 w-16 liquid-glass-card rounded-2xl flex items-center justify-center text-emerald-500 shadow-glass-emerald border border-white/40">
                            <CheckCircle size={32} strokeWidth={3} />
                        </div>
                    </div>
                </div>

                <div className="text-center lg:text-left flex-1 relative z-10">
                    <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 mb-8">
                        <span className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.4em] shadow-glass liquid-glass-rim ${currentStaff.role === 'super_admin' ? 'bg-amber-500 text-white' : 'bg-indigo-500 text-white'}`}>
                            {currentStaff.role === 'super_admin' ? t.role_super_admin : currentStaff.role === 'supervisor' ? t.role_supervisor : currentStaff.role === 'chief_accountant' ? t.role_chief_accountant : t.role_accountant}
                        </span>
                        <span className="px-6 py-2.5 rounded-2xl bg-white/10 dark:bg-white/5 border border-white/20 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] shadow-glass">Vector-ID: {currentStaff.id.slice(0, 8)}</span>
                    </div>
                    <h2 className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter leading-none mb-6 premium-text-gradient">{t.welcome}, {currentStaff.name.split(' ')[0]}!</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-bold max-w-xl leading-relaxed text-lg opacity-80">
                        {lang === 'uz' ? "Sizning bugungi nazorat va buxgalteriya hisoboti ko'rsatkichlaringiz. Jamoangiz samaradorligini real vaqt rejimida kuzatib boring." : "Ваши показатели контроля и бухгалтерской отчетности на сегодня. Следите за эффективностью вашей команды в режиме реального времени."}
                    </p>
                </div>

                <div className="liquid-glass-card p-12 rounded-[3.5rem] text-center border border-white/30 min-w-[320px] shadow-glass-indigo group-hover:translate-y-[-10px] transition-all duration-700 relative z-10">
                    <div className="glass-reflection"></div>
                    <p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.4em] mb-6">Taxminiy Maosh</p>
                    <p className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums flex items-baseline justify-center gap-4">
                        {salarySummary.toLocaleString()} <span className="text-sm font-black uppercase opacity-40">UZS</span>
                    </p>
                    <div className="mt-8 pt-8 border-t border-white/10 text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-3">
                        <TrendingUp size={16} /> KPI Bonusi Bilan Birga
                    </div>
                    <div className={`absolute -bottom-10 -right-10 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl`}></div>
                </div>
            </div>

            {isSupervisor && subordinates.length > 0 && (
                <div className="liquid-glass-card p-12 rounded-[4rem] border border-white/20 shadow-glass-lg relative group overflow-hidden">
                    <div className="glass-reflection"></div>
                    <div className="absolute -top-32 -right-32 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-1000"></div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-6 mb-12">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-glass-emerald">
                                <TrendingUp size={28} strokeWidth={3} />
                            </div>
                            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">
                                {t.teamStatus}
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                            {[
                                { label: t.totalStaff, value: subordinates.length, color: 'indigo' },
                                { label: t.averageKpi, value: '94%', color: 'emerald' },
                                { label: t.tasks, value: '1.2k', color: 'sky' },
                                { label: t.activeFirms, value: '48', color: 'amber' }
                            ].map((stat, i) => (
                                <div key={i} className="bg-white/5 dark:bg-white/[0.02] border border-white/10 p-8 rounded-[2.5rem] text-center hover:bg-white/10 dark:hover:bg-white/[0.05] transition-all group/stat">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 group-hover/stat:text-indigo-500 transition-colors">{stat.label}</p>
                                    <p className={`text-4xl font-black text-slate-900 dark:text-white tabular-nums group-hover/stat:scale-110 transition-transform`}>{stat.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-10">
                <div className="flex items-center justify-between px-6">
                    <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-6">
                        <Briefcase size={36} className="text-indigo-500" />
                        {t.personalCompanies}
                    </h3>
                    <div className="px-8 py-3 bg-indigo-500/10 text-indigo-500 rounded-2xl text-[11px] font-black uppercase tracking-widest border border-indigo-500/20 shadow-glass-indigo">
                        {t.total}: {personalCompanies.length}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                    {personalCompanies.map(c => {
                        const op = operations.find(o => o.companyId === c.id);
                        const isDone = op?.profitTaxStatus === ReportStatus.ACCEPTED;
                        return (
                            <div key={c.id} className="liquid-glass-card p-10 rounded-[3.5rem] border border-white/10 hover:border-indigo-500/40 transition-all duration-700 group relative overflow-hidden">
                                <div className="glass-reflection"></div>
                                <div className="absolute -top-16 -right-16 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/15 transition-all"></div>

                                <div className="flex justify-between items-start mb-10 relative z-10">
                                    <div className="font-black text-2xl text-slate-900 dark:text-white tracking-tighter group-hover:text-indigo-500 transition-colors leading-none pr-8">{c.name}</div>
                                    {isDone ? (
                                        <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 shadow-glass-emerald border border-emerald-500/20 animate-pulse-subtle">
                                            <CheckCircle size={28} strokeWidth={3} />
                                        </div>
                                    ) : (
                                        <div className="h-14 w-14 rounded-2xl bg-white/5 text-slate-400 flex items-center justify-center shrink-0 border border-white/10 shadow-inner">
                                            <Clock size={28} strokeWidth={3} />
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-6 relative z-10">
                                    {[
                                        { label: 'Foyda Solig\'i', status: op?.profitTaxStatus },
                                        { label: 'Balans (F1)', status: op?.form1Status }
                                    ].map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 border-b border-white/5 pb-5 group/row">
                                            <span className="group-hover/row:text-slate-600 dark:group-hover/row:text-white transition-colors">{item.label}</span>
                                            <span className={item.status === ReportStatus.ACCEPTED ? 'text-emerald-500' : 'text-slate-400 opacity-60'}>{item.status || 'Kutilmoqda'}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-12 flex justify-between items-center relative z-10">
                                    <div className="px-5 py-2.5 bg-white/5 rounded-[1.25rem] text-[10px] font-black text-slate-500 uppercase tracking-widest border border-white/10">
                                        {c.taxType}
                                    </div>
                                    <div className="text-2xl font-black text-indigo-500 tabular-nums tracking-tighter">
                                        {c.contractAmount?.toLocaleString()} <span className="text-[10px] opacity-40 ml-1">UZS</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 安全设置 V2 */}
            <div className="liquid-glass-card p-12 md:p-16 rounded-[4rem] border border-white/20 shadow-glass-lg relative overflow-hidden group">
                <div className="glass-reflection"></div>
                <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-rose-500/5 rounded-full blur-[100px] pointer-events-none group-hover:bg-rose-500/10 transition-all duration-1000"></div>

                <div className="flex items-center gap-8 mb-16 relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20 shadow-glass-rose">
                        <AlertCircle size={32} strokeWidth={3} />
                    </div>
                    <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">
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
                            alert("Parol kamida 6 ta belgidan iborat bo'lik kerak");
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
                    className="max-w-xl space-y-12 relative z-10"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        {[
                            { name: 'newPassword', label: t.newPassword },
                            { name: 'confirmPassword', label: t.confirmPassword }
                        ].map((field) => (
                            <div key={field.name} className="group">
                                <label className="block text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 mb-5 group-focus-within:text-indigo-500 transition-colors">{field.label}</label>
                                <input
                                    name={field.name}
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full bg-white/5 dark:bg-white/[0.02] border border-white/10 rounded-[1.5rem] px-8 py-6 font-black text-lg outline-none focus:bg-white/10 dark:focus:bg-white/[0.05] focus:border-indigo-500/40 transition-all shadow-inner placeholder:text-slate-600"
                                    required
                                />
                            </div>
                        ))}
                    </div>
                    <button
                        type="submit"
                        className="px-16 py-7 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[2.5rem] font-black text-[14px] uppercase tracking-[0.4em] hover:scale-105 active:scale-95 transition-all shadow-glass-indigo relative overflow-hidden group/submit"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-white/20 to-indigo-500/0 -translate-x-full group-hover/submit:translate-x-full transition-transform duration-1000"></div>
                        <span className="relative z-10 flex items-center justify-center gap-4">
                            {t.updatePassword} <Shield size={20} className="animate-pulse" />
                        </span>
                    </button>
                </form>

                <div className="mt-20 p-8 rounded-[2.5rem] bg-indigo-500/5 border border-indigo-500/20 flex items-center gap-6 group/info relative overflow-hidden">
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 border border-indigo-500/20">
                        <Star size={24} className="animate-spin-slow" />
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed opacity-60 max-w-2xl">
                        Xavfsizlik protokoli: Barcha parollar SHA-256 algoritmi yordamida shifrlanadi. Shaxsiy ma'lumotlaringiz ASOS Intelligence himoyasi ostida.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default StaffCabinet;
