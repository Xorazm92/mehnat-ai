import { supabase } from './supabaseClient';
import {
  Company,
  OperationEntry,
  Staff,
  Payment,
  Expense,
  StatsType,
  TaxRegime,
  ReportStatus,
  Document,
  ClientCredential,
  ClientHistory,
  KPIRule,
  MonthlyPerformance,
  PayrollAdjustment,
  EmployeeSalarySummary,
  ClientAssignment,
  ClientAssignmentRole
} from '../types';

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

// =====================================================
// AVTOMATIK KPI TIZIMI — DATA LAYER
// =====================================================

// 1. KPI Rules
export const fetchKPIRules = async (): Promise<KPIRule[]> => {
  const { data, error } = await supabase
    .from('kpi_rules')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('fetchKPIRules error:', error);
    return [];
  }

  return data.map(r => ({
    id: r.id,
    name: r.name,
    nameUz: r.name_uz,
    role: r.role,
    rewardPercent: r.reward_percent,
    penaltyPercent: r.penalty_percent,
    inputType: r.input_type,
    category: r.category,
    description: r.description,
    isActive: r.is_active,
    sortOrder: r.sort_order
  }));
};

export const upsertKPIRule = async (rule: Partial<KPIRule>) => {
  const payload = {
    id: rule.id,
    name: rule.name,
    name_uz: rule.nameUz,
    input_type: rule.inputType,
    category: rule.category,
    description: rule.description,
    is_active: rule.isActive,
    sort_order: rule.sortOrder,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('kpi_rules').upsert(payload);
  if (error) throw error;
};

// 2. Monthly Performance
export const fetchMonthlyPerformance = async (month: string, companyId?: string, employeeId?: string): Promise<MonthlyPerformance[]> => {
  let query = supabase
    .from('monthly_performance')
    .select('*, rule:kpi_rules(name, name_uz), company:companies(name), employee:profiles(full_name)')
    .eq('month', month);

  if (companyId) query = query.eq('company_id', companyId);
  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error } = await query;

  if (error) {
    console.error('fetchMonthlyPerformance error:', error);
    return [];
  }

  return data.map(p => ({
    id: p.id,
    month: p.month,
    companyId: p.company_id,
    companyName: p.company?.name,
    employeeId: p.employee_id,
    employeeName: p.employee?.full_name,
    ruleId: p.rule_id,
    ruleName: p.rule?.name,
    ruleNameUz: p.rule?.name_uz,
    value: p.value,
    calculatedScore: p.calculated_score,
    notes: p.notes,
    changeReason: p.change_reason,
    recordedBy: p.recorded_by,
    recordedAt: p.recorded_at
  }));
};

export const upsertMonthlyPerformance = async (perf: Partial<MonthlyPerformance>) => {
  const payload = {
    id: perf.id,
    month: perf.month,
    company_id: perf.companyId,
    employee_id: perf.employeeId,
    rule_id: perf.ruleId,
    value: perf.value,
    notes: perf.notes,
    recorded_at: new Date().toISOString()
  };

  // Note: calculated_score is handled by DB trigger
  const { error } = await supabase.from('monthly_performance').upsert(payload);
  if (error) throw error;
};

// 3. Payroll Adjustments
export const fetchPayrollAdjustments = async (month: string, employeeId?: string): Promise<PayrollAdjustment[]> => {
  let query = supabase
    .from('payroll_adjustments')
    .select('*')
    .eq('month', month);

  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error } = await query;

  if (error) {
    console.error('fetchPayrollAdjustments error:', error);
    return [];
  }

  return data.map(a => ({
    id: a.id,
    month: a.month,
    employeeId: a.employee_id,
    adjustmentType: a.adjustment_type,
    amount: a.amount,
    reason: a.reason,
    approvedBy: a.approved_by,
    isApproved: a.is_approved,
    createdAt: a.created_at
  }));
};

export const upsertPayrollAdjustment = async (adj: Partial<PayrollAdjustment>) => {
  const payload = {
    id: adj.id,
    month: adj.month,
    employee_id: adj.employeeId,
    adjustment_type: adj.adjustmentType,
    amount: adj.amount,
    reason: adj.reason,
    is_approved: adj.isApproved
  };

  const { error } = await supabase.from('payroll_adjustments').upsert(payload);
  if (error) throw error;
};

