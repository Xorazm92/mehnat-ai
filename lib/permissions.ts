import { ContractRole, AppView } from '../types';

// Role Definitions (mirroring DB)
export const ROLES = {
    SUPER_ADMIN: 'super_admin', // Yorkinoy (Main admin)
    ADMIN: 'admin',             // Alias
    CHIEF_ACCOUNTANT: 'chief_accountant', // Yorqinoy
    SUPERVISOR: 'supervisor',   // Go'zaloy
    ACCOUNTANT: 'accountant',   // Staff
    BANK_MANAGER: 'bank_manager' // Bank
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

// Permission Capabilities
export type Capability =
    | 'view_all_companies'
    | 'edit_contracts'
    | 'manage_staff'
    | 'view_salaries'
    | 'approve_kpi'
    | 'process_payments';

export const ROLE_PERMISSIONS: Record<UserRole, Capability[]> = {
    [ROLES.SUPER_ADMIN]: [
        'view_all_companies', 'edit_contracts', 'manage_staff', 'view_salaries', 'approve_kpi', 'process_payments'
    ],
    [ROLES.ADMIN]: [
        'view_all_companies', 'edit_contracts', 'manage_staff', 'view_salaries', 'approve_kpi', 'process_payments'
    ],
    [ROLES.CHIEF_ACCOUNTANT]: [
        'view_all_companies', 'manage_staff', 'view_salaries', 'approve_kpi'
    ],
    [ROLES.SUPERVISOR]: [
        'view_all_companies', 'manage_staff', 'approve_kpi', 'view_salaries'
    ],
    [ROLES.ACCOUNTANT]: [
        // Limited access
    ],
    [ROLES.BANK_MANAGER]: [
        'process_payments'
    ]
};

// View Access Control
export const ALLOWED_VIEWS: Record<UserRole, AppView[]> = {
    [ROLES.SUPER_ADMIN]: ['dashboard', 'organizations', 'staff', 'reports', 'analysis', 'documents', 'kpi', 'kassa', 'expenses', 'cabinet', 'payroll', 'audit_logs'],
    [ROLES.ADMIN]: ['dashboard', 'organizations', 'staff', 'reports', 'analysis', 'documents', 'kpi', 'kassa', 'expenses', 'cabinet', 'payroll', 'audit_logs'],
    [ROLES.CHIEF_ACCOUNTANT]: ['dashboard', 'organizations', 'staff', 'reports', 'analysis', 'documents', 'kpi', 'kassa', 'expenses', 'cabinet', 'payroll'],
    [ROLES.SUPERVISOR]: ['dashboard', 'organizations', 'staff', 'reports', 'analysis', 'documents', 'kpi', 'kassa', 'expenses', 'cabinet', 'payroll'],
    [ROLES.ACCOUNTANT]: ['dashboard', 'organizations', 'reports', 'cabinet'], // Filtered orgs
    [ROLES.BANK_MANAGER]: ['dashboard', 'kassa', 'expenses', 'cabinet']
};

const normalizeViewId = (viewId: string): AppView | null => {
    const v = String(viewId || '').trim();
    if (!v) return null;

    if (v === 'companies') return 'organizations';
    if (v === 'operations') return 'reports';
    if (v === 'settings') return 'cabinet';

    return v as AppView;
};

export const canSeeView = (role: UserRole, viewId: string): boolean => {
    const normalized = normalizeViewId(viewId);
    if (!normalized) return false;
    return ALLOWED_VIEWS[role]?.includes(normalized) || false;
};

export const hasPermission = (role: UserRole, capability: Capability): boolean => {
    return ROLE_PERMISSIONS[role]?.includes(capability) || false;
};
