
import React, { useState } from 'react';
import { Staff, Company, Language, OperationEntry } from '../types';
import { translations } from '../lib/translations';
import { UserPlus, Phone, Briefcase, Trash2, Edit3, X, Check, Search, Filter, ShieldCheck } from 'lucide-react';

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
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header Section */}
      <div className="dashboard-card p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)]">
            <UserPlus size={24} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>{t.staff}</h2>
            <p className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-3)' }}>{t.profile}</p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="font-bold px-6 py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 transition-all shadow-sm whitespace-nowrap uppercase tracking-widest hover:shadow-md"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          <UserPlus size={16} />
          {t.addStaff}
        </button>
      </div>

      {/* Search and Filter Section */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow group">
          <input
            type="text"
            className="w-full pl-12 pr-4 py-3.5 rounded-xl text-[12px] font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            placeholder="XODIMLARNI QIDIRISH..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-3)' }} />
        </div>

        <div className="flex gap-4">
          <div className="relative group">
            <select
              className="pl-12 pr-10 py-3.5 rounded-xl text-[11px] font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 appearance-none min-w-[200px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
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
            <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-3)' }} />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          <div className="relative group">
            <select
              className="pl-12 pr-10 py-3.5 rounded-xl text-[11px] font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 appearance-none min-w-[180px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">BARCHA HOLATLAR</option>
              <option value="active">FAOL (ISHDA)</option>
              <option value="sick">BETOB / KASAL</option>
              <option value="vacation">MEHNAT TA'TILIDA</option>
            </select>
            <Filter size={18} className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-3)' }} />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* ADD STAFF FORM CARD */}
        {isAdding && (
          <div className="dashboard-card relative overflow-hidden sm:col-span-full animate-fade-in p-8 border-t-[4px]" style={{ borderTopColor: 'var(--primary)' }}>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-[var(--primary)] shadow-sm border" style={{ background: 'var(--primary-ghost)', borderColor: 'var(--primary)' }}>
                  <UserPlus size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: 'var(--text)' }}>
                    {form.id ? t.edit : t.addStaff}
                  </h3>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: 'var(--text-3)' }}>Xodim ma'lumotlarini kiriting</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { key: 'name', placeholder: 'F.I.SH', icon: <UserPlus size={16} /> },
                  { key: 'email', placeholder: 'EMAIL (LOGIN UCHUN)', icon: <Check size={16} /> },
                  { key: 'phone', placeholder: t.phone.toUpperCase(), icon: <Phone size={16} /> }
                ].map(field => (
                  <div key={field.key} className="space-y-1.5 relative group/input">
                    <input
                      className="w-full pl-12 pr-4 py-3.5 rounded-xl font-black text-[12px] outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 placeholder:uppercase"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      placeholder={field.placeholder}
                      value={(form as any)[field.key] || ''}
                      onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                    />
                    <div className="absolute left-4 top-[14px] transition-colors" style={{ color: 'var(--text-3)' }}>
                      {field.icon}
                    </div>
                  </div>
                ))}

                <div className="space-y-1.5 relative group/input">
                  <select
                    className="w-full pl-12 pr-10 py-3.5 rounded-xl font-black text-[11px] outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 appearance-none uppercase tracking-widest"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    value={form.role || ''}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="" disabled>{t.role.toUpperCase()}</option>
                    <option value="super_admin">{t.role_super_admin.toUpperCase()}</option>
                    <option value="supervisor">{t.role_supervisor.toUpperCase()}</option>
                    <option value="chief_accountant">{t.role_chief_accountant.toUpperCase()}</option>
                    <option value="accountant">{t.role_accountant.toUpperCase()}</option>
                    <option value="manager">{t.role_manager.toUpperCase()}</option>
                  </select>
                  <div className="absolute left-4 top-[14px] pointer-events-none transition-colors" style={{ color: 'var(--text-3)' }}>
                    <Briefcase size={16} />
                  </div>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

                <div className="space-y-1.5 relative group/input md:col-span-2 lg:col-span-1">
                  <input
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl font-black text-[12px] outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 tracking-[0.3em] placeholder:tracking-normal"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    placeholder={form.id ? t.passwordChange.toUpperCase() : t.password.toUpperCase()}
                    type="password"
                    value={form.password || ''}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                  <div className="absolute left-4 top-[14px] transition-colors" style={{ color: 'var(--text-3)' }}>
                    <ShieldCheck size={16} />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-8 mt-8 justify-end" style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => { setIsAdding(false); setForm({}); }}
                  className="px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all hover:shadow-sm active:scale-95 flex items-center justify-center"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--text-3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <X size={16} className="mr-2" /> BEKOR QILISH
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`px-10 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-md transition-all active:scale-95 ${isSaving ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-lg'}`}
                  style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: 'white' }}
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-sm animate-spin"></div>
                  ) : (
                    <Check size={16} />
                  )}
                  {isSaving ? 'SAQLANMOQDA...' : t.save.toUpperCase()}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STAFF LIST TABLE */}
        <div className="dashboard-card overflow-hidden sm:col-span-full">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Xodim</th>
                  <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-center" style={{ color: 'var(--text-3)' }}>Lavozim</th>
                  <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Aloqa Kanallari</th>
                  <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-center" style={{ color: 'var(--text-3)' }}>Biriktirma</th>
                  <th className="px-6 py-5 text-[11px] font-bold uppercase tracking-widest text-right" style={{ color: 'var(--text-3)' }}>Boshqaruv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                {filteredStaff.map((person, i) => {
                  const myCompanies = companies.filter(c => c.accountantId === person.id || c.accountantName === person.name);
                  const associatedOrganizations = myCompanies.length;

                  return (
                    <tr
                      key={person.id}
                      onClick={() => onStaffSelect(person)}
                      className="transition-colors group cursor-pointer"
                      style={{ backgroundColor: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--primary-light)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'}
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div
                              className="w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center text-sm font-black text-white shadow-sm transition-transform group-hover:scale-110"
                              style={{ backgroundColor: person.avatarColor || 'var(--primary)' }}
                            >
                              {person.name.charAt(0)}
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-2 rounded-full shadow-sm ${person.status === 'sick' ? 'bg-amber-400' :
                                person.status === 'vacation' ? 'bg-rose-500' :
                                  'bg-emerald-500'
                              }`} style={{ borderColor: 'var(--surface)' }} />
                          </div>
                          <div>
                            <div className="text-[13px] font-black uppercase tracking-tight transition-colors" style={{ color: 'var(--text)' }}>{person.name}</div>
                            <div className="text-[10px] font-bold mt-1 uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{person.id.slice(0, 8)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="c1-badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                          {person.role === 'super_admin' ? t.role_super_admin :
                            person.role === 'supervisor' ? t.role_supervisor :
                              person.role === 'chief_accountant' ? t.role_chief_accountant :
                                person.role === 'manager' ? t.role_manager :
                                  t.role_accountant}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1.5">
                          <div className="text-[12px] font-black tracking-tight" style={{ color: 'var(--text)' }}>{person.phone || '—'}</div>
                          <div className="text-[10px] font-bold uppercase tracking-widest truncate max-w-[180px]" style={{ color: 'var(--text-3)' }}>{person.email || '—'}</div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="inline-flex items-center justify-center min-w-[36px] h-9 border text-[12px] font-black rounded-xl tabular-nums shadow-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--primary)' }}>
                          {associatedOrganizations}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); setForm(person); setIsAdding(true); }}
                            className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
                            style={{ color: 'var(--primary)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-ghost)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            title="Tahrirlash"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm(person.name + t.confirmDelete)) onDelete(person.id); }}
                            className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
                            style={{ color: 'var(--danger)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-light)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            title="O'chirish"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <Search size={40} className="mx-auto mb-4 opacity-20" style={{ color: 'var(--text-3)' }} />
                      <span className="text-[11px] uppercase font-black tracking-[0.3em] opacity-50" style={{ color: 'var(--text-3)' }}>MA'LUMOT TOPILMADI</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffModule;
