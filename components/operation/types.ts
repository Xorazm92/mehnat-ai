/**
 * Matritsa qatorining shakli — `OperationModule`, `OperationRow` va
 * `StatusCell` uchun umumiy. Ilgari u `OperationModule.tsx` ichida turardi va
 * qatorni chizadigan komponent ham o'sha faylda yashashga majbur edi.
 */
export interface ReportRow {
  index: number;
  name: string;
  inn: string;
  accountant: string;
  /**
   * Qolgan mas'ullar va firma xossalari — FILTR uchun.
   *
   * Avval qatorda faqat `accountant` bor edi, shuning uchun "Go'zaloy nazorat
   * qiladigan firmalar" yoki "QQS to'lovchilar" kabi savollarga matritsada
   * javob topib bo'lmasdi — ma'lumot `companies` propida bor edi, lekin
   * qatorga o'tkazilmagan.
   */
  supervisor: string;
  chief: string;
  bank: string;
  regime: string;
  department: string;
  director: string;
  taxType: string;
  login: string;
  password: string;
  companyId?: string;
  activeServices: string[];
  [key: string]: string | number | string[] | undefined;
}

/** Katakdagi dalil haqida menyu uchun kerak bo'ladigan minimal ma'lumot. */
export interface ProofMeta {
  status: string;
  mine: boolean;
}
