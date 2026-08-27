import React, { useState } from 'react';
import { ALL_SERVICE_KEYS as ALL_SERVICE_KEYS_SRC, SERVICE_LABELS as SERVICE_LABELS_SRC, serviceGroups, serviceFullLabel } from '@/lib/reportColumns';
import { Company, Staff, TaxType, ServerInfo } from '@/types';
import { ChevronRight, ChevronLeft, Check, X, Building2, Server, Calculator, Users } from 'lucide-react';
import { groupDigits, ungroupDigits } from '@/lib/format';
import { Button } from "@/components/ui/Button";
import { updateServiceTerm, getServiceTermInfo } from "@/server/companies";
import { friendlyError } from "@/lib/actionError";
import {
    ASSIGNMENT_ROLES,
    ASSIGNMENT_ROLE_LABELS,
    sortStaffForAssignmentRole,
    type AssignmentRole,
} from '@/lib/permissions';
import { STANDARD_TARIFF, type TariffPreset } from '@/lib/tariffPresets';
import {
    TAX_CATEGORIES,
    legacyTaxType,
    normalizeTaxRegime,
    taxRegimeCategory,
    type TaxRegimeCode,
} from '@/lib/taxRegimes';
import { DateField } from "./ui/DateField";

interface Props {
    staff: Staff[];
    initialData?: Partial<Company>;
    initialAssignments?: any[];
    /** Admin sozlamalaridan kelgan "Standart" taqsimot; berilmasa STANDARD_TARIFF. */
    tariffPreset?: TariffPreset;
    /**
     * "Ichki shartnoma tomoni" variantlari — bazadagi o'z firmalarimiz
     * (`isOwnFirm`). Ilgari bu ro'yxat SHU FAYLDA qo'lda yozilgan edi va
     * bazadan ajralib ketgan: "FINFO INFO BEST" yo'q, o'rniga o'z firma
     * bo'lmagan "Plastik" bor edi.
     */
    internalContractors?: { id: string; name: string }[];
  /**
   * Og'zaki shartnoma tomonlari — plastik/naqd kanallari (mas'ul odami bilan).
   * Mijoz 10 ta firmamizdan biri bilan shartnoma tuzmagan holat uchun.
   */
  internalParties?: { id: string; label: string; type: string; employee?: { fullName: string } | null }[];

    onSave: (company: Partial<Company>, assignments: any[]) => void;
    onCancel: () => void;
}

const steps = [
    { id: 'basic', title: 'Asosiy', icon: Building2 },
    { id: 'technical', title: 'Texnik', icon: Server },
    { id: 'tax', title: 'Soliq & Stat', icon: Calculator },
    { id: 'team', title: 'Jamoa', icon: Users }
];

// Xizmat kalitlari YAGONA manbadan (lib/reportColumns.ts). Ilgari bu yerda
// qo'lda yozilgan ro'yxat turardi va u eskirgan edi — `*_tolov` kalitlari
// yo'qligi tufayli "Yoqish" tugmasi to'lov kataklarini qulflab qo'yardi.
const ALL_SERVICE_KEYS = ALL_SERVICE_KEYS_SRC;

const SERVICE_LABELS: Record<string, string> = SERVICE_LABELS_SRC;

const SERVICE_GROUPS = serviceGroups();

const fieldLabelStyle: React.CSSProperties = { color: 'var(--text-muted)' };

