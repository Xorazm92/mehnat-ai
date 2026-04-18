import React, { useState, useMemo } from 'react';
import { Company, OperationEntry, Staff, Language, Payment, Expense } from '../types';
import { translations } from '../lib/translations';
import { periodsEqual } from '../lib/periods';
import { MonthPicker } from './ui/MonthPicker';
import {
    Building2, Users, Search, DollarSign, TrendingUp,
    ChevronRight, ChevronDown, Briefcase, CheckCircle2, AlertCircle,
    XCircle, Eye, Wallet, BarChart3, ArrowUpRight, X, Crown, Star,
    Shield, UserCheck, Network, Download, Activity, Clock, TrendingUp as TrendingUpIcon,
    PieChart as PieChartIcon, CheckCircle, ArrowRight, User, LogOut
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
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
        <div className="space-y-8 animate-fade-in pb-10 max-w-[1600px] mx-auto">
            {/* ═══ HEADER ═══ */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-[#DEE2E6] dark:border-[#3A3D44] pb-6">
                <div>
                    <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
                        <Shield className="text-[#3366CC]" size={28} />
                        <span className="text-gray-800 dark:text-white uppercase">VERTIKAL NAZORAT</span>
                        <span className="text-[#3366CC] uppercase">DIAGRAMMASI</span>
                    </h1>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1 italic">
                        Nazoratchi boshqaruv paneli • {selectedPeriod}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm font-black text-[11px] transition-all shadow-sm uppercase tracking-widest border border-emerald-700"
                    >
                        <Download size={14} /> EXPORT EXCEL
                    </button>
                    <MonthPicker
                        selectedPeriod={selectedPeriod}
                        onChange={onPeriodChange}
                        className="border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm bg-white dark:bg-[#1A1D23]"
                    />
                </div>
            </div>

            {/* ═══ 4 STAT CARDS ═══ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'JAMI FIRMALAR', value: String(summary.companyCount), icon: <Building2 size={20} />, color: 'text-[#3366CC]', bg: 'bg-[#F0F2F5] dark:bg-[#1A1D23]' },
                    { label: 'SHARTNOMA QIYMATI', value: fmtMoney(summary.totalContract), icon: <DollarSign size={20} />, color: 'text-emerald-600', bg: 'bg-[#F0F2F5] dark:bg-[#1A1D23]' },
                    { label: 'XODIMLAR', value: String(summary.staffCount), icon: <Users size={20} />, color: 'text-indigo-600', bg: 'bg-[#F0F2F5] dark:bg-[#1A1D23]' },
                    { label: 'NAZORAT ULUSHI', value: fmtMoney(summary.totalSupervisorEarnings), icon: <Wallet size={20} />, color: 'text-amber-600', bg: 'bg-[#F0F2F5] dark:bg-[#1A1D23]' },
                ].map((card, i) => (
                    <div key={i} className={`${card.bg} border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-5 shadow-sm group hover:border-[#3366CC] transition-all`}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">{card.label}</p>
                            <div className={`${card.color} opacity-40 group-hover:opacity-100 transition-opacity`}>{card.icon}</div>
                        </div>
                        <h2 className="text-2xl font-black tabular-nums tracking-tighter text-gray-800 dark:text-white uppercase">{card.value}</h2>
                    </div>
                ))}
            </div>

            {/* ═══ TAB NAVIGATION ═══ */}
            <div className="flex gap-1 border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                {([
                    { key: 'overview', label: 'Umumiy ko\'rinish', icon: <Eye size={14} /> },
                    { key: 'hierarchy', label: 'Vertikal Tuzilma', icon: <Network size={14} /> },
                    { key: 'companies', label: 'Firmalar ro\'yxati', icon: <Building2 size={14} /> },
                ] as { key: typeof activeTab, label: string, icon: React.ReactNode }[]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-bold text-[11px] uppercase tracking-widest transition-all border-t-2 ${activeTab === tab.key
                            ? 'bg-white dark:bg-[#22252B] text-[#3366CC] border-t-[#3366CC] border-x border-[#DEE2E6] dark:border-[#3A3D44] -mb-[1px]'
                            : 'text-gray-400 hover:text-gray-600 border-t-transparent border-x-transparent'
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
                    {/* ── HIERARCHY TREE (Industrial org chart) ── */}
                    <div className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-8 overflow-x-auto shadow-sm">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-10 text-center">
                            ASOS ERP • NAZORAT TUZILMASI • {selectedPeriod}
                        </h3>

                        {/* Chief Accountant (Ёркиной) at top */}
                        <div className="flex flex-col items-center">
                            <div className="bg-[#3366CC] border-2 border-[#2A52A3] rounded-sm px-10 py-5 text-center shadow-md relative min-w-[240px]">
                                <Crown size={18} className="absolute -top-3 left-1/2 -translate-x-1/2 text-white" />
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/70 mb-1">BOSH NAZORATCHI</p>
                                <p className="text-xl font-black text-white tracking-tight uppercase">Ёркиной</p>
                                <div className="mt-3 pt-2 border-t border-white/20">
                                    <p className="text-[10px] font-black text-white/80 uppercase">
                                        {allActiveCompanies.length} FIRMA • {fmtMoney(allActiveCompanies.reduce((s, c) => s + (c.contractAmount || 0), 0))} UZS
                                    </p>
                                </div>
                            </div>

                            {/* Vertical connector */}
                            <div className="w-px h-10 bg-[#DEE2E6] dark:bg-[#3A3D44]" />

                            {/* Supervisors level */}
                            <div className="flex gap-4 flex-wrap justify-center items-start">
                                {supervisorsData.map((sup, i) => {
                                    const isExpanded = expandedSupervisor === sup.id;
                                    
                                    return (
                                        <div key={sup.id} className="flex flex-col items-center">
                                            {/* Connector from top */}
                                            <div className="h-6 w-px bg-[#DEE2E6] dark:bg-[#3A3D44]" />

                                            {/* Supervisor Card */}
                                            <div
                                                onClick={() => setExpandedSupervisor(isExpanded ? null : sup.id)}
                                                className={`bg-white dark:bg-[#22252B] border-2 rounded-sm px-6 py-4 text-center shadow-sm cursor-pointer hover:border-[#3366CC] transition-all min-w-[210px] relative ${sup.isCurrent ? 'border-[#3366CC] ring-1 ring-[#3366CC]/20' : 'border-[#DEE2E6] dark:border-[#3A3D44]'}`}
                                            >
                                                {sup.isCurrent && <div className="absolute top-0 right-0 bg-[#3366CC] text-white p-1 rounded-bl-sm"><Star size={10} fill="currentColor" /></div>}
                                                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">NAZORATCHI</p>
                                                <p className="text-[14px] font-black text-gray-800 dark:text-white uppercase tracking-tight">{sup.name}</p>
                                                
                                                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#F0F2F5] dark:border-[#1A1D23]">
                                                    <div className="text-center border-r border-[#F0F2F5] dark:border-[#1A1D23]">
                                                        <p className="text-[10px] font-black text-[#3366CC]">{sup.companiesCount}</p>
                                                        <p className="text-[7px] font-bold text-gray-400 uppercase">Firma</p>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-[10px] font-black text-[#3366CC]">{fmtMoney(sup.totalContract)}</p>
                                                        <p className="text-[7px] font-bold text-gray-400 uppercase">Summa</p>
                                                    </div>
                                                </div>
                                                
                                                <div className="mt-2 flex items-center justify-center gap-1.5">
                                                    <p className="text-[8px] font-black text-gray-500 uppercase">
                                                        {sup.uniqueAccountants.length} BUXGALTER
                                                    </p>
                                                    <ChevronDown size={12} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180 text-[#3366CC]' : ''}`} />
                                                </div>
                                            </div>

                                            {/* Accountants under supervisor */}
                                            {isExpanded && (
                                                <div className="flex flex-col items-center mt-2 animate-fade-in">
                                                    <div className="w-px h-4 bg-[#DEE2E6] dark:bg-[#3A3D44]" />
                                                    <div className="flex flex-col gap-1 w-full max-w-[190px]">
                                                        {sup.uniqueAccountants.map((accName, ai) => (
                                                            <div key={ai} className="bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm px-3 py-2 flex items-center justify-between group hover:bg-white dark:hover:bg-[#1A1D23] transition-colors">
                                                                <div>
                                                                    <p className="text-[9px] font-black text-gray-800 dark:text-gray-200 uppercase truncate max-w-[120px]">{accName}</p>
                                                                    <p className="text-[7px] font-bold text-gray-400 uppercase">
                                                                        {sup.companies.filter(c => c.accountantName === accName).length} FIRMA
                                                                    </p>
                                                                </div>
                                                                <ArrowRight size={10} className="text-gray-300 group-hover:text-[#3366CC]" />
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
                            const barColor = 'bg-[#3366CC]';
                            const bgColor = 'bg-[#F0F2F5] dark:bg-[#1A1D23]';
                            const textColor = 'text-[#3366CC]';

                            // Get accountant distribution for this supervisor
                            const accDist: Record<string, number> = {};
                            sup.companies.forEach(c => {
                                const name = c.accountantName || '—';
                                accDist[name] = (accDist[name] || 0) + 1;
                            });
                            const sortedAcc = Object.entries(accDist).sort((a, b) => b[1] - a[1]);

                            return (
                                <div key={sup.id} className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-5 shadow-sm">
                                    <h4 className={`text-[10px] font-black uppercase tracking-widest ${textColor} mb-5 flex items-center gap-2 border-b border-[#F0F2F5] dark:border-[#1A1D23] pb-3`}>
                                        <Shield size={14} /> NAZORAT: {sup.name} ({sup.companiesCount} firma)
                                    </h4>
                                    <div className="space-y-3">
                                        {sortedAcc.slice(0, 8).map(([name, count]) => (
                                            <div key={name} className="flex items-center gap-3">
                                                <span className="text-[10px] font-bold text-gray-500 w-24 truncate">{name}</span>
                                                <div className="flex-1 h-3 bg-[#F8F9FA] dark:bg-[#111318] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] overflow-hidden">
                                                    <div
                                                        className={`h-full ${barColor} transition-all duration-700 flex items-center justify-end pr-1.5`}
                                                        style={{ width: `${(count / sup.companiesCount) * 100}%` }}
                                                    >
                                                        {count > 2 && <span className="text-[7px] font-black text-white">{count}</span>}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-black text-gray-500 tabular-nums w-6 text-right">{count}</span>
                                            </div>
                                        ))}
                                        {sortedAcc.length > 8 && (
                                            <p className="text-[9px] font-bold text-gray-400 text-center uppercase tracking-widest mt-2">+{sortedAcc.length - 8} buxgalter</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── MY ACCOUNTANTS FINANCIAL TABLE ── */}
                    <div className="bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-[#DEE2E6] dark:border-[#3A3D44] bg-[#F8F9FA] dark:bg-[#111318]">
                            <h3 className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <UserCheck size={16} className="text-[#3366CC]" />
                                MENING BUXGALTERLARIM — {myAccountants.length} ta
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
                            {myAccountants.map((acc) => (
                                <div key={acc.id} className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-4 hover:border-[#3366CC] transition-all group shadow-sm">
                                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#F0F2F5] dark:border-[#22252B]">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-sm bg-[#3366CC] text-white flex items-center justify-center font-black text-sm border border-[#2A52A3] shadow-sm">
                                                {acc.name[0]}
                                            </div>
                                            <div>
                                                <h4 className="font-black text-[13px] text-gray-800 dark:text-white leading-tight uppercase tracking-tight">{acc.name}</h4>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{acc.companiesCount} ta firma</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[14px] font-black text-emerald-600 tabular-nums">{fmtMoney(acc.totalContract)}</p>
                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Shartnoma</p>
                                        </div>
                                    </div>

                                    {/* Company list under this accountant */}
                                    <div className="space-y-1.5 mt-4 max-h-40 overflow-y-auto scrollbar-hide pr-1">
                                        {acc.companies.map(c => {
                                            const prog = getCompanyProgress(c.id);
                                            return (
                                                <div key={c.id} className="flex items-center gap-3 bg-[#F8F9FA] dark:bg-[#111318] p-2.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] group/row hover:border-[#3366CC] transition-colors">
                                                    <div className={`w-1.5 h-1.5 rounded-sm shrink-0 ${prog.percent >= 80 ? 'bg-emerald-500' : prog.percent >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                                                    <span className="font-bold text-[10px] text-gray-700 dark:text-gray-300 truncate flex-1 uppercase tracking-tight">{c.name}</span>
                                                    <span className="font-black tabular-nums text-[9px] text-gray-500">{fmtMoney(c.contractAmount || 0)}</span>
                                                    <div className="w-10 h-1 bg-[#DEE2E6] dark:bg-[#3A3D44] rounded-sm overflow-hidden ml-2">
                                                        <div className={`h-full ${prog.percent >= 80 ? 'bg-emerald-500' : prog.percent >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${prog.percent}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ TAB: HIERARCHY ═══ */}
            {activeTab === 'hierarchy' && (
                <div className="space-y-6">
                    {/* Full hierarchy for each supervisor */}
                    {supervisorsData.map((sup, i) => {
                        const isMe = sup.isCurrent;
                        
                        // Accountant breakdown
                        const accMap: Record<string, Company[]> = {};
                        sup.companies.forEach(c => {
                            const name = c.accountantName || '—';
                            if (!accMap[name]) accMap[name] = [];
                            accMap[name].push(c);
                        });
                        const accList = Object.entries(accMap).sort((a, b) => b[1].length - a[1].length);

                        return (
                            <div key={sup.id} className={`bg-[#F8F9FA] dark:bg-[#111318] rounded-sm border-t-4 p-6 shadow-sm ${isMe ? 'border-t-[#3366CC]' : 'border-t-gray-400'}`}>
                                <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                                    <div className="flex items-center gap-5">
                                        <div className={`w-12 h-12 rounded-sm bg-[#3366CC] text-white flex items-center justify-center font-black text-lg shadow-sm font-sans uppercase`}>
                                            {sup.name[0]}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight">{sup.name}</h3>
                                                {isMe && <span className="text-[9px] font-black px-2 py-0.5 bg-[#EBF3FF] text-[#3366CC] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] uppercase">SIZ</span>}
                                            </div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                                {sup.companiesCount} FIRMA • {fmtMoney(sup.totalContract)} UZS • {sup.uniqueAccountants.length} BUXGALTER
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-2xl font-black text-[#3366CC] tabular-nums`}>{fmtMoney(sup.totalSupervisorEarnings)}</p>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">NAZORAT ULUSHI</p>
                                    </div>
                                </div>

                                {/* Accountant cards grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                    {accList.map(([accName, accCompanies]) => {
                                        const accTotal = accCompanies.reduce((s, c) => s + (c.contractAmount || 0), 0);
                                        return (
                                            <div key={accName} className="bg-white dark:bg-[#22252B] rounded-sm p-4 border border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm hover:border-[#3366CC] transition-all">
                                                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#F0F2F5] dark:border-[#1A1D23]">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-7 h-7 rounded-sm bg-[#F0F2F5] dark:bg-[#1A1D23] flex items-center justify-center border border-[#DEE2E6] dark:border-[#3A3D44]`}>
                                                            <span className={`text-[10px] font-black text-[#3366CC]`}>{accName[0]}</span>
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-tight truncate max-w-[100px]">{accName}</p>
                                                            <p className="text-[8px] font-bold text-gray-400 uppercase">{accCompanies.length} FIRMA</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] font-black text-gray-600 dark:text-gray-400 tabular-nums">{fmtMoney(accTotal)}</p>
                                                </div>
                                                <div className="space-y-1.5 mt-2">
                                                    {accCompanies.slice(0, 4).map(c => (
                                                        <div key={c.id} className="flex items-center justify-between text-[9px] bg-[#F8F9FA] dark:bg-[#111318] p-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44]">
                                                            <span className="font-bold text-gray-500 uppercase truncate flex-1 mr-2">{c.name}</span>
                                                            <span className="font-black text-gray-600 dark:text-gray-400 tabular-nums">{fmtMoney(c.contractAmount || 0)}</span>
                                                        </div>
                                                    ))}
                                                    {accCompanies.length > 4 && (
                                                        <p className="text-[8px] font-bold text-gray-400 uppercase text-center mt-1">+{accCompanies.length - 4} FIRMA</p>
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

            {/* ═══ TAB: COMPANIES LIST ═══ */}
            {activeTab === 'companies' && (
                <div className="space-y-6">
                    {/* Search & Filter */}
                    <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-[#1A1D23] p-4 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="FIRMA QIDIRISH (NOMI YOKI INN)..."
                                className="w-full pl-11 pr-4 py-3 bg-[#F8F9FA] dark:bg-[#111318] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] outline-none font-bold text-[11px] uppercase tracking-wider focus:border-[#3366CC] transition-all shadow-inner"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <select
                            value={filterAccountant}
                            onChange={e => setFilterAccountant(e.target.value)}
                            className="px-4 py-3 bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm font-black text-[11px] uppercase tracking-wider outline-none cursor-pointer min-w-[180px] shadow-sm text-gray-500 focus:border-[#3366CC]"
                        >
                            <option value="all">BARCHA BUXGALTERLAR</option>
                            {myAccountants.map(acc => (
                                <option key={acc.id} value={acc.name}>{acc.name} ({acc.companiesCount})</option>
                            ))}
                        </select>
                    </div>

                    {/* Company Grid + Detail */}
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className={`w-full ${selectedCompany ? 'lg:w-[55%]' : 'lg:w-full'} transition-all duration-500`}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filteredCompanies.map(c => {
                                    const prog = getCompanyProgress(c.id);
                                    const isSelected = c.id === selectedCompanyId;
                                    const supAmt = (c.contractAmount || 0) * ((c.supervisorPerc || 5) / 100);

                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => setSelectedCompanyId(isSelected ? null : c.id)}
                                            className={`relative p-5 rounded-sm border-2 cursor-pointer transition-all duration-200 group ${isSelected
                                                ? 'bg-[#EBF3FF] dark:bg-[#1C2531] border-[#3366CC] shadow-md'
                                                : 'bg-white dark:bg-[#22252B] border-[#DEE2E6] dark:border-[#3A3D44] hover:border-[#3366CC] shadow-sm'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between mb-3 border-b border-[#F0F2F5] dark:border-[#1A1D23] pb-2">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className={`font-black text-[12px] uppercase tracking-tight truncate ${isSelected ? 'text-[#3366CC]' : 'text-gray-800 dark:text-white'}`}>{c.name}</h4>
                                                    <p className="text-[9px] font-bold text-gray-400 mt-0.5">INN: {c.inn}</p>
                                                </div>
                                                <ChevronRight size={14} className={`shrink-0 text-gray-300 transition-transform ${isSelected ? 'rotate-90 text-[#3366CC]' : ''}`} />
                                            </div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className="text-[8px] font-black px-2 py-0.5 bg-[#F0F2F5] dark:bg-[#1A1D23] text-gray-600 dark:text-gray-400 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] uppercase">{c.accountantName || '—'}</span>
                                                {c.bankClientName && c.bankClientName !== '—' && (
                                                    <span className="text-[8px] font-black px-2 py-0.5 bg-[#F0F2F5] dark:bg-[#1A1D23] text-gray-600 dark:text-gray-400 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] uppercase">{c.bankClientName}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] mb-4 bg-[#F8F9FA] dark:bg-[#111318] p-2 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44]">
                                                <span className="font-black text-gray-500 tabular-nums">{fmtMoney(c.contractAmount || 0)}</span>
                                                <span className="font-black text-emerald-600 tabular-nums">+{fmtMoney(supAmt)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-1.5 bg-[#F0F2F5] dark:bg-[#1A1D23] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-700 ${prog.percent >= 80 ? 'bg-emerald-500' : prog.percent >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                        style={{ width: `${prog.percent}%` }}
                                                    />
                                                </div>
                                                <span className={`text-[10px] font-black tabular-nums ${prog.percent >= 80 ? 'text-emerald-600' : prog.percent >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{prog.percent}%</span>
                                            </div>
                                            {prog.blocked > 0 && (
                                                <div className="absolute top-2 right-2 flex gap-1">
                                                    <AlertCircle size={10} className="text-rose-500 animate-pulse" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {filteredCompanies.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm">
                                    <Building2 size={40} className="text-gray-200 dark:text-gray-700 mb-4" />
                                    <p className="font-black text-gray-400 text-sm uppercase tracking-widest">Firmalar topilmadi</p>
                                </div>
                            )}
                        </div>

                        {/* Detail Panel */}
                        {selectedCompany && (
                            <div className="w-full lg:w-[45%] bg-white dark:bg-[#22252B] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-2xl overflow-hidden flex flex-col max-h-[80vh] sticky top-6 animate-fade-in">
                                <div className="p-5 bg-[#3366CC] text-white relative shadow-md">
                                    <button onClick={() => setSelectedCompanyId(null)} className="absolute top-4 right-4 p-1.5 rounded-sm hover:bg-white/10 border border-white/20 transition-all">
                                        <X size={16} />
                                    </button>
                                    <h3 className="text-lg font-black tracking-tight uppercase pr-8">{selectedCompany.name}</h3>
                                    <div className="flex items-center gap-3 mt-2 text-[9px] font-black text-white/70 uppercase tracking-widest">
                                        <span>INN: {selectedCompany.inn}</span>
                                        {selectedCompany.taxType && <span className="px-2 py-0.5 bg-white/10 rounded-sm border border-white/20">{selectedCompany.taxType}</span>}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
                                    {/* Employees */}
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2 border-b border-[#DEE2E6] dark:border-[#3A3D44] pb-2">
                                            <Users size={14} /> MAS'UL XODIMLAR
                                        </h4>
                                        <div className="space-y-2">
                                            {[
                                                { name: selectedCompany.accountantName || '—', role: 'Buxgalter', perc: selectedCompany.accountantPerc || 20, color: 'bg-blue-600', icon: <User size={14} /> },
                                                ...(selectedCompany.bankClientName && selectedCompany.bankClientName !== '—' ? [{ name: selectedCompany.bankClientName, role: 'Bank Klient', perc: selectedCompany.bankClientPerc || 5, color: 'bg-indigo-600', icon: <Wallet size={14} /> }] : []),
                                                { name: selectedCompany.supervisorName || currentUserName || '—', role: 'Nazoratchi (Siz)', perc: selectedCompany.supervisorPerc || 5, color: 'bg-[#3366CC]', icon: <Shield size={14} /> },
                                                { name: 'Ёркиной', role: 'Bosh Buxgalter', perc: selectedCompany.chiefAccountantPerc || 7, color: 'bg-gray-800', icon: <Crown size={14} /> },
                                            ].map((emp, i) => (
                                                <div key={i} className={`flex items-center justify-between p-3 bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm hover:border-[#3366CC] transition-all`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-9 h-9 rounded-sm ${emp.color} text-white flex items-center justify-center font-black text-xs shadow-sm`}>{React.cloneElement(emp.icon as React.ReactElement, { size: 16 })}</div>
                                                        <div>
                                                            <p className="font-black text-[12px] text-gray-800 dark:text-white uppercase tracking-tight">{emp.name}</p>
                                                            <p className={`text-[8px] font-black uppercase tracking-widest text-gray-400 mt-0.5`}>{emp.role}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[11px] font-black text-[#3366CC] tabular-nums">{emp.perc}%</p>
                                                        <p className="text-[9px] font-bold text-gray-400 tabular-nums">{fmtMoney((selectedCompany.contractAmount || 0) * (emp.perc / 100))}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Contract */}
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2 border-b border-[#DEE2E6] dark:border-[#3A3D44] pb-2">
                                            <DollarSign size={14} /> SHARTNOMA TADBIRLARI
                                        </h4>
                                        <div className="bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm p-4">
                                            <div className="flex justify-between items-center mb-4 border-b border-[#DEE2E6] dark:border-[#3A3D44] pb-2">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">JAMI SUMMA</span>
                                                <span className="text-[14px] font-black text-gray-800 dark:text-white tabular-nums">{(selectedCompany.contractAmount || 0).toLocaleString()} UZS</span>
                                            </div>
                                            <div className="flex w-full h-4 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] overflow-hidden bg-white dark:bg-[#22252B] shadow-inner">
                                                <div className="bg-blue-600 h-full border-r border-[#DEE2E6] dark:border-[#3A3D44]" style={{ width: `${selectedCompany.accountantPerc || 20}%` }} />
                                                <div className="bg-indigo-600 h-full border-r border-[#DEE2E6] dark:border-[#3A3D44]" style={{ width: `${selectedCompany.bankClientPerc || 5}%` }} />
                                                <div className="bg-[#3366CC] h-full border-r border-[#DEE2E6] dark:border-[#3A3D44]" style={{ width: `${selectedCompany.supervisorPerc || 5}%` }} />
                                                <div className="bg-gray-800 h-full border-r border-[#DEE2E6] dark:border-[#3A3D44]" style={{ width: `${selectedCompany.chiefAccountantPerc || 7}%` }} />
                                                <div className="bg-emerald-600 h-full" style={{ width: `${selectedCompany.firmaSharePercent || 50}%` }} />
                                            </div>
                                            <div className="flex flex-wrap gap-4 mt-4">
                                                {[
                                                    { label: 'BUX', color: 'bg-blue-600' },
                                                    { label: 'BANK', color: 'bg-indigo-600' },
                                                    { label: 'NAZ', color: 'bg-[#3366CC]' },
                                                    { label: 'BOSH', color: 'bg-gray-800' },
                                                    { label: 'FIRMA', color: 'bg-emerald-600' },
                                                ].map((item, i) => (
                                                    <span key={i} className="flex items-center gap-2 text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                                        <span className={`w-2.5 h-2.5 rounded-sm ${item.color} border border-[#DEE2E6] dark:border-[#3A3D44] shadow-sm`} /> {item.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Report Status */}
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2 border-b border-[#DEE2E6] dark:border-[#3A3D44] pb-2">
                                            <BarChart3 size={14} /> HISOBOT STATUSI — {selectedPeriod}
                                        </h4>
                                        {selectedOp ? (
                                            <div className="grid grid-cols-2 gap-2">
                                                {REPORT_FIELDS.map(field => {
                                                    const val = String((selectedOp as any)[field] || '').trim();
                                                    const lower = val.toLowerCase();
                                                    const isDone = lower === '+' || lower.startsWith('+');
                                                    const isBlocked = lower === 'kartoteka';
                                                    return (
                                                        <div key={field} className={`flex items-center gap-2 px-3 py-2.5 rounded-sm border text-[10px] font-black uppercase tracking-tight transition-all ${isDone ? 'bg-[#EBFBF0] dark:bg-[#1C3125] text-emerald-600 border-[#C3E6CB] dark:border-[#2C4A36]' :
                                                            isBlocked ? 'bg-rose-50 dark:bg-rose-500/5 text-rose-600 border-rose-100 dark:border-rose-900/30 shadow-inner' :
                                                                'bg-[#F8F9FA] dark:bg-[#111318] text-gray-400 border-[#DEE2E6] dark:border-[#3A3D44]'
                                                            }`}>
                                                            {isDone ? <CheckCircle2 size={12} /> : isBlocked ? <XCircle size={12} className="animate-pulse" /> : <AlertCircle size={12} />}
                                                            <span className="truncate">{field.replace(/_/g, ' ')}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-10 text-center bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm">
                                                <AlertCircle size={24} className="text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ma'lumot mavjud emas</p>
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
