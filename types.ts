
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

export interface OperationEntry {
  id: string;
  companyId: string;
  period: string;
  profitTaxStatus: ReportStatus;
  form1Status: ReportStatus;
  form2Status: ReportStatus;
  statsStatus: ReportStatus;
  comment: string;
  profitTaxDeadline?: string;
  statsDeadline?: string;
  updatedAt: string;
  history: HistoryLog[];
  kpi?: KPIMetrics;
}

export type StaffStatus = 'active' | 'vacation' | 'sick';

export interface Staff {
  id: string;
  name: string;
  username?: string; // New
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
