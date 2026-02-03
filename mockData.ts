
import { TaxRegime, StatsType, ReportStatus, Company, OperationEntry, Config } from './types';

// 1-Sahifa: FIRMALAR_BAZASI (Static Data)
// Fixed property 'accountant' to 'accountantId' and added 'createdAt'
// Added 'accountantName' to fix property missing error
export const COMPANIES: Company[] = [
  { id: '1', name: 'Premium Tex GMBH', inn: '301234567', accountantId: 's1', accountantName: 'Abrorbek', taxRegime: TaxRegime.VAT, statsType: StatsType.KB1, department: 'Sanoat', createdAt: '2024-01-01' },
  { id: '2', name: 'Zamin Qurilish LLC', inn: '302345678', accountantId: 's2', accountantName: 'Axmadjon', taxRegime: TaxRegime.TURNOVER, statsType: StatsType.MICRO, department: 'Qurilish', createdAt: '2024-01-01' },
  { id: '3', name: 'Smart Soft Systems', inn: '303456789', accountantId: 's3', accountantName: 'Dilmurod', taxRegime: TaxRegime.VAT, statsType: StatsType.KB1, department: 'IT', createdAt: '2024-01-01' },
  { id: '4', name: "G'alaba Tekstil", inn: '304567890', accountantId: 's1', accountantName: 'Abrorbek', taxRegime: TaxRegime.INCOME, statsType: StatsType.MEHNAT1, department: 'Yengil Sanoat', createdAt: '2024-01-01' },
  { id: '5', name: 'Fayz Savdo Markazi', inn: '305678901', accountantId: 's2', accountantName: 'Axmadjon', taxRegime: TaxRegime.TURNOVER, statsType: StatsType.SMALL, department: 'Savdo', createdAt: '2024-01-01' },
  { id: '6', name: 'Logistik Trans', inn: '306789012', accountantId: 's1', accountantName: 'Abrorbek', taxRegime: TaxRegime.VAT, statsType: StatsType.KB1, department: 'Logistika', createdAt: '2024-01-01' },
];

// 2-Sahifa: OPERATSIYA_JURNALI (Dynamic Data)
// Added 'id' and 'updatedAt' to satisfy OperationEntry interface
export const OPERATIONS: OperationEntry[] = [
  { id: 'op1', updatedAt: new Date().toISOString(), companyId: '1', period: '2024 Yillik', profitTaxStatus: ReportStatus.ACCEPTED, form1Status: ReportStatus.ACCEPTED, form2Status: ReportStatus.ACCEPTED, statsStatus: ReportStatus.ACCEPTED, comment: '', history: [] },
  { id: 'op2', updatedAt: new Date().toISOString(), companyId: '2', period: '2024 Yillik', profitTaxStatus: ReportStatus.NOT_REQUIRED, form1Status: ReportStatus.REJECTED, form2Status: ReportStatus.SUBMITTED, statsStatus: ReportStatus.NOT_SUBMITTED, comment: 'Hujjatlar chala', history: [] },
  { id: 'op3', updatedAt: new Date().toISOString(), companyId: '3', period: '2024 Yillik', profitTaxStatus: ReportStatus.ACCEPTED, form1Status: ReportStatus.ACCEPTED, form2Status: ReportStatus.ACCEPTED, statsStatus: ReportStatus.ACCEPTED, comment: '', history: [] },
  { id: 'op4', updatedAt: new Date().toISOString(), companyId: '4', period: '2024 Yillik', profitTaxStatus: ReportStatus.IN_PROGRESS, form1Status: ReportStatus.IN_PROGRESS, form2Status: ReportStatus.IN_PROGRESS, statsStatus: ReportStatus.NOT_SUBMITTED, comment: 'Direktor chet elda', history: [] },
  { id: 'op5', updatedAt: new Date().toISOString(), companyId: '5', period: '2024 Yillik', profitTaxStatus: ReportStatus.NOT_REQUIRED, form1Status: ReportStatus.SUBMITTED, form2Status: ReportStatus.SUBMITTED, statsStatus: ReportStatus.IN_PROGRESS, comment: '', history: [] },
  { id: 'op6', updatedAt: new Date().toISOString(), companyId: '6', period: '2024 Yillik', profitTaxStatus: ReportStatus.ACCEPTED, form1Status: ReportStatus.ACCEPTED, form2Status: ReportStatus.ACCEPTED, statsStatus: ReportStatus.ACCEPTED, comment: '', history: [] },
];

// 3-Sahifa: CONFIG (Sozlamalar)
export const CONFIG: Config = {
  profitTaxDeadline: '2024-03-01',
  statsDeadline: '2024-02-15',
  kpiNorm: 90
};
