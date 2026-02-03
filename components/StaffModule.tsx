
import React, { useState } from 'react';
import { Staff, Company, Language } from '../types';
import { translations } from '../lib/translations';
import { UserPlus, Phone, Briefcase, Trash2, Edit3, X, Check } from 'lucide-react';

interface Props {
  staff: Staff[];
  companies: Company[];
  lang: Language;
  onSave: (s: Staff) => void;
  onStaffSelect: (s: Staff) => void;
}

const StaffModule: React.FC<Props> = ({ staff, companies, lang, onSave, onStaffSelect }) => {
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
    <div className="space-y-10 animate-fade-in">
      <div className="flex justify-between items-center bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] shadow-sm border border-apple-border dark:border-apple-darkBorder">
        <div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{t.staff}</h2>
          <p className="text-sm font-semibold text-slate-400">{t.profile}</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-apple-accent text-white px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all active:scale-95"
        >
          <UserPlus size={20} /> {t.addStaff}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {isAdding && (
          <div className="bg-white dark:bg-apple-darkCard p-10 rounded-[2.5rem] border-2 border-dashed border-apple-accent/20">
            <h3 className="text-xl font-black text-apple-accent mb-8">{t.addStaff}</h3>
            <div className="space-y-6">
              <input 
                className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-transparent focus:bg-white dark:focus:bg-apple-darkBg focus:border-apple-accent outline-none"
                placeholder="F.I.SH"
                value={form.name || ''}
                onChange={e => setForm({...form, name: e.target.value})}
              />
              <input 
                className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-transparent focus:bg-white dark:focus:bg-apple-darkBg focus:border-apple-accent outline-none"
                placeholder={t.role}
                value={form.role || ''}
                onChange={e => setForm({...form, role: e.target.value})}
              />
              <input 
                className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-transparent focus:bg-white dark:focus:bg-apple-darkBg focus:border-apple-accent outline-none"
                placeholder={t.phone}
                value={form.phone || ''}
                onChange={e => setForm({...form, phone: e.target.value})}
              />
              <div className="flex gap-4">
                <button onClick={handleSave} className="flex-1 bg-emerald-500 text-white p-4 rounded-2xl font-black flex items-center justify-center gap-2"><Check size={20} /> {t.save}</button>
                <button onClick={() => setIsAdding(false)} className="bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white p-4 rounded-2xl font-black transition-all hover:bg-slate-300"><X size={20} /></button>
              </div>
            </div>
          </div>
        )}

        {staff.map(person => {
          const myCompanies = companies.filter(c => c.accountantName === person.name);
          return (
            <div 
              key={person.id} 
              onClick={() => onStaffSelect(person)}
              className="bg-white dark:bg-apple-darkCard p-10 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder group cursor-pointer hover:shadow-2xl hover:scale-[1.02] transition-all relative overflow-hidden"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-[2.2rem] mb-6 flex items-center justify-center text-3xl font-black text-white shadow-2xl transition-transform group-hover:scale-110" style={{backgroundColor: person.avatarColor}}>
                  {person.name.charAt(0)}
                </div>
                <h4 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mb-1">{person.name}</h4>
                <p className="text-xs font-black text-apple-accent uppercase tracking-widest mb-6">{person.role}</p>
                
                <div className="w-full space-y-3 pt-6 border-t border-apple-border dark:border-apple-darkBorder">
                  <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <Phone size={16} className="text-apple-accent" />
                    <span className="text-sm font-bold">{person.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <Briefcase size={16} className="text-apple-accent" />
                    <span className="text-sm font-bold">{t.activeCompanies}: {myCompanies.length}</span>
                  </div>
                </div>
              </div>
              
              <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-3 bg-apple-accent/10 text-apple-accent rounded-xl hover:bg-apple-accent hover:text-white transition-all"><Edit3 size={18} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StaffModule;
