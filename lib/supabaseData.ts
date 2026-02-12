import { supabase } from './supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'sonner'; // Optional, but usually handled by caller
import {
  Company,
  OperationEntry,
  Staff,
  Payment,
  Expense,
  StatsType,
  TaxType,
  ReportStatus,
  Document,
  ClientCredential,
  ContractAssignment,
  ContractRole,
  KPIRule,
  MonthlyPerformance,
  PayrollAdjustment,
  EmployeeSalarySummary,
  ClientHistory,
  SalaryCalculationType
} from '../types';

interface CompanyNotesFallback {
  v?: number;
  bcid?: string;
  bcn?: string;
  sid?: string;
  sn?: string;
  srvn?: string; // serverName
  camt?: number;
  aperc?: number;
  bcsum?: number;
  casum?: number;
  cperc?: number; // chiefAccountantPerc
  sperc?: number;
  on?: string;
  ia?: boolean;
  stats?: string[];
  scope?: string[];
  itp?: boolean | string; // itParkResident
  bcp?: number; // bankClientPerc
  idx?: number; // originalIndex
  icid?: string; // internalContractorId
  is_ic?: boolean; // isInternalContractor
  req_r?: string[]; // requiredReports
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

export const deleteKPIRule = async (id: string) => {
  const { error } = await supabase.from('kpi_rules').delete().eq('id', id);
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
  const { data, error } = await supabase.rpc('calculate_employee_salary_v2', {
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

interface CompanyNotesFallback {
  v?: number;
  bcid?: string;
  bcn?: string;
  sid?: string;
  sn?: string; // supervisorName
  srvn?: string; // serverName (NEW)
  camt?: number;
  aperc?: number;
  bcsum?: number;
  casum?: number;
  cperc?: number; // chiefAccountantPerc
  sperc?: number;
  on?: string;
  ia?: boolean;
  stats?: string[];
  scope?: string[];
  itp?: boolean | string; // itParkResident
  bcp?: number; // bankClientPerc
}

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
    if (c.notes?.startsWith('{')) {
      try { extra = JSON.parse(c.notes); } catch (e) { }
    }

    return {
      id: c.id,
      name: c.name,
      inn: c.inn,
      accountantName: (c.accountant as any)?.full_name || c.accountant_id,
      accountantId: c.accountant_id,
      taxType: c.tax_type_new || c.tax_regime,
      department: c.department,
      statsType: c.stats_type,
      login: c.login,
      password: c.password_encrypted,
      createdAt: c.created_at,
      internalContractor: c.internal_contractor,
      serverInfo: c.server_info,
      serverName: extra.srvn,
      baseName1c: c.base_name_1c,
      kpiEnabled: c.kpi_enabled,
      bankClientId: c.bank_client_id || extra.bcid,
      bankClientName: extra.bcn || '—',
      supervisorId: c.supervisor_id || extra.sid,
      supervisorName: extra.sn || '—',
      contractAmount: c.contract_amount ?? (extra.camt || 0),
      accountantPerc: c.accountant_perc ?? (extra.aperc || 0),
      bankClientPerc: extra.bcp || 0,
      bankClientSum: c.bank_client_sum ?? (extra.bcsum || 0),
      chiefAccountantPerc: extra.cperc || 0,
      chiefAccountantSum: c.chief_accountant_sum ?? (extra.casum || 0),
      supervisorPerc: c.supervisor_perc ?? (extra.sperc || 0),
      ownerName: extra.on,
      isActive: c.is_active ?? (extra.ia ?? true),
      originalIndex: extra.idx,
      itParkResident: c.it_park_resident ?? extra.itp,
      internalContractorId: extra.icid,
      isInternalContractor: extra.is_ic,
      requiredReports: extra.req_r || [],
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
      oneCLocation: c.one_c_location,
      accountant_name: c.accountant_name,
      // Tab 5: SHARTNOMA fields
      contractNumber: c.contract_number,
      contractDate: c.contract_date,
      paymentDay: c.payment_day ?? 5,
      firmaSharePercent: c.firma_share_percent ?? 50,
      currentBalance: c.current_balance ?? 0,
      // Tab 6: XAVF fields
      companyStatus: c.company_status ?? 'active',
      riskLevel: c.risk_level ?? 'low',
      riskNotes: c.risk_notes,
      statReports: c.stat_reports || extra.stats,
      serviceScope: c.service_scope || extra.scope
    };
  }) as Company[];
};

export const upsertCompany = async (company: Company) => {
  // UUID validation regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Ensure we have a valid UUID for the company ID
  let validId = company.id;
  if (!validId || !uuidRegex.test(validId)) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      validId = crypto.randomUUID();
    } else {
      validId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }

