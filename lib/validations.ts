import { z } from "zod";

// =====================================================
// COMPANY VALIDATION SCHEMAS
// =====================================================
export const companySchema = z.object({
  name: z.string().min(1, "Firma nomi kiritilishi shart"),
  inn: z.string().regex(/^\d{9}$|^\d{14}$/, "INN 9 ta yoki JSHSHIR 14 ta raqamdan iborat bo'lishi kerak").optional().or(z.literal("")),
  brandName: z.string().nullable().optional(),
  directorName: z.string().nullable().optional(),
  directorPhone: z.string().nullable().optional(),
  legalAddress: z.string().nullable().optional(),
  founderName: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  bankClientName: z.string().nullable().optional(),
  serverInfo: z.string().nullable().optional(),
  serverName: z.string().nullable().optional(),
  baseName1c: z.string().nullable().optional(),
  contractNumber: z.string().nullable().optional(),
  contractAmount: z.number().nonnegative("Shartnoma summasi manfiy bo'lolmaydi").nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  taxRegime: z.enum(["vat", "turnover", "fixed", "yatt", "income"]).optional(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).nullable().optional(),
  accountantId: z.string().nullable().optional(),
  supervisorId: z.string().nullable().optional(),
  chiefAccountantId: z.string().nullable().optional(),
  bankClientId: z.string().nullable().optional(),
  bankClientLogin: z.string().nullable().optional(),
  bankClientPassword: z.string().nullable().optional(),
});

// =====================================================
// USER VALIDATION SCHEMAS
// =====================================================
export const createUserSchema = z.object({
  email: z.string().email("Yaroqli email kiriting"),
  fullName: z.string().min(2, "F.I.SH kamida 2 harf bo'lishi kerak"),
  password: z.string().min(6, "Parol kamida 6 ta belgi bo'lishi kerak"),
  role: z.enum([
    "super_admin",
    "admin",
    "chief_accountant",
    "supervisor",
    "accountant",
    "bank_manager",
  ]),
  phone: z.string().nullable().optional(),
  pinfl: z.string().regex(/^\d{14}$/, "JSHSHIR 14 ta raqam bo'lishi kerak").nullable().optional().or(z.literal("")),
  department: z.string().nullable().optional(),
  avatarColor: z.string().optional(),
});

export const updateUserSchema = createUserSchema.partial().omit({ email: true, password: true });

// =====================================================
// TASK & OPERATION SCHEMAS
// =====================================================
export const taskSchema = z.object({
  title: z.string().min(1, "Sarlovha kiritilishi shart"),
  description: z.string().nullable().optional(),
  companyId: z.string().min(1, "Firma tanlanishi shart"),
  assigneeId: z.string().min(1, "Mas'ul xodim tanlanishi shart"),
  dueDate: z.string().or(z.date()).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

export const reportColumnGroupSchema = z.object({
  code: z.string().min(1),
  nameUz: z.string().min(1),
  category: z.enum(["OPERATSION", "SOLIQ", "STATISTIKA", "MAXSUS"]),
  sortOrder: z.number().int().default(0),
});
