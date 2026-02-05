import { supabase } from './supabaseClient';
import { Company, OperationEntry, Staff, Payment, Expense } from '../types';

interface CompanyNotesFallback {
  v?: number;
  bcid?: string;
  bcn?: string;
  sid?: string;
  sn?: string;
  camt?: number;
  aperc?: number;
  bcsum?: number;
  casum?: number;
  sperc?: number;
  on?: string;
  ia?: boolean;
}

// --- helpers for status mapping between UI enums and DB enums ---
const toDbStatus = (v: string) => {
  switch (v) {
    case '+': return 'accepted';
    case '-': return 'not_submitted';
    case '0': return 'not_required';
    case 'kartoteka': return 'blocked';
    case 'OSHIBKA': return 'error';
    case '?': return 'unknown';
    case 'rad etildi': return 'rejected';
    case 'topshirildi': return 'submitted';
    case 'ariza': return 'in_progress';
    default: return 'unknown';
  }
};

const fromDbStatus = (v: string) => {
  switch (v) {
    case 'accepted': return '+';
    case 'not_submitted': return '-';
    case 'not_required': return '0';
    case 'blocked': return 'kartoteka';
    case 'error': return 'OSHIBKA';
    case 'unknown': return '?';
    case 'rejected': return 'rad etildi';
    case 'submitted': return 'topshirildi';
    case 'in_progress': return 'ariza';
    default: return '?';
  }
};

// Profiles
export const fetchProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('fetchProfile', error);
    return null;
  }
  return data;
};

// Companies
export const fetchCompanies = async (): Promise<Company[]> => {
  const { data, error } = await supabase
    .from('companies')
    .select('*, accountant:profiles!companies_accountant_id_fkey(full_name)')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchCompanies', error);
    return [];
  }
  return data.map((c) => {
    // Smart Fallback Parser
    let extra: CompanyNotesFallback = {};
    if (c.notes?.startsWith('{"v":1')) {
      try { extra = JSON.parse(c.notes); } catch (e) { }
    }

    return {
      id: c.id,
      name: c.name,
      inn: c.inn,
      accountantName: c.accountant?.full_name || c.accountant_id,
      accountantId: c.accountant_id,
      taxRegime: c.tax_regime,
      department: c.department,
      statsType: c.stats_type,
      login: c.login,
      password: c.password_encrypted,
      createdAt: c.created_at,
      // Priority: Schema Column > JSON Fallback > Default
      bankClientId: c.bank_client_id || extra.bcid,
      bankClientName: extra.bcn,
      supervisorId: c.supervisor_id || extra.sid,
      supervisorName: extra.sn,
      contractAmount: c.contract_amount ?? (extra.camt || 0),
      accountantPerc: c.accountant_perc ?? (extra.aperc || 0),
      bankClientSum: c.bank_client_sum ?? (extra.bcsum || 0),
      chiefAccountantSum: c.chief_accountant_sum ?? (extra.casum || 0),
      supervisorPerc: c.supervisor_perc ?? (extra.sperc || 0),
      ownerName: extra.on,
      isActive: c.is_active ?? (extra.ia ?? true)
    };
  }) as Company[];
};

export const upsertCompany = async (company: Company) => {
  // Serialize complex data for fallback storage in 'notes'
  const fallbackJson = JSON.stringify({
    v: 1,
    bcid: company.bankClientId,
    bcn: company.bankClientName,
    sid: company.supervisorId,
    sn: company.supervisorName,
    camt: company.contractAmount,
    aperc: company.accountantPerc,
    bcsum: company.bankClientSum,
    casum: company.chiefAccountantSum,
    sperc: company.supervisorPerc,
    on: company.ownerName,
    ia: company.isActive
  });

  const payload = {
    id: company.id,
    name: company.name,
    inn: company.inn,
    tax_regime: company.taxRegime,
    stats_type: company.statsType,
    department: company.department,
    accountant_id: company.accountantId,
    login: company.login,
    password_encrypted: company.password,
    notes: fallbackJson, // Standard field serves as JSON store
    // Also try writing to real columns if they exist (Supabase ignores non-existent columns in some clients or we catch)
    ...(company.bankClientId ? { bank_client_id: company.bankClientId } : {}),
    ...(company.supervisorId ? { supervisor_id: company.supervisorId } : {}),
    contract_amount: company.contractAmount,
    accountant_perc: company.accountantPerc,
    bank_client_sum: company.bankClientSum,
    supervisor_perc: company.supervisorPerc,
    is_active: company.isActive ?? true,
  };

  try {
    const { error } = await supabase.from('companies').upsert(payload);
    if (error) {
      // If column error, retry with ONLY standard columns (Pure Fallback)
      if (error.code === '42703') {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.bank_client_id;
        delete fallbackPayload.supervisor_id;
        delete fallbackPayload.contract_amount;
        delete fallbackPayload.accountant_perc;
        delete fallbackPayload.bank_client_sum;
        delete fallbackPayload.supervisor_perc;
        const { error: fErr } = await supabase.from('companies').upsert(fallbackPayload);
        if (fErr) throw fErr;
      } else {
        throw error;
      }
    }
  } catch (e) { console.error(e); throw e; }
};

