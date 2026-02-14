
export type AppView = 'dashboard' | 'organizations' | 'staff' | 'reports' | 'analysis' | 'documents' | 'kpi' | 'kassa' | 'expenses' | 'cabinet' | 'payroll' | 'audit_logs';
export type Language = 'uz' | 'ru';

export enum PaymentStatus {
  PAID = 'paid',
  PENDING = 'pending',
  PARTIAL = 'partial',
  OVERDUE = 'overdue'
}

export interface Payment {
  id: string;
  companyId: string;
  amount: number;
  period: string;
  paymentDate: string;
  status: PaymentStatus;
  comment: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  createdAt: string;
}

export enum TaxType {
  NDS_PROFIT = 'nds_profit',
  TURNOVER = 'turnover',
  FIXED = 'fixed'
}

export type ServerInfo = 'CR1' | 'CR2' | 'CR3';
export type SalaryCalculationType = 'percent' | 'fixed';
export type ContractRole = 'accountant' | 'controller' | 'bank_manager';

export enum ReportStatus {
  ACCEPTED = '+',
  NOT_SUBMITTED = '-',
  NOT_REQUIRED = '0',
  IN_PROGRESS = 'ариза',
  BLOCKED = 'kartoteka',
  ERROR = 'OSHIBKA',
  UNKNOWN = '?',
  REJECTED = 'rad etildi',
  SUBMITTED = 'topshirildi'
}

export enum StatsType {
  KB1 = '1-KB',
  MICRO = 'Micro',
  MEHNAT1 = '1-Mehnat',
  SMALL = 'Small'
}

export enum ServiceScope {
  ACCOUNTING = 'Buxgalteriya',
  HR = 'Kadrlar ishi',
  BANKING = 'Bank xizmatlari',
  CONSULTING = 'Konsalting',
  LEGAL = 'Huquqiy maslahat'
}

// Company Status (Tab 6: XAVF)
export enum CompanyStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEBTOR = 'debtor',
  PROBLEM = 'problem',
  BANKRUPT = 'bankrupt'
}

// Risk Level (Tab 6: XAVF)
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

// 1C Accounting Status (Tab 2: SOLIQ)
export enum OneCStatus {
  CLOUD = 'cloud',
  LOCAL = 'local',
  SERVER = 'server',
  NONE = 'none'
}

// Credential Service Types (Tab 3: LOGINLAR)
export enum CredentialService {
  SOLIQ = 'soliq',
  DIDOX = 'didox',
  MY_MEHNAT = 'my_mehnat',
  BANK_CLIENT = 'bank_client'
}

export interface HistoryLog {
  action: string;
  date: string;
  comment: string;
  user: string;
}

// Client Credential (Tab 3: LOGINLAR)
export interface ClientCredential {
  id: string;
  companyId: string;
  serviceName: CredentialService | string;
  loginId: string;
  encryptedPassword: string;
  keyFilePath?: string;
  notes?: string;
  updatedBy?: string;
  updatedAt?: string;
}

// Client History (Tab 4: JAMOA & Audit)
export interface ClientHistory {
  id: string;
  companyId: string;
  changeType: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedBy?: string;
  changedByName?: string;
  changedAt: string;
  notes?: string;
}

// Extended Company Interface with 6-Tab Profile fields
export interface Company {
  id: string;
  name: string;
  inn: string;
  taxType: TaxType;
  internalContractor?: string;
  serverInfo?: ServerInfo | string; // Relaxed to string to allow free text from JSON
  serverName?: string; // New from JSON: "Сервер номи"
  baseName1c?: string;
  kpiEnabled?: boolean;
  contractAmount?: number;
  originalIndex?: number; // From JSON "№"
  isActive?: boolean;
  createdAt: string;

