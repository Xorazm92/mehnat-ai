import React, { useState, useMemo } from 'react';
import { Company, Staff, TaxRegime, StatsType, Language } from '../types';
import { translations } from '../lib/translations';
import { Plus, Search, Edit3, Trash2, X, Check, LayoutGrid, List, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  companies: Company[];
  staff: Staff[];
  lang: Language;
  onSave: (company: Company) => void;
  onCompanySelect: (c: Company) => void;
}

const OrganizationModule: React.FC<Props> = ({ companies, staff, lang, onSave, onCompanySelect }) => {
  const t = translations[lang];
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<Partial<Company>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filtered = useMemo(() => {
    return companies.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.inn.includes(search)
    );
  }, [companies, search]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

  const togglePassword = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-8 md:space-y-10 animate-fade-in pb-20">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white dark:bg-apple-darkCard p-8 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-sm border border-apple-border dark:border-apple-darkBorder gap-8">
        <div className="flex-1">
          <h2 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-white tracking-tight leading-tight mb-2">{t.organizations}</h2>
          <p className="text-sm md:text-base font-semibold text-slate-400">
            {t.totalFirms}: <span className="text-apple-accent tabular-nums">{filtered.length}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
          <div className="flex bg-slate-100 dark:bg-white/5 p-1.5 rounded-2xl border border-apple-border dark:border-apple-darkBorder shadow-inner">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-3 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-apple-darkBg text-apple-accent shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              title={t.gridView}
            >
              <LayoutGrid size={20} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-3 rounded-xl transition-all ${viewMode === 'table' ? 'bg-white dark:bg-apple-darkBg text-apple-accent shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              title={t.tableView}
            >
              <List size={20} />
            </button>
          </div>

          <button
            onClick={() => { setIsAdding(true); setForm({ id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() }); }}
            className="flex-1 md:flex-none grow bg-apple-accent text-white px-8 py-4.5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all active:scale-95"
          >
            <Plus size={20} /> <span className="hidden sm:inline">{t.addCompany}</span>
          </button>
        </div>
      </div>

      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-apple-accent transition-colors" size={20} />
        <input
          type="text"
          placeholder={t.search}
          className="w-full pl-16 pr-8 py-5 md:py-6 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder rounded-[1.5rem] md:rounded-[2rem] text-sm md:text-base font-bold focus:ring-4 focus:ring-apple-accent/10 outline-none transition-all shadow-sm"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
        />
      </div>

      <div className="space-y-8">
        {(isAdding || editingId) && (
          <div className="bg-white dark:bg-apple-darkCard p-10 rounded-[2.5rem] md:rounded-[3rem] border-2 border-apple-accent/30 shadow-2xl animate-macos">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-4">
                <span className="w-2 h-8 bg-apple-accent rounded-full"></span>
                {editingId ? t.edit : t.addCompany}
              </h3>
              <button
                onClick={() => { setIsAdding(false); setEditingId(null); }}
                className="p-3 bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-rose-500 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">{t.companyName}</label>
                  <input
                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all font-bold"
                    placeholder={t.companyName}
                    value={form.name || ''}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">{t.inn}</label>
                  <input
                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all font-bold"
                    placeholder={t.inn}
                    value={form.inn || ''}
                    onChange={e => setForm({ ...form, inn: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">{t.accountant}</label>
                  <select
                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all font-bold"
                    value={form.accountantId || ''}
                    onChange={e => {
                      const s = staff.find(x => x.id === e.target.value);
                      setForm({ ...form, accountantId: e.target.value, accountantName: s?.name || '' });
                    }}
                  >
                    <option value="">{t.selectAccountant}</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">{t.regime}</label>
                    <select
                      className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all font-bold"
                      value={form.taxRegime || ''}
                      onChange={e => setForm({ ...form, taxRegime: e.target.value as TaxRegime })}
                    >
                      {Object.values(TaxRegime).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">{t.stats}</label>
                    <select
                      className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all font-bold"
                      value={form.statsType || ''}
                      onChange={e => setForm({ ...form, statsType: e.target.value as StatsType })}
                    >
                      {Object.values(StatsType).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8 border-t dark:border-apple-darkBorder pt-8">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">{t.login}</label>
                  <input
                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all font-bold"
                    placeholder={t.login}
                    value={form.login || ''}
                    onChange={e => setForm({ ...form, login: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">{t.password}</label>
                  <input
                    className="w-full p-4.5 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 focus:border-apple-accent transition-all font-bold"
                    placeholder={t.password}
                    value={form.password || ''}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="md:col-span-2 flex gap-6 pt-4">
                <button onClick={handleSave} className="flex-1 bg-apple-accent text-white p-5 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all active:scale-95">
                  <Check size={20} /> {t.save}
                </button>
                <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="px-10 bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white p-5 rounded-2xl font-black hover:bg-slate-200 transition-all">
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-8">
            {paginated.map(c => (
              <div
                key={c.id}
                className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder flex flex-col justify-between group hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer"
                onClick={() => onCompanySelect(c)}
              >
                <div className="flex gap-6 mb-6">
                  <div className="h-20 w-20 bg-apple-accent/10 rounded-3xl flex items-center justify-center text-3xl font-black text-apple-accent group-hover:bg-apple-accent group-hover:text-white transition-all shadow-sm">
                    {c.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xl font-black text-slate-800 dark:text-white truncate group-hover:text-apple-accent transition-colors" title={c.name}>{c.name}</h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-[10px] font-black px-3 py-1 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-lg tabular-nums">INN: {c.inn}</span>
                      <span className="text-[10px] font-black px-3 py-1 bg-apple-accent/10 text-apple-accent rounded-lg uppercase">{c.taxRegime}</span>
                    </div>
                  </div>
                  <button onClick={() => startEdit(c)} className="p-3 self-start bg-slate-50 dark:bg-white/5 text-slate-400 rounded-xl hover:text-apple-accent transition-all opacity-0 group-hover:opacity-100"><Edit3 size={18} /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-auto">
                  <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.accountant}</p>
                    <p className="text-sm font-black text-slate-800 dark:text-white truncate">{c.accountantName}</p>
                  </div>
                  {(c.login || c.password) ? (
                    <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl group/pass relative">
                      <button
                        onClick={() => togglePassword(c.id)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-apple-accent transition-colors"
                      >
                        {showPasswords[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.login} / {t.password}</p>
                      <p className="text-xs font-bold text-slate-800 dark:text-white font-mono">
                        {showPasswords[c.id] ? `${c.login || '—'} / ${c.password || '—'}` : '•••••••• / ••••••••'}
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50/50 dark:bg-white/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-apple-border dark:border-apple-darkBorder">
                      <span className="text-[10px] font-bold text-slate-300">No Credentials</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-xl">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/10 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b dark:border-apple-darkBorder">
                    <th className="px-10 py-8 sticky left-0 bg-slate-50 dark:bg-apple-darkCard z-20 shadow-sm">{t.companyName}</th>
                    <th className="px-6 py-8">{t.inn}</th>
                    <th className="px-6 py-8">{t.regime}</th>
                    <th className="px-6 py-8">{t.accountant}</th>
                    <th className="px-6 py-8">{t.login}</th>
                    <th className="px-6 py-8">{t.password}</th>
                    <th className="px-8 py-8 text-right">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-border dark:divide-apple-darkBorder">
                  {paginated.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all group">
                      <td
                        className="px-10 py-6 sticky left-0 bg-white dark:bg-apple-darkCard group-hover:bg-slate-50 dark:group-hover:bg-apple-darkBg/90 z-20 shadow-sm transition-colors cursor-pointer"
                        onClick={() => onCompanySelect(c)}
                      >
                        <div className="font-extrabold text-slate-800 dark:text-white text-base tracking-tight hover:text-apple-accent transition-colors">{c.name}</div>
                      </td>
                      <td className="px-6 py-6 transition-colors">
                        <span className="text-sm font-bold text-slate-500 dark:text-slate-400 font-mono tabular-nums">{c.inn}</span>
                      </td>
                      <td className="px-6 py-6">
                        <span className="px-3 py-1 bg-apple-accent/10 text-apple-accent text-[10px] font-black uppercase rounded-lg">{c.taxRegime}</span>
                      </td>
                      <td className="px-6 py-6">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{c.accountantName}</span>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-2 group/val">
                          <span className="text-xs font-mono font-bold text-slate-500">{c.login || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono font-bold text-slate-500">
                            {showPasswords[c.id] ? c.password || '—' : '••••••••'}
                          </span>
                          <button
                            onClick={() => togglePassword(c.id)}
                            className="text-slate-300 hover:text-apple-accent transition-colors"
                          >
                            {showPasswords[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button
                          onClick={() => startEdit(c)}
                          className="p-3 bg-apple-accent/5 text-apple-accent rounded-xl hover:bg-apple-accent hover:text-white transition-all shadow-sm active:scale-90"
                        >
                          <Edit3 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {paginated.length === 0 && (
                <div className="p-32 flex flex-col items-center justify-center text-slate-300">
                  <LayoutGrid size={64} className="mb-4 opacity-20" />
                  <p className="font-black uppercase tracking-widest text-base">{t.noData}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t dark:border-apple-darkBorder pt-8">
            <p className="text-sm font-bold text-slate-400">
              {t.page} <span className="text-slate-700 dark:text-slate-200">{currentPage}</span> {t.of} {totalPages}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-2 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder p-3 rounded-xl disabled:opacity-30 font-black text-xs hover:border-apple-accent transition-colors shadow-sm"
              >
                <ChevronLeft size={16} /> {t.prev}
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-2 bg-white dark:bg-apple-darkCard border border-apple-border dark:border-apple-darkBorder p-3 rounded-xl disabled:opacity-30 font-black text-xs hover:border-apple-accent transition-colors shadow-sm"
              >
                {t.next} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrganizationModule;