// Operations
export const fetchOperations = async (): Promise<OperationEntry[]> => {
  const { data, error } = await supabase
    .from('operations')
    .select('*');
  if (error) {
    console.error('fetchOperations', error);
    return [];
  }
  return data.map((o) => {
    let kpiData = o.kpi;
    if (o.comment?.startsWith('{"kpi":')) {
      try { kpiData = JSON.parse(o.comment).kpi; } catch (e) { }
    }

    return {
      id: o.id,
      companyId: o.company_id,
      period: o.period,
      profitTaxStatus: fromDbStatus(o.profit_tax_status),
      form1Status: fromDbStatus(o.form1_status),
      form2Status: fromDbStatus(o.form2_status),
      statsStatus: fromDbStatus(o.stats_status),
      comment: o.comment?.startsWith('{"kpi":') ? '' : (o.comment || ''),
      updatedAt: o.updated_at,
      history: [],
      kpi: kpiData
    };
  }) as OperationEntry[];
};

export const upsertOperation = async (op: OperationEntry) => {
  const kpiStore = op.kpi ? JSON.stringify({ kpi: op.kpi }) : (op.comment || '');

  const payload = {
    id: op.id,
    company_id: op.companyId,
    period: op.period,
    profit_tax_status: toDbStatus(op.profitTaxStatus),
    form1_status: toDbStatus(op.form1Status),
    form2_status: toDbStatus(op.form2Status),
    stats_status: toDbStatus(op.statsStatus),
    comment: op.kpi ? kpiStore : op.comment, // Store KPI in comment if column missing
    kpi: op.kpi // Try real column
  };

  try {
    const { error } = await supabase.from('operations').upsert(payload);
    if (error && error.code === '42703') {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.kpi;
      const { error: fErr } = await supabase.from('operations').upsert(fallbackPayload);
      if (fErr) throw fErr;
    } else if (error) throw error;
  } catch (e) { console.error(e); throw e; }
};

// Staff
export const fetchStaff = async (): Promise<Staff[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_color, phone');
  if (error) {
    console.error('fetchStaff', error);
    return [];
  }
  return data.map((p) => ({
    id: p.id,
    name: p.full_name,
    role: p.role,
    avatarColor: p.avatar_color || 'hsl(200,50%,50%)',
    phone: p.phone,
  })) as Staff[];
};

export const upsertStaff = async (staff: Staff) => {
  const payload = {
    id: staff.id,
    full_name: staff.name,
    role: staff.role,
    avatar_color: staff.avatarColor,
    phone: staff.phone,
  };
  const { error } = await supabase.from('profiles').upsert(payload);
  if (error) throw error;
};

// KPI Metrics
export const fetchKpiMetrics = async () => {
  const { data, error } = await supabase
    .from('kpi_metrics')
    .select('*')
    .order('overall_score', { ascending: false });
  if (error) {
    console.error('fetchKpiMetrics', error);
    return [];
  }
  return data;
};

// Documents
export const fetchDocuments = async (companyId: string) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', companyId)
    .order('uploaded_at', { ascending: false });
  if (error) {
    console.error('fetchDocuments', error);
    return [];
  }
  return data;
};
// Payments
export const fetchPayments = async (): Promise<Payment[]> => {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('payment_date', { ascending: false });
  if (error) {
    console.error('fetchPayments', error);
    return [];
  }
  return data.map(p => ({
    id: p.id,
    companyId: p.company_id,
    amount: p.amount,
    period: p.period,
    paymentDate: p.payment_date,
    status: p.status,
    comment: p.comment,
    createdAt: p.created_at
  })) as Payment[];
};

export const upsertPayment = async (p: Partial<Payment>) => {
  const payload = {
    id: p.id,
    company_id: p.companyId,
    amount: p.amount,
    period: p.period,
    payment_date: p.paymentDate,
    status: p.status,
    comment: p.comment
  };
  const { error } = await supabase.from('payments').upsert(payload);
  if (error) throw error;
};

// Expenses
export const fetchExpenses = async (): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false });
  if (error) {
    console.error('fetchExpenses', error);
    return [];
  }
  return data.map(e => ({
    id: e.id,
    amount: e.amount,
    date: e.date,
    category: e.category,
    description: e.description,
    createdAt: e.created_at
  })) as Expense[];
};

export const upsertExpense = async (e: Partial<Expense>) => {
  const payload = {
    id: e.id,
    amount: e.amount,
    date: e.date,
    category: e.category,
    description: e.description
  };
  const { error } = await supabase.from('expenses').upsert(payload);
  if (error) throw error;
};
