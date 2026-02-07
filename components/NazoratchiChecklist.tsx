import React, { useState, useEffect, useMemo } from 'react';
import { Company, KPIRule, MonthlyPerformance, Staff, Language } from '../types';
import { fetchKPIRules, fetchMonthlyPerformance, upsertMonthlyPerformance } from '../lib/supabaseData';
import { CheckCircle2, XCircle, Search, AlertCircle, Save } from 'lucide-react';
import { translations } from '../lib/translations';

interface Props {
    companies: Company[];
    staff: Staff[];
    lang: Language;
    currentUserRole?: string;
    currentUserId?: string;
}

const NazoratchiChecklist: React.FC<Props> = ({ companies, staff, lang, currentUserRole, currentUserId }) => {
    const t = translations[lang];
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const [rules, setRules] = useState<KPIRule[]>([]);
    const [performances, setPerformances] = useState<MonthlyPerformance[]>([]);
    const [search, setSearch] = useState('');
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [loading, setLoading] = useState(false);

    // Load Rules and Initial Data
    useEffect(() => {
        loadData();
    }, [month]);

    const loadData = async () => {
        setLoading(true);
        const [rulesData, perfData] = await Promise.all([
            fetchKPIRules(),
            fetchMonthlyPerformance(`${month}-01`) // Start of month
        ]);
        setRules(rulesData.filter(r => r.role === 'accountant' || r.role === 'bank_client'));
        setPerformances(perfData);
        setLoading(false);
    };

    const filteredCompanies = useMemo(() => {
        return companies.filter(c =>
            (c.name.toLowerCase().includes(search.toLowerCase()) ||
                c.inn.includes(search)) &&
            c.isActive
        );
    }, [companies, search]);

    const selectedCompany = useMemo(() =>
        companies.find(c => c.id === selectedCompanyId),
        [companies, selectedCompanyId]);

    const handleToggle = async (rule: KPIRule, company: Company, employeeId: string, currentValue: number) => {
        // Cycle: 0 -> 1 -> -1 -> 0
        let newValue = 0;
        if (currentValue === 0) newValue = 1;
        else if (currentValue === 1) newValue = -1;
        else newValue = 0;

        // Optimistic update
        const tempId = Math.random().toString();
        const newPerf: MonthlyPerformance = {
            id: tempId,
            month: `${month}-01`,
            companyId: company.id,
            employeeId: employeeId,
            ruleId: rule.id,
            value: newValue,
            calculatedScore: 0
        };

        setPerformances(prev => {
            const existing = prev.find(p => p.companyId === company.id && p.ruleId === rule.id);
            if (existing) {
                return prev.map(p => p.id === existing.id ? { ...p, value: newValue } : p);
            }
            return [...prev, newPerf];
        });

        try {
            await upsertMonthlyPerformance({
                month: `${month}-01`,
                companyId: company.id,
                employeeId: employeeId,
                ruleId: rule.id,
                value: newValue,
                recordedBy: currentUserId
            });
            // Refresh to get real ID and score
            // await loadData(); 
        } catch (error) {
            console.error('Error updating KPI', error);
            // Revert on error
            loadData();
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
            {/* LEFT: Company List */}
            <div className="w-full lg:w-1/3 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder flex flex-col overflow-hidden shadow-xl">
                <div className="p-6 border-b border-apple-border dark:border-apple-darkBorder">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-4">Firmalar</h3>
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Firma qidirish..."
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 rounded-xl border-none outline-none font-bold text-sm"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
                    {filteredCompanies.map(c => {
                        // Calculate progress for this company
                        const companyPerf = performances.filter(p => p.companyId === c.id);
                        const progress = companyPerf.length > 0 ? (companyPerf.filter(p => p.value > 0).length / rules.length) * 100 : 0;

                        return (
                            <div
                                key={c.id}
                                onClick={() => setSelectedCompanyId(c.id)}
                                className={`p-4 rounded-2xl cursor-pointer transition-all border-2 ${selectedCompanyId === c.id
                                    ? 'bg-apple-accent/10 border-apple-accent'
                                    : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className={`font-black ${selectedCompanyId === c.id ? 'text-apple-accent' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {c.name}
                                    </h4>
                                    {progress > 0 && (
                                        <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded-full">
                                            {Math.round(progress)}%
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <div className="text-[10px] font-bold text-slate-400 px-2 py-1 bg-slate-100 dark:bg-white/10 rounded-lg">
                                        INN: {c.inn}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 px-2 py-1 bg-slate-100 dark:bg-white/10 rounded-lg">
                                        {c.accountantName}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: Checklist */}
            <div className="w-full lg:w-2/3 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder flex flex-col overflow-hidden shadow-xl">
                {selectedCompany ? (
                    <>
                        <div className="p-8 border-b border-apple-border dark:border-apple-darkBorder bg-slate-50 dark:bg-white/5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2">{selectedCompany.name}</h2>
                                    <div className="flex gap-4 text-sm font-bold text-slate-500">
                                        <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-apple-accent"></span>
                                            Buxgalter: {selectedCompany.accountantName}
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                            Bank: {staff.find(s => s.id === selectedCompany.bankClientId)?.name || '—'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Joriy Oy</p>
                                    <input
                                        type="month"
                                        value={month}
                                        onChange={e => setMonth(e.target.value)}
                                        className="bg-white dark:bg-apple-darkBg border border-apple-border rounded-xl px-3 py-2 font-bold text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
                            {/* Accountant Tasks */}
                            <div className="mb-8">
                                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span className="w-6 h-[2px] bg-slate-300"></span> Buxgalter Vazifalari (KPI)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {rules.filter(r => r.role === 'accountant').map(rule => {
                                        const perf = performances.find(p => p.companyId === selectedCompany.id && p.ruleId === rule.id);
                                        const isDone = perf?.value === 1;

                                        return (
                                            <div
                                                key={rule.id}
                                                onClick={() => handleToggle(rule, selectedCompany, selectedCompany.accountantId || '', perf?.value || 0)}
                                                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group active:scale-95 ${perf?.value === 1 ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/20' :
                                                    perf?.value === -1 ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-500/20' :
                                                        'bg-white dark:bg-apple-darkBg border-slate-100 dark:border-white/5 hover:border-apple-accent/50'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${perf?.value === 1 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' :
                                                        perf?.value === -1 ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' :
                                                            'bg-slate-100 dark:bg-white/10 text-slate-300'
                                                        }`}>
                                                        {perf?.value === -1 ? <XCircle size={20} strokeWidth={3} /> : <CheckCircle2 size={perf?.value === 1 ? 20 : 18} strokeWidth={3} />}
                                                    </div>
                                                    <div>
                                                        <p className={`font-bold text-sm ${perf?.value !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                            {lang === 'uz' ? rule.nameUz : rule.name}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <p className="text-[10px] font-black text-slate-400">
                                                                {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                                {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                            </p>
                                                            {perf?.value === 1 && <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tight">Mukofot</span>}
                                                            {perf?.value === -1 && <span className="text-[9px] font-black text-rose-500 uppercase tracking-tight">Jarima</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Bank Client Tasks */}
                            {selectedCompany.bankClientId && (
                                <div>
                                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span className="w-6 h-[2px] bg-slate-300"></span> Bank Klient Vazifalari
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {rules.filter(r => r.role === 'bank_client').map(rule => {
                                            const perf = performances.find(p => p.companyId === selectedCompany.id && p.ruleId === rule.id);

                                            return (
                                                <div
                                                    key={rule.id}
                                                    onClick={() => handleToggle(rule, selectedCompany, selectedCompany.bankClientId || '', perf?.value || 0)}
                                                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group active:scale-95 ${perf?.value === 1 ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-500/20' :
                                                            perf?.value === -1 ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-500/20' :
                                                                'bg-white dark:bg-apple-darkBg border-slate-100 dark:border-white/5 hover:border-purple-500/50'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${perf?.value === 1 ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30' :
                                                                perf?.value === -1 ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' :
                                                                    'bg-slate-100 dark:bg-white/10 text-slate-300'
                                                            }`}>
                                                            {perf?.value === -1 ? <XCircle size={20} strokeWidth={3} /> : <CheckCircle2 size={perf?.value === 1 ? 20 : 18} strokeWidth={3} />}
                                                        </div>
                                                        <div>
                                                            <p className={`font-bold text-sm ${perf?.value !== 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}>
                                                                {lang === 'uz' ? rule.nameUz : rule.name}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <p className="text-[10px] font-black text-slate-400">
                                                                    {rule.rewardPercent > 0 ? `+${rule.rewardPercent}%` : ''}
                                                                    {rule.penaltyPercent < 0 ? ` / ${rule.penaltyPercent}%` : ''}
                                                                </p>
                                                                {perf?.value === 1 && <span className="text-[9px] font-black text-purple-500 uppercase tracking-tight">Mukofot</span>}
                                                                {perf?.value === -1 && <span className="text-[9px] font-black text-rose-500 uppercase tracking-tight">Jarima</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-10 text-center">
                        <div className="flex gap-4 mb-4">
                            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/5 animate-pulse"></div>
                            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/5 animate-pulse delay-75"></div>
                            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/5 animate-pulse delay-150"></div>
                        </div>
                        <p className="font-black text-lg">Baholash uchun chapdan firmani tanlang</p>
                        <p className="text-sm mt-2 max-w-xs text-slate-400">Tezkor checklist yordamida buxgalter va bank xodimlarini baholang</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NazoratchiChecklist;
