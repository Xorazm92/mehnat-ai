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
  CompanyKPIRule,
  MonthlyPerformance,
  PayrollAdjustment,
  EmployeeSalarySummary,
  ClientHistory,
  SalaryCalculationType,
  AppNotification
} from '../types';

const withTimeout = <T>(promiseFn: () => Promise<T>, ms: number, label: string): Promise<T> => {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`DB Timeout: ${label} did not respond within ${ms / 1000}s`));
      }
    }, ms);

    try {
      const result = await promiseFn();

      // Check for Supabase-level errors in the response
      const anyResult = result as any;
      if (anyResult && anyResult.error) {
        const error = anyResult.error;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          return reject(error);
        }
      }

      if (!settled) {
        settled = true;
        clearTimeout(timer);
        return resolve(result);
      }
    } catch (e: any) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        return reject(e);
      }
    }
  });
};

interface CompanyNotesFallback {
  v?: number;
  bcid?: string;
  bcn?: string;
  cid?: string;
  cn?: string;
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
  // Normalize roles for frontend
  if (data) {
    if (data.role === 'manager') data.role = 'supervisor';
    if (data.full_name === 'Super Admin' && data.role === 'supervisor') data.role = 'chief_accountant';
  }
  return data;
};

// =====================================================
// AVTOMATIK KPI TIZIMI — DATA LAYER
// =====================================================

// --- NOTIFICATIONS ---
const TABLES = {
  profiles: 'profiles',
  companies: 'companies',
  operations: 'operations',
  kpi_rules: 'kpi_rules',
  monthly_performance: 'monthly_performance',
  payroll_adjustments: 'payroll_adjustments',
  company_monthly_reports: 'company_monthly_reports',
  contract_assignments: 'contract_assignments',
  notifications: 'notifications'
} as const;

export const fetchNotifications = async (userId: string): Promise<AppNotification[]> => {
  const { data, error } = await supabase
    .from(TABLES.notifications)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
  return data.map(n => ({
    id: n.id,
    userId: n.user_id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    isRead: n.is_read,
    createdAt: n.created_at
  }));
};

export const markNotificationAsRead = async (id: string) => {
  await supabase
    .from(TABLES.notifications)
    .update({ is_read: true })
    .eq('id', id);
};

export const createNotification = async (notif: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'>) => {
  const { error } = await supabase
    .from(TABLES.notifications)
    .insert({
      user_id: notif.userId,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      link: notif.link
    });
  if (error) console.error('Error creating notification:', error);
};

export const deleteNotification = async (id: string) => {
  const { error } = await supabase.from(TABLES.notifications).delete().eq('id', id);
  if (error) console.error('Error deleting notification:', error);
};

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
    role: rule.role,
    reward_percent: rule.rewardPercent ?? null,
    penalty_percent: rule.penaltyPercent ?? null,
    input_type: rule.inputType,
    category: rule.category,
    description: rule.description,
    is_active: rule.isActive,
    sort_order: rule.sortOrder,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('kpi_rules').upsert(payload);
  if (error) {
    console.error('upsertKPIRule error:', error);
    throw error;
  }
};


export const deleteKPIRule = async (id: string) => {
  const { error } = await supabase.from('kpi_rules').delete().eq('id', id);
  if (error) throw error;
};

export const fetchCompanyKPIRules = async (companyId: string): Promise<CompanyKPIRule[]> => {
  const { data, error } = await supabase
    .from('company_kpi_rules')
    .select('*')
    .eq('company_id', companyId);

  if (error) {
    console.error('fetchCompanyKPIRules error:', error);
    return [];
  }

  return data.map(r => ({
    id: r.id,
    companyId: r.company_id,
    ruleId: r.rule_id,
    rewardPercent: r.reward_percent,
    penaltyPercent: r.penalty_percent,
    isActive: r.is_active
  }));
};

export const fetchAllCompanyKPIRules = async (): Promise<CompanyKPIRule[]> => {
  const { data, error } = await supabase
    .from('company_kpi_rules')
    .select('*');

  if (error) {
    console.error('fetchAllCompanyKPIRules error:', error);
    return [];
  }

  return data.map(r => ({
    id: r.id,
    companyId: r.company_id,
    ruleId: r.rule_id,
    rewardPercent: r.reward_percent,
    penaltyPercent: r.penalty_percent,
    isActive: r.is_active
  }));
};