  // Serialize complex data for fallback storage in 'notes'
  const fallbackJson = JSON.stringify({
    v: 1,
    bcid: company.bankClientId,
    bcn: company.bankClientName,
    sid: company.supervisorId,
    sn: company.supervisorName,
    srvn: company.serverName,
    camt: company.contractAmount,
    aperc: company.accountantPerc,
    bcp: company.bankClientPerc,
    bcsum: company.bankClientSum,
    cperc: company.chiefAccountantPerc,
    casum: company.chiefAccountantSum,
    sperc: company.supervisorPerc,
    on: company.ownerName,
    ia: company.isActive,
    stats: company.statReports,
    scope: company.serviceScope,
    itp: company.itParkResident,
    idx: company.originalIndex,
    icid: company.internalContractorId,
    is_ic: company.isInternalContractor,
    req_r: company.requiredReports
  });


  // Map tax type to V2 enum safely
  let taxTypeV2 = (company.taxType === 'turnover' || company.taxType === 'nds_profit') ? company.taxType : undefined;

  // Map server info to enum safely
  const validServers = ['CR1', 'CR2', 'CR3'];
  const serverInfoEnum = typeof company.serverInfo === 'string' && validServers.includes(company.serverInfo)
    ? company.serverInfo
    : undefined;

  const payload = {
    id: validId,

    name: company.name,
    inn: company.inn,
    tax_regime: company.taxType === 'nds_profit' ? 'vat' : (company.taxType === 'turnover' ? 'turnover' : 'fixed'),
    tax_type_new: taxTypeV2,
    stats_type: company.statsType,
    department: company.department || 'default',

    accountant_id: company.accountantId,
    login: company.login,
    password: company.password,
    accountant_name: company.accountantName,
    notes: fallbackJson,
    internal_contractor: company.internalContractor,
    server_info: serverInfoEnum,
    base_name_1c: company.baseName1c,
    kpi_enabled: company.kpiEnabled,
    it_park_resident: typeof company.itParkResident === 'boolean' ? company.itParkResident : false, // DB expects boolean, store complex value in notes
    stat_reports: company.statReports,
    service_scope: company.serviceScope,
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
    const { data: existing } = await supabase.from('companies').select('*').eq('id', validId).maybeSingle();

    const { error } = await supabase.from('companies').upsert(payload);

    if (error) {
      console.error('upsertCompany error details:', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
        payload: payload
      });
      if (error.code === '42703') {
        const fallbackPayload = { ...payload };
        delete (fallbackPayload as any).bank_client_id;
        delete (fallbackPayload as any).supervisor_id;
        delete (fallbackPayload as any).contract_amount;
        delete (fallbackPayload as any).accountant_perc;
        delete (fallbackPayload as any).bank_client_sum;
        delete (fallbackPayload as any).supervisor_perc;
        const { error: fErr } = await supabase.from('companies').upsert(fallbackPayload);
        if (fErr) throw fErr;
      } else {
        throw error;
      }
    }

