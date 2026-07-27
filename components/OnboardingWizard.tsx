import React, { useEffect, useState } from 'react';
import { Company, Staff, TaxType, ServerInfo } from '@/types';
import { ChevronRight, ChevronLeft, Check, X, Building2, Server, Calculator, Users } from 'lucide-react';
import { groupDigits, ungroupDigits } from '@/lib/format';
import { Button } from "@/components/ui/Button";

interface Props {
    staff: Staff[];
    initialData?: Partial<Company>;
    initialAssignments?: any[];
    onSave: (company: Partial<Company>, assignments: any[]) => void;
    onCancel: () => void;
}

const steps = [
    { id: 'basic', title: 'Asosiy', icon: Building2 },
    { id: 'technical', title: 'Texnik', icon: Server },
    { id: 'tax', title: 'Soliq & Stat', icon: Calculator },
    { id: 'team', title: 'Jamoa', icon: Users }
];

const ALL_SERVICE_KEYS = ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds', 'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq', 'moliyaviy_natija', 'buxgalteriya_balansi', 'stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt', 'itpark_oylik', 'itpark_chorak', 'kom_suv', 'kom_gaz', 'kom_svet'];

const SERVICE_LABELS: Record<string, string> = {
    didox: 'Didox', xatlar: 'Xatlar', avtokameral: 'Avtokameral', my_mehnat: 'My Mehnat', one_c: '1C',
    pul_oqimlari: 'Pul Oqimlari', chiqadigan_soliqlar: 'Sol. Chiqarish', hisoblangan_oylik: 'Oylik Hisoblash',
    debitor_kreditor: 'Deb/Kred', foyda_va_zarar: 'F/Z', tovar_ostatka: 'Tovar Qoldiq',
    yer_soligi: "Yer", mol_mulk_soligi: "Mol-mulk", suv_soligi: "Suv",
    bonak: "Bo'nak", aksiz_soligi: 'AKSIZ', nedro_soligi: 'NEDRO', norezident_foyda: 'Nor. Foyda',
    norezident_nds: 'Nor. NDS', aylanma_qqs: 'Ayl/QQS', daromad_soliq: 'Daromad',
    inps: 'INPS', foyda_soliq: 'Foyda', moliyaviy_natija: 'Mol. Natija',
    buxgalteriya_balansi: 'Balans',
    stat_12_invest: '12-inv', stat_12_moliya: '12-mol', stat_12_korxona: '12-kor', stat_12_narx: '12-narx',
    stat_4_invest: '4-inv', stat_4_mehnat: '4-meh', stat_4_korxona_miz: '4-kor(miz)', stat_4_kb_qur_sav_xiz: '4-kb(all)', stat_4_kb_sanoat: '4-kb san',
    stat_1_invest: '1-inv', stat_1_ih: '1-ih', stat_1_energiya: '1-en', stat_1_korxona: '1-kor', stat_1_korxona_tif: '1-kor(tif)', stat_1_moliya: '1-mol', stat_1_akt: '1-akt',
    itpark_oylik: 'IT Oylik',
    itpark_chorak: 'IT Chorak', kom_suv: 'Suv', kom_gaz: 'Gaz', kom_svet: 'Svet'
};

