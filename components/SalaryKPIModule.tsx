"use client";
import React from 'react';
import Link from 'next/link';
import { Company, Staff, Language, OperationEntry } from '@/types';
import { CheckSquare, Settings, Trophy, TrendingUp, User, ArrowUpRight } from 'lucide-react';

// Sub-components
import NazoratchiChecklist from './NazoratchiChecklist';
import EmployeeDashboard from './EmployeeDashboard';
import KPIRulesManager from './KPIRulesManager';
import KpiLeaderboard from './KpiLeaderboard';
import BotKpiProjectionButton from './BotKpiProjectionButton';
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/Tabs";
import { useTabParam } from "@/hooks/useTabParam";
import {
  KPI_CONFIG_ROLES,
  KPI_REVIEW_ROLES,
  defaultKpiTab,
  type KpiTabId,
} from "@/lib/kpiTabs";

/**
 * KPI BO'LIMI — ko'rsatkichning bitta aylanasi: xodim TOPSHIRADI, nazoratchi
 * BAHOLAYDI, natija REYTINGDA ko'rinadi, o'lchov QOIDA bilan belgilanadi.
 *
 * Ilgari bu yerda beshta yorliq bor edi va bittasi begona:
 *
 *   · "Payroll (Oylik)" — `PayrollTable` ni AYNAN `/payroll` sahifasidagidek
 *     chizardi. Bitta jadval ikki manzilda: xodim qaysi biri "haqiqiy" ekanini
 *     bilmasdi, o'zgarish esa ikkalasida ham qo'lda ta'qib qilinardi. Oylik
 *     `/payroll` ga tegishli — bu yerda faqat havola qoldi.
 *
 * "Xodim kabineti" yorlig'i ESA saqlanadi, faqat nomi ishiga moslandi:
 * "Mening KPI'm". U `/cabinet` dagi "KPI va oylik" ning nusxasi EMAS —
 * kabinetdagisi tayyor natijani o'qiydi, bu yerdagisi esa xodim o'z
 * ko'rsatkichini TOPSHIRADIGAN joy (`source: 'employee'`, `submitted`), uni
 * yonidagi "Baholash" yorlig'ida nazoratchi tasdiqlaydi. Ikkalasi bitta
 * aylananing ikki qadami, shuning uchun bir ekranda turadi.
 *
 * "Qoidalar" — sozlash, kundalik ish emas: qatorning o'ng chetiga, ajratuvchi
 * chiziq ortiga surildi.
 */

/** Sarlavhadagi "boshqa ekranga o'tish" havolalari — bir xil ko'rinishda. */
const linkCls =
    "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-body font-medium transition-colors hover:bg-[var(--bg-sunken)]";
const linkStyle: React.CSSProperties = {
    borderColor: "var(--rule)",
    color: "var(--text-secondary)",
};

interface Props {
    companies: Company[];
    operations?: OperationEntry[];
    staff: Staff[];
    lang: Language;
    currentUserId?: string;
    currentUserRole?: string;
    canProjectBotKpi?: boolean;
    currentMonth?: string;
    /** Serverda `?tab=` dan o'qilgan boshlang'ich yorliq (hidratsiyaga xavfsiz). */
    initialTab?: KpiTabId;
    /** Rol `/payroll` ni ko'ra oladimi — havola shunga qarab chiziladi. */
    canSeePayroll?: boolean;
}

const SalaryKPIModule: React.FC<Props> = ({
    companies,
    operations = [],
    staff,
    lang,
    currentUserId = 'user-1',
    currentUserRole = '',
    canProjectBotKpi,
    currentMonth,
    initialTab,
    canSeePayroll,
}) => {
    const normalizedRole = (currentUserRole || '').toLowerCase();
    const isSenior = KPI_REVIEW_ROLES.includes(normalizedRole);
    const canConfigure = KPI_CONFIG_ROLES.includes(normalizedRole);

    const allTabs: (TabItem<KpiTabId> & { visible: boolean })[] = [
        {
            id: 'mine',
            label: "Mening KPI'm",
            icon: User,
            hint: "O'z ko'rsatkichingizni topshirish va ball tafsiloti",
            visible: true,
        },
        {
            id: 'nazoratchi',
            label: 'Baholash',
            icon: CheckSquare,
            hint: "Nazoratchi varaqasi — biriktirilgan xodimlarni baholash",
            visible: isSenior,
        },
        {
            id: 'reyting',
            label: 'Reyting',
            icon: Trophy,
            hint: "Barcha xodimlar bo'yicha oylik reyting",
            visible: true,
        },
        {
            id: 'rules',
            label: 'Qoidalar',
            icon: Settings,
            hint: 'KPI qoidalari — sozlash',
            trailing: true,
            visible: canConfigure,
        },
    ];
    const visibleTabs: TabItem<KpiTabId>[] = allTabs
        .filter((t) => t.visible)
        .map((t) => ({ id: t.id, label: t.label, icon: t.icon, hint: t.hint, trailing: t.trailing }));

    // Boshlang'ich yorliq HAR DOIM ko'rinadigan yorliqlar ichidan bo'lsin —
    // aks holda yorliqlar qatorida hech biri tanlanmagan holat chiqadi.
    const fallback: KpiTabId =
        visibleTabs.find((t) => t.id === (initialTab ?? defaultKpiTab(normalizedRole)))?.id ??
        visibleTabs[0]?.id ??
        'mine';

    const [tab, setTab] = useTabParam<KpiTabId>(
        'tab',
        visibleTabs.map((t) => t.id),
        fallback
    );

    if (visibleTabs.length === 0) {
        return (
            <div className="p-10 text-center text-[var(--text-muted)]">
                Sizda bu bo&apos;limni ko&apos;rish huquqi yo&apos;q.
            </div>
        );
    }

    const active = visibleTabs.some((t) => t.id === tab) ? tab : fallback;

    return (
        <div className="animate-fade-in pb-20">
            <PageHeader
                icon={<TrendingUp size={20} />}
                title="KPI"
                description="Ko'rsatkichlar, baholash va reyting"
                actions={
                    <div className="flex items-center gap-2.5">
                        {/* Oylik shu yerda EMAS — o'z sahifasiga havola.
                            Ilgari uning to'liq nusxasi yorliq bo'lib turardi. */}
                        {canSeePayroll && (
                            <Link href="/payroll" className={linkCls} style={linkStyle}>
                                Oylik hisob-kitobi
                                <ArrowUpRight size={14} aria-hidden="true" />
                            </Link>
                        )}
                        {canProjectBotKpi && currentMonth && (
                            <BotKpiProjectionButton month={currentMonth} />
                        )}
                    </div>
                }
            >
                <Tabs
                    items={visibleTabs}
                    value={active}
                    onChange={setTab}
                    idBase="kpi"
                    ariaLabel="KPI bo'limlari"
                />
            </PageHeader>

            <TabPanel tabId={active} idBase="kpi">
                {active === 'mine' && (
                    <EmployeeDashboard
                        currentUserId={currentUserId}
                        companies={companies}
                        operations={operations}
                        lang={lang}
                    />
                )}
                {active === 'nazoratchi' && (
                    <NazoratchiChecklist
                        companies={companies}
                        operations={operations}
                        staff={staff}
                        lang={lang}
                        currentUserId={currentUserId}
                        currentUserRole={currentUserRole}
                    />
                )}
                {active === 'reyting' && (
                    <KpiLeaderboard lang={lang} hideBonus={!isSenior} />
                )}
                {active === 'rules' && <KPIRulesManager lang={lang} />}
            </TabPanel>
        </div>
    );
};

export default SalaryKPIModule;