    // Audit Log
    if (existing) {
      logAuditAction(validId, 'update', 'company', validId, { before: existing, after: payload });
    } else {
      logAuditAction(validId, 'create', 'company', validId, { data: payload });
    }
  } catch (e) { console.error(e); throw e; }
};

export const deleteCompany = async (id: string) => {
  const { error } = await supabase.from('companies').delete().eq('id', id);
  if (error) throw error;
};

export const onboardCompany = async (company: Partial<Company>, assignments: any[]) => {
  // UUID validation regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Generate a proper UUID if the provided ID is invalid or missing
  let companyId: string;
  if (company.id && uuidRegex.test(company.id)) {
    companyId = company.id;
  } else {
    // Generate a valid UUID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      companyId = crypto.randomUUID();
    } else {
      // Fallback: generate a valid UUID v4 format
      companyId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }

  // 1. Save Company
  await upsertCompany({ ...company, id: companyId } as Company);

  // 2. Save Assignments
  for (const ass of assignments) {
    if (ass.userId && uuidRegex.test(ass.userId)) {
      await supabase.from('contract_assignments').insert({
        client_id: companyId,
        user_id: ass.userId,
        role: ass.role,
        salary_type: ass.salaryType || 'percent',
        salary_value: ass.salaryValue || 20,
        start_date: new Date().toISOString().split('T')[0]
      });

      logAuditAction(companyId, 'assign_role', 'contract_assignment', companyId, ass);
    }
  }
};


export const fetchContractAssignments = async (clientId?: string, userId?: string): Promise<ContractAssignment[]> => {
  let query = supabase.from('contract_assignments').select('*');
  if (clientId) query = query.eq('client_id', clientId);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) { console.error('fetchContractAssignments', error); return []; }
  return data.map(a => ({
    id: a.id,
    clientId: a.client_id,
    userId: a.user_id,
    role: a.role as ContractRole,
    salaryType: a.salary_type as SalaryCalculationType,
    salaryValue: a.salary_value,
    startDate: a.start_date,
    endDate: a.end_date
  }));
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
      comment: o.comment?.startsWith('{"kpi":') ? '' : (o.comment || ''),
      profitTaxDeadline: o.deadline_profit_tax,
      statsDeadline: o.deadline_stats,
      updatedAt: o.updated_at,
      history: [],
      kpi: kpiData,
      tasks: o.tasks || [] // Include tasks
    };
  }) as OperationEntry[];
};

export const upsertOperation = async (op: OperationEntry) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let validId = op.id;

  if (!validId || !uuidRegex.test(validId)) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      validId = crypto.randomUUID();
    } else {
      validId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }

  const kpiStore = op.kpi ? JSON.stringify({ kpi: op.kpi }) : (op.comment || '');

  const payload = {
    id: validId,
    company_id: op.companyId,
    period: op.period,
    deadline_profit_tax: op.profitTaxDeadline,
    deadline_stats: op.statsDeadline,
    comment: op.kpi ? kpiStore : op.comment, // Store KPI in comment if column missing
    kpi: op.kpi, // Try real column
    tasks: op.tasks // Add tasks field
  };

  try {
    const { error } = await supabase.from('operations').upsert(payload);
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      const fallbackPayload = { ...payload } as any;
      delete fallbackPayload.kpi;
      delete fallbackPayload.deadline_profit_tax;
      delete fallbackPayload.deadline_stats;
      delete fallbackPayload.tasks;
      const { error: fErr } = await supabase.from('operations').upsert(fallbackPayload);
      if (fErr) throw fErr;
    } else if (error) throw error;
  } catch (e) { console.error(e); throw e; }
};