const SERVICE_GROUPS = [
    { group: 'Oylik', keys: ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka'] },
    { group: 'Soliqlar', keys: ['yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds'] },
    { group: 'Soliq H/T', keys: ['aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq'] },
    { group: 'Yillik', keys: ['moliyaviy_natija', 'buxgalteriya_balansi'] },
    { group: 'Statistika', keys: ['stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt'] },
    { group: 'IT Park', keys: ['itpark_oylik', 'itpark_chorak'] },
    { group: 'Komunalka', keys: ['kom_suv', 'kom_gaz', 'kom_svet'] },
];

const fieldLabelStyle: React.CSSProperties = { color: 'var(--text-muted)' };

const OnboardingWizard: React.FC<Props> = ({ staff, initialData, initialAssignments, onSave, onCancel }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState<Partial<Company>>(initialData || {
        taxType: TaxType.TURNOVER,
        serverInfo: 'CR1',
        kpiEnabled: true,
        statReports: [],
        serviceScope: [],
        activeServices: []
    });

    const [assignments, setAssignments] = useState<any[]>(initialAssignments || [
        { role: 'accountant', userId: '', salaryType: 'percent', salaryValue: 0 },
        { role: 'chief', userId: '', salaryType: 'percent', salaryValue: 0 },
        { role: 'controller', userId: '', salaryType: 'percent', salaryValue: 0 },
        { role: 'bank_manager', userId: '', salaryType: 'percent', salaryValue: 0 }
    ]);

    useEffect(() => {
        if (initialAssignments) return;
        if (!staff?.length) return;

        setAssignments(prev => {
            const chiefIdx = prev.findIndex(a => a.role === 'chief');
            if (chiefIdx === -1) return prev;
            if (prev[chiefIdx]?.userId) return prev;

            const yorqinoy = staff.find(s => (s.name || '').trim().toLowerCase().includes('yorqinoy'));
            if (!yorqinoy) return prev;

            const next = [...prev];
            next[chiefIdx] = { ...next[chiefIdx], userId: yorqinoy.id };
            return next;
        });
    }, [staff, initialAssignments]);

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

    const updateAssignment = (role: string, field: string, value: any) => {
        setAssignments(prev => prev.map(a => a.role === role ? { ...a, [field]: value } : a));
    };

    const handleFinish = () => {
        onSave(formData, assignments);
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
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>INN (9 ta raqam) *</label>
                                <input
                                    className="erp-input font-mono"
                                    placeholder="123456789"
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
                                    value={formData.internalContractor || ''}
                                    onChange={e => setFormData({ ...formData, internalContractor: e.target.value, isInternalContractor: false })}
                                >
                                    <option value="">Tanlanmagan</option>
                                    <option value="Seven UP">Seven UP</option>
                                    <option value="Finance Council">Finance Council</option>
                                    <option value="The power full">The power full</option>
                                    <option value="Barokat team">Barokat team</option>
                                    <option value="SOFI TEAM">SOFI TEAM</option>
                                    <option value="OOO SARDORBEK HOUSE">OOO SARDORBEK HOUSE</option>
                                    <option value="TASTIFY">TASTIFY</option>
                                    <option value="Toolstrek Ca">Toolstrek Ca</option>
                                    <option value="MOLIYA AI">MOLIYA AI</option>
                                    <option value="Plastik">Plastik</option>
                                </select>
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
                                <input
                                    type="date"
                                    className="erp-input"
                                    value={formData.contractDate || ''}
                                    onChange={e => setFormData({ ...formData, contractDate: e.target.value })}
                                />
                            </div>
                        </div>
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {[
                                        { id: TaxType.NDS_PROFIT, label: 'QQS va Foyda', desc: 'УСН + НДС' },
                                        { id: TaxType.TURNOVER, label: 'Aylanmadan soliq', desc: 'Упрощенный налог' }
                                    ].map(tax => {
                                        const selected = formData.taxType === tax.id;
                                        return (
                                            <button
                                                key={tax.id}
                                                onClick={() => setFormData({ ...formData, taxType: tax.id })}
                                                className="p-5 rounded-xl transition-all text-left"
                                                style={selected
                                                    ? { border: '1px solid var(--accent-blue)', background: 'var(--accent-blue-light)' }
                                                    : { border: '1px solid var(--card-border)', background: 'var(--input-bg)' }}
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="w-5 h-5 rounded-full border flex items-center justify-center transition-all" style={{ borderColor: selected ? 'var(--accent-blue)' : 'var(--input-border)' }}>
                                                        {selected && <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent-blue)' }} />}
                                                    </div>
                                                    <Calculator size={18} style={{ color: selected ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
                                                </div>
                                                <div className="font-bold text-base mb-1" style={{ color: 'var(--text)' }}>{tax.label}</div>
                                                <div className="text-micro font-bold uppercase tracking-widest" style={fieldLabelStyle}>{tax.desc}</div>
                                            </button>
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
                                                            <span className="text-micro font-bold uppercase tracking-tight truncate" style={{ color: 'var(--text-secondary)' }}>{SERVICE_LABELS[key] || key}</span>
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
                        <h3 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Jamoa va Ish haqi</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {assignments.map((asgn) => (
                                <div key={asgn.role} className="p-4 rounded-xl grid grid-cols-12 gap-4 items-end" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                                    <div className="col-span-12 lg:col-span-4 space-y-1">
                                        <label className="text-micro font-semibold uppercase tracking-widest ml-1" style={fieldLabelStyle}>
                                            {asgn.role === 'chief' ? 'BOSH BUXGALTER' : asgn.role === 'controller' ? 'NAZORATCHI' : asgn.role === 'bank_manager' ? 'BANK MENEJER' : 'BUXGALTER'}
                                        </label>
                                        <select
                                            className="erp-input font-bold"
                                            value={asgn.userId || ''}
                                            onChange={e => updateAssignment(asgn.role, 'userId', e.target.value)}
                                        >
                                            <option value="">Tanlang...</option>
                                            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                                                className="erp-input font-semibold tabular-nums !pr-12 text-right"
                                                value={asgn.salaryValue ?? 0}
                                                onChange={e => updateAssignment(asgn.role, 'salaryValue', Number(e.target.value))}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-micro font-semibold uppercase" style={fieldLabelStyle}>
                                                {asgn.salaryType === 'percent' ? '%' : "so'm"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
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
