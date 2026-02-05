
export type AppView = 'dashboard' | 'organizations' | 'staff' | 'reports' | 'analysis' | 'documents' | 'kpi' | 'kassa' | 'expenses' | 'cabinet';
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

export enum TaxRegime {
  VAT = 'НДС',
  TURNOVER = 'Айланма',
  FIXED = 'Қатъий',
  YATT = 'ЯТТ',
  INCOME = 'Фойда'
}

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

export interface HistoryLog {
  action: string;
  date: string;
  comment: string;
  user: string;
}

export interface Company {
  id: string;
  name: string;
  inn: string;
  accountantName: string;
  taxRegime: TaxRegime;
  login?: string;
  password?: string;
  department: string;
  accountantId: string;
  bankClientId?: string;
  bankClientName?: string;
  supervisorId?: string;
  supervisorName?: string;
  contractAmount: number;
  accountantPerc: number;
  bankClientSum: number;
  chiefAccountantSum: number;
  supervisorPerc: number;
  statsType?: StatsType;
  ownerName?: string;
  isActive?: boolean;
  createdAt?: string;
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
  updatedAt: string;
  history: HistoryLog[];
  kpi?: KPIMetrics;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  phone?: string;
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