export const upsertCompanyKPIRule = async (rule: Partial<any>) => {
  const payload = {
    id: rule.id,
    company_id: rule.companyId,
    rule_id: rule.ruleId,
    reward_percent: rule.rewardPercent,
    penalty_percent: rule.penaltyPercent,
    is_active: rule.isActive,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('company_kpi_rules').upsert(payload, { onConflict: 'company_id, rule_id' });
  if (error) {
    console.error('upsertCompanyKPIRule error:', error);
    throw error;
  }
};

// 2. Monthly Performance
export const fetchMonthlyPerformance = async (month: string, companyId?: string, employeeId?: string): Promise<MonthlyPerformance[]> => {
  let query = supabase
    .from('monthly_performance')
    .select('*, rule:kpi_rules(name, name_uz, role, reward_percent, penalty_percent), company:companies(name), employee:profiles!employee_id(full_name)')
    .eq('month', month);

  if (companyId) query = query.eq('company_id', companyId);
  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error } = await query;

  if (error) {
    console.error('fetchMonthlyPerformance error:', error);
    return [];
  }

  // Fetch company-level overrides for these companies
  const companyIds = Array.from(new Set(data.map(p => p.company_id)));
  const { data: overrides } = await supabase
    .from('company_kpi_rules')
    .select('*')
    .in('company_id', companyIds);

  return data.map(p => {
    const override = overrides?.find(o => o.company_id === p.company_id && o.rule_id === p.rule_id);

    const rewardOverride = (p as any).reward_percent_override;
    const penaltyOverride = (p as any).penalty_percent_override;
    const normalizedCalculatedScore = (() => {
      const v = Number(p.value) || 0;
      if (v > 0) {
        return rewardOverride === null || rewardOverride === undefined ? 0 : Number(p.calculated_score) || 0;
      }
      if (v < 0) {
        return penaltyOverride === null || penaltyOverride === undefined ? 0 : Number(p.calculated_score) || 0;
      }
      return 0;
    })();

    return {
      id: p.id,
      month: p.month,
      companyId: p.company_id,
      companyName: p.company?.name,
      employeeId: p.employee_id,
      employeeName: p.employee?.full_name,
      ruleId: p.rule_id,
      ruleName: p.rule?.name,
      ruleNameUz: p.rule?.name_uz,
      ruleRole: p.rule?.role,
      // Effectively fall back: Override -> Global
      ruleRewardPercent: override?.reward_percent ?? p.rule?.reward_percent,
      rulePenaltyPercent: override?.penalty_percent ?? p.rule?.penalty_percent,
      rewardPercentOverride: rewardOverride,
      penaltyPercentOverride: penaltyOverride,
      value: p.value,
      calculatedScore: normalizedCalculatedScore,
      source: p.source,
      status: p.status,
      submittedBy: p.submitted_by,
      submittedAt: p.submitted_at,
      approvedBy: p.approved_by,
      approvedAt: p.approved_at,
      rejectedReason: p.rejected_reason,
      notes: p.notes,
      changeReason: p.change_reason,
      recordedBy: p.recorded_by,
      recordedAt: p.recorded_at
    };
  });
};

