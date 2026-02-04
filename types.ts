
export type AppView = 'dashboard' | 'organizations' | 'staff' | 'reports' | 'analysis' | 'documents';
export type Language = 'uz' | 'ru';

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
  statsType?: StatsType;
  createdAt?: string;
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
