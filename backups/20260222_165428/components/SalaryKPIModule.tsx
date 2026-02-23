import React, { useState } from 'react';
import { Company, Staff, Language, OperationEntry } from '../types';
import { translations } from '../lib/translations';
import { LayoutDashboard, CheckSquare, Settings, DollarSign, Lock } from 'lucide-react';

// Sub-components
import NazoratchiChecklist from './NazoratchiChecklist';
import EmployeeDashboard from './EmployeeDashboard';
import PayrollTable from './PayrollTable';
import KPIRulesManager from './KPIRulesManager';

interface Props {
    companies: Company[];
    operations?: OperationEntry[]; // Optional now
    staff: Staff[];
    lang: Language;
    currentUserId?: string;
    currentUserRole?: string;
}

const SalaryKPIModule: React.FC<Props> = ({ companies, operations = [], staff, lang, currentUserId = 'user-1', currentUserRole = 'manager' }) => {
    const t = translations[lang];
    // Default tab based on role could be set here
    const [activeTab, setActiveTab] = useState<'nazoratchi' | 'employee' | 'payroll' | 'rules'>('nazoratchi');

    const normalizedRole = (currentUserRole || '').toLowerCase();

    const tabs = [
        {
            id: 'nazoratchi',
            label: 'Nazoratchi',
            icon: CheckSquare,
            component: <NazoratchiChecklist
                companies={companies}
                operations={operations}
                staff={staff}
                lang={lang}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
            />,
            allowedRoles: ['manager', 'supervisor', 'admin', 'chief_accountant', 'super_admin']
        },
        {
            id: 'employee',
            label: 'Xodim Kabineti',
            icon: LayoutDashboard,
            component: <EmployeeDashboard
                currentUserId={currentUserId}
                companies={companies}
                operations={operations}
                lang={lang}
            />,
            allowedRoles: ['staff', 'accountant', 'bank_client', 'bank_manager', 'manager', 'admin', 'chief_accountant', 'super_admin']
        },
        {
            id: 'payroll',
            label: 'Payroll (Oylik)',
            icon: DollarSign,
            component: <PayrollTable
                staff={staff}
                companies={companies}
                operations={operations}
                lang={lang}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
            />,
            allowedRoles: ['manager', 'admin', 'director', 'chief_accountant', 'super_admin']
        },
        {
            id: 'rules',
            label: 'Qoidalar',
            icon: Settings,
            component: <KPIRulesManager lang={lang} />,
            allowedRoles: ['manager', 'admin', 'chief_accountant', 'super_admin']
        }
    ] as const;

    const visibleTabs = tabs.filter(tab => {
        if (!normalizedRole) return true;
        return tab.allowedRoles.includes(normalizedRole as any);
    });

    const activeComponent = visibleTabs.find(t => t.id === activeTab)?.component ?? visibleTabs[0]?.component;

    if (visibleTabs.length === 0) {
        return (
            <div className="p-10 text-center text-slate-400">
                Sizda bu bo'limni ko'rish huquqi yo'q.
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Premium Tab Navigation */}
            <div className="liquid-glass-card rounded-[3rem] p-3 flex overflow-x-auto scrollbar-none border border-white/20 shadow-glass-lg relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-transparent to-emerald-500/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>

                <div className="flex gap-3 w-full relative z-10">
                    {visibleTabs.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex-1 flex items-center justify-center gap-4 py-5 px-8 rounded-[1.8rem] transition-all duration-500 font-black text-xs uppercase tracking-[0.2em] whitespace-nowrap group/tab relative overflow-hidden ${isActive
                                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-glass-lg scale-[1.02]'
                                        : 'hover:bg-white/10 dark:hover:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                            >
                                {isActive && (
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 opacity-30"></div>
                                )}
                                <div className={`relative z-10 flex items-center gap-4 ${isActive ? 'scale-110' : 'group-hover:scale-110 transition-transform'}`}>
                                    <tab.icon size={22} className={isActive ? 'animate-pulse' : 'opacity-50'} />
                                    <span>{tab.label}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content Area with extra depth */}
            <div className="relative min-h-[600px] animate-fade-in-up">
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="relative z-10">
                    {activeComponent}
                </div>
            </div>
        </div>
    );
};

export default SalaryKPIModule;