export const upsertOperationsBatch = async (ops: OperationEntry[]) => {
  const payloads = ops.map(op => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let validId = op.id;
    if (!validId || !uuidRegex.test(validId)) {
      validId = crypto.randomUUID();
    }
    const kpiStore = op.kpi ? JSON.stringify({ kpi: op.kpi }) : (op.comment || '');

    return {
      id: validId,
      company_id: op.companyId,
      period: op.period,
      deadline_profit_tax: op.profitTaxDeadline,
      deadline_stats: op.statsDeadline,
      comment: op.kpi ? kpiStore : op.comment,
      kpi: op.kpi,
      tasks: op.tasks
    };
  });

  try {
    const { error } = await supabase.from('operations').upsert(payloads);
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      // Fallback: remove problematic columns from all items
      const fallbackPayloads = payloads.map(p => {
        const fb = { ...p } as any;
        delete fb.kpi;
        delete fb.deadline_profit_tax;
        delete fb.deadline_stats;
        delete fb.tasks;
        return fb;
      });
      const { error: fErr } = await supabase.from('operations').upsert(fallbackPayloads);
      if (fErr) throw fErr;
    } else if (error) throw error;
  } catch (e) {
    console.error('Batch upsert failed:', e);
    throw e;
  }
};

export const deleteOperation = async (id: string) => {
  const { error } = await supabase.from('operations').delete().eq('id', id);
  if (error) throw error;
};

// --- Monthly Reports (CSV Based) ---
export const fetchMonthlyReports = async (): Promise<OperationEntry[]> => {
  const { data, error } = await supabase
    .from('company_monthly_reports')
    .select('*');

  if (error) {
    console.error('fetchMonthlyReports', error);
    return [];
  }

  return data.map(r => ({
    id: r.id,
    companyId: r.company_id,
    period: r.period,
    bank_klient: r.bank_klient,
    didox: r.didox,
    xatlar: r.xatlar,
    avtokameral: r.avtokameral,
    my_mehnat: r.my_mehnat,
    one_c: r.one_c,
    pul_oqimlari: r.pul_oqimlari,
    chiqadigan_soliqlar: r.chiqadigan_soliqlar,
    hisoblangan_oylik: r.hisoblangan_oylik,
    debitor_kreditor: r.debitor_kreditor,
    foyda_va_zarar: r.foyda_va_zarar,
    tovar_ostatka: r.tovar_ostatka,
    nds_bekor_qilish: r.nds_bekor_qilish,
    aylanma_qqs: r.aylanma_qqs,
    daromad_soliq: r.daromad_soliq,
    inps: r.inps,
    foyda_soliq: r.foyda_soliq,
    moliyaviy_natija: r.moliyaviy_natija,
    buxgalteriya_balansi: r.buxgalteriya_balansi,
    statistika: r.statistika,
    bonak: r.bonak,
    yer_soliqi: r.yer_soligi,
    mol_mulk_soligi: r.mol_mulk_soligi,
    suv_soligi: r.suv_soligi,
    comment: r.comment || '',
    updatedAt: r.updated_at,
    history: []
  })) as OperationEntry[];
};