  // Optional/Extended fields
  department?: string;
  login?: string;
  password?: string;
  ownerName?: string;
  accountantId?: string;
  accountantName?: string;
  bankClientId?: string;
  bankClientName?: string; // New from JSON: "bank klient"
  supervisorId?: string;
  supervisorName?: string;
  accountantPerc?: number;
  bankClientPerc?: number; // New from JSON: "% банк клиент"
  bankClientSum?: number;
  chiefAccountantPerc?: number; // New from JSON: "%Bosh buxgalter Yorqinoy"
  chiefAccountantSum?: number;
  supervisorPerc?: number;
  statsType?: StatsType;
  itParkResident?: boolean | string; // Changed to allow "oylik/kvartalni" string
  statReports?: string[];
  requiredReports?: string[]; // New: List of reports company MUST submit (e.g. "QQS", "1-KB")
  serviceScope?: string[];
  isInternalContractor?: boolean; // New: Flag for "Ichki firma"
  internalContractorId?: string; // New: Link to "Ichki firma"

  // Tab 1: PASPORT
  brandName?: string;
  directorName?: string;
  directorPhone?: string;
  legalAddress?: string;
  founderName?: string;
  logoUrl?: string;
  certificateFilePath?: string;
  charterFilePath?: string;

  // Tab 2: SOLIQ
  vatCertificateDate?: string;
  hasLandTax?: boolean;
  hasWaterTax?: boolean;
  hasPropertyTax?: boolean;
  hasExciseTax?: boolean;
  hasAuctionTax?: boolean;
  oneCStatus?: OneCStatus;
  oneCLocation?: string;

  // Tab 5: SHARTNOMA
  contractNumber?: string;
  contractDate?: string;
  paymentDay?: number;
  firmaSharePercent?: number;
  currentBalance?: number;

  // Tab 6: XAVF
  companyStatus?: CompanyStatus;
  riskLevel?: RiskLevel;
  riskNotes?: string;

  // Xizmatlar nazorati
  activeServices?: string[]; // REPORT_COLUMNS keys that are enabled for this company
}

export interface KPIMetrics {
  // Supervisor (Rule 1)
  supervisorAttendance: boolean; // ±0.5%

  // Bank Client (Rule 2)
  bankClientAttendance: boolean; // ±1%
  bankClientTgOk: boolean;      // +1%
  bankClientTgMissed: number;   // -0.5% each

  // Accountant (Rule 3)
  accTgOk: boolean;             // +1%
  accTgMissed: number;          // -0.5% each
  didox: boolean;               // ±0.25%
  letters: boolean;              // ±0.25%
  myMehnat: boolean;             // ±0.25%
  oneC: boolean;                // +1% / 0
  autoCameral: boolean;          // ±0.25%
  cashFlow: boolean;             // ±0.2%
  taxInfo: boolean;              // ±0.2%
  payroll: boolean;              // ±0.2%
  debt: boolean;                // ±0.2%
  pnl: boolean;                 // ±0.2%
}

export type OperationFieldKey = 'didox' | 'xatlar' | 'avtokameral' | 'my_mehnat' | 'one_c' |
  'pul_oqimlari' | 'chiqadigan_soliqlar' | 'hisoblangan_oylik' | 'debitor_kreditor' |
  'foyda_va_zarar' | 'tovar_ostatka' | 'aylanma_qqs' | 'daromad_soliq' | 'inps' | 'foyda_soliq' |
  'bonak' | 'yer_soligi' | 'mol_mulk_soligi' | 'suv_soligi' | 'moliyaviy_natija' | 'buxgalteriya_balansi' |
  'statistika' | 'itpark_oylik' | 'itpark_chorak' | 'kom_suv' | 'kom_gaz' | 'kom_svet' |
  'bank_klient' | 'nds_bekor_qilish' |
  'stat_12_invest' | 'stat_12_moliya' | 'stat_12_korxona' | 'stat_12_narx' |
  'stat_4_invest' | 'stat_4_mehnat' | 'stat_4_korxona_miz' | 'stat_4_kb_qur_sav_xiz' | 'stat_4_kb_sanoat' |
  'stat_1_invest' | 'stat_1_ih' | 'stat_1_energiya' | 'stat_1_korxona' | 'stat_1_korxona_tif' | 'stat_1_moliya' | 'stat_1_akt';