// 4. Calculate Salary (via Database Function)
export const calculateEmployeeSalary = async (employeeId: string, month: string): Promise<EmployeeSalarySummary | null> => {
  const { data, error } = await supabase.rpc('calculate_employee_salary', {
    p_employee_id: employeeId,
    p_month: month
  });

  if (error) {
    console.error('calculateEmployeeSalary error:', error);
    return null;
  }

  // Also get list of companies for this employee to count them
  // This is a rough estimation, the DB function does it more accurately for calculations
  const { count } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .or(`accountant_id.eq.${employeeId},bank_client_id.eq.${employeeId},supervisor_id.eq.${employeeId}`)
    .eq('is_active', true);

  // Fetch employee details
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', employeeId)
    .single();

  if (data && data.length > 0) {
    const result = data[0];
    return {
      employeeId,
      employeeName: profile?.full_name || 'Unknown',
      employeeRole: profile?.role || 'staff',
      month,
      companyCount: count || 0,
      baseSalary: result.base_salary,
      kpiBonus: result.kpi_bonus,
      kpiPenalty: result.kpi_penalty,
      adjustments: result.adjustments,
      totalSalary: result.total_salary,
      performanceDetails: result.details
    };
  }

  return null;
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
      isActive: c.is_active ?? (extra.ia ?? true),
      // Tab 1: PASPORT fields
      brandName: c.brand_name,
      directorName: c.director_name,
      directorPhone: c.director_phone,
      legalAddress: c.legal_address,
      founderName: c.founder_name,
      logoUrl: c.logo_url,
      certificateFilePath: c.certificate_file_path,
      charterFilePath: c.charter_file_path,
      // Tab 2: SOLIQ fields
      vatCertificateDate: c.vat_certificate_date,
      hasLandTax: c.has_land_tax ?? false,
      hasWaterTax: c.has_water_tax ?? false,
      hasPropertyTax: c.has_property_tax ?? false,
      hasExciseTax: c.has_excise_tax ?? false,
      hasAuctionTax: c.has_auction_tax ?? false,
      oneCStatus: c.one_c_status,
      oneCLocation: c.one_c_location,
      // Tab 5: SHARTNOMA fields
      contractNumber: c.contract_number,
      contractDate: c.contract_date,
      paymentDay: c.payment_day ?? 5,
      firmaSharePercent: c.firma_share_percent ?? 50,
      currentBalance: c.current_balance ?? 0,
      // Tab 6: XAVF fields
      companyStatus: c.company_status ?? 'active',
      riskLevel: c.risk_level ?? 'low',
      riskNotes: c.risk_notes
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
    notes: fallbackJson,
    ...(company.bankClientId ? { bank_client_id: company.bankClientId } : {}),
    ...(company.supervisorId ? { supervisor_id: company.supervisorId } : {}),
    contract_amount: company.contractAmount,
    accountant_perc: company.accountantPerc,
    bank_client_sum: company.bankClientSum,
    supervisor_perc: company.supervisorPerc,
    is_active: company.isActive ?? true,
    // Tab 1: PASPORT
    brand_name: company.brandName,
    director_name: company.directorName,
    director_phone: company.directorPhone,
    legal_address: company.legalAddress,
    founder_name: company.founderName,
    logo_url: company.logoUrl,
    certificate_file_path: company.certificateFilePath,
    charter_file_path: company.charterFilePath,
    // Tab 2: SOLIQ
    vat_certificate_date: company.vatCertificateDate,
    has_land_tax: company.hasLandTax,
    has_water_tax: company.hasWaterTax,
    has_property_tax: company.hasPropertyTax,
    has_excise_tax: company.hasExciseTax,
    has_auction_tax: company.hasAuctionTax,
    one_c_status: company.oneCStatus,
    one_c_location: company.oneCLocation,
    // Tab 5: SHARTNOMA
    contract_number: company.contractNumber,
    contract_date: company.contractDate,
    payment_day: company.paymentDay,
    firma_share_percent: company.firmaSharePercent,
    current_balance: company.currentBalance,
    // Tab 6: XAVF
    company_status: company.companyStatus,
    risk_level: company.riskLevel,
    risk_notes: company.riskNotes,
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
    description: e.description
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

// =====================================================
// CREDENTIALS (Tab 3: LOGINLAR)
// =====================================================

export const fetchCredentials = async (companyId: string): Promise<ClientCredential[]> => {
  const { data, error } = await supabase
    .from('client_credentials')
    .select('*')
    .eq('company_id', companyId)
    .order('service_name', { ascending: true });
  if (error) {
    console.error('fetchCredentials', error);
    return [];
  }
  return data.map(c => ({
    id: c.id,
    companyId: c.company_id,
    serviceName: c.service_name,
    loginId: c.login_id,
    encryptedPassword: c.encrypted_password,
    keyFilePath: c.key_file_path,
    notes: c.notes,
    updatedBy: c.updated_by,
    updatedAt: c.updated_at
  })) as ClientCredential[];
};

export const upsertCredential = async (cred: Partial<ClientCredential>) => {
  const payload = {
    id: cred.id,
    company_id: cred.companyId,
    service_name: cred.serviceName,
    login_id: cred.loginId,
    encrypted_password: cred.encryptedPassword,
    key_file_path: cred.keyFilePath,
    notes: cred.notes,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('client_credentials').upsert(payload);
  if (error) throw error;
};

// Log when someone views a credential
export const logCredentialAccess = async (credentialId: string, companyId: string, userId: string, action: string = 'view') => {
  const { error } = await supabase.from('credential_access_log').insert({
    credential_id: credentialId,
    company_id: companyId,
    accessed_by: userId,
    action: action
  });
  if (error) console.error('logCredentialAccess', error);
};

// Fetch access logs for a company (admin view)
export const fetchCredentialAccessLogs = async (companyId: string) => {
  const { data, error } = await supabase
    .from('credential_access_log')
    .select('*, accessed_by_profile:profiles!credential_access_log_accessed_by_fkey(full_name)')
    .eq('company_id', companyId)
    .order('accessed_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('fetchCredentialAccessLogs', error);
    return [];
  }
  return data;
};

// =====================================================
// CLIENT HISTORY (Tab 4: JAMOA & Audit)
// =====================================================

export const fetchClientHistory = async (companyId: string): Promise<ClientHistory[]> => {
  const { data, error } = await supabase
    .from('client_history')
    .select('*, changed_by_profile:profiles!client_history_changed_by_fkey(full_name)')
    .eq('company_id', companyId)
    .order('changed_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('fetchClientHistory', error);
    return [];
  }
  return data.map(h => ({
    id: h.id,
    companyId: h.company_id,
    changeType: h.change_type,
    fieldName: h.field_name,
    oldValue: h.old_value,
    newValue: h.new_value,
    changedBy: h.changed_by,
    changedByName: h.changed_by_profile?.full_name,
    changedAt: h.changed_at,
    notes: h.notes
  })) as ClientHistory[];
};

// Manual history entry (for non-trigger logging)
export const insertClientHistory = async (entry: Partial<ClientHistory>) => {
  const payload = {
    company_id: entry.companyId,
    change_type: entry.changeType,
    field_name: entry.fieldName,
    old_value: entry.oldValue,
    new_value: entry.newValue,
    changed_by: entry.changedBy,
    notes: entry.notes
  };
  const { error } = await supabase.from('client_history').insert(payload);
  if (error) console.error('insertClientHistory', error);
};

// =====================================================
// RBAC: CLIENT ASSIGNMENTS (The Link)
// =====================================================

export const fetchClientAssignments = async (companyId: string): Promise<ClientAssignment[]> => {
  const { data, error } = await supabase
    .from('client_assignments')
    .select('*')
    .eq('company_id', companyId)
    .order('assigned_at', { ascending: false });

  if (error) {
    console.error('fetchClientAssignments', error);
    return [];
  }

  return data.map(d => ({
    id: d.id,
    companyId: d.company_id,
    staffId: d.staff_id,
    roleType: d.role_type,
    assignedAt: d.assigned_at,
    endedAt: d.ended_at,
    isActive: d.is_active,
    createdBy: d.created_by
  }));
};

export const createAssignment = async (
  companyId: string,
  staffId: string,
  roleType: ClientAssignmentRole,
  startDate: string
) => {
  const payload = {
    company_id: companyId,
    staff_id: staffId,
    role_type: roleType,
    assigned_at: startDate,
    is_active: true
  };

  const { error } = await supabase.from('client_assignments').insert(payload);
  if (error) throw error;
};

export const endAssignment = async (assignmentId: string, endDate: string) => {
  const { error } = await supabase
    .from('client_assignments')
    .update({ ended_at: endDate, is_active: false })
    .eq('id', assignmentId);
  if (error) throw error;
};

// Smart Handover (Bulk Transfer)
export const transferClients = async (fromUserId: string, toUserId: string, roleType: ClientAssignmentRole) => {
  const { error } = await supabase.rpc('transfer_clients', {
    p_from_user: fromUserId,
    p_to_user: toUserId,
    p_role: roleType
  });

  if (error) {
    console.error('transferClients error', error);
    throw error;
  }
};

// Audit Log
export const logAuditAction = async (userId: string, action: string, entityType: string, entityId: string, details: any) => {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    ip_address: 'client-side' // Real IP usually captured by server/edge function
  });
  if (error) console.error('logAuditAction', error);
};