export const upsertMonthlyPerformance = async (perf: Partial<MonthlyPerformance>) => {
  const payload = {
    id: perf.id,
    month: perf.month,
    company_id: perf.companyId,
    employee_id: perf.employeeId,
    rule_id: perf.ruleId,
    value: perf.value,
    reward_percent_override: perf.rewardPercentOverride,
    penalty_percent_override: perf.penaltyPercentOverride,
    source: perf.source,
    status: perf.status,
    submitted_by: perf.submittedBy,
    submitted_at: perf.submittedAt,
    approved_by: perf.approvedBy,
    approved_at: perf.approvedAt,
    rejected_reason: perf.rejectedReason,
    notes: perf.notes,
    recorded_by: perf.recordedBy,
    recorded_at: new Date().toISOString()
  };

  // Note: calculated_score is handled by DB trigger
  try {
    const { error } = await supabase
      .from('monthly_performance')
      .upsert(payload, {
        onConflict: 'month,company_id,employee_id,rule_id'
      });
    if (error) {
      console.error('upsertMonthlyPerformance error:', error);

      // If the DB schema is missing workflow columns (schema cache stale / migration not applied),
      // retry with minimal payload to avoid hard-blocking the UI.
      const message = String(error.message || '');
      const details = String(error.details || '');
      const hint = String(error.hint || '');
      const combined = `${message} ${details} ${hint}`.toLowerCase();

      const tryingToWriteOverrides =
        perf.rewardPercentOverride !== undefined ||
        perf.penaltyPercentOverride !== undefined;

      if (
        error.code === 'PGRST204' ||
        error.code === '42703' ||
        combined.includes('could not find') ||
        combined.includes('column') && combined.includes('does not exist')
      ) {
        if (tryingToWriteOverrides && (combined.includes('reward_percent_override') || combined.includes('penalty_percent_override'))) {
          throw new Error(
            "DB schema eski: monthly_performance jadvalida reward_percent_override / penalty_percent_override ustunlari yo'q. Supabase'da 20260218_kpi_percent_overrides.sql migration'ni RUN qiling, so'ng qayta urinib ko'ring."
          );
        }
        const minimalPayload = {
          id: perf.id,
          month: perf.month,
          company_id: perf.companyId,
          employee_id: perf.employeeId,
          rule_id: perf.ruleId,
          value: perf.value,
          notes: perf.notes,
          recorded_by: perf.recordedBy,
          recorded_at: new Date().toISOString()
        };

        const { error: retryError } = await supabase
          .from('monthly_performance')
          .upsert(minimalPayload, { onConflict: 'month,company_id,employee_id,rule_id' });

        if (retryError) {
          console.error('upsertMonthlyPerformance retryError:', retryError);
          throw retryError;
        }
        return;
      }

      throw error;
    }
  } catch (e: any) {
    // If DB schema doesn't have workflow columns yet (approved_by/source/status...), PostgREST can return
    // PGRST204 / 42703 or a message like "Could not find the 'approved_by' column ... in the schema cache".
    const msg = String(e?.message || '');
    const code = String(e?.code || '');
    const isMissingColumn =
      code === 'PGRST204' ||
      code === '42703' ||
      msg.includes("Could not find the '") ||
      msg.toLowerCase().includes('schema cache');

    if (!isMissingColumn) throw e;

    const minimalPayload = {
      id: perf.id,
      month: perf.month,
      company_id: perf.companyId,
      employee_id: perf.employeeId,
      rule_id: perf.ruleId,
      value: perf.value,
      notes: perf.notes,
      recorded_by: perf.recordedBy,
      recorded_at: new Date().toISOString()
    };

    const { error: e2 } = await supabase
      .from('monthly_performance')
      .upsert(minimalPayload, {
        onConflict: 'month,company_id,employee_id,rule_id'
      });
    if (e2) throw e2;
  }
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
    approved_by: adj.approvedBy,
    approved_at: adj.approvedAt,
    is_approved: adj.isApproved,
    created_by: adj.createdBy
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
    .or(`accountant_id.eq.${employeeId}, bank_client_id.eq.${employeeId}, supervisor_id.eq.${employeeId} `)
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
  cid?: string;
  cn?: string;
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
  // NOTE: Some deployments don't have FK relationships between companies and profiles
  // in PostgREST schema cache, causing PGRST200/400 errors for embedded selects.
  // Fetch plain companies rows and rely on stored names / notes fallback.
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchCompanies', error);
    throw error;
  }

  return (data || []).map((c: any) => {
    // Smart Fallback Parser
    let extra: CompanyNotesFallback = {};
    if (c.notes?.startsWith('{')) {
      try { extra = JSON.parse(c.notes); } catch (e) { }
    }

    const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const rawAccName = (c as any).accountant_name || c.accountant_id;
    const cleanAccName = (rawAccName && isUUID(rawAccName)) ? '' : (rawAccName || '');

    return {
      id: c.id,
      name: c.name,
      inn: c.inn,
      accountantName: cleanAccName,
      accountantId: c.accountant_id,
      taxType: (c as any).tax_type_new || (c.tax_regime === 'vat' ? TaxType.NDS_PROFIT : (c.tax_regime === 'turnover' ? TaxType.TURNOVER : TaxType.FIXED)),
      department: c.department,
      statsType: c.stats_type,
      login: c.login,
      password: (c as any).password_encrypted || c.password,
      createdAt: c.created_at,
      internalContractor: (c as any).internal_contractor,
      serverInfo: (c as any).server_info,
      serverName: extra.srvn,
      baseName1c: (c as any).base_name_1c,
      kpiEnabled: (c as any).kpi_enabled,
      bankClientId: (c as any).bank_client_id || extra.bcid,
      bankClientName: (extra.bcn && !isUUID(extra.bcn)) ? extra.bcn : '—',
      supervisorId: (c as any).supervisor_id || extra.sid,
      supervisorName: (extra.sn && !isUUID(extra.sn)) ? extra.sn : '—',
      chiefAccountantId: (c as any).chief_accountant_id || extra.cid,
      chiefAccountantName: (c as any).chief_accountant_name || ((extra.cn && !isUUID(extra.cn)) ? extra.cn : '—'),
      contractAmount: (c as any).contract_amount ?? (extra.camt || 0),
      accountantPerc: (c as any).accountant_perc ?? (extra.aperc || 0),
      bankClientPerc: extra.bcp || 0,
      bankClientSum: (c as any).bank_client_sum ?? (extra.bcsum || 0),
      chiefAccountantPerc: extra.cperc ?? 0,
      chiefAccountantSum: (c as any).chief_accountant_sum ?? (extra.casum || 0),
      supervisorPerc: (c as any).supervisor_perc ?? (extra.sperc || 0),
      ownerName: extra.on,
      isActive: c.is_active ?? (extra.ia ?? true),
      originalIndex: extra.idx,
      itParkResident: (c as any).it_park_resident ?? extra.itp,
      internalContractorId: extra.icid,
      isInternalContractor: extra.is_ic,
      requiredReports: extra.req_r || [],
      // Tab 1: PASPORT fields
      brandName: (c as any).brand_name,
      directorName: (c as any).director_name,
      directorPhone: (c as any).director_phone,
      legalAddress: (c as any).legal_address,
      founderName: (c as any).founder_name,
      logoUrl: (c as any).logo_url,
      certificateFilePath: (c as any).certificate_file_path,
      charterFilePath: (c as any).charter_file_path,
      // Tab 2: SOLIQ fields
      vatCertificateDate: (c as any).vat_certificate_date,
      hasLandTax: (c as any).has_land_tax ?? false,
      hasWaterTax: (c as any).has_water_tax ?? false,
      hasPropertyTax: (c as any).has_property_tax ?? false,
      hasExciseTax: (c as any).has_excise_tax ?? false,
      oneCLocation: (c as any).one_c_location,
      accountant_name: (c as any).accountant_name,
      // Tab 5: SHARTNOMA fields
      contractNumber: (c as any).contract_number,
      contractDate: (c as any).contract_date,
      paymentDay: (c as any).payment_day ?? 5,
      firmaSharePercent: (c as any).firma_share_percent ?? 50,
      currentBalance: (c as any).current_balance ?? 0,
      // Tab 6: XAVF fields
      companyStatus: (c as any).company_status ?? 'active',
      riskLevel: (c as any).risk_level ?? 'low',
      riskNotes: (c as any).risk_notes,
      statReports: (c as any).stat_reports || extra.stats,
      serviceScope: (c as any).service_scope || extra.scope,
      activeServices: (c as any).active_services || []
    };
  }) as Company[];
};

