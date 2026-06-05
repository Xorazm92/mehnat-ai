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

    const tabs = useMemo(() => [
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
    ], [companies, operations, staff, lang, currentUserId, currentUserRole]);

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
        <div className="space-y-0 animate-fade-in pb-20">
            {/* Standard Tab Navigation */}
            <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1d23] pt-2 px-2 shadow-sm rounded-t">
                {visibleTabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 py-2.5 px-6 font-bold text-xs uppercase transition-colors whitespace-nowrap border-t-[3px] rounded-t ${isActive
                                    ? 'border-indigo-600 bg-white dark:bg-[#22252B] text-gray-900 dark:text-white border-x border-gray-200 dark:border-gray-700 -mb-[1px]'
                                    : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white dark:bg-[#1e2025] hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                        >
                            <tab.icon size={16} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className="bg-white dark:bg-[#22252B] min-h-[600px] border border-gray-200 dark:border-gray-700 rounded-b shadow-sm relative z-10 p-0 md:p-0">
                {activeComponent}
            </div>
        </div>
    );
};

export default SalaryKPIModule;
