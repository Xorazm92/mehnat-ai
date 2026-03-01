
import React, { useState } from 'react';
import { Staff, Company, Language, OperationEntry } from '../types';
import { translations } from '../lib/translations';
import { UserPlus, Phone, Briefcase, Trash2, Edit3, X, Check, Search, Filter } from 'lucide-react';

interface Props {
  staff: Staff[];
  companies: Company[];
  operations: OperationEntry[];
  lang: Language;
  onSave: (s: Staff) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStaffSelect: (s: Staff) => void;
}

const StaffModule: React.FC<Props> = ({ staff, companies, operations, lang, onSave, onDelete, onStaffSelect }) => {
  const t = translations[lang];
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<Partial<Staff>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredStaff = React.useMemo(() => {
    return staff.filter(person => {
      const matchSearch = (person.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (person.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (person.phone || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchRole = roleFilter === 'all' || person.role === roleFilter;
      const matchStatus = statusFilter === 'all' || person.status === statusFilter || (statusFilter === 'active' && !person.status);

      return matchSearch && matchRole && matchStatus;
    });
  }, [staff, searchTerm, roleFilter, statusFilter]);

  const handleSave = async () => {
    if (!form.name || !form.role) {
      import('sonner').then(({ toast }) => toast.error("Iltimos, ism va lavozimni kiriting"));
      return;
    }

    try {
      setIsSaving(true);
      await onSave({
        ...form as Staff,
        id: form.id || '', // we let supabaseData generate a full proper UUID.
        avatarColor: form.avatarColor || '#007AFF'
      });
      setIsAdding(false);
      setForm({});
    } finally {
      setIsSaving(false);
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

      {/* Search and Filter Section */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="relative flex-grow group">
          <input
            type="text"
            className="w-full pl-14 pr-6 py-5 rounded-[2rem] bg-white/50 dark:bg-apple-darkBg border border-slate-100 dark:border-white/5 focus:bg-white dark:focus:bg-apple-darkBg focus:border-indigo-500 outline-none font-bold text-sm md:text-base text-slate-700 dark:text-white transition-all shadow-glass ring-4 ring-transparent focus:ring-indigo-500/10"
            placeholder="Xodimlarni qidirish (ism, email, tel)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search size={22} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
        </div>

        <div className="flex gap-4">
          <div className="relative group">
            <select
              className="pl-12 pr-10 py-5 rounded-[2rem] bg-white/50 dark:bg-apple-darkBg border border-slate-100 dark:border-white/5 focus:bg-white dark:focus:bg-apple-darkBg outline-none font-black text-xs uppercase tracking-widest text-slate-700 dark:text-white transition-all shadow-glass appearance-none min-w-[180px]"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">BARCHA LAVOZIMLAR</option>
              <option value="super_admin">{t.role_super_admin.toUpperCase()}</option>
              <option value="supervisor">{t.role_supervisor.toUpperCase()}</option>
              <option value="chief_accountant">{t.role_chief_accountant.toUpperCase()}</option>
              <option value="accountant">{t.role_accountant.toUpperCase()}</option>
              <option value="manager">{t.role_manager.toUpperCase()}</option>
            </select>
            <Briefcase size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          <div className="relative group">
            <select
              className="pl-12 pr-10 py-5 rounded-[2rem] bg-white/50 dark:bg-apple-darkBg border border-slate-100 dark:border-white/5 focus:bg-white dark:focus:bg-apple-darkBg outline-none font-black text-xs uppercase tracking-widest text-slate-700 dark:text-white transition-all shadow-glass appearance-none min-w-[160px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">BARCHA HOLATLAR</option>
              <option value="active">FAOL (ISHDA)</option>
              <option value="sick">BETOB / KASAL</option>
              <option value="vacation">MEHNAT TA'TILIDA</option>
            </select>
            <Filter size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>
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
                  <select
                    className="w-full pl-10 md:pl-12 pr-10 py-4 md:py-5 rounded-xl md:rounded-2xl bg-white/50 dark:bg-apple-darkBg border border-slate-100 dark:border-white/5 focus:bg-white dark:focus:bg-apple-darkBg focus:border-indigo-500 outline-none font-bold text-sm md:text-base text-slate-700 dark:text-white transition-all shadow-sm group-focus-within/input:shadow-glass group-focus-within/input:scale-[1.01] appearance-none"
                    value={form.role || ''}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="" disabled>{t.role}</option>
                    <option value="super_admin" className="bg-slate-900 text-white">{t.role_super_admin}</option>
                    <option value="supervisor" className="bg-slate-900 text-white">{t.role_supervisor}</option>
                    <option value="chief_accountant" className="bg-slate-900 text-white">{t.role_chief_accountant}</option>
                    <option value="accountant" className="bg-slate-900 text-white">{t.role_accountant}</option>
                    <option value="manager" className="bg-slate-900 text-white">{t.role_manager}</option>
                  </select>
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-indigo-500 transition-colors pointer-events-none">
                    <Briefcase size={16} className="md:w-[18px] md:h-[18px]" />
                  </div>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

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
                    disabled={isSaving}
                    className={`flex-2 grow p-4 md:p-5 rounded-xl md:rounded-2xl font-black text-xs md:text-sm flex items-center justify-center gap-3 shadow-glass-lg transition-all active:scale-95 ${isSaving ? 'bg-emerald-400 cursor-not-allowed opacity-80' : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20'
                      }`}
                  >
                    {isSaving ? (
                      <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <Check size={20} strokeWidth={3} className="md:w-[22px] md:h-[22px]" />
                    )}
                    {isSaving ? 'SAQLANMOQDA...' : t.save}
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
        {filteredStaff.map((person) => {
          // Assuming 'associatedOrganizations' and 'rating' are new properties on Staff type
          // For now, using dummy values or deriving from existing data if possible
          const myCompanies = companies.filter(c => c.accountantId === person.id || c.accountantName === person.name);
          const associatedOrganizations = myCompanies.length;
          const rating = 4.8; // Placeholder, as it's not in the original Staff type

          return (
            <div
              key={person.id}
              onClick={() => onStaffSelect(person)}
              className="group relative"
            >
              <div className="liquid-glass-card p-10 rounded-[3.5rem] cursor-pointer transition-all duration-700 hover:scale-[1.03] hover:-translate-y-2 border border-white/10 dark:border-white/5 bg-white/5 shadow-glass-lg hover:shadow-glass-2xl relative overflow-hidden flex flex-col items-center text-center">
                <div className="glass-reflection"></div>

                {/* Avatar Section */}
                <div className="relative mb-8">
                  <div
                    className="w-28 h-28 rounded-[2.8rem] flex items-center justify-center text-4xl font-black text-white shadow-2xl ring-1 ring-white/20 transition-all duration-1000 group-hover:rotate-6 group-hover:scale-110"
                    style={{ backgroundColor: person.avatarColor, boxShadow: `0 24px 48px -12px ${person.avatarColor}60` }}
                  >
                    <div className="glass-reflection"></div>
                    <span className="relative z-10">{person.name.charAt(0)}</span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-2xl bg-white dark:bg-slate-900 border-4 border-white dark:border-slate-900 flex items-center justify-center shadow-glass ring-4 ring-white/10">
                    <div className={`w-3 h-3 rounded-full animate-pulse ${person.status === 'sick' ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]' :
                      person.status === 'vacation' ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]' :
                        'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                      }`} />
                  </div>
                </div>

                {/* Info Section */}
                <div className="space-y-2 mb-10 relative z-10">
                  <h4 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter leading-tight premium-text-gradient group-hover:text-indigo-500 transition-colors duration-500">{person.name}</h4>
                  <p className="inline-block px-5 py-1.5 rounded-2xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] border border-indigo-500/10">
                    {person.role === 'super_admin' ? t.role_super_admin :
                      person.role === 'supervisor' ? t.role_supervisor :
                        person.role === 'chief_accountant' ? t.role_chief_accountant :
                          person.role === 'manager' ? t.role_manager :
                            t.role_accountant}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="w-full grid grid-cols-2 gap-4 pt-10 border-t border-white/10 relative z-10">
                  <div className="flex flex-col items-center p-5 bg-white/50 dark:bg-white/5 rounded-[2.2rem] border border-white/5 hover:bg-white dark:hover:bg-white/10 transition-all duration-500 shadow-sm hover:shadow-glass group/stat">
                    <Phone size={18} className="text-indigo-500 mb-3 opacity-60 group-hover/stat:scale-110 transition-transform" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.contact}</span>
                    <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 truncate w-full">{person.phone || '—'}</span>
                  </div>
                  <div className="flex flex-col items-center p-5 bg-white/50 dark:bg-white/5 rounded-[2.2rem] border border-white/5 hover:bg-white dark:hover:bg-white/10 transition-all duration-500 shadow-sm hover:shadow-glass group/stat">
                    <Briefcase size={18} className="text-emerald-500 mb-3 opacity-60 group-hover/stat:scale-110 transition-transform" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.organizations}</span>
                    <span className="text-sm font-black text-emerald-500 tabular-nums">{associatedOrganizations}</span>
                  </div>
                </div>

                {/* Decorative Bottom Line */}
                <div className="absolute bottom-0 left-0 h-1.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-400 w-0 group-hover:w-full transition-all duration-1000"></div>
              </div>

              {/* ACTION BUTTONS (Floating on hover) */}
              <div className="absolute top-6 right-6 flex flex-col gap-3 opacity-0 group-hover:opacity-100 translate-x-6 group-hover:translate-x-0 transition-all duration-700 z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); setForm(person); setIsAdding(true); }}
                  className="p-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl text-slate-600 dark:text-white rounded-2xl shadow-glass-lg hover:bg-indigo-600 hover:text-white transition-all transform hover:scale-110 active:scale-95 border border-white/20 group/btn"
                >
                  <Edit3 size={18} className="group-hover/btn:rotate-12 transition-transform" strokeWidth={2.5} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm(person.name + t.confirmDelete)) onDelete(person.id); }}
                  className="p-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl text-rose-500 rounded-2xl shadow-glass-lg hover:bg-rose-600 hover:text-white transition-all transform hover:scale-110 active:scale-95 border border-white/20 group/btn"
                >
                  <Trash2 size={18} className="group-hover/btn:rotate-12 transition-transform" strokeWidth={2.5} />
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
