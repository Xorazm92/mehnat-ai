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

    const tabs = [
        {
            id: 'nazoratchi',
            label: 'Nazoratchi',
            icon: CheckSquare,
            component: <NazoratchiChecklist
                companies={companies}
                staff={staff}
                lang={lang}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
            />,
            allowedRoles: ['manager', 'supervisor', 'admin']
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
            allowedRoles: ['staff', 'accountant', 'bank_client', 'manager', 'admin']
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
                currentUserRole={currentUserRole}
            />,
            allowedRoles: ['manager', 'admin', 'director']
        },
        {
            id: 'rules',
            label: 'Qoidalar',
            icon: Settings,
            component: <KPIRulesManager lang={lang} />,
            allowedRoles: ['manager', 'admin']
        }
    ] as const;

    const visibleTabs = tabs;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header & Tabs */}
            <div className="bg-white dark:bg-apple-darkCard rounded-[2rem] p-4 shadow-xl border border-apple-border dark:border-apple-darkBorder flex overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 w-full">
                    {visibleTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-2xl transition-all font-black text-sm whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg scale-[1.02]'
                                : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                }`}
                        >
                            <tab.icon size={20} className={activeTab === tab.id ? 'animate-bounce-subtle' : ''} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="min-h-[600px]">
                {tabs.find(t => t.id === activeTab)?.component}
            </div>
        </div>
    );
};

export default SalaryKPIModule;
