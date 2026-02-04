import { supabase } from './supabaseClient';
import { Company, OperationEntry, Staff } from '../types';

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
  return data.map((c) => ({
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
  })) as Company[];
};

export const upsertCompany = async (company: Company) => {
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
  };
  const { error } = await supabase.from('companies').upsert(payload);
  if (error) throw error;
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
  return data.map((o) => ({
    id: o.id,
    companyId: o.company_id,
    period: o.period,
    profitTaxStatus: fromDbStatus(o.profit_tax_status),
    form1Status: fromDbStatus(o.form1_status),
    form2Status: fromDbStatus(o.form2_status),
    statsStatus: fromDbStatus(o.stats_status),
    comment: o.comment || '',
    updatedAt: o.updated_at,
    history: [],
  })) as OperationEntry[];
};

export const upsertOperation = async (op: OperationEntry) => {
  const payload = {
    id: op.id,
    company_id: op.companyId,
    period: op.period,
    profit_tax_status: toDbStatus(op.profitTaxStatus),
    form1_status: toDbStatus(op.form1Status),
    form2_status: toDbStatus(op.form2Status),
    stats_status: toDbStatus(op.statsStatus),
    comment: op.comment,
  };
  const { error } = await supabase.from('operations').upsert(payload);
  if (error) throw error;
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
