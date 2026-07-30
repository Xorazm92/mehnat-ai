"use client";
import React, { useState, useMemo } from 'react';
import { Company, Staff, Language, OperationEntry } from '@/types';
import { LayoutDashboard, CheckSquare, Settings, DollarSign, Trophy } from 'lucide-react';
import { TrendingUp } from 'lucide-react';

// Sub-components
import NazoratchiChecklist from './NazoratchiChecklist';
import EmployeeDashboard from './EmployeeDashboard';
import PayrollTable from './PayrollTable';
import KPIRulesManager from './KPIRulesManager';
import KpiLeaderboard from './KpiLeaderboard';
import BotKpiProjectionButton from './BotKpiProjectionButton';
import { PageHeader } from "@/components/ui/PageHeader";

interface Props {
    companies: Company[];
    operations?: OperationEntry[]; // Optional now
    staff: Staff[];
    lang: Language;
    currentUserId?: string;
    currentUserRole?: string;
    canProjectBotKpi?: boolean;
    currentMonth?: string;
}

const SalaryKPIModule: React.FC<Props> = ({ companies, operations = [], staff, lang, currentUserId = 'user-1', currentUserRole = 'manager', canProjectBotKpi, currentMonth }) => {
    // Default tab based on role could be set here
    const [activeTab, setActiveTab] = useState<'nazoratchi' | 'reyting' | 'employee' | 'payroll' | 'rules'>('nazoratchi');

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
            id: 'reyting',
            label: 'Reyting',
            icon: Trophy,
            component: <KpiLeaderboard lang={lang} hideBonus={!['manager', 'supervisor', 'admin', 'chief_accountant', 'super_admin'].includes(normalizedRole)} />,
            allowedRoles: ['manager', 'supervisor', 'admin', 'chief_accountant', 'super_admin', 'accountant', 'bank_client', 'bank_manager', 'staff']
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
            <div className="p-10 text-center text-[var(--text-muted)]">
                Sizda bu bo&apos;limni ko&apos;rish huquqi yo&apos;q.
            </div>
        );
    }

    return (
        <div className="space-y-0 animate-fade-in pb-20">
      <PageHeader
        icon={<TrendingUp size={20} />}
        title="KPI va Oylik"
        description="Ko'rsatkichlar, reyting, telegram bot statistikasi va maosh hisobi"
        actions={
          canProjectBotKpi && currentMonth ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--rule)] bg-[var(--bg-sunken)] text-[var(--text-secondary)] text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-indigo)] animate-pulse" />
                <span>Telegram Bot</span>
              </div>
              <BotKpiProjectionButton month={currentMonth} />
            </div>
          ) : null
        }
      />
            {/* Standard Tab Navigation */}
            <div className="flex gap-1 overflow-x-auto border-b border-[var(--rule)] bg-[var(--card-bg)] dark:bg-[var(--surface)] pt-2 px-2 shadow-sm rounded-t">
                {visibleTabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 py-2.5 px-6 font-bold text-xs uppercase transition-colors whitespace-nowrap border-t-[3px] rounded-t ${isActive
                                    ? 'border-[var(--accent-indigo)] bg-[var(--card-bg)] dark:bg-[var(--surface-2)] text-[var(--text-primary)] dark:text-white border-x border-[var(--rule)] -mb-[1px]'
                                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white dark:bg-[var(--surface)] hover:bg-[var(--bg-sunken)] dark:hover:bg-[var(--surface-2)]'
                                }`}
                        >
                            <tab.icon size={16} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className="bg-[var(--card-bg)] dark:bg-[var(--surface-2)] min-h-[600px] border border-[var(--rule)] rounded-b shadow-sm relative z-10 p-0 md:p-0">
                {activeComponent}
            </div>
        </div>
    );
};

export default SalaryKPIModule;
