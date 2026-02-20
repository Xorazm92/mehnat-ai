import React, { useState, useMemo } from 'react';
import { Company, OperationEntry, Staff, Language, Payment, Expense } from '../types';
import { translations } from '../lib/translations';
import { periodsEqual } from '../lib/periods';
import { MonthPicker } from './ui/MonthPicker';
import {
    Building2, Users, Search, DollarSign, TrendingUp,
    ChevronRight, ChevronDown, Briefcase, CheckCircle2, AlertCircle,
    XCircle, Eye, Wallet, BarChart3, ArrowUpRight, X, Crown, Star,
    Shield, UserCheck, Network, Download
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
    companies: Company[];
    operations: OperationEntry[];
    staff: Staff[];
    payments: Payment[];
    expenses: Expense[];
    selectedPeriod: string;
    onPeriodChange: (p: string) => void;
    lang: Language;
    currentUserId?: string;
    currentUserName?: string;
}

// Report field keys for progress tracking
const REPORT_FIELDS = [
    'didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c',
    'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka',
    'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq',
    'moliyaviy_natija', 'buxgalteriya_balansi', 'statistika',
    'bonak', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi'
] as const;

// Hierarchy node for the tree
interface HierarchyNode {
    id: string;
    name: string;
    role: string;
    color: string;
    companiesCount: number;
    totalContract: number;
    children: HierarchyNode[];
}