export const upsertMonthlyReport = async (report: Partial<OperationEntry>) => {
  const payload = {
    company_id: report.companyId,
    period: report.period,
    bank_klient: report.bank_klient,
    didox: report.didox,
    xatlar: report.xatlar,
    avtokameral: report.avtokameral,
    my_mehnat: report.my_mehnat,
    one_c: report.one_c,
    pul_oqimlari: report.pul_oqimlari,
    chiqadigan_soliqlar: report.chiqadigan_soliqlar,
    hisoblangan_oylik: report.hisoblangan_oylik,
    debitor_kreditor: report.debitor_kreditor,
    foyda_va_zarar: report.foyda_va_zarar,
    tovar_ostatka: report.tovar_ostatka,
    nds_bekor_qilish: report.nds_bekor_qilish,
    aylanma_qqs: report.aylanma_qqs,
    daromad_soliq: report.daromad_soliq,
    inps: report.inps,
    foyda_soliq: report.foyda_soliq,
    moliyaviy_natija: report.moliyaviy_natija,
    buxgalteriya_balansi: report.buxgalteriya_balansi,
    statistika: report.statistika,
    bonak: report.bonak,
    yer_soligi: report.yer_soliqi,
    mol_mulk_soligi: report.mol_mulk_soligi,
    suv_soligi: report.suv_soligi,
    comment: report.comment,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('company_monthly_reports').upsert(payload, { onConflict: 'company_id,period' });
  if (error) throw error;
};

// Staff
export const fetchStaff = async (): Promise<Staff[]> => {
  // First attempt with all columns
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_color, phone, is_active');

  if (error) {
    // Fallback if some columns are missing
    console.warn('fetchStaff full select failed, trying minimal select', error);
    const { data: minData, error: minError } = await supabase
      .from('profiles')
      .select('id, full_name, role');

    if (minError) {
      console.error('fetchStaff minimal select failed', minError);
      return [];
    }

    return minData.map((p) => ({
      id: p.id,
      name: p.full_name,
      role: p.role,
      avatarColor: 'hsl(200,50%,50%)',
      phone: '',
      is_active: true
    })) as Staff[];
  }

  return data.map((p) => ({
    id: p.id,
    name: p.full_name,
    role: p.role,
    avatarColor: p.avatar_color || 'hsl(200,50%,50%)',
    phone: p.phone,
    is_active: p.is_active ?? true
  })) as Staff[];
};

export const upsertStaff = async (staff: Staff) => {
  // UUID validation for safety
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let validId = staff.id;

  // 1. Logic for NEW users or explicit auth creation
  if (staff.email && staff.password && (!validId || !uuidRegex.test(validId))) {
    try {
      // Create a temporary client to avoid logging out the admin
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseAnonKey) {
        const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });

        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email: staff.email,
          password: staff.password,
          options: {
            data: { full_name: staff.name, role: staff.role }
          }
        });

        if (authError) {
          console.error('Auth signup failed:', authError);
          // If user already exists, we might want to fetch their ID?
          // For now, proceed with error logging but try to continue or throw?
          // If auth fails, we should probably stop.
          if (!authError.message.includes('already registered')) {
            throw authError;
          }
        }

        if (authData.user && authData.user.id) {
          validId = authData.user.id;
        }
      }
    } catch (e) {
      console.error('Auth handler error:', e);
      // Fallback: If auth fails, generate random ID? No, better to fail or let the user know.
    }
  }

  // Fallback ID generation if Auth didn't provide one
  if (!validId || !uuidRegex.test(validId)) {
    validId = crypto.randomUUID();
  }

  // Map roles to DB enum: 'super_admin', 'manager', 'accountant', 'auditor'
  let dbRole = 'accountant';
  const r = staff.role?.toLowerCase() || '';
  if (r.includes('admin') || r.includes('chief')) dbRole = 'super_admin';
  else if (r.includes('manager') || r.includes('supervisor') || r.includes('controller')) dbRole = 'manager';
  else if (r.includes('audit')) dbRole = 'auditor';

  const payload = {
    id: validId,
    email: staff.email || (staff.username ? `${staff.username}@asos.uz` : `${staff.name.toLowerCase().replace(/\s/g, '.')}@asos.uz`),
    full_name: staff.name,
    role: dbRole,
    avatar_color: staff.avatarColor || 'hsl(200, 50%, 50%)',
    phone: staff.phone || '',
    is_active: staff.is_active ?? true
  };

  try {
    const { error } = await supabase.from('profiles').upsert(payload);
    if (error) {
      // If there's a problem with columns, try a bare minimum upsert
      if (error.code === '42703') {
        const { error: fErr } = await supabase.from('profiles').upsert({
          id: validId,
          full_name: staff.name,
          email: payload.email,
          role: dbRole
        });
        if (fErr) throw fErr;
      } else {
        throw error;
      }
    }
  } catch (e) {
    console.error('upsertStaff failed', e);
    // Don't throw for seeding safety, just log
  }
};

