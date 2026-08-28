
export type AppView = 'dashboard' | 'organizations' | 'staff' | 'reports' | 'documents' | 'kpi' | 'kassa' | 'expenses' | 'cabinet' | 'payroll' | 'audit_logs';
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
  paymentMethod?: string; // 'naqd' | 'plastik' | 'schyot' | 'terminal' | 'boshqa'
  comment: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  amount: number;
  date: string;
  category: string;
  paymentMethod?: string; // 'naqd' | 'plastik' | 'schyot' | 'terminal' | 'boshqa'
  /**
   * Pul MANBAI — `DisbursementChannel.id`. `paymentMethod` dan farq qiladi:
   * usul "schyot orqali" deydi, manba esa KIMNING schyoti ekanini
   * (o'z firma hisobi yoki xodim plastigi). Eski yozuvlarda bo'sh.
   */
  channelId?: string | null;
  description: string;
  createdAt: string;
  status?: string; // pending | approved | rejected
  approvedBy?: string | null;
  rejectedReason?: string | null;
}

// Yagona kassa balansi tafsiloti (lib/balance.ts getAvailableBalance natijasi).
// Barcha pul jadvallari (Payment + KassaEntry + Expense + Payout) bitta balansga
// bog'lanadi. DIQQAT: chiqim `Payout` dan sanaladi, `PayrollAdjustment` dan emas —
// tasdiqlangan majburiyat hali pul emas (lib/balance.ts:5-7).
export interface BalanceBreakdown {
  income: number; // jami kirim
  outflow: number; // jami chiqim
  balance: number; // income − outflow (mavjud mablag')
  transitBalance?: number; // tranzit kartalardagi sarflanmagan qoldiq
  incomePayments: number; // to'langan shartnoma to'lovlari
  incomeKassa: number; // kassa kirimlari
  outflowExpenses: number; // tasdiqlangan xarajatlar
  outflowKassa: number; // kassa chiqimlari
  outflowPayroll: number; // REAL berilgan oyliklar/avanslar (Payout)
}

export enum TaxType {
  NDS_PROFIT = 'nds_profit',
  TURNOVER = 'turnover',
  FIXED = 'fixed'
}

export type ServerInfo = 'CR1' | 'CR2' | 'CR3' | 'srv1c1' | 'srv1c2' | 'srv1c3' | 'srv2';
export type SalaryCalculationType = 'percent' | 'fixed';
export type ContractRole = 'accountant' | 'controller' | 'bank_manager' | 'chief' | 'chief_accountant';

export enum ReportStatus {
  ACCEPTED = '+',
  NOT_SUBMITTED = '-',
  NOT_REQUIRED = '0',
  IN_PROGRESS = 'ariza',
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
  taxRegime?: string; // Prisma schema uses taxRegime (vat, turnover, fixed, yatt, income)
  internalContractor?: string;
  serverInfo?: ServerInfo | string; // Relaxed to string to allow free text from JSON
  serverName?: string; // New from JSON: "Сервер номи"
  baseName1c?: string;
  kpiEnabled?: boolean;
  contractAmount?: number;
  originalIndex?: number; // From JSON "№"
  isActive?: boolean;
  /** ASRO'ning O'Z yuridik shaxsi — mijoz emas. "Ichki firmalar" tabida ko'rinadi. */
  isOwnFirm?: boolean;
  createdAt: string;

  // Optional/Extended fields
  department?: string;
  login?: string;
  password?: string;
  ownerName?: string;
  accountantId?: string;
  accountantName?: string;
  bankClientId?: string;
  bankClientLogin?: string;
  bankClientPassword?: string;
  bankClientName?: string; // New from JSON: "bank klient"
  supervisorId?: string;
  supervisorName?: string;
  chiefAccountantId?: string;
  chiefAccountantName?: string;
  accountantPerc?: number;
  accountantSum?: number;
  bankClientPerc?: number; // New from JSON: "% банк клиент"
  bankClientSum?: number;
  chiefAccountantPerc?: number; // New from JSON: "%Bosh buxgalter Yorqinoy"
  chiefAccountantSum?: number;
  supervisorPerc?: number;
  supervisorSum?: number;
  statsType?: StatsType;
  itParkResident?: boolean | string; // Changed to allow "oylik/kvartalni" string
  statReports?: string[];
  requiredReports?: string[]; // New: List of reports company MUST submit (e.g. "QQS", "1-KB")
  serviceScope?: string[];
  isInternalContractor?: boolean; // New: Flag for "Ichki firma"
  internalContractorId?: string; // New: Link to "Ichki firma"
  /** Og'zaki shartnoma tomoni — DisbursementChannel.id (plastik/naqd). */
  internalChannelId?: string;
  /** Faqat ekran uchun: yuqoridagi kanalning nomi. */
  internalChannelLabel?: string;

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