const SupervisorDashboard: React.FC<Props> = ({
    companies,
    operations,
    staff,
    payments,
    expenses,
    selectedPeriod,
    onPeriodChange,
    lang,
    currentUserId,
    currentUserName
}) => {
    const t = translations[lang];
    const [search, setSearch] = useState('');
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const [filterAccountant, setFilterAccountant] = useState<string>('all');
    const [expandedSupervisor, setExpandedSupervisor] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'hierarchy' | 'companies'>('overview');

    // ─── DATA COMPUTATIONS ────────────────────────────────────────────

    // All companies in system (for hierarchy view)
    const allActiveCompanies = useMemo(() => companies.filter(c => c.isActive), [companies]);

    // My companies (assigned to current supervisor)
    const myCompanies = useMemo(() => {
        const nameLower = (currentUserName || '').trim().toLowerCase();
        return allActiveCompanies.filter(c => {
            if (currentUserId && c.supervisorId === currentUserId) return true;
            if (nameLower && c.supervisorName && c.supervisorName.trim().toLowerCase() === nameLower) return true;
            return false;
        });
    }, [allActiveCompanies, currentUserId, currentUserName]);

    // Supervisors hierarchy
    const supervisorsData = useMemo(() => {
        const supervisorMap: Record<string, { name: string, companies: Company[], staff: Set<string> }> = {};

        allActiveCompanies.forEach(c => {
            const sid = c.supervisorId;
            const sname = c.supervisorName || 'Belgilanmagan';
            if (sid) {
                if (!supervisorMap[sid]) {
                    const staffMember = staff.find(s => s.id === sid);
                    supervisorMap[sid] = { name: staffMember?.name || sname, companies: [], staff: new Set() };
                }
                supervisorMap[sid].companies.push(c);
                if (c.accountantId) supervisorMap[sid].staff.add(c.accountantId);
                if (c.bankClientId) supervisorMap[sid].staff.add(c.bankClientId);
            }
        });

        return Object.entries(supervisorMap).map(([id, data]) => ({
            id,
            name: data.name,
            companies: data.companies,
            companiesCount: data.companies.length,
            totalContract: data.companies.reduce((sum, c) => sum + (c.contractAmount || 0), 0),
            totalSupervisorEarnings: data.companies.reduce((sum, c) => sum + (c.contractAmount || 0) * ((c.supervisorPerc || 5) / 100), 0),
            staffCount: data.staff.size,
            uniqueAccountants: [...new Set(data.companies.map(c => c.accountantName).filter(Boolean))],
            isCurrent: id === currentUserId
        })).sort((a, b) => b.companiesCount - a.companiesCount);
    }, [allActiveCompanies, staff, currentUserId]);

    // Accountants under this supervisor
    const myAccountants = useMemo(() => {
        const accountantMap: Record<string, { name: string, companies: Company[] }> = {};
        myCompanies.forEach(c => {
            const aid = c.accountantId || 'unknown';
            const aname = c.accountantName || '—';
            if (!accountantMap[aid]) accountantMap[aid] = { name: aname, companies: [] };
            accountantMap[aid].companies.push(c);
        });
        return Object.entries(accountantMap).map(([id, data]) => ({
            id,
            name: data.name,
            companiesCount: data.companies.length,
            totalContract: data.companies.reduce((sum, c) => sum + (c.contractAmount || 0), 0),
            companies: data.companies
        })).sort((a, b) => b.companiesCount - a.companiesCount);
    }, [myCompanies]);

    // Period operations
    const periodOps = useMemo(() =>
        operations.filter(o => periodsEqual(o.period, selectedPeriod)),
        [operations, selectedPeriod]
    );

    // Company progress calculation
    const getCompanyProgress = (companyId: string) => {
        const op = periodOps.find(o => o.companyId === companyId);
        if (!op) return { done: 0, pending: 0, blocked: 0, total: REPORT_FIELDS.length, percent: 0 };
        let done = 0, pending = 0, blocked = 0;
        REPORT_FIELDS.forEach(field => {
            const val = String((op as any)[field] || '').trim().toLowerCase();
            if (val === '+' || val.startsWith('+')) done++;
            else if (val === 'kartoteka') blocked++;
            else pending++;
        });
        return { done, pending, blocked, total: REPORT_FIELDS.length, percent: Math.round((done / REPORT_FIELDS.length) * 100) };
    };

    // Summary stats  
    const summary = useMemo(() => {
        let totalContract = 0;
        let totalSupervisorEarnings = 0;
        let totalDone = 0, totalReports = 0;

        myCompanies.forEach(c => {
            totalContract += (c.contractAmount || 0);
            totalSupervisorEarnings += (c.contractAmount || 0) * ((c.supervisorPerc || 5) / 100);
            const p = getCompanyProgress(c.id);
            totalDone += p.done;
            totalReports += p.total;
        });

        return {
            companyCount: myCompanies.length,
            totalContract,
            totalSupervisorEarnings,
            overallProgress: totalReports > 0 ? Math.round((totalDone / totalReports) * 100) : 0,
            staffCount: myAccountants.length,
            totalDone,
            totalReports
        };
    }, [myCompanies, periodOps, myAccountants]);

    // Filtered companies
    const filteredCompanies = useMemo(() => {
        return myCompanies.filter(c => {
            const matchSearch = !search ||
                c.name.toLowerCase().includes(search.toLowerCase()) ||
                (c.inn && c.inn.includes(search));
            const matchAcc = filterAccountant === 'all' || c.accountantName === filterAccountant;
            return matchSearch && matchAcc;
        });
    }, [myCompanies, search, filterAccountant]);

    const selectedCompany = useMemo(() => myCompanies.find(c => c.id === selectedCompanyId), [myCompanies, selectedCompanyId]);
    const selectedOp = useMemo(() => selectedCompany ? periodOps.find(o => o.companyId === selectedCompany.id) : null, [selectedCompany, periodOps]);

    const fmtMoney = (n: number) => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
        if (n >= 1_000) return `${Math.round(n / 1_000)} K`;
        return n.toLocaleString();
    };

    const handleExport = () => {
        const wb = XLSX.utils.book_new();

        // Sheet 1: Overview
        const overviewData = [
            ['Metric', 'Value'],
            ['Total Companies', summary.companyCount],
            ['Total Contract Value', summary.totalContract],
            ['Total Supervisor Earnings', summary.totalSupervisorEarnings],
            ['Staff Count', summary.staffCount],
            ['Reporting Progress', `${summary.overallProgress}%`]
        ];
        const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
        XLSX.utils.book_append_sheet(wb, wsOverview, "Overview");

        // Sheet 2: Companies
        const companiesData = myCompanies.map(c => ({
            Name: c.name,
            INN: c.inn,
            Accountant: c.accountantName,
            Contract: c.contractAmount,
            SupervisorPerc: c.supervisorPerc,
            SupervisorAmount: (c.contractAmount || 0) * ((c.supervisorPerc || 5) / 100),
            Status: c.isActive ? 'Active' : 'Inactive'
        }));
        const wsCompanies = XLSX.utils.json_to_sheet(companiesData);
        XLSX.utils.book_append_sheet(wb, wsCompanies, "Companies");

        XLSX.writeFile(wb, `Supervisor_Report_${selectedPeriod}.xlsx`);
    };

    // ═════════════════════════════════════════════════════════════════
    // ─── RENDER ──────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════

    return (
        <div className="space-y-6 animate-macos pb-10 max-w-[1600px] mx-auto">
            {/* ═══ HEADER ═══ */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                        <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 bg-clip-text text-transparent">
                            VERTIKAL NAZORAT
                        </span>
                        <span className="text-slate-800 dark:text-white">DIAGRAMMASI</span>
                    </h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-1 pl-1">
                        Nazoratchi boshqaruv paneli • {selectedPeriod}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        <Download size={16} /> Export Excel
                    </button>
                    <MonthPicker
                        selectedPeriod={selectedPeriod}
                        onChange={onPeriodChange}
                        className="border border-apple-border dark:border-apple-darkBorder rounded-xl"
                    />
                </div>
            </div>

            {/* ═══ 4 STAT CARDS ═══ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'JAMI FIRMALAR', value: String(summary.companyCount), icon: <Building2 size={22} />, bg: 'bg-gradient-to-br from-blue-600 to-indigo-700', glow: 'shadow-blue-500/25' },
                    { label: 'SHARTNOMA QIYMATI', value: fmtMoney(summary.totalContract), icon: <DollarSign size={22} />, bg: 'bg-gradient-to-br from-emerald-600 to-teal-700', glow: 'shadow-emerald-500/25' },
                    { label: 'XODIMLAR', value: String(summary.staffCount), icon: <Users size={22} />, bg: 'bg-gradient-to-br from-violet-600 to-purple-700', glow: 'shadow-violet-500/25' },
                    { label: 'NAZORAT ULUSHI', value: fmtMoney(summary.totalSupervisorEarnings), icon: <Wallet size={22} />, bg: 'bg-gradient-to-br from-amber-500 to-orange-600', glow: 'shadow-amber-500/25' },
                ].map((card, i) => (
                    <div key={i} className={`relative ${card.bg} rounded-[1.5rem] p-5 text-white overflow-hidden shadow-xl ${card.glow} group hover:scale-[1.02] transition-all duration-300`}>
                        <div className="absolute -top-2 -right-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            <div className="w-20 h-20 flex items-center justify-center">{card.icon}</div>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50 mb-3">{card.label}</p>
                        <h2 className="text-3xl font-black tabular-nums tracking-tight">{card.value}</h2>
                    </div>
                ))}
            </div>

            {/* ═══ TAB NAVIGATION ═══ */}
            <div className="flex gap-1 bg-slate-100 dark:bg-white/5 rounded-2xl p-1">
                {([
                    { key: 'overview', label: 'Umumiy ko\'rinish', icon: <Eye size={16} /> },
                    { key: 'hierarchy', label: 'Vertikal Tuzilma', icon: <Network size={16} /> },
                    { key: 'companies', label: 'Firmalar ro\'yxati', icon: <Building2 size={16} /> },
                ] as { key: typeof activeTab, label: string, icon: React.ReactNode }[]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === tab.key
                                ? 'bg-white dark:bg-apple-darkCard shadow-lg text-slate-800 dark:text-white'
                                : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ═══ TAB: OVERVIEW ═══ */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* ── HIERARCHY TREE (Visual org chart) ── */}
                    <div className="bg-slate-900 rounded-[2rem] p-8 overflow-x-auto shadow-2xl">
                        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-8 text-center">
                            ASOS ERP • NAZORAT TUZILMASI • {selectedPeriod}
                        </h3>

                        {/* Chief Accountant (Ёркиной) at top */}
                        <div className="flex flex-col items-center">
                            <div className="bg-gradient-to-br from-amber-600 to-amber-800 rounded-2xl px-8 py-4 text-center border-2 border-amber-500/50 shadow-lg shadow-amber-500/20 relative">
                                <Crown size={14} className="absolute -top-2 left-1/2 -translate-x-1/2 text-amber-400" />
                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-300/60">BOSH NAZORATCHI</p>
                                <p className="text-lg font-black text-white tracking-tight">Ёркиной</p>
                                <p className="text-[9px] font-bold text-amber-200/50 mt-0.5">
                                    {allActiveCompanies.length} firma • {fmtMoney(allActiveCompanies.reduce((s, c) => s + (c.contractAmount || 0), 0))} UZS
                                </p>
                            </div>

                            {/* Vertical connector */}
                            <div className="w-0.5 h-8 bg-gradient-to-b from-amber-500/50 to-slate-600" />

                            {/* Supervisors level */}
                            <div className="flex gap-6 flex-wrap justify-center">
                                {supervisorsData.map((sup, i) => {
                                    const isExpanded = expandedSupervisor === sup.id;
                                    const colors = [
                                        { bg: 'from-cyan-600 to-cyan-800', border: 'border-cyan-500/50', glow: 'shadow-cyan-500/20', text: 'text-cyan-300', accent: 'text-cyan-400' },
                                        { bg: 'from-violet-600 to-violet-800', border: 'border-violet-500/50', glow: 'shadow-violet-500/20', text: 'text-violet-300', accent: 'text-violet-400' },
                                        { bg: 'from-emerald-600 to-emerald-800', border: 'border-emerald-500/50', glow: 'shadow-emerald-500/20', text: 'text-emerald-300', accent: 'text-emerald-400' },
                                        { bg: 'from-rose-600 to-rose-800', border: 'border-rose-500/50', glow: 'shadow-rose-500/20', text: 'text-rose-300', accent: 'text-rose-400' },
                                    ];
                                    const c = colors[i % colors.length];

                                    return (
                                        <div key={sup.id} className="flex flex-col items-center">
                                            {/* Connector from top */}
                                            <div className="w-0.5 h-4 bg-slate-600" />

                                            {/* Supervisor Card */}
                                            <div
                                                onClick={() => setExpandedSupervisor(isExpanded ? null : sup.id)}
                                                className={`bg-gradient-to-br ${c.bg} rounded-2xl px-6 py-4 text-center border-2 ${c.border} shadow-lg ${c.glow} cursor-pointer hover:scale-105 transition-all duration-300 min-w-[200px] ${sup.isCurrent ? 'ring-2 ring-white/30' : ''}`}
                                            >
                                                {sup.isCurrent && <Star size={12} className="absolute -top-1 -right-1 text-amber-400 fill-amber-400" />}
                                                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">NAZORATCHI</p>
                                                <p className="text-base font-black text-white tracking-tight">{sup.name}</p>
                                                <div className="flex items-center justify-center gap-3 mt-2">
                                                    <span className={`text-[10px] font-black ${c.text}`}>{sup.companiesCount} firma</span>
                                                    <span className="text-[10px] font-bold text-white/30">•</span>
                                                    <span className={`text-[10px] font-black ${c.text}`}>{fmtMoney(sup.totalContract)}</span>
                                                </div>
                                                <p className="text-[9px] font-bold text-white/30 mt-1">
                                                    {sup.uniqueAccountants.length} buxgalter
                                                </p>
                                                <ChevronDown size={14} className={`mx-auto mt-1 text-white/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            </div>

                                            {/* Accountants under supervisor */}
                                            {isExpanded && (
                                                <div className="flex flex-col items-center mt-2">
                                                    <div className="w-0.5 h-4 bg-slate-600" />
                                                    <div className="flex gap-2 flex-wrap justify-center max-w-[500px]">
                                                        {sup.uniqueAccountants.map((accName, ai) => (
                                                            <div key={ai} className="flex flex-col items-center">
                                                                <div className="w-0.5 h-3 bg-slate-700" />
                                                                <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-center min-w-[100px]">
                                                                    <p className="text-[9px] font-black text-slate-500 uppercase">Buxgalter</p>
                                                                    <p className="text-[11px] font-bold text-slate-300 truncate">{accName}</p>
                                                                    <p className="text-[9px] font-bold text-slate-500">
                                                                        {sup.companies.filter(c => c.accountantName === accName).length} firma
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ── NAZORATCHI DISTRIBUTION BARS ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {supervisorsData.map((sup, i) => {
                            const barColors = ['bg-cyan-500', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500'];
                            const barBg = ['bg-cyan-500/10', 'bg-violet-500/10', 'bg-emerald-500/10', 'bg-rose-500/10'];
                            const textColors = ['text-cyan-400', 'text-violet-400', 'text-emerald-400', 'text-rose-400'];
                            const color = barColors[i % barColors.length];
                            const bgColor = barBg[i % barBg.length];
                            const textColor = textColors[i % textColors.length];

                            // Get accountant distribution for this supervisor
                            const accDist: Record<string, number> = {};
                            sup.companies.forEach(c => {
                                const name = c.accountantName || '—';
                                accDist[name] = (accDist[name] || 0) + 1;
                            });
                            const sortedAcc = Object.entries(accDist).sort((a, b) => b[1] - a[1]);

                            return (
                                <div key={sup.id} className="bg-white dark:bg-apple-darkCard rounded-[1.5rem] border border-apple-border dark:border-apple-darkBorder p-5 shadow-sm">
                                    <h4 className={`text-xs font-black uppercase tracking-widest ${textColor} mb-4 flex items-center gap-2`}>
                                        <Shield size={14} /> NAZORAT: {sup.name} ({sup.companiesCount} firma)
                                    </h4>
                                    <div className="space-y-2">
                                        {sortedAcc.slice(0, 8).map(([name, count]) => (
                                            <div key={name} className="flex items-center gap-3">
                                                <span className="text-[11px] font-bold text-slate-500 w-20 truncate">{name}</span>
                                                <div className="flex-1 h-4 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${color} rounded-full transition-all duration-700 flex items-center justify-end pr-1.5`}
                                                        style={{ width: `${(count / sup.companiesCount) * 100}%` }}
                                                    >
                                                        {count > 2 && <span className="text-[8px] font-black text-white">{count}</span>}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-black text-slate-500 tabular-nums w-6 text-right">{count}</span>
                                            </div>
                                        ))}
                                        {sortedAcc.length > 8 && (
                                            <p className="text-[10px] font-bold text-slate-400 text-center">+{sortedAcc.length - 8} buxgalter</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── MY ACCOUNTANTS FINANCIAL TABLE ── */}
                    <div className="bg-white dark:bg-apple-darkCard rounded-[1.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-sm">
                        <div className="p-5 border-b border-apple-border dark:border-apple-darkBorder bg-slate-50 dark:bg-white/5">
                            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <UserCheck size={16} className="text-amber-500" />
                                MENING BUXGALTERLARIM — {myAccountants.length} ta
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
                            {myAccountants.map((acc) => (
                                <div key={acc.id} className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-100 dark:border-white/5 hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-lg shadow-blue-500/20">
                                                {acc.name[0]}
                                            </div>
                                            <div>
                                                <h4 className="font-black text-sm text-slate-800 dark:text-white">{acc.name}</h4>
                                                <p className="text-[10px] font-bold text-slate-400">{acc.companiesCount} ta firma</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{fmtMoney(acc.totalContract)}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Shartnoma</p>
                                        </div>
                                    </div>

                                    {/* Company list under this accountant */}
                                    <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-thin">
                                        {acc.companies.slice(0, 5).map(c => {
                                            const prog = getCompanyProgress(c.id);
                                            return (
                                                <div key={c.id} className="flex items-center gap-2 text-[10px]">
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${prog.percent >= 80 ? 'bg-emerald-500' : prog.percent >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                                                    <span className="font-bold text-slate-600 dark:text-slate-300 truncate flex-1">{c.name}</span>
                                                    <span className="font-black tabular-nums text-slate-400">{fmtMoney(c.contractAmount || 0)}</span>
                                                    <span className={`font-black tabular-nums w-8 text-right ${prog.percent >= 80 ? 'text-emerald-500' : prog.percent >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>{prog.percent}%</span>
                                                </div>
                                            );
                                        })}
                                        {acc.companies.length > 5 && (
                                            <p className="text-[9px] font-bold text-slate-400 text-center">+{acc.companies.length - 5} firma</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ═══ TAB: HIERARCHY ═══ */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'hierarchy' && (
                <div className="space-y-6">
                    {/* Full hierarchy for each supervisor */}
                    {supervisorsData.map((sup, i) => {
                        const isMe = sup.isCurrent;
                        const gradients = [
                            'from-cyan-500/10 to-cyan-600/5 border-cyan-500/20',
                            'from-violet-500/10 to-violet-600/5 border-violet-500/20',
                            'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20',
                            'from-rose-500/10 to-rose-600/5 border-rose-500/20',
                        ];
                        const accentColors = ['text-cyan-500', 'text-violet-500', 'text-emerald-500', 'text-rose-500'];
                        const barColors2 = ['bg-cyan-500', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500'];

                        // Accountant breakdown
                        const accMap: Record<string, Company[]> = {};
                        sup.companies.forEach(c => {
                            const name = c.accountantName || '—';
                            if (!accMap[name]) accMap[name] = [];
                            accMap[name].push(c);
                        });
                        const accList = Object.entries(accMap).sort((a, b) => b[1].length - a[1].length);

                        return (
                            <div key={sup.id} className={`bg-gradient-to-br ${gradients[i % gradients.length]} rounded-[2rem] border-2 p-6 ${isMe ? 'ring-2 ring-amber-400/30' : ''}`}>
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl ${barColors2[i % barColors2.length]} text-white flex items-center justify-center font-black text-lg shadow-lg`}>
                                            {sup.name[0]}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xl font-black text-slate-800 dark:text-white">{sup.name}</h3>
                                                {isMe && <span className="text-[9px] font-black px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full uppercase">Siz</span>}
                                            </div>
                                            <p className="text-xs font-bold text-slate-400">
                                                {sup.companiesCount} firma • {fmtMoney(sup.totalContract)} UZS • {sup.uniqueAccountants.length} buxgalter
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-2xl font-black ${accentColors[i % accentColors.length]}`}>{fmtMoney(sup.totalSupervisorEarnings)}</p>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nazorat ulushi</p>
                                    </div>
                                </div>

                                {/* Accountant cards grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {accList.map(([accName, accCompanies]) => {
                                        const accTotal = accCompanies.reduce((s, c) => s + (c.contractAmount || 0), 0);
                                        return (
                                            <div key={accName} className="bg-white/80 dark:bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/50 dark:border-white/10">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-7 h-7 rounded-lg ${barColors2[i % barColors2.length]}/20 flex items-center justify-center`}>
                                                            <span className={`text-[10px] font-black ${accentColors[i % accentColors.length]}`}>{accName[0]}</span>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-black text-slate-800 dark:text-white">{accName}</p>
                                                            <p className="text-[9px] font-bold text-slate-400">{accCompanies.length} firma</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs font-black text-slate-600 dark:text-slate-300">{fmtMoney(accTotal)}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    {accCompanies.slice(0, 3).map(c => (
                                                        <div key={c.id} className="flex items-center justify-between text-[9px]">
                                                            <span className="font-bold text-slate-500 truncate flex-1 mr-2">{c.name}</span>
                                                            <span className="font-black text-slate-400 tabular-nums">{fmtMoney(c.contractAmount || 0)}</span>
                                                        </div>
                                                    ))}
                                                    {accCompanies.length > 3 && (
                                                        <p className="text-[8px] font-bold text-slate-400/60">+{accCompanies.length - 3} firma</p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ═══ TAB: COMPANIES LIST ═══ */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'companies' && (
                <div className="space-y-4">
                    {/* Search & Filter */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Firma qidirish (nomi yoki INN)..."
                                className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder outline-none font-bold text-sm focus:ring-2 focus:ring-apple-accent/20 transition-all shadow-sm"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <select
                            value={filterAccountant}
                            onChange={e => setFilterAccountant(e.target.value)}
                            className="px-4 py-3.5 bg-white dark:bg-apple-darkCard rounded-2xl border border-apple-border dark:border-apple-darkBorder font-bold text-sm outline-none cursor-pointer shadow-sm min-w-[160px]"
                        >
                            <option value="all">Barcha buxgalterlar</option>
                            {myAccountants.map(acc => (
                                <option key={acc.id} value={acc.name}>{acc.name} ({acc.companiesCount})</option>
                            ))}
                        </select>
                    </div>

                    {/* Company Grid + Detail */}
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className={`w-full ${selectedCompany ? 'lg:w-3/5' : 'lg:w-full'} transition-all duration-500`}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filteredCompanies.map(c => {
                                    const prog = getCompanyProgress(c.id);
                                    const isSelected = c.id === selectedCompanyId;
                                    const supAmt = (c.contractAmount || 0) * ((c.supervisorPerc || 5) / 100);

                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => setSelectedCompanyId(isSelected ? null : c.id)}
                                            className={`relative p-5 rounded-[1.5rem] border-2 cursor-pointer transition-all duration-300 group hover:-translate-y-0.5 ${isSelected
                                                    ? 'bg-apple-accent/5 border-apple-accent shadow-lg shadow-apple-accent/10'
                                                    : 'bg-white dark:bg-apple-darkCard border-slate-100 dark:border-white/5 hover:border-apple-accent/30 hover:shadow-md'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className={`font-black text-sm truncate ${isSelected ? 'text-apple-accent' : 'text-slate-800 dark:text-white'}`}>{c.name}</h4>
                                                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">INN: {c.inn}</p>
                                                </div>
                                                <ChevronRight size={16} className={`shrink-0 text-slate-300 transition-transform ${isSelected ? 'rotate-90 text-apple-accent' : ''}`} />
                                            </div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-[10px] font-black px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg truncate">{c.accountantName || '—'}</span>
                                                {c.bankClientName && c.bankClientName !== '—' && (
                                                    <span className="text-[10px] font-black px-2 py-0.5 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg truncate">{c.bankClientName}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-xs mb-3">
                                                <span className="font-bold text-slate-500">{fmtMoney(c.contractAmount || 0)}</span>
                                                <span className="font-black text-amber-600 dark:text-amber-400">+{fmtMoney(supAmt)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-700 ${prog.percent >= 80 ? 'bg-emerald-500' : prog.percent >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                        style={{ width: `${prog.percent}%` }}
                                                    />
                                                </div>
                                                <span className={`text-[10px] font-black tabular-nums ${prog.percent >= 80 ? 'text-emerald-500' : prog.percent >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>{prog.percent}%</span>
                                            </div>
                                            {prog.blocked > 0 && (
                                                <div className="absolute top-3 right-10">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {filteredCompanies.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <Building2 size={48} className="text-slate-200 dark:text-slate-700 mb-4" />
                                    <p className="font-black text-slate-400 text-lg">Firmalar topilmadi</p>
                                </div>
                            )}
                        </div>

                        {/* Detail Panel */}
                        {selectedCompany && (
                            <div className="w-full lg:w-2/5 bg-white dark:bg-apple-darkCard rounded-[2rem] border border-apple-border dark:border-apple-darkBorder shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-240px)] sticky top-6">
                                <div className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white relative">
                                    <button onClick={() => setSelectedCompanyId(null)} className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/10 transition-colors">
                                        <X size={18} />
                                    </button>
                                    <h3 className="text-xl font-black tracking-tight pr-8">{selectedCompany.name}</h3>
                                    <div className="flex items-center gap-3 mt-2 text-xs font-bold text-white/60">
                                        <span>INN: {selectedCompany.inn}</span>
                                        {selectedCompany.taxType && <span className="px-2 py-0.5 bg-white/10 rounded-lg uppercase">{selectedCompany.taxType}</span>}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
                                    {/* Employees */}
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                                            <Users size={14} /> MAS'UL XODIMLAR
                                        </h4>
                                        <div className="space-y-2">
                                            {[
                                                { name: selectedCompany.accountantName || '—', role: 'Buxgalter', perc: selectedCompany.accountantPerc || 20, color: 'bg-blue-500', bgLight: 'bg-blue-50 dark:bg-blue-500/5' },
                                                ...(selectedCompany.bankClientName && selectedCompany.bankClientName !== '—' ? [{ name: selectedCompany.bankClientName, role: 'Bank Klient', perc: selectedCompany.bankClientPerc || 5, color: 'bg-purple-500', bgLight: 'bg-purple-50 dark:bg-purple-500/5' }] : []),
                                                { name: selectedCompany.supervisorName || currentUserName || '—', role: 'Nazoratchi (Siz)', perc: selectedCompany.supervisorPerc || 5, color: 'bg-amber-500', bgLight: 'bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20' },
                                                { name: 'Ёркиной', role: 'Bosh Buxgalter', perc: selectedCompany.chiefAccountantPerc || 7, color: 'bg-slate-700', bgLight: 'bg-slate-50 dark:bg-white/5' },
                                            ].map((emp, i) => (
                                                <div key={i} className={`flex items-center justify-between p-3 ${emp.bgLight} rounded-xl`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg ${emp.color} text-white flex items-center justify-center font-black text-xs`}>{emp.name[0]}</div>
                                                        <div>
                                                            <p className="font-bold text-sm text-slate-800 dark:text-white">{emp.name}</p>
                                                            <p className={`text-[10px] font-black uppercase ${emp.color.replace('bg-', 'text-')}`}>{emp.role}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{emp.perc}%</p>
                                                        <p className="text-[10px] font-bold text-slate-400">{fmtMoney((selectedCompany.contractAmount || 0) * (emp.perc / 100))}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Contract */}
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                                            <DollarSign size={14} /> SHARTNOMA
                                        </h4>
                                        <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4">
                                            <div className="flex justify-between items-center mb-3">
                                                <span className="text-xs font-bold text-slate-500">Jami</span>
                                                <span className="text-sm font-black text-slate-800 dark:text-white">{(selectedCompany.contractAmount || 0).toLocaleString()} UZS</span>
                                            </div>
                                            <div className="flex w-full h-4 rounded-full overflow-hidden bg-slate-200 dark:bg-white/10">
                                                <div className="bg-blue-500 h-full" style={{ width: `${selectedCompany.accountantPerc || 20}%` }} />
                                                <div className="bg-purple-500 h-full" style={{ width: `${selectedCompany.bankClientPerc || 5}%` }} />
                                                <div className="bg-amber-500 h-full" style={{ width: `${selectedCompany.supervisorPerc || 5}%` }} />
                                                <div className="bg-slate-700 h-full" style={{ width: `${selectedCompany.chiefAccountantPerc || 7}%` }} />
                                                <div className="bg-emerald-500 h-full" style={{ width: `${selectedCompany.firmaSharePercent || 50}%` }} />
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-2">
                                                {[
                                                    { label: 'Bux', color: 'bg-blue-500' },
                                                    { label: 'Bank', color: 'bg-purple-500' },
                                                    { label: 'Naz', color: 'bg-amber-500' },
                                                    { label: 'Bosh', color: 'bg-slate-700' },
                                                    { label: 'Firma', color: 'bg-emerald-500' },
                                                ].map((item, i) => (
                                                    <span key={i} className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                                        <span className={`w-2 h-2 rounded-full ${item.color}`} /> {item.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Report Status */}
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                                            <BarChart3 size={14} /> HISOBOT — {selectedPeriod}
                                        </h4>
                                        {selectedOp ? (
                                            <div className="grid grid-cols-2 gap-2">
                                                {REPORT_FIELDS.map(field => {
                                                    const val = String((selectedOp as any)[field] || '').trim();
                                                    const lower = val.toLowerCase();
                                                    const isDone = lower === '+' || lower.startsWith('+');
                                                    const isBlocked = lower === 'kartoteka';
                                                    return (
                                                        <div key={field} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${isDone ? 'bg-emerald-50 dark:bg-emerald-500/5 text-emerald-600' :
                                                                isBlocked ? 'bg-rose-50 dark:bg-rose-500/5 text-rose-600' :
                                                                    'bg-slate-50 dark:bg-white/5 text-slate-400'
                                                            }`}>
                                                            {isDone ? <CheckCircle2 size={12} strokeWidth={3} /> : isBlocked ? <XCircle size={12} strokeWidth={3} /> : <AlertCircle size={12} strokeWidth={3} />}
                                                            <span className="truncate capitalize">{field.replace(/_/g, ' ')}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-6 text-center bg-slate-50 dark:bg-white/5 rounded-2xl">
                                                <AlertCircle size={24} className="text-slate-300 mx-auto mb-2" />
                                                <p className="text-xs font-bold text-slate-400">Bu davr uchun hisobot mavjud emas</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupervisorDashboard;
