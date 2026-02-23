
import React, { useState } from 'react';
import { Staff, Company, Language, OperationEntry } from '../types';
import { translations } from '../lib/translations';
import { UserPlus, Phone, Briefcase, Trash2, Edit3, X, Check } from 'lucide-react';

interface Props {
  staff: Staff[];
  companies: Company[];
  operations: OperationEntry[];
  lang: Language;
  onSave: (s: Staff) => void;
  onDelete: (id: string) => void;
  onStaffSelect: (s: Staff) => void;
}

const StaffModule: React.FC<Props> = ({ staff, companies, operations, lang, onSave, onDelete, onStaffSelect }) => {
  const t = translations[lang];
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<Partial<Staff>>({});

  const handleSave = () => {
    if (form.name && form.role) {
      onSave({
        ...form as Staff,
        id: form.id || Math.random().toString(36).substr(2, 9),
        avatarColor: form.avatarColor || '#007AFF'
      });
      setIsAdding(false);
      setForm({});
    }
  };

  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center liquid-glass-card p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] gap-6 shadow-glass border border-white/10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] -mr-32 -mt-32 group-hover:bg-indigo-500/10 transition-colors duration-700"></div>
        <div className="relative z-10">
          <h2 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-white tracking-tighter mb-2 premium-text-gradient">{t.staff}</h2>
          <p className="text-[10px] md:text-sm font-black text-slate-400 uppercase tracking-[0.2em]">{t.profile}</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="relative z-10 w-full md:w-auto bg-indigo-600 text-white px-8 md:px-10 py-4 md:p-5 rounded-xl md:rounded-2xl font-black text-xs md:text-sm flex items-center justify-center gap-3 shadow-glass-lg shadow-indigo-500/30 hover:bg-indigo-500 hover:scale-105 transition-all active:scale-95 group/btn"
        >
          <UserPlus size={20} className="group-hover:rotate-12 transition-transform md:w-[22px] md:h-[22px]" />
          {t.addStaff}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {/* ADD STAFF FORM CARD */}
        {isAdding && (
          <div className="liquid-glass-card p-8 md:p-10 rounded-[2.5rem] md:rounded-[3rem] border-2 border-dashed border-indigo-500/30 animate-scale-in shadow-glass bg-indigo-500/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8 md:mb-10">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-indigo-500 text-white flex items-center justify-center shadow-glass-lg">
                  <UserPlus size={20} className="md:w-6 md:h-6" />
                </div>
                <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                  {form.id ? t.edit : t.addStaff}
                </h3>
              </div>

              <div className="space-y-4 md:space-y-6">
                {[
                  { key: 'name', placeholder: 'F.I.SH', icon: <UserPlus size={16} className="md:w-[18px] md:h-[18px]" /> },
                  { key: 'role', placeholder: t.role, icon: <Briefcase size={16} className="md:w-[18px] md:h-[18px]" /> },
                  { key: 'email', placeholder: 'Email (Login uchun)', icon: <Check size={16} className="md:w-[18px] md:h-[18px]" /> },
                  { key: 'phone', placeholder: t.phone, icon: <Phone size={16} className="md:w-[18px] md:h-[18px]" /> }
                ].map(field => (
                  <div key={field.key} className="relative group/input">
                    <input
                      className="w-full pl-10 md:pl-12 pr-5 md:pr-6 py-4 md:py-5 rounded-xl md:rounded-2xl bg-white/50 dark:bg-apple-darkBg border border-slate-100 dark:border-white/5 focus:bg-white dark:focus:bg-apple-darkBg focus:border-indigo-500 outline-none font-bold text-sm md:text-base text-slate-700 dark:text-white transition-all shadow-sm group-focus-within/input:shadow-glass group-focus-within/input:scale-[1.01]"
                      placeholder={field.placeholder}
                      value={(form as any)[field.key] || ''}
                      onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-indigo-500 transition-colors">
                      {field.icon}
                    </div>
                  </div>
                ))}

                <div className="relative group/input">
                  <input
                    className="w-full pl-10 md:pl-12 pr-5 md:pr-6 py-4 md:py-5 rounded-xl md:rounded-2xl bg-white/50 dark:bg-apple-darkBg border border-slate-100 dark:border-white/5 focus:bg-white dark:focus:bg-apple-darkBg focus:border-indigo-500 outline-none font-bold text-sm md:text-base text-slate-700 dark:text-white transition-all shadow-sm group-focus-within/input:shadow-glass group-focus-within/input:scale-[1.01]"
                    placeholder={form.id ? t.passwordChange : t.password}
                    type="password"
                    value={form.password || ''}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-indigo-500 transition-colors">
                    <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleSave}
                    className="flex-2 grow bg-emerald-500 text-white p-4 md:p-5 rounded-xl md:rounded-2xl font-black text-xs md:text-sm flex items-center justify-center gap-3 shadow-glass-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-95"
                  >
                    <Check size={20} strokeWidth={3} className="md:w-[22px] md:h-[22px]" /> {t.save}
                  </button>
                  <button
                    onClick={() => { setIsAdding(false); setForm({}); }}
                    className="flex-1 bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white p-4 md:p-5 rounded-xl md:rounded-2xl font-black transition-all hover:bg-slate-300 dark:hover:bg-white/20 active:scale-95 flex items-center justify-center"
                  >
                    <X size={20} strokeWidth={3} className="md:w-[22px] md:h-[22px]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STAFF LIST CARDS */}
        {staff.map(person => {
          const myCompanies = companies.filter(c => c.accountantId === person.id || c.accountantName === person.name);
          return (
            <div
              key={person.id}
              onClick={() => onStaffSelect(person)}
              className="liquid-glass-card p-12 rounded-[4rem] group cursor-pointer hover:shadow-glass-lg hover:scale-[1.03] hover:-translate-y-2 transition-all duration-500 relative overflow-hidden border border-white/10"
            >
              {/* Subtle background glow */}
              <div className="absolute -bottom-10 -right-10 w-48 h-48 rounded-full blur-[80px] transition-all duration-700" style={{ backgroundColor: `${person.avatarColor}15` }}></div>

              <div className="flex flex-col items-center text-center relative z-10">
                <div className="relative mb-8">
                  <div className="w-28 h-28 rounded-[2.5rem] flex items-center justify-center text-4xl font-black text-white shadow-glass-lg transition-all duration-700 group-hover:rotate-6 group-hover:scale-110" style={{ backgroundColor: person.avatarColor, boxShadow: `0 20px 40px -10px ${person.avatarColor}50` }}>
                    {person.name.charAt(0)}
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-white dark:bg-apple-darkBg border-2 border-slate-100 dark:border-white/10 flex items-center justify-center shadow-glass ring-4 ring-white/20">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  </div>
                </div>

                <div className="space-y-1 mb-8">
                  <h4 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter leading-tight">{person.name}</h4>
                  <p className="inline-block px-4 py-1 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] border border-indigo-500/10">
                    {person.role === 'super_admin' ? t.role_super_admin : person.role === 'supervisor' ? t.role_supervisor : person.role === 'chief_accountant' ? t.role_chief_accountant : t.role_accountant}
                  </p>
                </div>

                <div className="w-full grid grid-cols-2 gap-3 md:gap-4 pt-6 md:pt-10 border-t border-white/10">
                  <div className="flex flex-col items-center p-3 md:p-4 bg-slate-50/50 dark:bg-white/5 rounded-[1.5rem] md:rounded-[1.8rem] border border-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                    <Phone size={14} className="text-indigo-500 mb-1.5 md:mb-2 opacity-70 md:w-[18px] md:h-[18px]" />
                    <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.contact}</span>
                    <span className="text-[10px] md:text-[11px] font-black text-slate-700 dark:text-slate-300 truncate w-full">{person.phone || '—'}</span>
                  </div>
                  <div className="flex flex-col items-center p-3 md:p-4 bg-slate-50/50 dark:bg-white/5 rounded-[1.5rem] md:rounded-[1.8rem] border border-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                    <Briefcase size={14} className="text-emerald-500 mb-1.5 md:mb-2 opacity-70 md:w-[18px] md:h-[18px]" />
                    <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.organizations}</span>
                    <span className="text-xs md:text-sm font-black text-emerald-500 tabular-nums">{myCompanies.length}</span>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS (Floating on hover) */}
              <div className="absolute top-4 md:top-8 right-4 md:right-8 flex flex-col gap-2 md:gap-3 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                <button
                  onClick={(e) => { e.stopPropagation(); setForm(person); setIsAdding(true); }}
                  className="p-3 md:p-4 bg-white/80 dark:bg-apple-darkBg/80 backdrop-blur-md text-slate-600 dark:text-white rounded-xl md:rounded-[1.2rem] shadow-glass hover:bg-indigo-600 hover:text-white transition-all transform hover:scale-110 active:scale-95 border border-white/20"
                >
                  <Edit3 size={16} className="md:w-[18px] md:h-[18px]" strokeWidth={2.5} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm(person.name + t.confirmDelete)) onDelete(person.id); }}
                  className="p-3 md:p-4 bg-white/80 dark:bg-apple-darkBg/80 backdrop-blur-md text-rose-500 rounded-xl md:rounded-[1.2rem] shadow-glass hover:bg-rose-600 hover:text-white transition-all transform hover:scale-110 active:scale-95 border border-white/20"
                >
                  <Trash2 size={16} className="md:w-[18px] md:h-[18px]" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StaffModule;
