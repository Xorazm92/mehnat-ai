
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">{t.staff}</h2>
          <p className="text-xs font-bold text-gray-500 uppercase">{t.profile}</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-white dark:bg-[#22252B] border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
            className="w-full pl-10 pr-4 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e2025] focus:outline-none focus:border-indigo-500 text-sm font-bold text-gray-800 dark:text-gray-200 transition-colors shadow-sm"
            placeholder="Xodimlarni qidirish (ism, email, tel)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
        </div>

        <div className="flex gap-4">
          <div className="relative group">
            <select
              className="pl-10 pr-8 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e2025] focus:outline-none focus:border-indigo-500 text-xs font-bold uppercase text-gray-700 dark:text-gray-200 transition-colors shadow-sm appearance-none min-w-[150px]"
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
            <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          <div className="relative group">
            <select
              className="pl-10 pr-8 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e2025] focus:outline-none focus:border-indigo-500 text-xs font-bold uppercase text-gray-700 dark:text-gray-200 transition-colors shadow-sm appearance-none min-w-[140px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">BARCHA HOLATLAR</option>
              <option value="active">FAOL (ISHDA)</option>
              <option value="sick">BETOB / KASAL</option>
              <option value="vacation">MEHNAT TA'TILIDA</option>
            </select>
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* ADD STAFF FORM CARD */}
        {isAdding && (
          <div className="bg-white dark:bg-[#22252B] p-6 rounded border-l-4 border-l-indigo-500 border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden sm:col-span-full">
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-800">
                  <UserPlus size={18} />
                </div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase">
                  {form.id ? t.edit : t.addStaff}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { key: 'name', placeholder: 'F.I.SH', icon: <UserPlus size={16} /> },
                  { key: 'email', placeholder: 'Email (Login uchun)', icon: <Check size={16} /> },
                  { key: 'phone', placeholder: t.phone, icon: <Phone size={16} /> }
                ].map(field => (
                  <div key={field.key} className="space-y-1 relative group/input">
                    <input
                      className="w-full pl-10 pr-3 py-2 rounded bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-indigo-500 font-bold text-xs text-gray-800 dark:text-white transition-colors shadow-sm"
                      placeholder={field.placeholder}
                      value={(form as any)[field.key] || ''}
                      onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                    />
                    <div className="absolute left-3 top-[18px] text-gray-400 group-focus-within/input:text-indigo-500 transition-colors">
                      {field.icon}
                    </div>
                  </div>
                ))}

                <div className="space-y-1 relative group/input">
                  <select
                    className="w-full pl-10 pr-8 py-2 rounded bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-indigo-500 font-bold text-xs text-gray-800 dark:text-white transition-colors shadow-sm appearance-none"
                    value={form.role || ''}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="" disabled>{t.role}</option>
                    <option value="super_admin">{t.role_super_admin}</option>
                    <option value="supervisor">{t.role_supervisor}</option>
                    <option value="chief_accountant">{t.role_chief_accountant}</option>
                    <option value="accountant">{t.role_accountant}</option>
                    <option value="manager">{t.role_manager}</option>
                  </select>
                  <div className="absolute left-3 top-[18px] text-gray-400 group-focus-within/input:text-indigo-500 transition-colors pointer-events-none">
                    <Briefcase size={16} />
                  </div>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

                <div className="space-y-1 relative group/input md:col-span-2 lg:col-span-1">
                  <input
                    className="w-full pl-10 pr-3 py-2 rounded bg-white dark:bg-[#1e2025] border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-indigo-500 font-bold text-xs text-gray-800 dark:text-white transition-colors shadow-sm"
                    placeholder={form.id ? t.passwordChange : t.password}
                    type="password"
                    value={form.password || ''}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                  <div className="absolute left-3 top-[18px] text-gray-400 group-focus-within/input:text-indigo-500 transition-colors">
                    <Trash2 size={16} />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-6 mt-4 border-t border-gray-200 dark:border-gray-700 justify-end">
                <button
                  onClick={() => { setIsAdding(false); setForm({}); }}
                  className="px-6 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded text-xs font-bold transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 flex items-center justify-center shadow-sm"
                >
                  <X size={16} className="mr-1" /> BEKOR QILISH
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`px-6 py-2 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 ${isSaving ? 'bg-indigo-300 cursor-not-allowed text-white opacity-80' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
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
        <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden sm:col-span-full">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3">Xodim</th>
                  <th className="px-4 py-3">Lavozim</th>
                  <th className="px-4 py-3">Aloqa</th>
                  <th className="px-4 py-3">Firmalar</th>
                  <th className="px-4 py-3 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {filteredStaff.map((person) => {
                  const myCompanies = companies.filter(c => c.accountantId === person.id || c.accountantName === person.name);
                  const associatedOrganizations = myCompanies.length;

                  return (
                    <tr
                      key={person.id}
                      onClick={() => onStaffSelect(person)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div
                              className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-sm"
                              style={{ backgroundColor: person.avatarColor || '#4F46E5' }}
                            >
                              {person.name.charAt(0)}
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 border-white dark:border-[#22252B] rounded-full ${person.status === 'sick' ? 'bg-amber-400' :
                                person.status === 'vacation' ? 'bg-rose-500' :
                                  'bg-emerald-500'
                              }`} />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{person.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-bold uppercase tracking-wider rounded inline-block">
                          {person.role === 'super_admin' ? t.role_super_admin :
                            person.role === 'supervisor' ? t.role_supervisor :
                              person.role === 'chief_accountant' ? t.role_chief_accountant :
                                person.role === 'manager' ? t.role_manager :
                                  t.role_accountant}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-bold max-w-[150px] truncate">
                        {person.phone || person.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-gray-600 dark:text-gray-400">
                        {associatedOrganizations}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 text-gray-400">
                          <button
                            onClick={(e) => { e.stopPropagation(); setForm(person); setIsAdding(true); }}
                            className="p-1.5 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            title="Tahrirlash"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm(person.name + t.confirmDelete)) onDelete(person.id); }}
                            className="p-1.5 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition-colors"
                            title="O'chirish"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      <Search size={24} className="mx-auto mb-2 opacity-20" />
                      <span className="text-xs uppercase font-bold opacity-60">Ma'lumot topilmadi</span>
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