export const deleteStaff = async (id: string) => {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
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

export const deletePayment = async (id: string) => {
  const { error } = await supabase.from('payments').delete().eq('id', id);
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

export const deleteExpense = async (id: string) => {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
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

export const deleteCredential = async (id: string) => {
  const { error } = await supabase.from('client_credentials').delete().eq('id', id);
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
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('fetchClientHistory', error);
    return [];
  }
  return data.map(h => ({
    id: h.id,
    companyId: h.company_id,
    changeType: h.action || h.change_type,
    fieldName: h.field_name,
    oldValue: h.old_value,
    newValue: h.new_value,
    changedBy: h.user_id || h.changed_by,
    changedByName: null,
    changedAt: h.created_at || h.changed_at,
    notes: h.details?.notes || h.notes
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

export const fetchClientAssignments = async (companyId: string): Promise<ContractAssignment[]> => {
  const { data, error } = await supabase
    .from('contract_assignments')
    .select('*')
    .eq('client_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchClientAssignments', error);
    return [];
  }

  return data.map(d => ({
    id: d.id,
    clientId: d.client_id,
    userId: d.user_id,
    role: d.role,
    salaryType: d.salary_type,
    salaryValue: d.salary_value,
    startDate: d.start_date,
    endDate: d.end_date,
    isActive: !d.end_date || new Date(d.end_date) > new Date(),
    createdAt: d.created_at
  }));
};

export const createAssignment = async (
  companyId: string,
  userId: string,
  role: ContractRole,
  startDate: string
) => {
  const payload = {
    client_id: companyId,
    user_id: userId,
    role: role,
    start_date: startDate
  };

  const { error } = await supabase.from('contract_assignments').insert(payload);
  if (error) throw error;
};

export const endAssignment = async (assignmentId: string, endDate: string) => {
  const { error } = await supabase
    .from('contract_assignments')
    .update({ end_date: endDate })
    .eq('id', assignmentId);
  if (error) throw error;
};

// Smart Handover (Bulk Transfer)
export const transferClients = async (fromUserId: string, toUserId: string, role: string) => {
  const { error } = await supabase.rpc('transfer_clients', {
    p_from_user: fromUserId,
    p_to_user: toUserId,
    p_role: role
  });

  if (error) {
    console.error('transferClients error', error);
    throw error;
  }
};

// Audit Log
// Valid actions for the audit_action enum: 'create', 'update', 'delete', 'login', 'logout'
export const logAuditAction = async (userId: string, action: string, entityType: string, entityId: string, details: any) => {
  // Map custom actions to valid enum values
  const validActions = ['create', 'update', 'delete', 'login', 'logout'];
  const mappedAction = action === 'assign_role' ? 'create' :
    validActions.includes(action) ? action : 'update';

  try {
    let finalUserId: string | null = null;

    // 1. Try to use the passed userId if it looks valid and isn't the entityId (which implies mistake)
    if (userId &&
      userId !== entityId &&
      userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      finalUserId = userId;
    }

    // 2. If no valid user provided, try to get current auth user
    if (!finalUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) finalUserId = user.id;
    }

    // 3. Verify foreign key existence (optional, but good for avoiding 23503)
    // If we have a user ID, let's verify it quickly or just catch the error.
    // simpler: If it fails with FK violation, retry with null user_id

    const payload = {
      user_id: finalUserId,
      action: mappedAction,
      table_name: entityType,
      record_id: entityId,
      new_data: details
    };

    const { error } = await supabase.from('audit_logs').insert(payload);

    if (error) {
      if (error.code === '23503') { // Foreign key violation
        // Retry with null user_id
        await supabase.from('audit_logs').insert({ ...payload, user_id: null });
      } else {
        console.error('logAuditAction', error);
      }
    }
  } catch (e) {
    console.error('logAuditAction exception', e);
  }
};

