import { z } from 'zod';
import { isValidPassword } from './passwordUtils';

// ===== COMPANY FORM VALIDATION =====
export const CompanyFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Company name is required')
    .max(255, 'Company name is too long')
    .trim(),

  inn: z
    .string()
    .regex(/^\d{14}$/, 'Invalid INN format (must be 14 digits)')
    .transform((val) => val.replace(/\D/g, '')), // Clean non-digits

  login: z
    .string()
    .min(1, 'Login is required')
    .max(255, 'Login is too long')
    .trim(),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((pwd) => isValidPassword(pwd), {
      message:
        'Password must contain uppercase, lowercase, number, and special character',
    })
    .optional(),

  taxType: z.enum(['nds_profit', 'turnover', 'fixed']),

  contractAmount: z
    .number()
    .min(0, 'Contract amount must be positive')
    .optional(),

  accountantId: z
    .string()
    .uuid('Invalid staff ID')
    .optional(),

  accountantName: z
    .string()
    .max(255, 'Name is too long')
    .trim()
    .optional(),
});

export type CompanyFormInput = z.infer<typeof CompanyFormSchema>;

// ===== OPERATION VALIDATION =====
export const OperationSchema = z.object({
  companyId: z.string().uuid('Invalid company ID'),

  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Invalid period format (YYYY-MM)'),

  status: z.enum(['pending', 'in_progress', 'completed', 'rejected']),

  assignedAccountantId: z.string().uuid('Invalid staff ID').optional(),

  notes: z.string().max(1000, 'Notes are too long').optional(),
});

export type OperationInput = z.infer<typeof OperationSchema>;

// ===== STAFF VALIDATION =====
export const StaffFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255).trim(),

  email: z.string().email('Invalid email address').optional(),

  phone: z.string().max(20).optional(),

  role: z.enum(['accountant', 'supervisor', 'chief_accountant', 'bank_manager']),

  companyId: z.string().uuid('Invalid company ID'),
});

export type StaffFormInput = z.infer<typeof StaffFormSchema>;

// ===== BATCH IMPORT VALIDATION =====
export const BatchCompanyImportSchema = z.array(CompanyFormSchema).min(1, 'At least one company required');

export const BatchOperationImportSchema = z.array(OperationSchema).min(1, 'At least one operation required');

// ===== HELPER VALIDATION FUNCTIONS =====

/**
 * Validate company form data
 */
export const validateCompanyForm = (data: unknown) => {
  try {
    const validated = CompanyFormSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Validation failed',
        errors: error.issues,
      };
    }
    return { success: false, error: 'Validation failed' };
  }
};

/**
 * Validate operation data
 */
export const validateOperation = (data: unknown) => {
  try {
    const validated = OperationSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Validation failed',
        errors: error.issues,
      };
    }
    return { success: false, error: 'Validation failed' };
  }
};

/**
 * Validate staff form data
 */
export const validateStaffForm = (data: unknown) => {
  try {
    const validated = StaffFormSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Validation failed',
        errors: error.issues,
      };
    }
    return { success: false, error: 'Validation failed' };
  }
};

/**
 * Validate batch import
 */
export const validateBatchCompanyImport = (data: unknown) => {
  try {
    const validated = BatchCompanyImportSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Batch validation failed',
        errors: error.issues,
      };
    }
    return { success: false, error: 'Batch validation failed' };
  }
};
