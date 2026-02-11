import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Company, OperationEntry, OperationTask, TaskStatus, Language, OperationFieldKey } from '../types';
import { translations } from '../lib/translations';
import { OPERATION_TEMPLATES, MAP_JSON_FIELD_TO_KEY } from '../lib/operationTemplates';
import { Search, Filter, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronRight, ShieldCheck, UserCheck, LayoutGrid, List, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  companies: Company[];
  operations: OperationEntry[];
  activeFilter?: string;
  selectedPeriod: string;
  onPeriodChange: (p: string) => void;
  lang: Language;
  onUpdate: (op: OperationEntry) => void;
  onBatchUpdate?: (ops: OperationEntry[]) => void;
  onCompanySelect: (c: Company) => void;
  userRole: string;
  currentUserId?: string;
}

const OperationModule: React.FC<Props> = ({
  companies,
  operations,
  activeFilter = 'all',
  selectedPeriod,
  onPeriodChange,
  lang,
  onUpdate,
  onBatchUpdate,
  onCompanySelect,
  userRole,
  currentUserId
}) => {
  const t = translations[lang];
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix'); // Admin can toggle
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCompanyForEdit, setSelectedCompanyForEdit] = useState<Company | null>(null);
  const [editingTasks, setEditingTasks] = useState<string[]>([]); // List of active template keys
  const [isSyncing, setIsSyncing] = useState(false);
  const [activePicker, setActivePicker] = useState<{ companyId: string, templateKey: string } | null>(null);

  const normalizeName = (name: string) => {
    return name.toLowerCase()
      .replace(/["'“”«»]/g, '')
      .replace(/mchj|xk|fx|ok|llc|oao|ooo|чп|хк|ок|мчж|латлар/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // --- Helper Functions ---
  const getTaskStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'approved': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400';
      case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
      case 'submitted': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
      case 'pending_review': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
      case 'blocked': return 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-400';
      case 'overdue': return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400';
      case 'not_required': return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'approved': return <span className="font-bold text-sm leading-none">+</span>;
      case 'rejected': return <span className="font-bold text-[9px] uppercase tracking-tighter leading-none">rad</span>;
      case 'submitted': return <span className="font-bold text-sm leading-none">✓</span>;
      case 'pending_review': return <span className="text-[8px] font-bold uppercase leading-[0.8] tracking-tighter text-center px-0.5">ariza</span>;
      case 'blocked': return <span className="text-[8px] font-bold uppercase leading-[0.8] tracking-tighter text-center px-0.5">karto<br />teka</span>;
      case 'overdue': return <span className="font-bold text-sm leading-none">-</span>;
      case 'not_required': return <span className="font-bold text-xs opacity-60">0</span>;
      case 'new': return <span className="text-gray-400/50 font-bold">-</span>;
      default: return <span className="text-gray-400/50 font-bold">-</span>;
    }
  }



  // --- Actions ---
  const handleQuickToggle = async (companyId: string, templateKey: string) => {
    if (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'supervisor') return;

    const op = operations.find(o => o.companyId === companyId && o.period === selectedPeriod);
    let updatedTasks = [...(op?.tasks || [])];
    const existingIndex = updatedTasks.findIndex(t => t.templateKey === templateKey);

    if (existingIndex >= 0) {
      const currentStatus = updatedTasks[existingIndex].status;
      // Toggle between 'new' and 'not_required'
      updatedTasks[existingIndex] = {
        ...updatedTasks[existingIndex],
        status: currentStatus === 'not_required' ? 'new' : 'not_required'
      };
    } else {
      // Create new task
      const tmpl = OPERATION_TEMPLATES.find(t => t.key === templateKey);
      const company = companies.find(c => c.id === companyId);
      if (!tmpl || !company) return;

      updatedTasks.push({
        id: generateUUID(),
        companyId: company.id,
        companyName: company.name,
        templateKey: tmpl.key,
        templateName: lang === 'uz' ? tmpl.nameUz : tmpl.nameRu,
        assigneeName: company.accountantName || 'Tayinlanmagan',
        controllerName: 'Nazorat',
        period: selectedPeriod,
        deadline: new Date().toISOString(),
        status: 'approved', // Default to approved when manually toggled on
        jsonValue: '+'
      });
    }

    const newOp: OperationEntry = op ? {
      ...op,
      tasks: updatedTasks,
      updatedAt: new Date().toISOString()
    } : {
      id: generateUUID(),
      companyId: companyId,
      period: selectedPeriod,
      profitTaxStatus: '?' as any,
      form1Status: '?' as any,
      form2Status: '?' as any,
      statsStatus: '?' as any,
      tasks: updatedTasks,
      updatedAt: new Date().toISOString(),
      history: []
    };

    try {
      await onUpdate(newOp);
      toast.success("Operatsiya holati yangilandi");
    } catch (e) {
      toast.error("Xatolik yuz berdi");
    }
  };

  // --- Auto-Sync Logic ---
  const handleSyncFromJson = async (silent = false) => {
    if (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'supervisor') return;

    if (!silent) setIsSyncing(true);

    try {
      const response = await fetch('/Firma online.json');
      if (!response.ok) throw new Error('JSON faylni yuklab bo\'lmadi');
      const data: any[] = await response.json();

      const batchUpdates: OperationEntry[] = [];

      for (const item of data) {
        const inn = String(item["ИНН"] || '').trim();
        const rawName = String(item["НАИМЕНОВАНИЯ"] || '').trim();
        const normName = normalizeName(rawName);

        // Find company by INN or Fuzzy Name
        const company = companies.find(c => {
          if (inn && c.inn === inn) return true;
          if (normalizeName(c.name) === normName) return true;
          return false;
        });

        if (!company) continue;

        const existingOp = operations.find(o => o.companyId === company.id && o.period === selectedPeriod);
        let updatedTasks = [...(existingOp?.tasks || [])];
        let hasChanges = false;

        for (const [jsonKey, templateKey] of Object.entries(MAP_JSON_FIELD_TO_KEY)) {
          const jsonValue = item[jsonKey];
          if (jsonValue === undefined) continue;

          const valStr = String(jsonValue).trim().toLowerCase();
          let status: TaskStatus = 'new';

          if (valStr === '+' || valStr === 'topshirildi') status = 'approved';
          else if (valStr === '0' || valStr === 'not_required') status = 'not_required';
          else if (valStr === 'kartoteka') status = 'blocked';
          else if (valStr.includes('ariza') || valStr === 'in_progress') status = 'pending_review';
          else if (valStr === 'rad etildi') status = 'rejected';
          else if (valStr === '-') status = 'new';
          else if (valStr === '?') status = 'new';

          const existingTaskIndex = updatedTasks.findIndex(t => t.templateKey === templateKey);

          if (existingTaskIndex >= 0) {
            if (updatedTasks[existingTaskIndex].status !== status || updatedTasks[existingTaskIndex].jsonValue !== String(jsonValue)) {
              updatedTasks[existingTaskIndex] = {
                ...updatedTasks[existingTaskIndex],
                status,
                jsonValue: String(jsonValue)
              };
              hasChanges = true;
            }
          } else {
            const tmpl = OPERATION_TEMPLATES.find(t => t.key === templateKey);
            if (tmpl) {
              updatedTasks.push({
                id: generateUUID(),
                companyId: company.id,
                companyName: company.name,
                templateKey: templateKey as any,
                templateName: lang === 'uz' ? tmpl.nameUz : tmpl.nameRu,
                assigneeName: company.accountantName || 'Tayinlanmagan',
                controllerName: 'Nazorat',
                period: selectedPeriod,
                deadline: new Date().toISOString(),
                status,
                jsonValue: String(jsonValue)
              });
              hasChanges = true;
            }
          }
        }

        if (hasChanges) {
          const newOp: OperationEntry = existingOp ? {
            ...existingOp,
            tasks: updatedTasks,
            updatedAt: new Date().toISOString()
          } : {
            id: generateUUID(),
            companyId: company.id,
            period: selectedPeriod,
            profitTaxStatus: '?' as any,
            form1Status: '?' as any,
            form2Status: '?' as any,
            statsStatus: '?' as any,
            tasks: updatedTasks,
            updatedAt: new Date().toISOString(),
            history: []
          };
          batchUpdates.push(newOp);
        }
      }

      if (batchUpdates.length > 0) {
        if (onBatchUpdate) {
          await onBatchUpdate(batchUpdates);
        } else {
          for (const op of batchUpdates) {
            await onUpdate(op);
          }
        }
        if (!silent) toast.success(`${batchUpdates.length} ta firmaning operatsiyalari yangilandi`);
      } else {
        if (!silent) toast.info('Yangi o\'zgarishlar topilmadi');
      }
    } catch (e: any) {
      console.error('Auto-sync error:', e);
      if (!silent) toast.error('Sinxronizatsiyada xatolik: ' + e.message);
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'supervisor') {
      const timer = setTimeout(() => {
        handleSyncFromJson(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [selectedPeriod, companies.length]);

  const handleTaskStatusChange = async (companyId: string, taskKey: string, newStatus: TaskStatus) => {
    if (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'supervisor') return;

    // Find the operation entry
    const operation = operations.find(o => o.companyId === companyId && o.period === selectedPeriod);
    let updatedTasks = [...(operation?.tasks || [])];
    const existingIndex = updatedTasks.findIndex(t => t.templateKey === taskKey);

    if (existingIndex >= 0) {
      updatedTasks[existingIndex] = {
        ...updatedTasks[existingIndex],
        status: newStatus,
        verifiedAt: newStatus === 'approved' ? new Date().toISOString() : undefined,
        submittedAt: newStatus === 'submitted' ? new Date().toISOString() : updatedTasks[existingIndex].submittedAt
      };
    } else {
      const tmpl = OPERATION_TEMPLATES.find(t => t.key === taskKey);
      const company = companies.find(c => c.id === companyId);
      if (tmpl && company) {
        updatedTasks.push({
          id: generateUUID(),
          companyId: company.id,
          companyName: company.name,
          templateKey: taskKey as any,
          templateName: lang === 'uz' ? tmpl.nameUz : tmpl.nameRu,
          assigneeName: company.accountantName || 'Tayinlanmagan',
          controllerName: 'Nazorat',
          period: selectedPeriod,
          deadline: new Date().toISOString(),
          status: newStatus,
          jsonValue: '-'
        });
      }
    }

    const updatedOp: OperationEntry = operation ? {
      ...operation,
      tasks: updatedTasks,
      updatedAt: new Date().toISOString()
    } : {
      id: generateUUID(),
      companyId,
      period: selectedPeriod,
      profitTaxStatus: '?' as any,
      form1Status: '?' as any,
      form2Status: '?' as any,
      statsStatus: '?' as any,
      tasks: updatedTasks,
      updatedAt: new Date().toISOString(),
      history: []
    };

    try {
      await onUpdate(updatedOp);
      setActivePicker(null);
      if (newStatus !== 'approved' || (activePicker)) {
        toast.success(`Status o'zgartirildi: ${newStatus}`);
      }
    } catch (e) {
      toast.error("Xatolik yuz berdi");
      console.error(e);
    }
  };


  const handleExportToExcel = () => {
    // Basic CSV export that Excel can open (with BOM for UTF-8)
    const header = ['Firma Nomi', 'INN', ...OPERATION_TEMPLATES.map(t => lang === 'uz' ? t.nameUz : t.nameRu)];
    const rows = filteredData.map(({ company, tasks }) => {
      const row = [company.name, company.inn];
      OPERATION_TEMPLATES.forEach(tmpl => {
        const task = tasks.find(t => t.templateKey === tmpl.key);
        row.push(task ? task.status : '-');
      });
      return row;
    });

    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `operatsiyalar_${selectedPeriod}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel (CSV) fayli tayyorlandi");
  };

  // --- Data Filtering ---
  const periods = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const list = [`${currentYear} Yillik`];
    for (let i = 0; i < 12; i++) {
      const month = String(i + 1).padStart(2, '0');
      list.push(`${currentYear}-${month}`);
    }
    return list;
  }, []);

  const filteredData = useMemo(() => {
    let filteredCompanies = companies;

    if (search) {
      const lowerSearch = search.toLowerCase();
      filteredCompanies = filteredCompanies.filter(c =>
        c.name.toLowerCase().includes(lowerSearch) ||
        c.inn.includes(lowerSearch) ||
        (c.accountantName && c.accountantName.toLowerCase().includes(lowerSearch))
      );
    }

    // Role-based filtering
    if (userRole === 'accountant' && currentUserId) {
      // Staff only sees their own companies
      filteredCompanies = filteredCompanies.filter(c => c.accountantId === currentUserId);
    }
    // Supervisors might see all or assigned ones - assuming all for now or handled by company.supervisorId
    // If strict supervisor view needed:
    // if (userRole === 'supervisor' && currentUserId) {
    //    filteredCompanies = filteredCompanies.filter(c => c.supervisorId === currentUserId);
    // }

    // Pre-calculate operations map for O(1) lookup
    const map = new Map<string, OperationEntry>();
    operations.forEach(o => {
      if (o.period === selectedPeriod) {
        map.set(o.companyId, o);
      }
    });

    return filteredCompanies.map(company => {
      const op = map.get(company.id);
      const tasks = op?.tasks || [];
      return { company, op, tasks };
    });
  }, [companies, operations, search, selectedPeriod, userRole, currentUserId]);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const top = topScrollRef.current;
    const bottom = bottomScrollRef.current;
    if (!top || !bottom) return;

    const syncTop = () => {
      if (bottom.scrollLeft !== top.scrollLeft) {
        bottom.scrollLeft = top.scrollLeft;
      }
    };
    const syncBottom = () => {
      if (top.scrollLeft !== bottom.scrollLeft) {
        top.scrollLeft = bottom.scrollLeft;
      }
    };

    top.addEventListener('scroll', syncTop);
    bottom.addEventListener('scroll', syncBottom);
    return () => {
      top.removeEventListener('scroll', syncTop);
      bottom.removeEventListener('scroll', syncBottom);
    };
  }, []);


  // --- Actions ---

  const openEditModal = (company: Company) => {
    if (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'supervisor') {
      onCompanySelect(company);
      return;
    }

    setSelectedCompanyForEdit(company);
    // Find current tasks
    const op = operations.find(o => o.companyId === company.id && o.period === selectedPeriod);
    if (op?.tasks) {
      const activeKeys = op.tasks.filter(t => t.status !== 'not_required').map(t => t.templateKey);
      setEditingTasks(activeKeys);
    } else {
      setEditingTasks([]);
    }
    setIsModalOpen(true);
  };

  const handleSaveOperations = async () => {
    if (!selectedCompanyForEdit) return;

    const op = operations.find(o => o.companyId === selectedCompanyForEdit.id && o.period === selectedPeriod);
    let existingTasks = op?.tasks || [];

    // 1. Process active keys (ensure they exist with 'new' or keep existing status)
    const updatedTasks = [...existingTasks];

    OPERATION_TEMPLATES.forEach(tmpl => {
      const isEnabled = editingTasks.includes(tmpl.key);
      const existingIndex = updatedTasks.findIndex(t => t.templateKey === tmpl.key);

      if (isEnabled) {
        if (existingIndex >= 0) {
          // If it was 'not_required', reset to 'new'
          if (updatedTasks[existingIndex].status === 'not_required') {
            updatedTasks[existingIndex] = {
              ...updatedTasks[existingIndex],
              status: 'new'
            };
          }
        } else {
          // Create new task
          updatedTasks.push({
            id: generateUUID(),
            companyId: selectedCompanyForEdit.id,
            companyName: selectedCompanyForEdit.name,
            templateKey: tmpl.key,
            templateName: lang === 'uz' ? tmpl.nameUz : tmpl.nameRu,
            assigneeName: selectedCompanyForEdit.accountantName || 'Tayinlanmagan',
            controllerName: 'Nazorat',
            period: selectedPeriod,
            deadline: new Date().toISOString(), // Todo: calculate real deadline
            status: 'new',
            jsonValue: '+'
          });
        }
      } else {
        // Disable it
        if (existingIndex >= 0) {
          updatedTasks[existingIndex] = {
            ...updatedTasks[existingIndex],
            status: 'not_required'
          };
        }
      }
    });

    const newOp: OperationEntry = op ? {
      ...op,
      tasks: updatedTasks,
      updatedAt: new Date().toISOString()
    } : {
      // Create new operation entry if doesn't exist
      id: generateUUID(),
      companyId: selectedCompanyForEdit.id,
      period: selectedPeriod,
      profitTaxStatus: '?' as any,
      form1Status: '?' as any,
      form2Status: '?' as any,
      statsStatus: '?' as any,
      tasks: updatedTasks,
      updatedAt: new Date().toISOString(),
      history: []
    };

    try {
      await onUpdate(newOp);
      setIsModalOpen(false);
      toast.success("Operatsiyalar yangilandi");
    } catch (e) {
      toast.error("Saqlashda xatolik");
    }
  };

  const renderOperationsModal = () => {
    if (!isModalOpen || !selectedCompanyForEdit) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-fade-in">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h3 className="text-xl font-bold">{selectedCompanyForEdit.name} - Operatsiyalar</h3>
            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full text-gray-400">
              <XCircle size={24} />
            </button>
          </div>

          <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/5 flex gap-3">
            <button
              onClick={() => setEditingTasks(OPERATION_TEMPLATES.map(t => t.key))}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Hammasini belgilash
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => setEditingTasks([])}
              className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline"
            >
              Hammasini o'chirish
            </button>
          </div>

          <div className="overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {OPERATION_TEMPLATES.map(tmpl => (
              <div
                key={tmpl.key}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${editingTasks.includes(tmpl.key)
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-500/50'
                  }`}
                onClick={() => {
                  if (editingTasks.includes(tmpl.key)) {
                    setEditingTasks(prev => prev.filter(k => k !== tmpl.key));
                  } else {
                    setEditingTasks(prev => [...prev, tmpl.key]);
                  }
                }}
              >
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${editingTasks.includes(tmpl.key)
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-transparent'
                  }`}>
                  {editingTasks.includes(tmpl.key) && <CheckCircle2 size={14} />}
                </div>
                <span className="font-medium text-sm">{lang === 'uz' ? tmpl.nameUz : tmpl.nameRu}</span>
              </div>
            ))}
          </div>

          <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-white/5">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSaveOperations}
              className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 transition-all active:scale-95"
            >
              Saqlash
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- Render Views ---

  // --- Sub-renderers ---
  const renderStatusLegend = () => (
    <div className="flex flex-wrap items-center gap-4 mb-4 px-5 py-3.5 bg-white/50 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-gray-100 dark:border-white/10 overflow-x-auto no-scrollbar shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-2 whitespace-nowrap">{t.legend}:</div>
      {[
        { s: 'approved', label: '+', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
        { s: 'pending_review', label: 'ariza', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
        { s: 'blocked', label: 'kartoteka', color: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-400' },
        { s: 'rejected', label: 'rad', color: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
        { s: 'not_required', label: '0', color: 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-500' },
        { s: 'new', label: '-', color: 'bg-gray-50 text-gray-300 dark:bg-white/5 dark:text-gray-600' }
      ].map(item => (
        <div key={item.s} className="flex items-center gap-2 whitespace-nowrap group/legend cursor-default">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover/legend:scale-110 ${item.color} shadow-sm border border-white/20`}>
            {getStatusIcon(item.s as TaskStatus)}
          </div>
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 lowercase">{t[item.s as keyof typeof t] || item.s}</span>
        </div>
      ))}
    </div>
  );

  // 1. Matrix View (Admin/Supervisor)
  const renderMatrixView = () => (
    <div className="flex flex-col gap-4">
      {renderStatusLegend()}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-[2.5rem] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-2xl relative group ring-1 ring-black/5 dark:ring-white/5">
        {/* --- TOP SYNCHRONIZED SCROLLBAR --- */}
        <div
          ref={topScrollRef}
          className="overflow-x-auto h-4 bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-800 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
        >
          <div style={{ width: `${300 + (OPERATION_TEMPLATES.length * 100)}px`, height: '1px' }}></div>
        </div>

        <div ref={bottomScrollRef} className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm text-left border-collapse min-w-[300px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-800">
                <th className="p-4 font-black text-xs uppercase tracking-widest text-gray-500 sticky left-0 bg-gray-50 dark:bg-[#1C1C1E] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-none min-w-[200px]">
                  Firma Nomi
                </th>
                {OPERATION_TEMPLATES.map(tmpl => (
                  <th key={tmpl.key} className="p-4 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span>{lang === 'uz' ? tmpl.nameUz : tmpl.nameRu}</span>
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full text-gray-400">
                        {tmpl.deadlineDay}-sana
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredData.map(({ company, tasks }) => (
                <tr key={company.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
                  <td className="p-4 font-medium sticky left-0 bg-white dark:bg-[#1C1C1E] group-hover:bg-gray-50 dark:group-hover:bg-[#2C2C2E] transition-colors z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-none border-r border-transparent dark:border-gray-800">
                    <div
                      className="w-full truncate cursor-pointer hover:text-blue-500 transition-colors"
                      onClick={() => openEditModal(company)}
                    >
                      {company.name}
                    </div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{company.inn}</div>
                  </td>
                  {OPERATION_TEMPLATES.map(tmpl => {
                    const task = tasks.find(t => t.templateKey === tmpl.key);
                    const status = task ? task.status : 'new';

                    return (
                      <td
                        key={tmpl.key}
                        className={`p-2 text-center transition-all cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-500/10 group/cell relative`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'supervisor') {
                            setActivePicker(activePicker?.companyId === company.id && activePicker?.templateKey === tmpl.key ? null : { companyId: company.id, templateKey: tmpl.key });
                          } else {
                            openEditModal(company);
                          }
                        }}
                      >
                        {/* Click-away backdrop */}
                        {activePicker?.companyId === company.id && activePicker?.templateKey === tmpl.key && (
                          <div
                            className="fixed inset-0 z-40 bg-transparent"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePicker(null);
                            }}
                          />
                        )}

                        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${getTaskStatusColor(status)} transition-all duration-300 group-hover/cell:scale-110 shadow-sm border-2 border-transparent group-hover/cell:border-white/20 dark:group-hover/cell:border-white/10`} title={`${t[status as keyof typeof t] || status} ${task?.comment ? '- ' + task.comment : ''}`}>
                          {getStatusIcon(status)}
                        </div>

                        {/* Status Picker Popover */}
                        {
                          activePicker?.companyId === company.id && activePicker?.templateKey === tmpl.key && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white dark:bg-[#2C2C2E] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 min-w-[120px] animate-in fade-in zoom-in duration-200">
                              {[
                                { s: 'approved', label: '+', color: 'text-emerald-500' },
                                { s: 'pending_review', label: 'ariza', color: 'text-amber-500' },
                                { s: 'blocked', label: 'kartoteka', color: 'text-orange-500' },
                                { s: 'rejected', label: 'rad', color: 'text-red-500' },
                                { s: 'not_required', label: '0', color: 'text-gray-400' },
                                { s: 'new', label: '-', color: 'text-gray-300' }
                              ].map(item => (
                                <button
                                  key={item.s}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTaskStatusChange(company.id, tmpl.key, item.s as TaskStatus);
                                  }}
                                  className={`flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-xs font-bold ${item.color}`}
                                >
                                  <span>{item.label}</span>
                                  {status === item.s && <CheckCircle2 size={12} />}
                                </button>
                              ))}
                            </div>
                          )
                        }
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // 2. Staff List View (Detailed)
  const renderStaffView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {filteredData.map(({ company, tasks }) => {
        // Only show companies that have tasks (filteredData already handles user role)
        if (tasks.filter(t => t.status !== 'not_required').length === 0) return null;

        return (
          <div key={company.id} className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-2xl p-5 hover:border-blue-500/30 transition-all shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-lg">{company.name}</h3>
                <p className="text-sm text-gray-400">{company.inn} • {company.region || 'Toshkent'}</p>
              </div>
              <div className="bg-gray-50 dark:bg-white/5 px-2 py-1 rounded-lg text-xs font-mono text-gray-500">
                {tasks.filter(t => t.status === 'approved').length} / {tasks.filter(t => t.status !== 'not_required').length}
              </div>
            </div>

            <div className="space-y-3">
              {tasks.filter(t => t.status !== 'not_required').map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-black/20 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getTaskStatusColor(task.status)}`}>
                      {getStatusIcon(task.status)}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{task.templateName}</div>
                      <div className="text-xs text-gray-400">
                        Deadline: {new Date(task.deadline).getDate()}-sana
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {task.status === 'new' && (
                      <button
                        onClick={() => handleTaskStatusChange(company.id, task.templateKey, 'submitted')}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      >
                        Topshirish
                      </button>
                    )}
                    {task.status === 'rejected' && (
                      <button
                        onClick={() => handleTaskStatusChange(company.id, task.templateKey, 'submitted')}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      >
                        Qayta topshirish
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  );

  // 3. Nazoratchi View (Supervisor)
  const renderSupervisorView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-500 text-white rounded-[2rem] p-6 relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-blue-100 mb-1">Kutilmoqda</div>
            <div className="text-4xl font-bold">12</div>
            <div className="text-sm mt-2">Tasdiqlash uchun kutayotgan hisobotlar</div>
          </div>
          <div className="absolute -right-5 -bottom-5 opacity-20 transform rotate-12">
            <Clock size={100} />
          </div>
        </div>
        <div className="bg-emerald-500 text-white rounded-[2rem] p-6 relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-emerald-100 mb-1">Tasdiqlandi</div>
            <div className="text-4xl font-bold">145</div>
            <div className="text-sm mt-2">Ushbu oy uchun muvaffaqiyatli</div>
          </div>
          <div className="absolute -right-5 -bottom-5 opacity-20 transform rotate-12">
            <ShieldCheck size={100} />
          </div>
        </div>
        <div className="bg-rose-500 text-white rounded-[2rem] p-6 relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-rose-100 mb-1">Rad etildi</div>
            <div className="text-4xl font-bold">3</div>
            <div className="text-sm mt-2">Qayta ishlash talab etiladi</div>
          </div>
          <div className="absolute -right-5 -bottom-5 opacity-20 transform rotate-12">
            <AlertTriangle size={100} />
          </div>
        </div>
      </div>

      {/* Pending Tasks List */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-[2.5rem] border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-6 px-2">Tasdiqlashni kutayotgan vazifalar</h3>
        <div className="space-y-4">
          {filteredData.flatMap(d => d.tasks).filter(t => t.status === 'pending_review').map(task => (
            <div key={task.id} className="flex flex-col md:flex-row items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-transparent hover:border-gray-200 dark:hover:border-white/10 transition-all">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Clock size={20} />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">{task.companyName}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{task.templateName} • {task.assigneeName}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4 md:mt-0 w-full md:w-auto">
                <div className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-white/10 text-xs font-mono text-gray-500">
                  {task.jsonValue}
                </div>
                <button
                  onClick={() => handleTaskStatusChange(task.companyId, task.templateKey, 'approved')}
                  className="flex-1 md:flex-none px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Tasdiqlash
                </button>
                <button
                  onClick={() => handleTaskStatusChange(task.companyId, task.templateKey, 'rejected')}
                  className="flex-1 md:flex-none px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Rad etish
                </button>
              </div>
            </div>
          ))}

          {filteredData.flatMap(d => d.tasks).filter(t => t.status === 'pending_review').length === 0 && (
            <div className="text-center py-10 text-gray-400">
              Hozircha tekshiruv uchun vazifalar yo'q
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-24">
      {/* Header Controls */}
      <div className="bg-white dark:bg-[#1C1C1E] p-6 md:p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
            {userRole === 'accountant' ? 'Mening Vazifalarim' : userRole === 'supervisor' ? 'Nazorat Markazi' : t.reports}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {selectedPeriod} davri uchun operatsiyalar holati
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
          {/* Period Selector */}
          <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-2xl w-full md:w-auto items-center">
            <div className="flex overflow-x-auto scrollbar-none gap-1 max-w-[300px] md:max-w-none">
              {periods.map(p => (
                <button
                  key={p}
                  onClick={() => onPeriodChange(p)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${selectedPeriod === p
                    ? 'bg-white dark:bg-white/10 shadow-sm text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                >
                  {p.endsWith('Yillik') ? p : new Date(p + '-01').toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU', { month: 'long' })}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={handleExportToExcel}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-white/5 border border-emerald-100 dark:border-emerald-800 rounded-xl text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-white/10 transition-all shadow-sm active:scale-95"
              title="Excelga yuklab olish"
            >
              <Download size={18} />
              <span className="hidden sm:inline">Excelga</span>
            </button>

            {/* View Toggle for Admin */}
            {userRole !== 'accountant' && userRole !== 'supervisor' && (
              <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-xl">
                <button
                  onClick={() => setViewMode('matrix')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'matrix' ? 'bg-white dark:bg-white/10 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}
                  title="Matrix View"
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-white/10 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}
                  title="List View"
                >
                  <List size={18} />
                </button>
              </div>
            )}

            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Izlash..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-white/5 border-none rounded-xl focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {userRole === 'accountant' ? renderStaffView() :
        userRole === 'supervisor' ? renderSupervisorView() :
          renderMatrixView()}

      {filteredData.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-white/5 mb-4 text-gray-400">
            <Filter size={32} />
          </div>
          <p className="text-gray-500 dark:text-gray-400">Ma'lumot topilmadi</p>
        </div>
      )}

      {renderOperationsModal()}
    </div>
  );
};

export default OperationModule;