  activeServices?: string[]; // REPORT_COLUMNS keys that are enabled for this company
  notes?: string; // Metadata storage or raw notes
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
  'foyda_va_zarar' | 'tovar_ostatka' | 'qqs' | 'aylanma' | 'aylanma_qqs' | 'daromad_soliq' | 'inps' | 'foyda_soliq' |
  'bonak' | 'yer_soligi' | 'mol_mulk_soligi' | 'suv_soligi' | 'moliyaviy_natija' | 'buxgalteriya_balansi' |
  'statistika' | 'itpark_oylik' | 'itpark_chorak' | 'kom_suv' | 'kom_gaz' | 'kom_svet' |
  'bank_klient' | 'nds_bekor_qilish' | 'ekologiya' |
  'stat_12_invest' | 'stat_12_moliya' | 'stat_12_korxona' | 'stat_12_narx' |
  'stat_4_invest' | 'stat_4_mehnat' | 'stat_4_korxona_miz' | 'stat_4_kb_qur_sav_xiz' | 'stat_4_kb_sanoat' |
  'stat_1_invest' | 'stat_1_ih' | 'stat_1_energiya' | 'stat_1_korxona' | 'stat_1_korxona_tif' | 'stat_1_moliya' | 'stat_1_akt' | 'stat_1_tib' | 'stat_1_turizm' | 'stat_4_moliya' |
  'aksiz_soligi' | 'nedro_soligi' | 'norezident_foyda' | 'norezident_nds' |
  'qqs_tolov' | 'aylanma_tolov' | 'aylanma_qqs_tolov' | 'daromad_soliq_tolov' | 'inps_tolov' | 'foyda_soliq_tolov' |
  'jismoniy_ijara' | 'stat_1_nnt' |
  'stat_1_hisobot_mazmuni' | 'stat_4_qx' | 'stat_1_qx' | 'stat_1_fx' | 'stat_4_fx' | 'stat_1_fan' |
  'dividend_soligi' | 'dividend_soligi_tolov' |
  'aksiz_soligi_tolov' |
  'nedro_soligi_tolov' |
  'norezident_foyda_tolov' |
  'norezident_nds_tolov' |
  'mol_mulk_soligi_tolov' |
  'yer_soligi_tolov' |
  'suv_soligi_tolov' |
  'jismoniy_ijara_tolov' |
  'bonak_tolov' |
  'foyda_avans_hisobot' |
  'mol_mulk_yillik' |
  'yer_yillik' |
  'suv_yillik' |
  'mol_mulk_malumotnoma' | 'suv_malumotnoma';

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
  /** @deprecated 2026-08 da `qqs` va `aylanma` ga bo'lindi. */
  aylanma_qqs?: string;
  qqs?: string;
  aylanma?: string;
  daromad_soliq?: string;
  inps?: string;
  foyda_soliq?: string;
  moliyaviy_natija?: string;
  buxgalteriya_balansi?: string;
  statistika?: string;
  ekologiya?: string;
  yer_soligi?: string;
  mol_mulk_soligi?: string;
  suv_soligi?: string;
  bonak?: string;
  aksiz_soligi?: string;
  nedro_soligi?: string;
  norezident_foyda?: string;
  norezident_nds?: string;
  /** @deprecated 2026-08 da `qqs_tolov` va `aylanma_tolov` ga bo'lindi. */
  aylanma_qqs_tolov?: string;
  qqs_tolov?: string;
  aylanma_tolov?: string;
  daromad_soliq_tolov?: string;
  inps_tolov?: string;
  foyda_soliq_tolov?: string;
  itpark_oylik?: string;
  itpark_chorak?: string;
  kom_suv?: string;
  kom_gaz?: string;
  kom_svet?: string;

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
  stat_1_nnt?: string;
  jismoniy_ijara?: string;

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
  assigned_supervisor_id?: string;
  assigned_supervisor_name?: string;
  assigned_bank_manager_id?: string;
  assigned_bank_manager_name?: string;
  contract_amount?: number;
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
  pinfl?: string; // JSHSHIR — 14 raqamli shaxsiy identifikatsiya raqami
  department?: string;
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

// KPI v2 — three-state input type
export type KPIInputTypeV2 = 'select' | 'counter' | 'checkbox_bonus' | 'checkbox_penalty' | 'amount_penalty';

// KPI v2 — one selectable option (bonus / neutral / penalty)
export interface KpiRuleOption {
  key: string;
  label_uz?: string;
  color?: 'green' | 'yellow' | 'red';
  coeff?: number | null;        // select/checkbox: direct percent
  coeff_per_unit?: number;      // counter: percent per unit
  max_coeff?: number | null;    // counter: cap on this option's contribution
  note?: string;
}

// KPI Role Type
export type KPIRoleType = 'accountant' | 'bank_client' | 'supervisor' | 'all';

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
  // --- KPI v2 (three-state options-based) ---
  descriptionUz?: string;
  options?: KpiRuleOption[];
  inputTypeV2?: KPIInputTypeV2;
  scope?: 'global' | 'per_company' | 'per_group';
  maxBonus?: number | null;
  maxPenalty?: number | null;
}

