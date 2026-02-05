import { ClientAssignmentRole, AppView } from '../types';

// Role Definitions (mirroring DB)
export const ROLES = {
    SUPER_ADMIN: 'super_admin', // Yorkinoy
    SUPERVISOR: 'supervisor',   // Nazoratchi
    ACCOUNTANT: 'accountant',   // Buxgalter
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
    [ROLES.SUPERVISOR]: [
        'view_all_companies', 'manage_staff', 'approve_kpi'
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
    [ROLES.SUPER_ADMIN]: ['dashboard', 'organizations', 'staff', 'reports', 'analysis', 'documents', 'kpi', 'kassa', 'expenses', 'cabinet'],
    [ROLES.SUPERVISOR]: ['dashboard', 'organizations', 'staff', 'reports', 'kpi', 'cabinet'],
    [ROLES.ACCOUNTANT]: ['dashboard', 'organizations', 'reports', 'cabinet'], // Filtered orgs
    [ROLES.BANK_MANAGER]: ['dashboard', 'kassa', 'expenses', 'cabinet']
};

export const hasPermission = (role: UserRole, capability: Capability): boolean => {
    return ROLE_PERMISSIONS[role]?.includes(capability) || false;
};