export type TaskStatus = 'new' | 'submitted' | 'pending_review' |
  'approved' | 'rejected' | 'overdue' | 'not_required' | 'blocked';

export interface OperationTemplate {
  key: OperationFieldKey;
  nameUz: string;
  nameRu: string;
  assignedRole: 'accountant' | 'bank_manager';
  deadlineDay: number;       // Oyning nechanchi kunida
  frequency: 'monthly' | 'quarterly' | 'yearly';
  condition?: (company: Company) => boolean;  // Qachon kerak
}

export interface OperationTask {
  id: string; // Unique ID (compound of companyId + key + period)
  companyId: string;
  companyName: string;
  templateKey: OperationFieldKey;
  templateName: string;
  assigneeId?: string;       // Buxgalter/Bank menejer ID
  assigneeName: string;
  controllerId?: string;     // Nazoratchi ID
  controllerName: string;
  period: string;            // "2026-02"
  deadline: string;          // ISO date
  status: TaskStatus;
  jsonValue: string;         // JSON dagi qiymat ("+", "-", "0", "kartoteka")
  submittedAt?: string;
  verifiedAt?: string;
  comment?: string;
  evidenceFile?: string;
  serverInfo?: string;       // "srv2", "srv1c2" etc.
  serverName?: string;       // "46.Montaj-Teplo-Energo"
}

export interface OperationEntry {
  id: string;
  companyId: string;
  period: string;

  // Specific Report Columns (from CSV)
  bank_klient?: string;
  didox?: string;
  xatlar?: string;
  avtokameral?: string;
  my_mehnat?: string;
  one_c?: string;
  pul_oqimlari?: string;
  chiqadigan_soliqlar?: string;
  hisoblangan_oylik?: string;
  debitor_kreditor?: string;
  foyda_va_zarar?: string;
  tovar_ostatka?: string;
  nds_bekor_qilish?: string;
  aylanma_qqs?: string;
  daromad_soliq?: string;
  inps?: string;
  foyda_soliq?: string;
  moliyaviy_natija?: string;
  buxgalteriya_balansi?: string;
  statistika?: string;
  bonak?: string;
  yer_soligi?: string;
  mol_mulk_soligi?: string;
  suv_soligi?: string;

  // Statistika 2026
  stat_12_invest?: string;
  stat_12_moliya?: string;
  stat_12_korxona?: string;
  stat_12_narx?: string;
  stat_4_invest?: string;
  stat_4_mehnat?: string;
  stat_4_korxona_miz?: string;
  stat_4_kb_qur_sav_xiz?: string;
  stat_4_kb_sanoat?: string;
  stat_1_invest?: string;
  stat_1_ih?: string;
  stat_1_energiya?: string;
  stat_1_korxona?: string;
  stat_1_korxona_tif?: string;
  stat_1_moliya?: string;
  stat_1_akt?: string;

  // Legacy fields (backward compatibility for Dashboard, Analysis, etc.)
  profitTaxStatus?: ReportStatus;
  form1Status?: ReportStatus;
  form2Status?: ReportStatus;
  statsStatus?: ReportStatus;

  comment?: string;
  profitTaxDeadline?: string;
  statsDeadline?: string;
  updatedAt: string;
  assigned_accountant_id?: string;
  assigned_accountant_name?: string;
  history: HistoryLog[];
  kpi?: KPIMetrics;
  tasks?: OperationTask[];       // NEW: List of all dynamic tasks
}

export type StaffStatus = 'active' | 'vacation' | 'sick';

export interface Staff {
  id: string;
  name: string;
  username?: string; // New
  email?: string; // Auth
  password?: string; // Auth (only for creation)
  role: string;
  avatarColor: string;
  phone?: string;
  gender?: 'erkak' | 'ayol';
  birthDate?: string;
  education?: 'oliy' | 'orta' | 'magistratura';
  hiredAt?: string;
  firedAt?: string;
  status?: StaffStatus;
  rating?: number;
  is_active: boolean; // New
}

