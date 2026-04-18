
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] p-5 rounded-sm shadow-sm gap-4 transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-sm bg-[#3366CC] flex items-center justify-center text-white shadow-sm">
            <UserPlus size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-800 dark:text-white uppercase tracking-tight leading-none">{t.staff}</h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1.5">{t.profile}</p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] text-gray-700 dark:text-gray-300 px-5 py-2.5 rounded-sm text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm hover:bg-[#EBF3FF] hover:border-[#3366CC] hover:text-[#3366CC] transition-all active:scale-95"
        >
          <UserPlus size={14} />
          {t.addStaff}
        </button>
      </div>

      {/* Search and Filter Section */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow group">
          <input
            type="text"
            className="w-full pl-11 pr-4 py-3 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] bg-white dark:bg-[#1A1D23] focus:outline-none focus:border-[#3366CC] text-[12px] font-black text-gray-800 dark:text-white transition-all shadow-inner placeholder:text-gray-400 placeholder:font-bold placeholder:uppercase placeholder:tracking-widest"
            placeholder="XODIMLARNI QIDIRISH..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#3366CC] transition-colors" />
        </div>

        <div className="flex gap-4">
          <div className="relative group">
            <select
              className="pl-11 pr-10 py-3 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] bg-white dark:bg-[#1A1D23] focus:outline-none focus:border-[#3366CC] text-[10px] font-black uppercase text-gray-700 dark:text-white transition-all shadow-sm appearance-none min-w-[180px] tracking-widest"
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
            <Briefcase size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#3366CC] transition-colors" />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          <div className="relative group">
            <select
              className="pl-11 pr-10 py-3 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] bg-white dark:bg-[#1A1D23] focus:outline-none focus:border-[#3366CC] text-[10px] font-black uppercase text-gray-700 dark:text-white transition-all shadow-sm appearance-none min-w-[160px] tracking-widest"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">BARCHA HOLATLAR</option>
              <option value="active">FAOL (ISHDA)</option>
              <option value="sick">BETOB / KASAL</option>
              <option value="vacation">MEHNAT TA'TILIDA</option>
            </select>
            <Filter size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#3366CC] transition-colors" />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* ADD STAFF FORM CARD */}
        {isAdding && (
          <div className="bg-white dark:bg-[#1A1D23] p-8 rounded-sm border-t-4 border-t-[#3366CC] border border-[#DEE2E6] dark:border-[#3A3D44] shadow-md relative overflow-hidden sm:col-span-full transition-all animate-fade-in">
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-sm bg-[#F8F9FA] dark:bg-[#111318] text-[#3366CC] flex items-center justify-center border border-[#DEE2E6] dark:border-[#3A3D44] shadow-inner">
                  <UserPlus size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-800 dark:text-white uppercase tracking-widest">
                    {form.id ? t.edit : t.addStaff}
                  </h3>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">Xodim ma'lumotlarini kiriting</p>
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
                      className="w-full pl-11 pr-4 py-3 rounded-sm bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] focus:outline-none focus:border-[#3366CC] font-black text-[12px] text-gray-800 dark:text-white transition-all shadow-inner placeholder:text-gray-400 placeholder:uppercase"
                      placeholder={field.placeholder}
                      value={(form as any)[field.key] || ''}
                      onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                    />
                    <div className="absolute left-4 top-[14px] text-gray-300 group-focus-within/input:text-[#3366CC] transition-colors">
                      {field.icon}
                    </div>
                  </div>
                ))}

                <div className="space-y-1.5 relative group/input">
                  <select
                    className="w-full pl-11 pr-10 py-3 rounded-sm bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] focus:outline-none focus:border-[#3366CC] font-black text-[11px] text-gray-800 dark:text-white transition-all shadow-inner appearance-none uppercase tracking-widest"
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
                  <div className="absolute left-4 top-[14px] text-gray-300 group-focus-within/input:text-[#3366CC] transition-colors pointer-events-none">
                    <Briefcase size={16} />
                  </div>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

                <div className="space-y-1.5 relative group/input md:col-span-2 lg:col-span-1">
                  <input
                    className="w-full pl-11 pr-4 py-3 rounded-sm bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] focus:outline-none focus:border-[#3366CC] font-black text-[12px] text-gray-800 dark:text-white transition-all shadow-inner tracking-[0.3em] placeholder:tracking-normal placeholder:text-gray-300"
                    placeholder={form.id ? t.passwordChange.toUpperCase() : t.password.toUpperCase()}
                    type="password"
                    value={form.password || ''}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                  <div className="absolute left-4 top-[14px] text-gray-300 group-focus-within/input:text-[#3366CC] transition-colors">
                    <ShieldCheck size={16} />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-8 mt-8 border-t border-[#DEE2E6] dark:border-[#3A3D44] justify-end">
                <button
                  onClick={() => { setIsAdding(false); setForm({}); }}
                  className="px-8 py-3 bg-[#F8F9FA] dark:bg-[#111318] text-gray-500 dark:text-gray-400 border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-[11px] font-black uppercase tracking-widest transition-all hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 flex items-center justify-center shadow-sm"
                >
                  <X size={16} className="mr-2" /> BEKOR QILISH
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`px-10 py-3 rounded-sm font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-md transition-all active:scale-95 ${isSaving ? 'bg-gray-300 cursor-not-allowed text-white opacity-80' : 'bg-[#3366CC] text-white hover:bg-[#2855AA]'
                    }`}
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
        <div className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-sm overflow-hidden sm:col-span-full transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA] dark:bg-[#111318] text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                  <th className="px-5 py-4">Xodim</th>
                  <th className="px-5 py-4 text-center">Lavozim</th>
                  <th className="px-5 py-4">Aloqa Kanallari</th>
                  <th className="px-5 py-4 text-center">Biriktirma</th>
                  <th className="px-5 py-4 text-right">Boshqaruv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                {filteredStaff.map((person) => {
                  const myCompanies = companies.filter(c => c.accountantId === person.id || c.accountantName === person.name);
                  const associatedOrganizations = myCompanies.length;

                  return (
                    <tr
                      key={person.id}
                      onClick={() => onStaffSelect(person)}
                      className="hover:bg-[#F2F7FF] dark:hover:bg-[#1e222a] transition-all cursor-pointer group"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div
                              className="w-10 h-10 rounded-sm shrink-0 flex items-center justify-center text-sm font-black text-white shadow-sm transition-transform group-hover:scale-110"
                              style={{ backgroundColor: person.avatarColor || '#3366CC' }}
                            >
                              {person.name.charAt(0)}
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-2 border-white dark:border-[#1A1D23] rounded-sm shadow-sm ${person.status === 'sick' ? 'bg-amber-400' :
                                person.status === 'vacation' ? 'bg-rose-500' :
                                  'bg-emerald-500'
                              }`} />
                          </div>
                          <div>
                            <div className="text-[13px] font-black text-gray-800 dark:text-white group-hover:text-[#3366CC] transition-colors uppercase tracking-tight">{person.name}</div>
                            <div className="text-[9px] font-bold text-gray-400 mt-0.5 uppercase tracking-widest">{person.id.slice(0, 8)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="px-3 py-1 bg-[#F0F2F5] dark:bg-[#2A2D33] text-gray-600 dark:text-gray-300 text-[9px] font-black uppercase tracking-[0.1em] rounded-sm inline-block border border-[#DEE2E6] dark:border-[#3A3D44]">
                          {person.role === 'super_admin' ? t.role_super_admin :
                            person.role === 'supervisor' ? t.role_supervisor :
                              person.role === 'chief_accountant' ? t.role_chief_accountant :
                                person.role === 'manager' ? t.role_manager :
                                  t.role_accountant}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="text-[11px] text-gray-700 dark:text-gray-300 font-black tracking-tight">{person.phone || '—'}</div>
                          <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest truncate max-w-[180px]">{person.email || '—'}</div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="inline-flex items-center justify-center min-w-[32px] h-8 bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] text-[12px] font-black text-[#3366CC] rounded-sm tabular-nums shadow-inner">
                          {associatedOrganizations}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 text-gray-400 group-hover:text-gray-600">
                          <button
                            onClick={(e) => { e.stopPropagation(); setForm(person); setIsAdding(true); }}
                            className="p-2 hover:text-[#3366CC] hover:bg-[#EBF3FF] dark:hover:bg-[#1C2531] rounded-sm border border-transparent hover:border-[#DEE2E6] transition-all"
                            title="Tahrirlash"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm(person.name + t.confirmDelete)) onDelete(person.id); }}
                            className="p-2 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-sm border border-transparent hover:border-rose-100 transition-all"
                            title="O'chirish"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-8 py-16 text-center text-gray-300 dark:text-gray-700">
                      <Search size={32} className="mx-auto mb-4 opacity-10" />
                      <span className="text-[10px] uppercase font-black tracking-[0.3em] opacity-40">MA'LUMOT TOPILMADI</span>
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