const OnboardingWizard: React.FC<Props> = ({ staff, initialData, initialAssignments, tariffPreset, internalContractors, internalParties, onSave, onCancel }) => {
    const [currentStep, setCurrentStep] = useState(0);
    /**
     * Xatolar DARHOL emas, urinishdan KEYIN ko'rsatiladi.
     * Aks holda bo'sh forma ochilishi bilanoq qizil ogohlantirishlar bilan
     * qarshi olardi.
     */
    const [showErrors, setShowErrors] = useState(false);
    const [formData, setFormData] = useState<Partial<Company>>(initialData || {
        // KANONIK maydon `taxRegime`; `taxType` faqat eski ekranlar uchun nusxa.
        taxRegime: 'turnover',
        taxType: TaxType.TURNOVER,
        serverInfo: 'CR1',
        kpiEnabled: true,
        statReports: [],
        serviceScope: [],
        activeServices: []
    });

    // Kanonik rol imlosi — ASSIGNMENT_ROLES (lib/permissions.ts). Ilgari bu yerda
    // 'chief' yozilardi, CompanyDrawer esa 'chief_accountant' — natijada bitta
    // firmada ikkita faol bosh buxgalter qatori qolib ketardi.
    const [assignments, setAssignments] = useState<any[]>(
        initialAssignments ||
        ASSIGNMENT_ROLES.map(role => ({ role, userId: '', salaryType: 'percent', salaryValue: 0 }))
    );

    const preset = tariffPreset ?? STANDARD_TARIFF;

    /**
     * "Ichki shartnoma tomoni" variantlari.
     *
     * Joriy qiymat ro'yxatda bo'lmasa ham QO'SHILADI: eski firmalarda bazadan
     * ajralib qolgan nomlar bor ("Plastik", "Seven UP" kabi qo'lda yozilgan
     * imlolar). Ularni tushirib qoldirsak, boshqa maydonni tahrirlash uchun
     * ochilgan firma jimgina shartnoma tomonini yo'qotib qo'yardi.
     */
    const contractorOptions = React.useMemo(() => {
        const list = [...(internalContractors ?? [])];
        // Joriy qiymat ro'yxatda bo'lmasa ham QO'SHILADI: o'z firma keyinchalik
        // arxivlansa, tahrirlashga ochilgan mijoz jimgina shartnoma tomonini
        // yo'qotib qo'ymasligi kerak.
        const id = formData.internalContractorId;
        if (id && !list.some(o => o.id === id)) {
            list.push({ id, name: formData.internalContractor || 'Arxivdagi firma' });
        }
        return list;
    }, [internalContractors, formData.internalContractorId, formData.internalContractor]);

    /**
     * Og'zaki shartnoma tomonlari — plastik/naqd kanallari.
     *
     * Tanlagich BITTA, chunki tomon ham bitta: `firma:<id>` yoki
     * `kanal:<id>`. Ikkita alohida tanlagich bo'lganda ikkalasini ham
     * to'ldirish mumkin bo'lardi, DB esa CHECK bilan buni rad etardi —
     * foydalanuvchi sababini tushunmaydigan xato.
     */
    const partyOptions = React.useMemo(() => {
        const list = (internalParties ?? []).map(p => ({
            id: p.id,
            // Kanal nomi ("Plastik", "Cash (seyf)") o'zi javobgarni aytmaydi —
            // pul kimga tushishini ko'rsatish uchun odam ismi yoniga qo'yiladi.
            label: p.employee?.fullName ? `${p.label} — ${p.employee.fullName}` : p.label,
        }));
        const id = formData.internalChannelId;
        if (id && !list.some(o => o.id === id)) {
            list.push({ id, label: formData.internalChannelLabel || 'Arxivdagi kanal' });
        }
        return list;
    }, [internalParties, formData.internalChannelId, formData.internalChannelLabel]);

    const partyValue = formData.internalChannelId
        ? `kanal:${formData.internalChannelId}`
        : formData.internalContractorId
            ? `firma:${formData.internalContractorId}`
            : '';

    // Har bir o'rinda HAMMA xodim chiqadi — odatdagi lavozim ro'yxat boshida.
    // Bitta odam bir firmada nazoratchi, boshqasida buxgalter bo'ladi, shuning
    // uchun "Buxgalter" o'rnini lavozim bo'yicha qisqartirish mumkin emas.
    const staffForRole = React.useMemo(() => {
        const map = {} as Record<AssignmentRole, Staff[]>;
        for (const role of ASSIGNMENT_ROLES) {
            map[role] = sortStaffForAssignmentRole(staff || [], role);
        }
        return map;
    }, [staff]);

    const updateAssignment = (role: string, field: string, value: any) => {
        setAssignments(prev => prev.map(a => {
            if (a.role !== role) return a;
            const next = { ...a, [field]: value };
            /**
             * Odam olib tashlansa ulushi ham tushadi.
             *
             * Busiz bo'sh o'rin qiymatni saqlab turardi va keyingi "Standart
             * taqsimot" yoki saqlash paytida "kimga tegishli ekani noma'lum"
             * foiz qolib ketardi.
             */
            if (field === 'userId' && !value) next.salaryValue = 0;
            return next;
        }));
    };

    /**
     * "Standart" — kelishilgan taqsimotni qo'yadi, LEKIN FAQAT odam tanlangan
     * o'rinlarga.
     *
     * Ilgari u har to'rt qatorga foiz yozardi: nazoratchi tanlanmagan bo'lsa ham
     * unga 5% tegib turardi va buxgalter uni har firmada qo'lda nolga tushirishga
     * majbur bo'lardi. Bo'sh o'rin — "bu firmada bunday mas'ul yo'q" degani,
     * demak unga ulush ham yo'q.
     */
    const applyStandardTariff = () => {
        setAssignments(prev => prev.map(a => {
            const percent = preset[a.role as AssignmentRole];
            if (percent == null) return a;
            return { ...a, salaryType: 'percent', salaryValue: a.userId ? percent : 0 };
        }));
    };

    /** Joriy holat aynan standart taqsimotga tengmi (tugmani yoqib ko'rsatish uchun). */
    const isStandardTariff = assignments.every(a => {
        const percent = preset[a.role as AssignmentRole];
        if (percent == null) return true;
        const expected = a.userId ? percent : 0;
        return a.salaryType === 'percent' && Number(a.salaryValue) === expected;
    });

    /**
     * QADAM-QADAM TEKSHIRUV.
     *
     * Ilgari wizard'da tekshiruv UMUMAN yo'q edi: "Keyingisi" har doim o'tardi,
     * "Tamomlash" esa firmani buxgalterisiz yaratardi (yagona tekshiruv
     * `OrganizationModule.handleSave` dagi `name && inn` edi, u ham to'rtinchi
     * qadamdan keyin ishga tushardi). Buxgalter biriktirilmagan firma esa
     * matritsada, majburiyat dvigatelida va oylikda egasiz qolardi.
     *
     * STIR uzunligi YANGI firmada qat'iy: prodda bir xil STIR bilan 10 ta
     * dublikat aynan qo'lda yozishdagi xatolardan yig'ilgan. Tahrirlashda esa
     * faqat qiymat O'ZGARGANDA tekshiriladi — aks holda eski, nomuvofiq STIR'li
     * firmaning boshqa maydonini tuzatib bo'lmasdi.
     */
    const isEdit = Boolean(initialData?.id);
    const innTouched = (formData.inn || '') !== (initialData?.inn || '');

    /**
     * "Narxni o'zgartirish (split bilan)" — mustaqil panel, YANGI firmada
     * ko'rsatilmaydi (u avtomatik to'liq-bank term bilan yaratiladi,
     * server/companies.ts#createCompany).
     *
     * `formData.contractAmount` ni to'g'ridan-to'g'ri tahrirlash (yuqoridagi
     * "Shartnoma Summasi" maydoni) ESKI oylarni ham "yangilab" qo'yardi —
     * bu panel `updateServiceTerm` orqali VERSIYALAB yozadi (lib/terms.ts).
     */
    /**
     * YANGI firmaning dastlabki split'i. Tahrirlashda ishlatilmaydi — u yerda
     * split VERSIYALANIB o'zgaradi (pastdagi panel). Bu uchta son Company
     * ustuni emas, `createCompany` ularni xom ko'rinishda o'qib dastlabki
     * CompanyServiceTerm ga uzatadi; bank qismi qoldiqdan hisoblanadi.
     */
    const [newPlastik, setNewPlastik] = useState('');
    const [newNaqd, setNewNaqd] = useState('');
    const [newOffset, setNewOffset] = useState('');
    const newTotal = Number(formData.contractAmount || 0);
    const newBank = newTotal - (Number(newPlastik) || 0) - (Number(newNaqd) || 0) - (Number(newOffset) || 0);

    const [termOpen, setTermOpen] = useState(false);
    const [termLoading, setTermLoading] = useState(false);
    const [termInfo, setTermInfo] = useState<{
        current: any;
        usedOffsetThisPeriod: number;
        usedPlastikThisPeriod: number;
        usedNaqdThisPeriod: number;
    } | null>(null);
    const [termTotal, setTermTotal] = useState('');
    const [termBank, setTermBank] = useState('');
    const [termPlastik, setTermPlastik] = useState('');
    const [termNaqd, setTermNaqd] = useState('');
    const [termOffset, setTermOffset] = useState('');
    const [termFrom, setTermFrom] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [termReason, setTermReason] = useState('');
    const [termBusy, setTermBusy] = useState(false);
    const [termError, setTermError] = useState<string | null>(null);
    const [termSuccess, setTermSuccess] = useState(false);

    const companyId = initialData?.id;

    const openTermPanel = async () => {
        setTermOpen(true);
        setTermSuccess(false);
        setTermError(null);
        if (!companyId) return;
        setTermLoading(true);
        try {
            const info = await getServiceTermInfo(companyId);
            setTermInfo(info as any);
            const cur = (info as any).current;
            if (cur) {
                setTermTotal(String(cur.totalAmount));
                setTermBank(String(cur.bankAmount));
                setTermPlastik(String(cur.plastikAmount ?? 0));
                setTermNaqd(String(cur.naqdAmount ?? 0));
                setTermOffset(String(cur.offsetAmount));
            }
        } catch (e) {
            setTermError(friendlyError(e, "Joriy holatni o'qib bo'lmadi"));
        } finally {
            setTermLoading(false);
        }
    };

    const submitTerm = async () => {
        if (!companyId) return;
        const total = Number(termTotal);
        const bank = Number(termBank);
        const plastik = Number(termPlastik) || 0;
        const naqd = Number(termNaqd) || 0;
        const offset = Number(termOffset);
        if (!Number.isFinite(total) || total <= 0) {
            setTermError('Umumiy summa musbat son bo\'lishi kerak');
            return;
        }
        if (Math.round((bank + plastik + naqd + offset) * 100) !== Math.round(total * 100)) {
            setTermError('Bank + Plastik + Naqd + Offset yig\'indisi umumiy summaga teng bo\'lishi kerak');
            return;
        }
        setTermBusy(true);
        setTermError(null);
        try {
            await updateServiceTerm({
                companyId,
                totalAmount: total,
                bankAmount: bank,
                plastikAmount: plastik,
                naqdAmount: naqd,
                offsetAmount: offset,
                effectiveFrom: termFrom,
                reason: termReason.trim() || undefined,
            });
            setTermSuccess(true);
            setTermReason('');
            const info = await getServiceTermInfo(companyId);
            setTermInfo(info as any);
        } catch (e) {
            setTermError(friendlyError(e, "Saqlab bo'lmadi"));
        } finally {
            setTermBusy(false);
        }
    };

    const stepErrors = (step: number): string[] => {
        const errs: string[] = [];
        if (step === 0) {
            if (!(formData.name || '').trim()) errs.push('Firma nomi kiritilishi shart');
            const inn = (formData.inn || '').trim();
            if (!inn) errs.push('INN kiritilishi shart');
            if (!isEdit && newBank < 0) {
                errs.push("Plastik + Naqd + Offset yig'indisi shartnoma summasidan oshib ketdi");
            }
            else if (!isEdit || innTouched) {
                // YTT JSHSHIR (14 xona) bilan ro'yxatdan o'tadi, yuridik shaxs INN (9 xona) bilan.
                if (!/^\d{9}$/.test(inn) && !/^\d{14}$/.test(inn)) {
                    errs.push("INN 9 ta yoki JSHSHIR 14 ta raqamdan iborat bo'lishi kerak");
                }
            }
        }
        if (step === 3 && !isEdit) {
            /**
             * Buxgalter faqat YANGI firmada majburiy — server qoidasi bilan bir xil
             * (`assertNewCompanyComplete`).
             *
             * Tahrirlashda ATAYLAB talab qilinmaydi: bazada buxgalteri yo'q eski
             * firmalar bor (prodda 1 ta), va ularni ham qamrasak boshqa maydonni —
             * masalan soliq rejimini — tuzatish uchun ochilgan firma umuman
             * saqlanmay qolardi.
             */
            const accountant = assignments.find(a => a.role === 'accountant');
            if (!accountant?.userId) {
                errs.push('Buxgalter tanlanishi shart — firma egasiz qolmasligi kerak');
            }
        }
        return errs;
    };

    /** Barcha qadamlar bo'yicha xatolar (Tamomlash uchun). */
    const allErrors = steps.flatMap((_, i) => stepErrors(i));
    const currentErrors = stepErrors(currentStep);

    const nextStep = () => {
        if (currentErrors.length > 0) {
            setShowErrors(true);
            return;
        }
        setShowErrors(false);
        setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    };
    const prevStep = () => {
        setShowErrors(false);
        setCurrentStep(prev => Math.max(prev - 1, 0));
    };

    const handleFinish = () => {
        if (allErrors.length > 0) {
            setShowErrors(true);
            // Xato boshqa qadamda bo'lsa — o'sha qadamga qaytaramiz, aks holda
            // foydalanuvchi "nega tamomlanmadi?" degan savol bilan qolardi.
            const firstBad = steps.findIndex((_, i) => stepErrors(i).length > 0);
            if (firstBad >= 0 && firstBad !== currentStep) setCurrentStep(firstBad);
            return;
        }
        onSave(
            isEdit
                ? formData
                : ({
                    ...formData,
                    splitPlastik: Number(newPlastik) || 0,
                    splitNaqd: Number(newNaqd) || 0,
                    splitOffset: Number(newOffset) || 0,
                } as Partial<Company>),
            assignments
        );
    };

    return (
        <div className="flex flex-col max-h-[85vh]" style={{ background: 'var(--card-bg)' }}>
            {/* Header / Stepper */}
            <div className="p-5 flex items-center justify-between gap-4 shrink-0" style={{ background: 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}>
                <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
                    {steps.map((step, idx) => {
                        const Icon = step.icon;
                        const isActive = idx === currentStep;
                        const isDone = idx < currentStep;
                        return (
                            <div key={step.id} className="flex items-center gap-3 shrink-0">
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 font-bold shadow-sm"
                                    style={isActive
                                        ? { background: 'var(--accent-blue)', color: '#fff' }
                                        : isDone
                                            ? { background: 'var(--success)', color: '#fff' }
                                            : { background: 'var(--card-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}
                                >
                                    {isDone ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-micro font-semibold uppercase tracking-[0.15em]" style={{ color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>{step.title}</span>
                                    <span className="text-2xs font-bold uppercase tracking-widest" style={fieldLabelStyle}>{idx + 1}-QADAM</span>
                                </div>
                                {idx < steps.length - 1 && <div className="mx-2 w-8 h-px" style={{ background: 'var(--card-border)' }} />}
                            </div>
                        );
                    })}
                </div>
                <button
                    onClick={onCancel}
                    className="p-2 rounded-lg transition-all shadow-sm shrink-0 icon-btn-danger"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}
                >
                    <X size={16} strokeWidth={3} />
                </button>
            </div>

            {/* Content */}
            <div className="p-6 md:p-8 overflow-y-auto flex-1 min-h-[300px]">
                {currentStep === 0 && (
                    <div className="space-y-6 animate-fade-in">
                        <h3 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Asosiy ma&apos;lumotlar</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Firma Nomi *</label>
                                <input
                                    autoFocus
                                    className="erp-input"
                                    placeholder="Masalan: MONTAJ TEPLO"
                                    style={showErrors && !(formData.name || '').trim() ? { borderColor: 'var(--danger)' } : undefined}
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>INN (9) yoki JSHSHIR (14) *</label>
                                <input
                                    className="erp-input font-mono"
                                    placeholder="123456789"
                                    inputMode="numeric"
                                    style={showErrors && stepErrors(0).some(e => e.includes('INN')) ? { borderColor: 'var(--danger)' } : undefined}
                                    value={formData.inn || ''}
                                    onChange={e => setFormData({ ...formData, inn: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Brend Nomi</label>
                                <input
                                    className="erp-input"
                                    placeholder="Masalan: MONTAJ"
                                    value={formData.brandName || ''}
                                    onChange={e => setFormData({ ...formData, brandName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Direktor Ism-Sharifi</label>
                                <input
                                    className="erp-input"
                                    placeholder="Masalan: Sobirov Ali"
                                    value={formData.directorName || ''}
                                    onChange={e => setFormData({ ...formData, directorName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Direktor Telefoni</label>
                                <input
                                    className="erp-input"
                                    placeholder="+998 90 123 45 67"
                                    value={formData.directorPhone || ''}
                                    onChange={e => setFormData({ ...formData, directorPhone: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Yuridik Manzil</label>
                                <input
                                    className="erp-input"
                                    placeholder="Masalan: Toshkent sh., Chilonzor tumani..."
                                    value={formData.legalAddress || ''}
                                    onChange={e => setFormData({ ...formData, legalAddress: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Ichki Shartnoma Tomoni</label>
                                <select
                                    className="erp-input"
                                    value={partyValue}
                                    onChange={e => {
                                        // Bazaga ID yoziladi (firma nomi o'zgarsa bog'lanish
                                        // uzilmasin), nom esa faqat ekran uchun yonida yuriydi.
                                        const [kind, id] = e.target.value.split(':');
                                        setFormData({
                                            ...formData,
                                            internalContractorId: kind === 'firma' ? id : undefined,
                                            internalContractor: kind === 'firma'
                                                ? contractorOptions.find(o => o.id === id)?.name
                                                : undefined,
                                            internalChannelId: kind === 'kanal' ? id : undefined,
                                            internalChannelLabel: kind === 'kanal'
                                                ? partyOptions.find(o => o.id === id)?.label
                                                : undefined,
                                        });
                                    }}
                                >
                                    <option value="">Tanlanmagan</option>
                                    <optgroup label="Yozma shartnoma — o'z firmamiz">
                                        {contractorOptions.map(o => (
                                            <option key={o.id} value={`firma:${o.id}`}>{o.name}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Og'zaki shartnoma — plastik/naqd">
                                        {partyOptions.map(o => (
                                            <option key={o.id} value={`kanal:${o.id}`}>{o.label}</option>
                                        ))}
                                    </optgroup>
                                </select>
                                {contractorOptions.length === 0 && (
                                    <p className="text-2xs ml-1" style={{ color: 'var(--text-muted)' }}>
                                        O&apos;z firmalar ro&apos;yxati bo&apos;sh — bazada `isOwnFirm` belgilangan firma yo&apos;q.
                                    </p>
                                )}
                                {partyOptions.length === 0 && (
                                    <p className="text-2xs ml-1" style={{ color: 'var(--text-muted)' }}>
                                        Og&apos;zaki shartnoma tomoni yo&apos;q — kassa kanallarida plastik/naqd
                                        kanaliga mas&apos;ul xodim biriktirilmagan.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Shartnoma Summasi</label>
                                <input
                                    type="text" inputMode="numeric"
                                    className="erp-input tabular-nums"
                                    value={groupDigits(formData.contractAmount || 0)}
                                    onChange={e => setFormData({ ...formData, contractAmount: Number(ungroupDigits(e.target.value)) })}
                                />
                            </div>
                            {!isEdit && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Shundan: Plastik</label>
                                        <input
                                            type="text" inputMode="numeric"
                                            className="erp-input tabular-nums"
                                            value={groupDigits(newPlastik)}
                                            onChange={e => setNewPlastik(ungroupDigits(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Shundan: Naqd</label>
                                        <input
                                            type="text" inputMode="numeric"
                                            className="erp-input tabular-nums"
                                            value={groupDigits(newNaqd)}
                                            onChange={e => setNewNaqd(ungroupDigits(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Shundan: Offset (vzaimozachyot/ijara)</label>
                                        <input
                                            type="text" inputMode="numeric"
                                            className="erp-input tabular-nums"
                                            value={groupDigits(newOffset)}
                                            onChange={e => setNewOffset(ungroupDigits(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Qolgani: Bank</label>
                                        <div
                                            className="erp-input tabular-nums flex items-center"
                                            style={{ color: newBank < 0 ? 'var(--danger)' : 'var(--text-muted)' }}
                                        >
                                            {groupDigits(newBank)} so&apos;m
                                        </div>
                                        {newBank < 0 && (
                                            <p className="text-2xs ml-1" style={{ color: 'var(--danger)' }}>
                                                Yig&apos;indi shartnoma summasidan oshib ketdi.
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Shartnoma №</label>
                                <input
                                    className="erp-input"
                                    placeholder="Masalan: 12-A"
                                    value={formData.contractNumber || ''}
                                    onChange={e => setFormData({ ...formData, contractNumber: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Shartnoma Sanasi</label>
                                <DateField
                                    value={formData.contractDate || ''}
                                    onChange={v => setFormData({ ...formData, contractDate: v })}
                                />
                            </div>
                        </div>

                        {isEdit && companyId && (
                            <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--card-border)', background: 'var(--input-bg)' }}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-body font-semibold" style={{ color: 'var(--text)' }}>Narxni o&apos;zgartirish (split bilan)</div>
                                        <p className="text-2xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                            Yuqoridagi &quot;Shartnoma Summasi&quot; faqat ekranda ko&apos;rinadi — real
                                            o&apos;zgarish shu panel orqali, yangi VERSIYA sifatida yoziladi.
                                            Eski oylar eski summada qoladi.
                                        </p>
                                    </div>
                                    {!termOpen && (
                                        <Button variant="secondary" size="sm" onClick={openTermPanel}>Ochish</Button>
                                    )}
                                </div>
                                {termOpen && (
                                    termLoading ? (
                                        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Yuklanmoqda…</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {termInfo?.current && (
                                                <p className="text-2xs" style={{ color: 'var(--text-muted)' }}>
                                                    Joriy: {groupDigits(termInfo.current.totalAmount)} so&apos;m
                                                    (bank {groupDigits(termInfo.current.bankAmount)}
                                                    + plastik {groupDigits(termInfo.current.plastikAmount ?? 0)}
                                                    + naqd {groupDigits(termInfo.current.naqdAmount ?? 0)}
                                                    + offset {groupDigits(termInfo.current.offsetAmount)}),
                                                    amal qiladi: {String(termInfo.current.effectiveFrom).slice(0, 10)} dan.
                                                    Shu oy ishlatilgan: plastik {groupDigits(termInfo.usedPlastikThisPeriod ?? 0)},
                                                    naqd {groupDigits(termInfo.usedNaqdThisPeriod ?? 0)},
                                                    offset {groupDigits(termInfo.usedOffsetThisPeriod)} so&apos;m.
                                                </p>
                                            )}
                                            {termError && <p className="text-meta" style={{ color: 'var(--danger)' }}>{termError}</p>}
                                            {termSuccess && <p className="text-meta" style={{ color: 'var(--success, #16a34a)' }}>Yangi versiya saqlandi.</p>}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <label className="block">
                                                    <span className="text-micro" style={fieldLabelStyle}>Umumiy summa</span>
                                                    <input
                                                        type="text" inputMode="numeric"
                                                        className="erp-input tabular-nums"
                                                        value={groupDigits(termTotal)}
                                                        onChange={e => setTermTotal(ungroupDigits(e.target.value))}
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="text-micro" style={fieldLabelStyle}>Amal qiladi (oy)</span>
                                                    <DateField value={termFrom} onChange={setTermFrom} />
                                                </label>
                                                <label className="block">
                                                    <span className="text-micro" style={fieldLabelStyle}>Bank qismi</span>
                                                    <input
                                                        type="text" inputMode="numeric"
                                                        className="erp-input tabular-nums"
                                                        value={groupDigits(termBank)}
                                                        onChange={e => setTermBank(ungroupDigits(e.target.value))}
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="text-micro" style={fieldLabelStyle}>Plastik qismi</span>
                                                    <input
                                                        type="text" inputMode="numeric"
                                                        className="erp-input tabular-nums"
                                                        value={groupDigits(termPlastik)}
                                                        onChange={e => setTermPlastik(ungroupDigits(e.target.value))}
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="text-micro" style={fieldLabelStyle}>Naqd qismi</span>
                                                    <input
                                                        type="text" inputMode="numeric"
                                                        className="erp-input tabular-nums"
                                                        value={groupDigits(termNaqd)}
                                                        onChange={e => setTermNaqd(ungroupDigits(e.target.value))}
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="text-micro" style={fieldLabelStyle}>Offset (vzaimozachyot/ijara) qismi</span>
                                                    <input
                                                        type="text" inputMode="numeric"
                                                        className="erp-input tabular-nums"
                                                        value={groupDigits(termOffset)}
                                                        onChange={e => setTermOffset(ungroupDigits(e.target.value))}
                                                    />
                                                </label>
                                                <label className="block sm:col-span-2">
                                                    <span className="text-micro" style={fieldLabelStyle}>Sabab (ixtiyoriy)</span>
                                                    <input
                                                        className="erp-input"
                                                        placeholder="masalan: narx ko'tarildi, ijara qo'shildi"
                                                        value={termReason}
                                                        onChange={e => setTermReason(e.target.value)}
                                                    />
                                                </label>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="primary" size="sm" disabled={termBusy} onClick={submitTerm}>
                                                    {termBusy ? 'Saqlanmoqda…' : 'Yangi versiya sifatida saqlash'}
                                                </Button>
                                                <Button variant="secondary" size="sm" onClick={() => setTermOpen(false)}>Yopish</Button>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        )}
                    </div>
                )}

                {currentStep === 1 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-7 rounded-full" style={{ background: 'var(--accent-blue)' }}></div>
                            <h3 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Texnik sozlamalar</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>1C Server</label>
                                <select
                                    className="erp-input cursor-pointer"
                                    value={formData.serverInfo || 'CR1'}
                                    onChange={e => setFormData({ ...formData, serverInfo: e.target.value as ServerInfo })}
                                >
                                    <option value="CR1">CR1</option>
                                    <option value="CR2">CR2</option>
                                    <option value="CR3">CR3</option>
                                    <option value="srv1c1">srv1c1 (1-server)</option>
                                    <option value="srv1c2">srv1c2 (2-server)</option>
                                    <option value="srv1c3">srv1c3 (3-server)</option>
                                    <option value="srv2">srv2 (Asosiy server)</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>1C Baza Nomi</label>
                                <input
                                    className="erp-input"
                                    placeholder="Masalan: Montaj_Teplo_2024"
                                    value={formData.baseName1c || ''}
                                    onChange={e => setFormData({ ...formData, baseName1c: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Server Nomi (Firma Bazasi uchun)</label>
                                <input
                                    className="erp-input"
                                    placeholder="Masalan: 44.AMIRBEK"
                                    value={formData.serverName || ''}
                                    onChange={e => setFormData({ ...formData, serverName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Bank-Klient Login</label>
                                <input
                                    className="erp-input"
                                    placeholder="Masalan: bk_login"
                                    value={formData.bankClientLogin || ''}
                                    onChange={e => setFormData({ ...formData, bankClientLogin: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Bank-Klient Parol</label>
                                <input
                                    className="erp-input"
                                    placeholder="Masalan: 12345"
                                    value={formData.bankClientPassword || ''}
                                    onChange={e => setFormData({ ...formData, bankClientPassword: e.target.value })}
                                />
                            </div>
                        </div>
                        <label
                            className="flex items-center gap-4 p-5 rounded-xl cursor-pointer transition-all"
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}
                        >
                            <div
                                className="w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all shrink-0"
                                style={formData.itParkResident
                                    ? { background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', color: '#fff' }
                                    : { borderColor: 'var(--input-border)', color: 'transparent' }}
                            >
                                <Check size={16} strokeWidth={4} />
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={formData.itParkResident === true}
                                onChange={e => setFormData({ ...formData, itParkResident: e.target.checked })}
                            />
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text)' }}>IT Park Rezidenti</span>
                                <span className="text-micro font-bold uppercase tracking-widest mt-0.5" style={fieldLabelStyle}>Soliq imtiyozlari mavjud</span>
                            </div>
                        </label>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="space-y-6 animate-fade-in">
                        <h3 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Soliq va Statistika</h3>
                        <div className="space-y-5">
                            <div>
                                <label className="text-micro font-bold uppercase tracking-widest mb-3 block ml-1" style={fieldLabelStyle}>Soliq Turi</label>
                                {/*
                                 * IKKI BOSQICHLI TANLAGICH: avval rejim TOIFASI (TAX_CATEGORIES),
                                 * so'ng — agar toifa ichida sub-variantlar bo'lsa (Aylanmadan
                                 * soliq: foiz/qat'iy; YaTT: qat'iy/aylanma/QQS) — ICHKI radio.
                                 * Bazaga har doim BARG kod yoziladi (masalan `yatt_fixed`),
                                 * toifa o'zi saqlanmaydi — `taxRegimeCategory()` uni bargdan
                                 * qayta hisoblaydi, shu bilan tanlov har doim izchil qoladi.
                                 */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {TAX_CATEGORIES.map(cat => {
                                        /**
                                         * TANLOV KANONIK MAYDONGA YOZILADI.
                                         *
                                         * Ilgari bu yerda faqat `taxType` o'zgarardi, `taxRegime` esa
                                         * server qatoridan kelgan ESKI qiymat bo'lib payload'da qolib
                                         * ketardi. `sanitizeCompanyData` avval `taxRegime` ni
                                         * tekshirgani uchun tahrir jimgina yo'qolardi — foydalanuvchi
                                         * "o'zgartiraman, saqlayman, o'zgarmaydi" deb xabar qildi.
                                         */
                                        const current = normalizeTaxRegime(formData.taxRegime ?? formData.taxType);
                                        const currentCategory = taxRegimeCategory(current);
                                        const selected = currentCategory === cat.id;
                                        const selectRegime = (code: TaxRegimeCode) =>
                                            setFormData({ ...formData, taxRegime: code, taxType: legacyTaxType(code) as Company['taxType'] });
                                        return (
                                            <div
                                                key={cat.id}
                                                className="p-5 rounded-xl transition-all text-left"
                                                style={selected
                                                    ? { border: '1px solid var(--accent-blue)', background: 'var(--accent-blue-light)' }
                                                    : { border: '1px solid var(--card-border)', background: 'var(--input-bg)' }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => selectRegime(cat.code ?? cat.subOptions![0].code)}
                                                    className="w-full text-left"
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="w-5 h-5 rounded-full border flex items-center justify-center transition-all" style={{ borderColor: selected ? 'var(--accent-blue)' : 'var(--input-border)' }}>
                                                            {selected && <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent-blue)' }} />}
                                                        </div>
                                                        <Calculator size={18} style={{ color: selected ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
                                                    </div>
                                                    <div className="font-bold text-base mb-1" style={{ color: 'var(--text)' }}>{cat.label}</div>
                                                    <div className="text-micro font-bold uppercase tracking-widest" style={fieldLabelStyle}>{cat.hint}</div>
                                                </button>

                                                {cat.subOptions && (
                                                    <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid var(--card-border)' }}>
                                                        {cat.subOptions.map(sub => {
                                                            const subSelected = current === sub.code;
                                                            return (
                                                                <button
                                                                    key={sub.code}
                                                                    type="button"
                                                                    onClick={() => selectRegime(sub.code)}
                                                                    className="w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left"
                                                                    style={subSelected
                                                                        ? { background: 'var(--accent-blue)', color: '#fff' }
                                                                        : { background: 'var(--card-bg)', color: 'var(--text)' }}
                                                                >
                                                                    <div
                                                                        className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                                                                        style={{ borderColor: subSelected ? '#fff' : 'var(--input-border)' }}
                                                                    >
                                                                        {subSelected && <div className="w-2 h-2 rounded-full" style={{ background: '#fff' }} />}
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className="text-xs font-bold truncate">{sub.label}</span>
                                                                        <span
                                                                            className="text-2xs font-semibold truncate"
                                                                            style={{ color: subSelected ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}
                                                                        >
                                                                            {sub.hint}
                                                                        </span>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="c1-card overflow-hidden">
                                <div className="c1-section-header">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>Operatsiyalar</span>
                                        <div className="flex gap-2 shrink-0">
                                            <Button variant="success" size="sm" onClick={() => setFormData({ ...formData, activeServices: [...ALL_SERVICE_KEYS] })} className="!py-1">Yoqish</Button>
                                            <Button variant="danger" size="sm" onClick={() => setFormData({ ...formData, activeServices: [] })} className="!py-1">O&apos;chirish</Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5 space-y-4">
                                    {SERVICE_GROUPS.map(section => (
                                        <div key={section.group} className="mb-4 last:mb-0">
                                            <h5 className="text-micro font-semibold uppercase tracking-widest mb-2 px-2 py-1 rounded-lg w-fit" style={{ color: 'var(--text-secondary)', background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>{section.group}</h5>
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                                {section.keys.map(key => {
                                                    const currentServices = formData.activeServices || [];
                                                    const isChecked = currentServices.length === 0 || currentServices.includes(key);
                                                    return (
                                                        <label
                                                            key={key}
                                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                                                            style={isChecked
                                                                ? { background: 'var(--accent-blue-light)', border: '1px solid var(--accent-blue)' }
                                                                : { background: 'var(--input-bg)', border: '1px solid var(--card-border)', opacity: 0.65 }}
                                                        >
                                                            <div
                                                                className="w-4 h-4 rounded-lg border flex items-center justify-center shrink-0"
                                                                style={isChecked
                                                                    ? { background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', color: '#fff' }
                                                                    : { borderColor: 'var(--input-border)', color: 'transparent' }}
                                                            >
                                                                <Check size={12} strokeWidth={4} />
                                                            </div>
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={isChecked}
                                                                onChange={() => {
                                                                    let newServices = [...(currentServices.length === 0 ? ALL_SERVICE_KEYS : currentServices)];
                                                                    if (isChecked) {
                                                                        newServices = newServices.filter(k => k !== key);
                                                                    } else {
                                                                        newServices.push(key);
                                                                    }
                                                                    setFormData({ ...formData, activeServices: newServices });
                                                                }}
                                                            />
                                                            {/* To'lov kaliti yorlig'i "#46" — nomi yonidagi hisobot
                                                                katagida turibdi, kod esa topshiriqnoma uchun kerak.
                                                                To'liq nomi tooltip'da qoladi. */}
                                                            <span className="text-micro font-bold uppercase tracking-tight truncate" style={{ color: 'var(--text-secondary)' }} title={(key.endsWith('_tolov') || SERVICE_LABELS[key]?.startsWith('#')) ? serviceFullLabel(key) : undefined}>{SERVICE_LABELS[key] || key}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <h3 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Jamoa va Ish haqi</h3>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={applyStandardTariff}
                                style={isStandardTariff
                                    ? { background: 'var(--success)', color: '#fff' }
                                    : { background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
                                title={ASSIGNMENT_ROLES.map(r => `${ASSIGNMENT_ROLE_LABELS[r]} ${preset[r]}%`).join(' • ')}
                            >
                                Standart taqsimot
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {assignments.map((asgn) => {
                                const options = staffForRole[asgn.role as AssignmentRole] ?? [];
                                const label = ASSIGNMENT_ROLE_LABELS[asgn.role as AssignmentRole] ?? asgn.role;
                                // Bo'sh o'ringa ulush yozilmaydi — maydon ham yopiladi, chunki
                                // "kimga tegishli ekani noma'lum foiz" oylikda ma'nosiz.
                                const noPerson = !asgn.userId;
                                const isRequired = asgn.role === 'accountant';
                                return (
                                <div key={asgn.role} className="p-4 rounded-xl grid grid-cols-12 gap-4 items-end" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                                    <div className="col-span-12 lg:col-span-4 space-y-1">
                                        <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>
                                            {label}
                                            {isRequired && <span style={{ color: 'var(--danger)' }}> *</span>}
                                        </label>
                                        <select
                                            className="erp-input font-bold"
                                            value={asgn.userId || ''}
                                            disabled={options.length === 0}
                                            style={showErrors && isRequired && noPerson
                                                ? { borderColor: 'var(--danger)' }
                                                : undefined}
                                            onChange={e => updateAssignment(asgn.role, 'userId', e.target.value)}
                                        >
                                            <option value="">
                                                {options.length === 0 ? 'Bu rolda faol xodim yo\'q' : 'Tanlang...'}
                                            </option>
                                            {options.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-6 lg:col-span-3 space-y-1">
                                        <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Hisob turi</label>
                                        <div className="flex p-1 rounded-lg" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                                            <Button variant="primary" size="sm" onClick={() => updateAssignment(asgn.role, 'salaryType', 'percent')} className="flex-1" style={asgn.salaryType === 'percent' ? { background: 'var(--accent-blue)', color: '#fff' } : { color: 'var(--text-muted)' }}>Foiz</Button>
                                            <Button variant="primary" size="sm" onClick={() => updateAssignment(asgn.role, 'salaryType', 'fixed')} className="flex-1" style={asgn.salaryType === 'fixed' ? { background: 'var(--accent-blue)', color: '#fff' } : { color: 'var(--text-muted)' }}>Fiks</Button>
                                        </div>
                                    </div>
                                    <div className="col-span-6 lg:col-span-5 space-y-1">
                                        <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>Qiymat</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="erp-input font-semibold tabular-nums !pr-12 text-right disabled:opacity-40"
                                                value={noPerson ? 0 : (asgn.salaryValue ?? 0)}
                                                disabled={noPerson}
                                                title={noPerson ? "Avval xodimni tanlang — bo'sh o'ringa ulush berilmaydi" : undefined}
                                                onChange={e => updateAssignment(asgn.role, 'salaryValue', Number(e.target.value))}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-micro font-semibold uppercase" style={fieldLabelStyle}>
                                                {asgn.salaryType === 'percent' ? '%' : "so'm"}
                                            </span>
                                        </div>
                                        {noPerson && (
                                            <p className="text-2xs ml-1" style={{ color: 'var(--text-muted)' }}>
                                                Xodim tanlanmagan — ulush berilmaydi
                                            </p>
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>

                        <label
                            className="flex items-center gap-4 p-5 rounded-xl cursor-pointer transition-all"
                            style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
                        >
                            <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0"
                                style={formData.kpiEnabled
                                    ? { background: 'var(--success)', color: '#fff' }
                                    : { background: 'var(--card-bg)', color: 'transparent', border: '1px solid var(--input-border)' }}
                            >
                                <Check size={18} strokeWidth={4} />
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={formData.kpiEnabled === true}
                                onChange={e => setFormData({ ...formData, kpiEnabled: e.target.checked })}
                            />
                            <div className="flex flex-col">
                                <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--success)' }}>KPI Tizimini Yoqish</span>
                                <span className="text-micro font-bold uppercase tracking-widest opacity-70" style={{ color: 'var(--success)' }}>Avtomatik hisob-kitob va ballar tizimi faollashadi</span>
                            </div>
                        </label>
                    </div>
                )}
            </div>

            {/* Tekshiruv xabarlari — tugmalar ustida, sabab bilan. */}
            {showErrors && currentErrors.length > 0 && (
                <div
                    className="mx-5 mb-0 mt-1 p-3 rounded-lg shrink-0"
                    style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border, var(--danger))' }}
                    role="alert"
                >
                    <ul className="space-y-1">
                        {currentErrors.map(e => (
                            <li key={e} className="text-meta font-semibold" style={{ color: 'var(--danger)' }}>
                                • {e}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Footer / Buttons */}
            <div className="p-5 flex items-center justify-between shrink-0" style={{ background: 'var(--input-bg)', borderTop: '1px solid var(--card-border)' }}>
                <button
                    onClick={prevStep}
                    disabled={currentStep === 0}
                    className="px-5 py-2.5 rounded-lg font-bold text-micro uppercase tracking-widest flex items-center gap-2 disabled:opacity-0 transition-all"
                    style={{ color: 'var(--text-secondary)', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                >
                    <ChevronLeft size={16} strokeWidth={3} /> Orqaga
                </button>

                {currentStep < steps.length - 1 ? (
                    <Button variant="primary" size="md" onClick={nextStep}>
                        Keyingisi <ChevronRight size={16} strokeWidth={3} />
                    </Button>
                ) : (
                    <Button variant="success" size="md" onClick={handleFinish}>
                        Tamomlash <Check size={18} strokeWidth={4} />
                    </Button>
                )}
            </div>
        </div>
    );
};

export default OnboardingWizard;