export interface AccountantKPI {
  name: string;
  totalCompanies: number;
  annualCompleted: number; // '+' statusdagilar
  annualPending: number;   // '-' statusdagilar
  annualBlocked: number;   // 'kartoteka' statusdagilar
  statsCompleted: number;
  annualProgress: number;
  statsProgress: number;
  zone: 'green' | 'yellow' | 'red';
}

export interface Config {
  profitTaxDeadline: string;
  statsDeadline: string;
  kpiNorm: number;
}

// =====================================================
// AVTOMATIK KPI TIZIMI — Types
// =====================================================

// KPI Input Type
export type KPIInputType = 'checkbox' | 'counter' | 'number' | 'rating';

// KPI Role Type
export type KPIRoleType = 'accountant' | 'bank_client' | 'supervisor';

// KPI Rule (Dinamik qoida)
export interface KPIRule {
  id: string;
  name: string;                    // Internal: "telegram_response"
  nameUz: string;                  // O'zbekcha: "Telegramda javob"
  role: KPIRoleType;
  rewardPercent: number;           // +1.0%
  penaltyPercent: number;          // -0.5%
  inputType: KPIInputType;
  category: string;                // 'attendance', 'telegram', 'reports'
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

// Monthly Performance Entry (Oylik natija)
export interface MonthlyPerformance {
  id: string;
  month: string;                   // '2026-02-01'
  companyId: string;
  companyName?: string;
  employeeId: string;
  employeeName?: string;
  ruleId: string;
  ruleName?: string;
  ruleNameUz?: string;
  value: number;                   // 1=Ha, 0=Yo'q, 5=5 ta kechikish
  calculatedScore: number;         // Avtomat hisoblangan foiz
  notes?: string;
  changeReason?: string;
  recordedBy?: string;
  recordedAt?: string;
}

// Payroll Adjustment Type
export type PayrollAdjustmentType = 'bonus' | 'avans' | 'jarima' | 'manual' | 'other';

// Payroll Adjustment (Qo'lda to'lovlar)
export interface PayrollAdjustment {
  id: string;
  month: string;
  employeeId: string;
  employeeName?: string;
  adjustmentType: PayrollAdjustmentType;
  amount: number;                  // Musbat yoki manfiy
  reason: string;
  approvedBy?: string;
  approvedAt?: string;
  isApproved: boolean;
  createdAt?: string;
  createdBy?: string;
}

// Employee Salary Summary (Xodim oylik xulosasi)
export interface EmployeeSalarySummary {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  month: string;

  // Firmalar
  companyCount: number;

  // Oylik bo'limlari
  baseSalary: number;              // Asosiy oylik (shartnomalardan)
  kpiBonus: number;                // KPI bonus (musbat)
  kpiPenalty: number;              // KPI jarima (manfiy)
  adjustments: number;             // Qo'lda qo'shilganlar

  // Jami
  totalSalary: number;

  // Tafsilotlar
  performanceDetails?: MonthlyPerformance[];
  adjustmentDetails?: PayrollAdjustment[];
}

// Performance Change Log (O'zgarishlar tarixi)
export interface PerformanceChangeLog {
  id: string;
  performanceId: string;
  oldValue: number;
  newValue: number;
  changeReason: string;
  changedBy: string;
  changedByName?: string;
  changedAt: string;
}

// =====================================================
// RBAC & HISTORY (Integration)
// =====================================================

export interface ContractAssignment {
  id: string;
  clientId: string;
  userId: string;
  role: ContractRole;
  salaryType: SalaryCalculationType;
  salaryValue: number;
  startDate: string;
  endDate?: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: any; // JSONB
  ipAddress?: string;
  createdAt: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  url: string;
  size?: string;
  uploadedAt: string;
  companyId?: string;
  staffId?: string;
}
export interface AppNotification {
  id: string;
  userId: string;
  type: 'deadline' | 'status_change' | 'kpi_alert' | 'system' | 'approval_request';
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}
