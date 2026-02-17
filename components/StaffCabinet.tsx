import React, { useMemo } from 'react';
import { Company, OperationEntry, Staff, Language, ReportStatus, MonthlyPerformance } from '../types';
import { translations } from '../lib/translations';
import { fetchMonthlyPerformance } from '../lib/supabaseData';
import { calculateCompanySalaries } from '../lib/kpiLogic';
import { User, Briefcase, TrendingUp, CheckCircle, Clock, AlertCircle } from 'lucide-react';


interface StaffCabinetProps {
    currentStaff: Staff;
    companies: Company[];
    operations: OperationEntry[];
    staff: Staff[]; // Added staff list
    lang: Language;
}

const StaffCabinet: React.FC<StaffCabinetProps> = ({ currentStaff, companies, operations, staff, lang }) => {
    const t = translations[lang];

    const [salarySummary, setSalarySummary] = React.useState<number>(0);
    const [performances, setPerformances] = React.useState<MonthlyPerformance[]>([]);

    const { personalCompanies, supervisedOnlyCompanies } = useMemo(() => {
        const personal = companies.filter(c => c.accountantId === currentStaff.id || c.bankClientId === currentStaff.id);
        const supervised = companies.filter(c => c.supervisorId === currentStaff.id && c.accountantId !== currentStaff.id && c.bankClientId !== currentStaff.id);
        return { personalCompanies: personal, supervisedOnlyCompanies: supervised };
    }, [companies, currentStaff]);

    const stats = useMemo(() => {
        const total = personalCompanies.length;
        const completed = operations.filter(op =>
            personalCompanies.some(c => c.id === op.companyId) &&
            op.profitTaxStatus === ReportStatus.ACCEPTED
        ).length;

        return {
            total,
            completed,
            progress: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }, [personalCompanies, operations]);

    // Calculate Subordinates
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

    // Calculate Salary using client-side logic
    React.useEffect(() => {
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
    }, [currentStaff.id, personalCompanies, operations]);

    // Calculate Subordinates with their salaries
    const subData = useMemo(() => {
        return subordinates.map(sub => {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const subCompanies = companies.filter(c => c.accountantId === sub.id || c.bankClientId === sub.id || c.supervisorId === sub.id);

            let total = 0;
            subCompanies.forEach(c => {
                const op = operations.find(o => o.companyId === c.id && o.period === currentMonth);
                const results = calculateCompanySalaries(c, op, performances);
                const myResult = results.find(r => r.staffId === sub.id);
                if (myResult) total += myResult.finalAmount;
            });

            return {
                ...sub,
                companiesCount: subCompanies.length,
                estimatedSalary: total
            };
        });
    }, [subordinates, companies, operations, performances]);

    const isSupervisor = currentStaff.role === 'supervisor' || currentStaff.role === 'chief_accountant' || currentStaff.role === 'super_admin';

    return (
        <div className="space-y-12 animate-macos pb-20">
            {/* Welcome & Overview */}
            <div className="flex flex-col md:flex-row items-center gap-10 bg-white dark:bg-apple-darkCard p-12 rounded-[3.5rem] border border-slate-100 dark:border-apple-darkBorder shadow-2xl shadow-slate-200/50 dark:shadow-none">
                <div className="h-40 w-40 rounded-[3.2rem] bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-2xl shadow-blue-500/30 relative group">
                    <User size={80} strokeWidth={2.5} className="group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute -bottom-2 -right-2 h-12 w-12 bg-white dark:bg-apple-darkCard rounded-2xl flex items-center justify-center text-apple-accent shadow-lg border border-slate-50 dark:border-apple-darkBorder">
                        <CheckCircle size={24} />
                    </div>
                </div>
                <div className="text-center md:text-left flex-1">
                    <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
                        <span className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] ${currentStaff.role === 'super_admin' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-apple-accent/10 text-apple-accent border border-apple-accent/20'}`}>
                            {currentStaff.role === 'super_admin' ? 'Tizim Admini' : currentStaff.role === 'supervisor' ? 'Nazoratchi (Supervisor)' : currentStaff.role === 'chief_accountant' ? 'Bosh Buxgalter' : 'Buxgalter'}
                        </span>
                        <span className="px-5 py-2 rounded-2xl bg-slate-100 dark:bg-apple-darkBg text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">ID: {currentStaff.id.slice(0, 8)}</span>
                    </div>
                    <h2 className="text-5xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-6">Salom, {currentStaff.name}!</h2>
                    <p className="text-slate-400 font-bold max-w-lg leading-relaxed">
                        Sizning bugungi nazorat va buxgalteriya hisoboti ko'rsatkichlaringiz. Jamoangiz samaradorligini real vaqt rejimida kuzatib boring.
                    </p>
                </div>
                <div className="bg-slate-50 dark:bg-apple-darkBg p-8 rounded-[2.5rem] text-center border border-slate-100 dark:border-apple-darkBorder min-w-[240px]">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 text-center w-full">Taxminiy Maosh</p>
                    <p className="text-4xl font-black text-apple-accent tracking-tighter tabular-nums flex items-baseline justify-center gap-2">
                        {salarySummary.toLocaleString()} <span className="text-sm uppercase opacity-50">UZS</span>
                    </p>
                </div>
            </div>

            {isSupervisor && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Team Stats Summary */}
                    <div className="lg:col-span-2 bg-white dark:bg-apple-darkCard p-10 rounded-[3rem] border border-slate-100 dark:border-apple-darkBorder shadow-sm flex flex-col md:flex-row items-center gap-10">
                        <div className="flex-1 space-y-6">
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                                <TrendingUp size={24} className="text-apple-accent" />
                                Jamoa Umumiy Holati
                            </h3>
                            <div className="space-y-4">
                                <div className="p-6 bg-slate-50 dark:bg-apple-darkBg rounded-2xl border border-slate-100 dark:border-apple-darkBorder">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Umumiy Firmalar</span>
                                        <span className="text-xl font-black text-slate-800 dark:text-white">{companies.filter(c => c.supervisorId === currentStaff.id || currentStaff.role === 'super_admin').length} ta</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-200 dark:bg-apple-darkBorder rounded-full overflow-hidden">
                                        <div className="h-full bg-apple-accent rounded-full transition-all duration-1000" style={{ width: '100%' }}></div>
                                    </div>
                                </div>
                                <div className="p-6 bg-slate-50 dark:bg-apple-darkBg rounded-2xl border border-slate-100 dark:border-apple-darkBorder">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jamoa Samaradorligi</span>
                                        <span className="text-xl font-black text-emerald-500">92%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-200 dark:bg-apple-darkBorder rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: '92%' }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="shrink-0 text-center space-y-4">
                            <div className="h-40 w-40 rounded-full border-[10px] border-apple-accent/10 flex items-center justify-center relative">
                                <div className="absolute inset-0 rounded-full border-[10px] border-apple-accent border-r-transparent border-b-transparent animate-spin-slow"></div>
                                <div className="text-center">
                                    <span className="text-4xl font-black text-slate-800 dark:text-white">92</span>
                                    <span className="text-sm font-black text-slate-400">%</span>
                                </div>
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">KPI Buxgalterlar</p>
                        </div>
                    </div>

                    {/* Quick Profile Summary */}
                    <div className="bg-white dark:bg-apple-darkCard p-10 rounded-[3rem] border border-slate-100 dark:border-apple-darkBorder shadow-sm flex flex-col items-center justify-center text-center space-y-6">
                        <div className="h-20 w-20 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                            <Briefcase size={40} />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-800 dark:text-white tracking-tighter">{subordinates.length}</p>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Xodimlar Nazoratda</p>
                        </div>
                        <div className="w-full h-px bg-slate-50 dark:bg-apple-darkBorder"></div>
                        <div className="flex gap-8">
                            <div className="text-center">
                                <p className="text-xl font-black text-slate-800 dark:text-white">{personalCompanies.length}</p>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Shaxsiy</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xl font-black text-slate-800 dark:text-white">{supervisedOnlyCompanies.length}</p>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Nazoratda</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Subordinates Section */}
            {subData.length > 0 && (
                <div className="space-y-8">
                    <div className="flex items-center justify-between px-4">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-4">
                            <User size={28} className="text-apple-accent" />
                            Jamoa Boshqaruvi
                        </h3>
                        <span className="px-5 py-2 rounded-2xl bg-apple-accent/5 text-apple-accent text-[10px] font-black uppercase tracking-widest border border-apple-accent/10">
                            {subData.length} Naush
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {subData.map(sub => {
                            return (
                                <div key={sub.id} className="bg-white dark:bg-apple-darkCard p-8 rounded-[3rem] border border-slate-100 dark:border-apple-darkBorder shadow-sm group hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-500 hover:-translate-y-2">
                                    <div className="flex items-center gap-5 mb-8">
                                        <div className="h-16 w-16 rounded-[1.4rem] bg-slate-50 dark:bg-apple-darkBg text-slate-500 flex items-center justify-center font-black text-2xl group-hover:bg-apple-accent group-hover:text-white transition-all duration-500">
                                            {sub.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight mb-0.5">{sub.name}</div>
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{sub.role}</div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            <span>Firmalar</span>
                                            <span className="text-slate-700 dark:text-slate-200">{sub.companiesCount} ta</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            <span>Kutilayotgan</span>
                                            <span className="text-apple-accent">{sub.estimatedSalary.toLocaleString()} UZS</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-50 dark:bg-apple-darkBg rounded-full overflow-hidden mt-4">
                                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: '85%' }}></div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Managed Companies (Only for Supervisors) */}
            {supervisedOnlyCompanies.length > 0 && (
                <div className="space-y-8">
                    <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight ml-4 flex items-center gap-4">
                        <AlertCircle size={28} className="text-amber-500" />
                        Nazoratdagi Boshqa Korxonalar
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {supervisedOnlyCompanies.map(c => {
                            const op = operations.find(o => o.companyId === c.id);
                            const isDone = op?.profitTaxStatus === ReportStatus.ACCEPTED;
                            return (
                                <div key={c.id} className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-slate-100 dark:border-apple-darkBorder hover:shadow-xl transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 h-24 w-24 bg-amber-500/5 rounded-full -translate-y-8 translate-x-8"></div>
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="font-black text-slate-800 dark:text-white uppercase tracking-tight text-sm group-hover:text-amber-500 transition-colors">{c.name}</div>
                                        <span className="text-[8px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md uppercase">Nazorat</span>
                                    </div>
                                    <div className="space-y-3 relative z-10">
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            <span>Buxgalter</span>
                                            <span className="text-slate-600 dark:text-slate-300">{c.accountantName || '—'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            <span>Holat</span>
                                            <span className={isDone ? 'text-emerald-500' : 'text-amber-500'}>{isDone ? 'Bajarilgan' : 'Jarayonda'}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Personal Firm List */}
            <div className="space-y-8">
                <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight ml-4 flex items-center gap-4">
                    <Briefcase size={28} className="text-apple-accent" />
                    Mening Shaxsiy Firmalarim
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {personalCompanies.map(c => {
                        const op = operations.find(o => o.companyId === c.id);
                        const isDone = op?.profitTaxStatus === ReportStatus.ACCEPTED;
                        return (
                            <div key={c.id} className="bg-white dark:bg-apple-darkCard p-8 rounded-[3rem] border border-slate-100 dark:border-apple-darkBorder hover:shadow-2xl hover:shadow-slate-200/50 transition-all group overflow-hidden">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="font-black text-slate-800 dark:text-white uppercase tracking-tight text-lg group-hover:text-apple-accent transition-colors leading-tight">{c.name}</div>
                                    {isDone ? (
                                        <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm border border-emerald-500/20">
                                            <CheckCircle size={18} />
                                        </div>
                                    ) : (
                                        <div className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-apple-darkBg text-slate-400 flex items-center justify-center shrink-0 border border-slate-50 dark:border-apple-darkBorder">
                                            <Clock size={18} />
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50 dark:border-apple-darkBorder pb-2">
                                        <span>Foyda Solig'i</span>
                                        <span className={op?.profitTaxStatus === ReportStatus.ACCEPTED ? 'text-emerald-500' : 'text-slate-500'}>{op?.profitTaxStatus || 'Kutilmoqda'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50 dark:border-apple-darkBorder pb-2">
                                        <span>Balans (F1)</span>
                                        <span className={op?.form1Status === ReportStatus.ACCEPTED ? 'text-emerald-500' : 'text-slate-500'}>{op?.form1Status || 'Kutilmoqda'}</span>
                                    </div>
                                </div>
                                <div className="mt-8 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span className="px-3 py-1 bg-slate-100 dark:bg-apple-darkBg rounded-lg text-[8px] font-black text-slate-400 uppercase tracking-widest border border-slate-50 dark:border-apple-darkBorder">
                                            {c.taxRegime}
                                        </span>
                                    </div>
                                    <span className="text-sm font-black text-apple-accent tabular-nums tracking-tighter">
                                        {c.contractAmount?.toLocaleString()} <span className="text-[10px] opacity-60">UZS</span>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {/* Security Settings */}
            <div className="bg-white dark:bg-apple-darkCard p-10 rounded-[3rem] border border-slate-100 dark:border-apple-darkBorder shadow-sm">
                <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-4 mb-8">
                    <User size={28} className="text-rose-500" />
                    Xavfsizlik Sozlamalari
                </h3>
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

                        // Import dynamically to avoid top-level issues if not already imported
                        const { supabase } = await import('../lib/supabaseClient');
                        const { error } = await supabase.auth.updateUser({ password: newPass });

                        if (error) {
                            alert("Xatolik: " + error.message);
                        } else {
                            alert("Parol muvaffaqiyatli o'zgartirildi!");
                            form.reset();
                        }
                    }}
                    className="max-w-md space-y-4"
                >
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Yangi Parol</label>
                        <input
                            name="newPassword"
                            type="password"
                            placeholder="••••••••"
                            className="w-full bg-slate-50 dark:bg-apple-darkBg border border-slate-100 dark:border-apple-darkBorder rounded-2xl px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Parolni Tasdiqlash</label>
                        <input
                            name="confirmPassword"
                            type="password"
                            placeholder="••••••••"
                            className="w-full bg-slate-50 dark:bg-apple-darkBg border border-slate-100 dark:border-apple-darkBorder rounded-2xl px-6 py-4 font-bold outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-8 py-4 bg-slate-800 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black hover:bg-slate-900 dark:hover:bg-slate-200 transition-all active:scale-[0.98]"
                    >
                        Parolni Yangilash
                    </button>
                </form>
            </div>
        </div>
    );
};

export default StaffCabinet;
