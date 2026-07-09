// Plain (non-"use server") module so these non-function exports can be shared.
export const SYSTEM_SETTING_DEFAULTS = {
  appName: "UTYBI ERP",
  defaultUserPassword: "Password123!",
  features: {
    eimzo: false,
    integration_1c: false,
    integration_didox: false,
    integration_soliq: false,
    integration_mysoliq: false,
    tasks: false,
    invoices: false,
  },
} as const;

export type SystemSettings = {
  appName: string;
  defaultUserPassword: string;
  features: Record<string, boolean>;
};
