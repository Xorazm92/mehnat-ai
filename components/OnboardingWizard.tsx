import React, { useEffect, useState } from 'react';
import { Company, Staff, TaxType, ServerInfo, ContractRole, SalaryCalculationType, ServiceScope } from '../types';
import { ChevronRight, ChevronLeft, Check, X, Building2, Server, Calculator, Users } from 'lucide-react';

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
        <div className="c1-card animate-macos overflow-hidden">
            {/* Header / Stepper */}
            <div className="p-6 bg-[#FAFBFC] dark:bg-[#22252B] border-b border-[#D1D5DB] dark:border-[#3A3D44] flex items-center justify-between">
                <div className="flex items-center gap-8 overflow-x-auto scrollbar-hide">
                    {steps.map((step, idx) => {
                        const Icon = step.icon;
                        const isActive = idx === currentStep;
                        const isDone = idx < currentStep;
                        return (
                            <div key={step.id} className="flex items-center gap-3 shrink-0">
                                <div className={`w-10 h-10 rounded-sm flex items-center justify-center transition-all duration-300 font-bold ${isActive ? 'bg-[#3366CC] text-white shadow-sm scale-105' : isDone ? 'bg-[#339933] text-white' : 'bg-white dark:bg-[#1A1D23] text-slate-400 border border-[#D1D5DB] dark:border-[#4A4D55]'}`}>
                                    {isDone ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${isActive ? 'text-[#3366CC] dark:text-[#4A8CFF]' : 'text-slate-500'}`}>{step.title}</span>
                                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{idx + 1}-QADAM</span>
                                </div>
                                {idx < steps.length - 1 && <div className="mx-2 w-8 h-px bg-[#D1D5DB] dark:bg-[#3A3D44]" />}
                            </div>
                        );
                    })}
                </div>
                <button onClick={onCancel} className="p-2 bg-white dark:bg-[#2A2D33] border border-[#D1D5DB] dark:border-[#4A4D55] hover:bg-red-600 hover:text-white rounded-sm text-slate-500 transition-all shadow-sm">
                    <X size={16} strokeWidth={3} />
                </button>
            </div>

            {/* Content */}
            <div className="p-10 min-h-[400px]">
                {currentStep === 0 && (
                    <div className="space-y-8 animate-fade-in">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">Asosiy ma'lumotlar</h3>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Firma Nomi</label>
                                <input
                                    autoFocus
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    placeholder="Masalan: MONTAJ TEPLO"
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">INN (9 ta raqam)</label>
                                <input
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold font-mono"
                                    placeholder="123456789"
                                    value={formData.inn || ''}
                                    onChange={e => setFormData({ ...formData, inn: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Brend Nomi (Brand Name)</label>
                                <input
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    placeholder="Masalan: MONTAJ"
                                    value={formData.brandName || ''}
                                    onChange={e => setFormData({ ...formData, brandName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Direktor Ism-Sharifi</label>
                                <input
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    placeholder="Masalan: Sobirov Ali"
                                    value={formData.directorName || ''}
                                    onChange={e => setFormData({ ...formData, directorName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Direktor Telefoni</label>
                                <input
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    placeholder="+998 90 123 45 67"
                                    value={formData.directorPhone || ''}
                                    onChange={e => setFormData({ ...formData, directorPhone: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Yuridik Manzil</label>
                                <input
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    placeholder="Masalan: Toshkent sh., Chilonzor tumani..."
                                    value={formData.legalAddress || ''}
                                    onChange={e => setFormData({ ...formData, legalAddress: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Ichki Shartnoma Tomoni</label>
                                <select
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold appearance-none"
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
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Shartnoma Summasi</label>
                                <input
                                    type="number"
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    value={formData.contractAmount || 0}
                                    onChange={e => setFormData({ ...formData, contractAmount: Number(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Shartnoma №</label>
                                <input
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    placeholder="Masalan: 12-A"
                                    value={formData.contractNumber || ''}
                                    onChange={e => setFormData({ ...formData, contractNumber: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Shartnoma Sanasi</label>
                                <input
                                    type="date"
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    value={formData.contractDate || ''}
                                    onChange={e => setFormData({ ...formData, contractDate: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 1 && (
                    <div className="space-y-10 animate-macos">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="w-1.5 h-8 bg-apple-accent rounded-full"></div>
                            <h3 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Texnik sozlamalar</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-10">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">1C Server</label>
                                <div className="relative">
                                    <select
                                        className="liquid-glass-input w-full p-5 rounded-2xl outline-none appearance-none font-bold cursor-pointer"
                                        value={formData.serverInfo}
                                        onChange={e => setFormData({ ...formData, serverInfo: e.target.value as ServerInfo })}
                                    >
                                        <option value="CR1">CR1</option>
                                        <option value="CR2">CR2</option>
                                        <option value="CR3">CR3</option>
                                        <option value="srv1c1">srv1c1 (Server 1)</option>
                                        <option value="srv1c2">srv1c2 (Server 2)</option>
                                        <option value="srv1c3">srv1c3 (Server 3)</option>
                                        <option value="srv2">srv2 (Main Server)</option>
                                    </select>
                                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronRight size={20} className="rotate-90" />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">1C Baza Nomi</label>
                                <input
                                    className="liquid-glass-input w-full p-5 rounded-2xl outline-none transition-all font-bold placeholder:text-slate-300"
                                    placeholder="Masalan: Montaj_Teplo_2024"
                                    value={formData.baseName1c || ''}
                                    onChange={e => setFormData({ ...formData, baseName1c: e.target.value })}
                                />
                            </div>
                            <div className="space-y-3 col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Server Nomi (Firma Bazasi uchun)</label>
                                <input
                                    className="liquid-glass-input w-full p-5 rounded-2xl outline-none transition-all font-bold placeholder:text-slate-300"
                                    placeholder="Masalan: 44.AMIRBEK"
                                    value={formData.serverName || ''}
                                    onChange={e => setFormData({ ...formData, serverName: e.target.value })}
                                />
                            </div>
                        </div>
                        <label className="flex items-center gap-6 liquid-glass-card p-8 rounded-[2rem] border border-white/20 dark:border-white/10 cursor-pointer hover:bg-white/40 dark:hover:bg-white/10 transition-all duration-300 group">
                            <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${formData.itParkResident ? 'bg-apple-accent border-apple-accent text-white shadow-lg' : 'border-slate-300'}`}>
                                {formData.itParkResident && <Check size={18} strokeWidth={4} />}
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={formData.itParkResident === true}
                                onChange={e => setFormData({ ...formData, itParkResident: e.target.checked })}
                            />
                            <div className="flex flex-col">
                                <span className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">IT Park Rezidenti</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Soliq imtiyozlari mavjud</span>
                            </div>
                        </label>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="space-y-8 animate-macos">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white uppercase tracking-tight">Soliq va Statistika</h3>
                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block ml-1">Soliq Turi</label>
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { id: TaxType.NDS_PROFIT, label: 'QQS va Foyda', desc: 'УСН + НДС' },
                                        { id: TaxType.TURNOVER, label: 'Aylanmadan soliq', desc: 'Упрощенный налог' }
                                    ].map(tax => (
                                        <button
                                            key={tax.id}
                                            onClick={() => setFormData({ ...formData, taxType: tax.id })}
                                            className={`p-6 border rounded-sm transition-all text-left ${formData.taxType === tax.id ? 'border-[#3366CC] bg-[#3366CC]/5' : 'border-[#D1D5DB] dark:border-[#3A3D44] bg-white dark:bg-[#1A1D23]'}`}
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${formData.taxType === tax.id ? 'border-[#3366CC]' : 'border-gray-300'}`}>
                                                    {formData.taxType === tax.id && <div className="w-2.5 h-2.5 bg-[#3366CC] rounded-full" />}
                                                </div>
                                                <Calculator size={18} className={formData.taxType === tax.id ? 'text-[#3366CC]' : 'text-gray-400'} />
                                            </div>
                                            <div className="font-bold text-gray-900 dark:text-white text-base mb-1">{tax.label}</div>
                                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{tax.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="c1-card">
                                <div className="c1-section-header">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs uppercase tracking-widest px-2 py-0.5 font-bold">Operatsiyalar</span>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <button
                                                onClick={() => {
                                                    const allKeys = ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds', 'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq', 'moliyaviy_natija', 'buxgalteriya_balansi', 'stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt', 'itpark_oylik', 'itpark_chorak', 'kom_suv', 'kom_gaz', 'kom_svet'];
                                                    setFormData({ ...formData, activeServices: allKeys });
                                                }}
                                                className="c1-btn c1-btn-success text-[8px] py-1"
                                            >Yoqish</button>
                                            <button
                                                onClick={() => setFormData({ ...formData, activeServices: [] })}
                                                className="c1-btn c1-btn-danger text-[8px] py-1"
                                            >O'chirish</button>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5 space-y-4">
                                    {[
                                        { group: 'Oylik', keys: ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka'], color: 'blue' },
                                        { group: 'Soliqlar', keys: ['yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds'], color: 'orange' },
                                        { group: 'Soliq H/T', keys: ['aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq'], color: 'purple' },
                                        { group: 'Yillik', keys: ['moliyaviy_natija', 'buxgalteriya_balansi'], color: 'green' },
                                        { group: 'Statistika', keys: ['stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt'], color: 'blue' },
                                        { group: 'IT Park', keys: ['itpark_oylik', 'itpark_chorak'], color: 'blue' },
                                        { group: 'Komunalka', keys: ['kom_suv', 'kom_gaz', 'kom_svet'], color: 'red' },
                                    ].map(section => (
                                        <div key={section.group} className="mb-4 last:mb-0">
                                            <h5 className="text-[9px] font-black uppercase tracking-widest mb-2 text-gray-400 bg-gray-50 dark:bg-[#2A2D33] px-2 py-1 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm w-fit">{section.group}</h5>
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                                {section.keys.map(key => {
                                                    const labels: Record<string, string> = {
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
                                                    const currentServices = formData.activeServices || [];
                                                    const isChecked = currentServices.length === 0 || currentServices.includes(key);
                                                    return (
                                                        <label key={key} className={`flex items-center gap-2 px-3 py-1.5 border rounded-sm cursor-pointer transition-all ${isChecked ? 'bg-[#3366CC]/5 border-[#3366CC]/30' : 'bg-white dark:bg-[#1A1D23] border-gray-100 dark:border-gray-800 opacity-60'}`}>
                                                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center ${isChecked ? 'bg-[#3366CC] border-[#3366CC] text-white' : 'border-gray-300'}`}>
                                                                {isChecked && <Check size={12} strokeWidth={4} />}
                                                            </div>
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={isChecked}
                                                                onChange={() => {
                                                                    let newServices = [...(currentServices.length === 0 ? ['didox', 'xatlar', 'avtokameral', 'my_mehnat', 'one_c', 'pul_oqimlari', 'chiqadigan_soliqlar', 'hisoblangan_oylik', 'debitor_kreditor', 'foyda_va_zarar', 'tovar_ostatka', 'yer_soligi', 'mol_mulk_soligi', 'suv_soligi', 'bonak', 'aksiz_soligi', 'nedro_soligi', 'norezident_foyda', 'norezident_nds', 'aylanma_qqs', 'daromad_soliq', 'inps', 'foyda_soliq', 'moliyaviy_natija', 'buxgalteriya_balansi', 'stat_12_invest', 'stat_12_moliya', 'stat_12_korxona', 'stat_12_narx', 'stat_4_invest', 'stat_4_mehnat', 'stat_4_korxona_miz', 'stat_4_kb_qur_sav_xiz', 'stat_4_kb_sanoat', 'stat_1_invest', 'stat_1_ih', 'stat_1_energiya', 'stat_1_korxona', 'stat_1_korxona_tif', 'stat_1_moliya', 'stat_1_akt', 'itpark_oylik', 'itpark_chorak', 'kom_suv', 'kom_gaz', 'kom_svet'] : currentServices)];
                                                                    if (isChecked) {
                                                                        newServices = newServices.filter(k => k !== key);
                                                                    } else {
                                                                        newServices.push(key);
                                                                    }
                                                                    setFormData({ ...formData, activeServices: newServices });
                                                                }}
                                                            />
                                                            <span className="text-[9px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight truncate">{labels[key] || key}</span>
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
                    <div className="space-y-8 animate-macos">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white uppercase tracking-tight">Jamoa va Ish haqi</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {assignments.map((asgn) => (
                                <div key={asgn.role} className="p-5 bg-[#FAFBFC] dark:bg-[#1e2025] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm grid grid-cols-12 gap-6 items-end group/item">
                                    <div className="col-span-12 lg:col-span-4 space-y-1">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                                            {asgn.role === 'chief' ? 'BOSH BUXGALTER' : asgn.role.toUpperCase().replace('_', ' ')}
                                        </label>
                                        <select
                                            className="c1-input w-full font-bold"
                                            value={asgn.userId}
                                            onChange={e => updateAssignment(asgn.role, 'userId', e.target.value)}
                                        >
                                            <option value="">Tanlang...</option>
                                            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-6 lg:col-span-3 space-y-1">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Hisob turi</label>
                                        <div className="flex bg-white dark:bg-[#22252B] p-1 border border-[#D1D5DB] dark:border-[#4A4D55] rounded-sm">
                                            <button
                                                onClick={() => updateAssignment(asgn.role, 'salaryType', 'percent')}
                                                className={`flex-1 py-1 text-[9px] font-black uppercase rounded-sm transition-all ${asgn.salaryType === 'percent' ? 'bg-[#3366CC] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            >Foiz</button>
                                            <button
                                                onClick={() => updateAssignment(asgn.role, 'salaryType', 'fixed')}
                                                className={`flex-1 py-1 text-[9px] font-black uppercase rounded-sm transition-all ${asgn.salaryType === 'fixed' ? 'bg-[#3366CC] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            >Fiks</button>
                                        </div>
                                    </div>
                                    <div className="col-span-6 lg:col-span-5 space-y-1">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Qiymat</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="c1-input w-full font-black tabular-nums pr-12 text-right"
                                                value={asgn.salaryValue}
                                                onChange={e => updateAssignment(asgn.role, 'salaryValue', Number(e.target.value))}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">
                                                {asgn.salaryType === 'percent' ? '%' : "so'm"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <label className="flex items-center gap-4 bg-emerald-500/5 p-6 rounded-sm border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/10 transition-all group">
                            <div className={`w-8 h-8 rounded-sm flex items-center justify-center transition-all ${formData.kpiEnabled ? 'bg-[#339933] text-white shadow-sm' : 'bg-white dark:bg-[#1A1D23] text-slate-400 border border-[#D1D5DB] dark:border-[#4A4D55]'}`}>
                                <Check size={18} strokeWidth={4} />
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={formData.kpiEnabled === true}
                                onChange={e => setFormData({ ...formData, kpiEnabled: e.target.checked })}
                            />
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-[#339933] uppercase tracking-tight">KPI Tizimini Yoqish</span>
                                <span className="text-[10px] font-bold text-[#339933]/60 uppercase tracking-widest">Avtomatik hisob-kitob va ballar tizimi faollashadi</span>
                            </div>
                        </label>
                    </div>
                )}
            </div>

            {/* Footer / Buttons */}
            <div className="p-6 bg-[#FAFBFC] dark:bg-[#22252B] border-t border-[#D1D5DB] dark:border-[#3A3D44] flex items-center justify-between">
                <button
                    onClick={prevStep}
                    disabled={currentStep === 0}
                    className="px-6 py-2.5 rounded-sm font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 text-slate-400 hover:text-[#3366CC] hover:bg-white dark:hover:bg-[#2A2D33] disabled:opacity-0 transition-all"
                >
                    <ChevronLeft size={16} strokeWidth={3} /> Orqaga
                </button>

                {currentStep < steps.length - 1 ? (
                    <button
                        onClick={nextStep}
                        className="c1-btn c1-btn-primary flex items-center gap-2 text-[11px]"
                    >
                        Keyingisi <ChevronRight size={16} strokeWidth={3} />
                    </button>
                ) : (
                    <button
                        onClick={handleFinish}
                        className="c1-btn c1-btn-success flex items-center gap-2 text-[12px] px-10 py-3"
                    >
                        Tamomlash <Check size={18} strokeWidth={4} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default OnboardingWizard;