export interface CompanyKPIRule {
  id: string; // company_kpi_rules ID
  companyId: string;
  ruleId: string;
  rewardPercent?: number;  // Override
  penaltyPercent?: number; // Override
  isActive: boolean;
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
  ruleRole?: KPIRoleType;
  ruleRewardPercent?: number;
  rulePenaltyPercent?: number;
  rewardPercentOverride?: number;
  penaltyPercentOverride?: number;
  value: number;                   // 1=Ha, 0=Yo'q, 5=5 ta kechikish
  calculatedScore: number;         // Avtomat hisoblangan foiz
  // --- KPI v2 inputs ---
  selectedOption?: string | null;  // tanlangan holat key (green/yellow/red)
  earlyDays?: number;              // 08:30 gacha kelgan kunlar
  lateMinutes?: number;            // kechikkan daqiqalar
  absentDays?: number;             // uzrsiz kelmagan kunlar
  penaltyAmount?: number;          // qo'lda kiritilgan jarima (so'm)
  // 'bot' = Telegram javob-vaqti ledgeri, 'system' = muddat/davomat dalili.
  // Ikkalasi ham `status='submitted'` taklif yozadi va tasdiqni kutadi (ADR-0005).
  source?: 'employee' | 'supervisor' | 'chief' | 'system' | 'bot';
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  notes?: string;
  changeReason?: string;
  recordedBy?: string;
  recordedAt?: string;
}

// Payroll Adjustment Type
export type PayrollAdjustmentType = 'bonus' | 'avans' | 'jarima' | 'payment' | 'manual' | 'other';

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
export interface CompanyBreakdown {
  companyId: string;
  companyName: string;
  contractAmount: number;
  role: string;
  baseAmount: number;
  kpiBonus: number;
  kpiPenalty: number;
  // Jarima shu firmadagi bazadan OSHIB ketgan qismi. Oylik firma bo'yicha
  // nolga qisiladi (`lib/kpiLogic.ts` finalAmount = max(0, raw)), ya'ni oshgan
  // jarima jimgina yo'qoladi. Bu — yo'qolgan miqdor; 0 bo'lsa qisish bo'lmagan.
  clampedLoss: number;
  // Ulush QAYSI summadan hisoblangani. 'accrual' rejimida contractAmount ga
  // teng, 'cash' da esa shu davrda haqiqatda tushgan pul (`collectedAmount`
  // shartnomadan oshsa, shartnoma bilan cheklanadi).
  basisAmount?: number;
  collectedAmount?: number;
  details: string[];
}

export interface EmployeeSalary {
  id: string;
  employeeId: string;
  month: string;
  baseSalary: number;
  kpiBonus: number;
  kpiPenalty: number;
  totalSalary: number;
  breakdown: CompanyBreakdown[];
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

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
