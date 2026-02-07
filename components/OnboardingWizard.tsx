import React, { useState } from 'react';
import { Company, Staff, TaxType, ServerInfo, ContractRole, SalaryCalculationType, StatsType, ServiceScope } from '../types';
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
        serviceScope: []
    });

    const [assignments, setAssignments] = useState<any[]>(initialAssignments || [
        { role: 'accountant', userId: '', salaryType: 'percent', salaryValue: 70 },
        { role: 'controller', userId: '', salaryType: 'fixed', salaryValue: 50000 },
        { role: 'bank_manager', userId: '', salaryType: 'fixed', salaryValue: 50000 }
    ]);

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

    const updateAssignment = (role: string, field: string, value: any) => {
        setAssignments(prev => prev.map(a => a.role === role ? { ...a, [field]: value } : a));
    };

    const handleFinish = () => {
        onSave(formData, assignments);
    };

    return (
        <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] shadow-2xl overflow-hidden border border-apple-border dark:border-apple-darkBorder animate-macos">
            {/* Header / Stepper */}
            <div className="p-8 bg-slate-50 dark:bg-white/5 border-b dark:border-apple-darkBorder flex items-center justify-between">
                <div className="flex items-center gap-10">
                    {steps.map((step, idx) => {
                        const Icon = step.icon;
                        const isActive = idx === currentStep;
                        const isDone = idx < currentStep;
                        return (
                            <div key={step.id} className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-apple-accent text-white shadow-lg' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-400'}`}>
                                    {isDone ? <Check size={20} /> : <Icon size={20} />}
                                </div>
                                <span className={`text-xs font-black uppercase tracking-widest ${isActive ? 'text-apple-accent' : 'text-slate-400'}`}>{step.title}</span>
                                {idx < steps.length - 1 && <div className="ml-4 w-8 h-px bg-slate-200 dark:bg-white/10" />}
                            </div>
                        );
                    })}
                </div>
                <button onClick={onCancel} className="p-2 text-slate-400 hover:text-rose-500 transition-colors"><X size={24} /></button>
            </div>

            {/* Content */}
            <div className="p-10 min-h-[400px]">
                {currentStep === 0 && (
                    <div className="space-y-8 animate-fade-in">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">Asosiy ma'lumotlar</h3>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Firma Nomi</label>
                                <input
                                    autoFocus
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    placeholder="Masalan: MONTAJ TEPLO"
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">INN (9 ta raqam)</label>
                                <input
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold font-mono"
                                    placeholder="123456789"
                                    value={formData.inn || ''}
                                    onChange={e => setFormData({ ...formData, inn: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ichki Shartnoma Tomoni</label>
                                <input
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    placeholder="Sizning qaysi firmangiz bilan shartnoma?"
                                    value={formData.internalContractor || ''}
                                    onChange={e => setFormData({ ...formData, internalContractor: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Shartnoma Summasi</label>
                                <input
                                    type="number"
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    value={formData.contractAmount || 0}
                                    onChange={e => setFormData({ ...formData, contractAmount: Number(e.target.value) })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 1 && (
                    <div className="space-y-8 animate-fade-in">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">Texnik sozlamalar</h3>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">1C Server</label>
                                <select
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    value={formData.serverInfo}
                                    onChange={e => setFormData({ ...formData, serverInfo: e.target.value as ServerInfo })}
                                >
                                    <option value="CR1">CR1 (Server 1)</option>
                                    <option value="CR2">CR2 (Server 2)</option>
                                    <option value="CR3">CR3 (Server 3)</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">1C Baza Nomi</label>
                                <input
                                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold"
                                    placeholder="Masalan: Montaj_Teplo_2024"
                                    value={formData.baseName1c || ''}
                                    onChange={e => setFormData({ ...formData, baseName1c: e.target.value })}
                                />
                            </div>
                        </div>
                        <label className="flex items-center gap-4 bg-slate-50 dark:bg-white/5 p-6 rounded-2xl border border-apple-border dark:border-apple-darkBorder cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-5 h-5 accent-apple-accent"
                                checked={formData.itParkResident === true}
                                onChange={e => setFormData({ ...formData, itParkResident: e.target.checked })}
                            />
                            <span className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">IT Park Rezidenti</span>
                        </label>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="space-y-8 animate-fade-in">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">Soliq va Statistika</h3>
                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block ml-1">Soliq Turi</label>
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { id: TaxType.NDS_PROFIT, label: 'QQS va Foyda (NDS Profit)' },
                                        { id: TaxType.TURNOVER, label: 'Aylanmadan olingan soliq (Turnover)' }
                                    ].map(tax => (
                                        <button
                                            key={tax.id}
                                            onClick={() => setFormData({ ...formData, taxType: tax.id })}
                                            className={`p-6 rounded-2xl border-2 transition-all text-left ${formData.taxType === tax.id ? 'border-apple-accent bg-apple-accent/5' : 'border-apple-border dark:border-apple-darkBorder hover:border-slate-400'}`}
                                        >
                                            <div className={`w-6 h-6 rounded-full border-2 mb-4 flex items-center justify-center ${formData.taxType === tax.id ? 'border-apple-accent bg-apple-accent' : 'border-slate-300'}`}>
                                                {formData.taxType === tax.id && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>
                                            <span className="font-bold text-slate-800 dark:text-white">{tax.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block ml-1">Statistika Hisobotlari</label>
                                <div className="grid grid-cols-3 gap-4">
                                    {Object.values(StatsType).map(stat => (
                                        <label key={stat} className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-apple-border dark:border-apple-darkBorder cursor-pointer hover:border-apple-accent transition-all">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-apple-accent"
                                                checked={formData.statReports?.includes(stat) || false}
                                                onChange={e => {
                                                    const current = formData.statReports || [];
                                                    const next = e.target.checked ? [...current, stat] : current.filter(s => s !== stat);
                                                    setFormData({ ...formData, statReports: next });
                                                }}
                                            />
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{stat}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block ml-1">Xizmatlar Ko'lami (Service Scope)</label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {Object.values(ServiceScope).map(scope => (
                                        <label key={scope} className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-apple-border dark:border-apple-darkBorder cursor-pointer hover:border-apple-accent transition-all">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-apple-accent"
                                                checked={formData.serviceScope?.includes(scope) || false}
                                                onChange={e => {
                                                    const current = formData.serviceScope || [];
                                                    const next = e.target.checked ? [...current, scope] : current.filter(s => s !== scope);
                                                    setFormData({ ...formData, serviceScope: next });
                                                }}
                                            />
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{scope}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="space-y-8 animate-fade-in">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">Jamoa va Ish haqi</h3>
                        <div className="space-y-6">
                            {assignments.map((asgn) => (
                                <div key={asgn.role} className="p-6 bg-slate-50 dark:bg-white/5 rounded-2xl border border-apple-border dark:border-apple-darkBorder grid grid-cols-12 gap-6 items-end">
                                    <div className="col-span-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">{asgn.role.toUpperCase().replace('_', ' ')}</label>
                                        <select
                                            className="w-full p-3 rounded-xl bg-white dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder font-bold text-sm"
                                            value={asgn.userId}
                                            onChange={e => updateAssignment(asgn.role, 'userId', e.target.value)}
                                        >
                                            <option value="">Tanlang...</option>
                                            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Hisob turi</label>
                                        <div className="flex bg-slate-200 dark:bg-white/10 p-1 rounded-lg">
                                            <button
                                                onClick={() => updateAssignment(asgn.role, 'salaryType', 'percent')}
                                                className={`flex-1 py-1 text-[10px] font-black uppercase rounded-md transition-all ${asgn.salaryType === 'percent' ? 'bg-white dark:bg-slate-700 text-apple-accent shadow-sm' : 'text-slate-500'}`}
                                            >Foiz</button>
                                            <button
                                                onClick={() => updateAssignment(asgn.role, 'salaryType', 'fixed')}
                                                className={`flex-1 py-1 text-[10px] font-black uppercase rounded-md transition-all ${asgn.salaryType === 'fixed' ? 'bg-white dark:bg-slate-700 text-apple-accent shadow-sm' : 'text-slate-500'}`}
                                            >Fiks</button>
                                        </div>
                                    </div>
                                    <div className="col-span-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Qiymat</label>
                                        <input
                                            type="number"
                                            className="w-full p-3 rounded-xl bg-white dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder font-bold text-sm text-right"
                                            value={asgn.salaryValue}
                                            onChange={e => updateAssignment(asgn.role, 'salaryValue', Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="col-span-3 text-xs font-black text-apple-accent pb-3">
                                        {asgn.salaryType === 'percent' ? '%' : "so'm"}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <label className="flex items-center gap-4 bg-emerald-50 dark:bg-emerald-500/5 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-5 h-5 accent-emerald-500"
                                checked={formData.kpiEnabled === true}
                                onChange={e => setFormData({ ...formData, kpiEnabled: e.target.checked })}
                            />
                            <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-tight">KPI Tizimini Yoqish</span>
                        </label>
                    </div>
                )}
            </div>

            {/* Footer / Buttons */}
            <div className="p-8 bg-slate-50 dark:bg-white/5 border-t dark:border-apple-darkBorder flex items-center justify-between">
                <button
                    onClick={prevStep}
                    disabled={currentStep === 0}
                    className="px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-2 text-slate-400 hover:text-slate-600 disabled:opacity-0 transition-all"
                >
                    <ChevronLeft size={20} /> Orqaga
                </button>

                {currentStep < steps.length - 1 ? (
                    <button
                        onClick={nextStep}
                        className="px-10 py-4 bg-apple-accent text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all active:scale-95"
                    >
                        Keyingisi <ChevronRight size={20} />
                    </button>
                ) : (
                    <button
                        onClick={handleFinish}
                        className="px-12 py-4 bg-emerald-500 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-95"
                    >
                        Tamomlash <Check size={20} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default OnboardingWizard;