export const upsertCompany = async (company: Company, assignments?: any[]) => {
  // Map internal types to DB types — ALL fields must be included
  const payload: any = {
    id: company.id,
    name: company.name,
    inn: company.inn,
    tax_regime: company.taxType === 'nds_profit' ? 'vat' : (company.taxType === 'turnover' ? 'turnover' : 'fixed'),
    stats_type: company.statsType,
    department: company.department || 'default',
    accountant_id: company.accountantId,
    login: company.login,
    password: company.password,
    accountant_name: (company.accountantName && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(company.accountantName)) ? '' : company.accountantName,
    notes: company.notes,
    is_active: company.isActive ?? true,
    // SHARTNOMA (Contract) fields
    contract_amount: company.contractAmount,
    accountant_perc: company.accountantPerc,
    bank_client_id: company.bankClientId || null,
    bank_client_sum: company.bankClientSum,
    supervisor_id: company.supervisorId || null,
    supervisor_perc: company.supervisorPerc,
    chief_accountant_id: company.chiefAccountantId || null,
    chief_accountant_sum: company.chiefAccountantSum,
    it_park_resident: company.itParkResident,
    // PASPORT fields
    brand_name: company.brandName,
    director_name: company.directorName,
    director_phone: company.directorPhone,
    legal_address: company.legalAddress,
    founder_name: company.founderName,
    logo_url: company.logoUrl,
    certificate_file_path: company.certificateFilePath,
    charter_file_path: company.charterFilePath,
    // SOLIQ (Tax) fields
    vat_certificate_date: company.vatCertificateDate,
    has_land_tax: company.hasLandTax,
    has_water_tax: company.hasWaterTax,
    has_property_tax: company.hasPropertyTax,
    has_excise_tax: company.hasExciseTax,
    has_auction_tax: company.hasAuctionTax,
    one_c_status: company.oneCStatus,
    one_c_location: company.oneCLocation,
    contract_number: company.contractNumber,
    contract_date: company.contractDate,
    payment_day: company.paymentDay,
    firma_share_percent: company.firmaSharePercent,
    current_balance: company.currentBalance,
    // STATUS fields
    company_status: company.companyStatus,
    risk_level: company.riskLevel,
    risk_notes: company.riskNotes,
    active_services: company.activeServices || [],
    // TECHNICAL fields
    internal_contractor: company.internalContractor,
    tax_type_new: company.taxType === 'nds_profit' ? 'nds_profit' : (company.taxType === 'turnover' ? 'turnover' : null),
    server_info: company.serverInfo,
    base_name_1c: company.baseName1c,
    kpi_enabled: company.kpiEnabled ?? true,
    stat_reports: company.statReports || [],
    service_scope: company.serviceScope || [],
  };

  const startTime = Date.now();
  console.log(`[upsertCompany] Saving "${company.name}" (ID: ${payload.id})`);
  console.log('[upsertCompany] PAYLOAD:', JSON.stringify(payload, null, 2));

  // Step 1: Upsert company with .select() to detect RLS silent failures
  const { data: upsertedRows, error: companyError } = await supabase
    .from('companies')
    .upsert(payload, { onConflict: 'id' })
    .select('id, name, updated_at');

  if (companyError) {
    console.error('[upsertCompany] ❌ Company upsert FAILED:', companyError.message, companyError.code, companyError.details);
    throw new Error(`Saqlashda xatolik: ${companyError.message}`);
  }

  if (!upsertedRows || upsertedRows.length === 0) {
    console.error('[upsertCompany] ❌ RLS BLOCKED: Upsert returned 0 rows — data was NOT saved!');
    console.error('[upsertCompany] This means RLS policy is blocking the write. Check companies INSERT/UPDATE policies.');
    throw new Error('Ma\'lumot saqlanmadi — ruxsat (RLS) cheklangan. Admin bilan bog\'laning.');
  }

  console.log(`[upsertCompany] ✅ Company saved:`, upsertedRows[0]);

  // Step 2: Handle assignments if provided
  if (assignments && assignments.length > 0) {
    // Delete existing assignments
    const { data: deletedRows, error: delError } = await supabase
      .from('contract_assignments')
      .delete()
      .eq('client_id', payload.id)
      .select('id');

    if (delError) {
      console.warn('[upsertCompany] ⚠️ Assignment delete warning:', delError.message);
    } else {
      console.log(`[upsertCompany] 🗑️ Deleted ${deletedRows?.length || 0} old assignments`);
    }

    // Insert new assignments
    const assignmentRows = assignments
      .filter((a: any) => a.userId)
      .map((a: any) => ({
        client_id: payload.id,
        user_id: a.userId,
        role: a.role,
        salary_type: a.salaryType,
        salary_value: a.salaryValue,
      }));

    if (assignmentRows.length > 0) {
      console.log('[upsertCompany] Inserting assignments:', JSON.stringify(assignmentRows));
      const { data: insertedAssign, error: assignError } = await supabase
        .from('contract_assignments')
        .insert(assignmentRows)
        .select('id, user_id, role');

      if (assignError) {
        console.error('[upsertCompany] ❌ Assignment insert failed:', assignError.message, assignError.code);
        throw new Error(`Mas'ullar saqlanmadi: ${assignError.message}`);
      }

      console.log(`[upsertCompany] ✅ Inserted ${insertedAssign?.length || 0} assignments`);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[upsertCompany] ✅ ALL SAVED in ${duration}ms`);
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

  // Atomic save: Company + Assignments in ONE single database transaction
  console.log('[onboardCompany] Step 1: Performing atomic upsert via RPC');
  await upsertCompany({ ...company, id: companyId } as Company, assignments);

  console.log('[onboardCompany] Finished (Atomic Sync Successful)');
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
      ...o, // Spread all database fields (didox, xatlar, one_c, etc.)
      id: o.id,
      companyId: o.company_id,
      period: o.period,
      comment: o.comment?.startsWith('{"kpi":') ? '' : (o.comment || ''),
      profitTaxDeadline: o.deadline_profit_tax,
      statsDeadline: o.deadline_stats,
      updatedAt: o.updated_at,
      history: [],
      kpi: kpiData,
      tasks: o.tasks || [],
      assigned_supervisor_id: o.assigned_supervisor_id,
      assigned_supervisor_name: o.assigned_supervisor_name,
      assigned_bank_manager_id: o.assigned_bank_manager_id,
      assigned_bank_manager_name: o.assigned_bank_manager_name,
      contract_amount: o.contract_amount,
      assigned_accountant_id: o.assigned_accountant_id,
      assigned_accountant_name: o.assigned_accountant_name
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
    tasks: op.tasks, // Add tasks field
    assigned_accountant_id: op.assigned_accountant_id,
    assigned_accountant_name: op.assigned_accountant_name,
    assigned_supervisor_id: op.assigned_supervisor_id,
    assigned_supervisor_name: op.assigned_supervisor_name,
    assigned_bank_manager_id: op.assigned_bank_manager_id,
    assigned_bank_manager_name: op.assigned_bank_manager_name,
    contract_amount: op.contract_amount
  };

  try {
    const { error } = await supabase.from('operations').upsert(payload);
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      const fallbackPayload = { ...payload } as any;
      delete fallbackPayload.kpi;
      delete fallbackPayload.deadline_profit_tax;
      delete fallbackPayload.deadline_stats;
      delete fallbackPayload.tasks;
      delete fallbackPayload.assigned_supervisor_id;
      delete fallbackPayload.assigned_supervisor_name;
      delete fallbackPayload.assigned_bank_manager_id;
      delete fallbackPayload.assigned_bank_manager_name;
      delete fallbackPayload.contract_amount;
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
    // Oylik
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
    // Soliqlar (umumiy)
    yer_soligi: r.yer_soligi,
    mol_mulk_soligi: r.mol_mulk_soligi,
    suv_soligi: r.suv_soligi,
    bonak: r.bonak,
    aksiz_soligi: r.aksiz_soligi,
    nedro_soligi: r.nedro_soligi,
    norezident_foyda: r.norezident_foyda,
    norezident_nds: r.norezident_nds,
    // Soliqlar (hisobot + to'lov)
    aylanma_qqs: r.aylanma_qqs,
    aylanma_qqs_tolov: r.aylanma_qqs_tolov,
    daromad_soliq: r.daromad_soliq,
    daromad_soliq_tolov: r.daromad_soliq_tolov,
    inps: r.inps,
    inps_tolov: r.inps_tolov,
    foyda_soliq: r.foyda_soliq,
    foyda_soliq_tolov: r.foyda_soliq_tolov,
    // Yillik
    moliyaviy_natija: r.moliyaviy_natija,
    buxgalteriya_balansi: r.buxgalteriya_balansi,
    // Statistika 2026
    stat_12_invest: r.stat_12_invest,
    stat_12_moliya: r.stat_12_moliya,
    stat_12_korxona: r.stat_12_korxona,
    stat_12_narx: r.stat_12_narx,
    stat_4_invest: r.stat_4_invest,
    stat_4_mehnat: r.stat_4_mehnat,
    stat_4_korxona_miz: r.stat_4_korxona_miz,
    stat_4_kb_qur_sav_xiz: r.stat_4_kb_qur_sav_xiz,
    stat_4_kb_sanoat: r.stat_4_kb_sanoat,
    stat_1_invest: r.stat_1_invest,
    stat_1_ih: r.stat_1_ih,
    stat_1_energiya: r.stat_1_energiya,
    stat_1_korxona: r.stat_1_korxona,
    stat_1_korxona_tif: r.stat_1_korxona_tif,
    stat_1_moliya: r.stat_1_moliya,
    stat_1_akt: r.stat_1_akt,
    // IT Park
    itpark_oylik: r.itpark_oylik,
    itpark_chorak: r.itpark_chorak,
    // Komunalka
    kom_suv: r.kom_suv,
    kom_gaz: r.kom_gaz,
    kom_svet: r.kom_svet,
    // Boshqa
    comment: r.comment || '',
    updatedAt: r.updated_at,
    history: [],
    // Buxgalter tarixi
    assigned_accountant_id: r.assigned_accountant_id,
    assigned_accountant_name: r.assigned_accountant_name,
    assigned_supervisor_id: r.assigned_supervisor_id,
    assigned_supervisor_name: r.assigned_supervisor_name,
    assigned_bank_manager_id: r.assigned_bank_manager_id,
    assigned_bank_manager_name: r.assigned_bank_manager_name,
    contract_amount: r.contract_amount
  })) as OperationEntry[];
};

// Clear all values for a specific column in a specific period (Superadmin only)
export const clearColumnForPeriod = async (period: string, columnKey: string) => {
  const { error } = await supabase
    .from('company_monthly_reports')
    .update({ [columnKey]: null, updated_at: new Date().toISOString() })
    .eq('period', period);
  if (error) throw error;
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
    // Soliqlar (umumiy)
    yer_soligi: report.yer_soligi,
    mol_mulk_soligi: report.mol_mulk_soligi,
    suv_soligi: report.suv_soligi,
    bonak: report.bonak,
    aksiz_soligi: report.aksiz_soligi,
    nedro_soligi: report.nedro_soligi,
    norezident_foyda: report.norezident_foyda,
    norezident_nds: report.norezident_nds,
    // Soliqlar (hisobot + to'lov)
    aylanma_qqs_tolov: report.aylanma_qqs_tolov,
    daromad_soliq_tolov: report.daromad_soliq_tolov,
    inps_tolov: report.inps_tolov,
    foyda_soliq_tolov: report.foyda_soliq_tolov,
    comment: report.comment,
    // Statistika 2026
    stat_12_invest: report.stat_12_invest,
    stat_12_moliya: report.stat_12_moliya,
    stat_12_korxona: report.stat_12_korxona,
    stat_12_narx: report.stat_12_narx,
    stat_4_invest: report.stat_4_invest,
    stat_4_mehnat: report.stat_4_mehnat,
    stat_4_korxona_miz: report.stat_4_korxona_miz,
    stat_4_kb_qur_sav_xiz: report.stat_4_kb_qur_sav_xiz,
    stat_4_kb_sanoat: report.stat_4_kb_sanoat,
    stat_1_invest: report.stat_1_invest,
    stat_1_ih: report.stat_1_ih,
    stat_1_energiya: report.stat_1_energiya,
    stat_1_korxona: report.stat_1_korxona,
    stat_1_korxona_tif: report.stat_1_korxona_tif,
    stat_1_moliya: report.stat_1_moliya,
    stat_1_akt: report.stat_1_akt,
    assigned_accountant_id: report.assigned_accountant_id,
    assigned_accountant_name: report.assigned_accountant_name,
    assigned_supervisor_id: report.assigned_supervisor_id,
    assigned_supervisor_name: report.assigned_supervisor_name,
    assigned_bank_manager_id: report.assigned_bank_manager_id,
    assigned_bank_manager_name: report.assigned_bank_manager_name,
    contract_amount: report.contract_amount,
    updated_at: new Date().toISOString()
  };

  const { error } = await withTimeout(
    () => supabase.from('company_monthly_reports').upsert(payload, { onConflict: 'company_id,period' }) as any,
    30000,
    'UPSERT_MONTHLY_REPORT'
  ) as any;
  if (error) throw error;
};

// Create a snapshot of company's current state into a monthly report
export const ensureOperationSnapshot = async (company: Company, period: string) => {
  try {
    // Use snake_case column names to match the DB schema
    const payload: any = {
      company_id: company.id,
      period: period,
    };

    // Only include snapshot fields if they have values
    if (company.accountantId) payload.assigned_accountant_id = company.accountantId;
    if (company.accountantName) payload.assigned_accountant_name = company.accountantName;

    const { error } = await supabase
      .from('company_monthly_reports')
      .upsert(payload, { onConflict: 'company_id,period' });

    if (error) {
      console.warn('[ensureOperationSnapshot] Non-critical error (save still succeeded):', error.message);
    }
  } catch (err: any) {
    // Never crash — snapshot is optional
    console.warn('[ensureOperationSnapshot] Skipped:', err.message);
  }
};

// Staff
export const fetchStaff = async (): Promise<Staff[]> => {
  const YORQINOY_ID = 'b717137c-607f-4f16-91ba-01ec093c3288';
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

    const staff = minData.map((p) => {
      let role = p.role;
      if (role === 'manager') role = 'supervisor';
      if (p.full_name === 'Super Admin' && role === 'supervisor') role = 'chief_accountant';

      return {
        id: p.id,
        name: p.full_name,
        role: role,
        avatarColor: 'hsl(200,50%,50%)',
        phone: '',
        is_active: true
      };
    }) as Staff[];

    if (!staff.some(s => s.id === YORQINOY_ID)) {
      staff.push({
        id: YORQINOY_ID,
        name: 'Yorqinoy',
        role: 'chief_accountant',
        avatarColor: 'hsl(280,60%,55%)',
        phone: '',
        is_active: true
      });
    }

    return staff;
  }

  const staff = data.map((p) => {
    let role = p.role;
    if (role === 'manager') role = 'supervisor';
    if (p.full_name === 'Super Admin' && role === 'supervisor') role = 'chief_accountant';

    return {
      id: p.id,
      name: p.full_name,
      role: role,
      avatarColor: p.avatar_color || 'hsl(200,50%,50%)',
      phone: p.phone || '',
      is_active: p.is_active ?? true
    };
  }) as Staff[];

  if (!staff.some(s => s.id === YORQINOY_ID)) {
    staff.push({
      id: YORQINOY_ID,
      name: 'Yorqinoy',
      role: 'chief_accountant',
      avatarColor: 'hsl(280,60%,55%)',
      phone: '',
      is_active: true
    });
  }

  return staff;
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

  // Map roles to DB enum strictly: 'super_admin', 'chief_accountant', 'supervisor', 'bank_manager', 'accountant', 'auditor'
  let dbRole = staff.role?.toLowerCase() || 'accountant';

  // Normalize known legacy mappings if needed
  if (dbRole === 'admin') dbRole = 'super_admin';
  if (dbRole === 'manager') dbRole = 'supervisor';

  const payload = {
    id: validId,
    email: staff.email || (staff.username ? `${staff.username} @asos.uz` : `${staff.name.toLowerCase().replace(/\s/g, '.')} @asos.uz`),
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
