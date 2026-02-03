
import React, { useState } from 'react';
import { Company, Staff, TaxRegime, StatsType, Language } from '../types';
import { translations } from '../lib/translations';
import { Plus, Search, Edit3, Trash2, X, Check } from 'lucide-react';

interface Props {
  companies: Company[];
  staff: Staff[];
  lang: Language;
  onSave: (company: Company) => void;
}

const OrganizationModule: React.FC<Props> = ({ companies, staff, lang, onSave }) => {
  const t = translations[lang];
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<Partial<Company>>({});

  const filtered = companies.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.inn.includes(search)
  );

  const startEdit = (c: Company) => {
    setForm(c);
    setEditingId(c.id);
  };

  const handleSave = () => {
    if (form.name && form.inn) {
      onSave(form as Company);
      setEditingId(null);
      setIsAdding(false);
      setForm({});
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] shadow-sm border border-apple-border dark:border-apple-darkBorder gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{t.organizations}</h2>
          <p className="text-sm font-semibold text-slate-400">{t.totalFirms}</p>
        </div>
        <button 
          onClick={() => { setIsAdding(true); setForm({ id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() }); }}
          className="bg-apple-accent text-white px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all active:scale-95"
        >
          <Plus size={20} /> {t.addCompany}
        </button>
      </div>

      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={20} />
        <input 
          type="text" 
          placeholder={t.search}
          className="w-full pl-16 pr-8 py-5 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder rounded-3xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {(isAdding || editingId) && (
          <div className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border-2 border-apple-accent/20 bg-apple-accent/5">
            <h3 className="text-xl font-black text-apple-accent mb-6">{editingId ? t.save : t.addCompany}</h3>
            <div className="space-y-4">
              <input 
                className="w-full p-4 rounded-2xl bg-white dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:border-apple-accent" 
                placeholder={t.companyName}
                value={form.name || ''}
                onChange={e => setForm({...form, name: e.target.value})}
              />
              <input 
                className="w-full p-4 rounded-2xl bg-white dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:border-apple-accent" 
                placeholder={t.inn}
                value={form.inn || ''}
                onChange={e => setForm({...form, inn: e.target.value})}
              />
              <select 
                className="w-full p-4 rounded-2xl bg-white dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:border-apple-accent"
                value={form.accountantName || ''}
                onChange={e => setForm({...form, accountantName: e.target.value, accountantId: e.target.value.toLowerCase()})}
              >
                <option value="">{t.selectAccountant}</option>
                {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <select 
                  className="p-4 rounded-2xl bg-white dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:border-apple-accent"
                  value={form.taxRegime || ''}
                  onChange={e => setForm({...form, taxRegime: e.target.value as TaxRegime})}
                >
                  {Object.values(TaxRegime).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select 
                  className="p-4 rounded-2xl bg-white dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:border-apple-accent"
                  value={form.statsType || ''}
                  onChange={e => setForm({...form, statsType: e.target.value as StatsType})}
                >
                  {Object.values(StatsType).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={handleSave} className="flex-1 bg-emerald-500 text-white p-4 rounded-2xl font-black flex items-center justify-center gap-2"><Check size={18} /> {t.save}</button>
                <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white p-4 rounded-2xl font-black">{t.cancel}</button>
              </div>
            </div>
          </div>
        )}

        {filtered.map(c => (
          <div key={c.id} className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder flex justify-between items-start group hover:shadow-xl transition-all">
            <div className="flex gap-6">
              <div className="h-16 w-16 bg-apple-accent/10 rounded-2xl flex items-center justify-center text-2xl font-black text-apple-accent group-hover:bg-apple-accent group-hover:text-white transition-all">
                {c.name.charAt(0)}
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-800 dark:text-white">{c.name}</h4>
                <div className="flex gap-3 mt-1">
                  <span className="text-[10px] font-black px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-500 rounded">INN: {c.inn}</span>
                  <span className="text-[10px] font-black px-2 py-0.5 bg-apple-accent/10 text-apple-accent rounded">{c.taxRegime}</span>
                </div>
                <p className="text-xs font-bold text-slate-400 mt-3">{t.accountant}: <span className="text-slate-700 dark:text-slate-300 font-black">{c.accountantName}</span></p>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => startEdit(c)} className="p-3 bg-apple-accent/10 text-apple-accent rounded-xl hover:bg-apple-accent hover:text-white transition-all"><Edit3 size={18} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrganizationModule;
