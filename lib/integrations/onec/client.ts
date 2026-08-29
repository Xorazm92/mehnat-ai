/**
 * 1C HTTP API client — Faza B/1C integratsiya uchun scaffold.
 *
 * BU SKAFFOLD — to'liq typed codeni yozish uchun asos.
 * Haqiqiy implementatsiya uchun mijoz 1C server API hujjatlarini taqdim qilishi kerak.
 *
 * Kutilgan API:
 *   GET  /hs/api/v1/contracts          — shartnomalar
 *   GET  /hs/api/v1/debtors             — qarzdorlik hisoboti
 *   GET  /hs/api/v1/invoices           — invoyslar
 *   POST /hs/api/v1/payments           — to'lov yozish
 */

export class OneCError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public body?: string
  ) {
    super(message);
    this.name = "OneCError";
  }
}

export interface OneCConfig {
  baseUrl: string;
  apiKey: string;
  companyId: string;
}

interface RequestOpts {
  method?: string;
  body?: unknown;
}

async function apiFetch<T>(config: OneCConfig, path: string, opts: RequestOpts = {}): Promise<T> {
  const resp = await fetch(`${config.baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Basic ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    next: { revalidate: 0 },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new OneCError(`1C ${opts.method ?? "GET"} ${path} → ${resp.status} ${resp.statusText}`, resp.status, body);
  }
  return resp.json() as Promise<T>;
}

export interface OneCContract {
  id: string;
  number: string;
  date: string;
  counterparty: string;
  inn: string;
  openingDebt: number;
  monthlyPayment: number;
}

export interface OneCDebtor {
  name: string;
  inn: string;
  contractNumber: string | null;
  balance: number;
  overdue: number;
}

export interface OneCInvoice {
  id: string;
  number: string;
  date: string;
  customer: string;
  inn: string;
  amount: number;
  paid: number;
}

export interface OneCPayment {
  id?: string;
  date: string;
  invoiceId: string;
  amount: number;
  method: "naqd" | "plastik" | "schyot";
}

export async function fetchContracts(config: OneCConfig): Promise<OneCContract[]> {
  return apiFetch<OneCContract[]>(config, "/hs/api/v1/contracts");
}

export async function fetchDebtors(config: OneCConfig): Promise<OneCDebtor[]> {
  return apiFetch<OneCDebtor[]>(config, "/hs/api/v1/debtors");
}

export async function fetchInvoices(config: OneCConfig): Promise<OneCInvoice[]> {
  return apiFetch<OneCInvoice[]>(config, "/hs/api/v1/invoices");
}

export async function postPayment(
  config: OneCConfig,
  payment: Omit<OneCPayment, "id">
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(config, "/hs/api/v1/payments", {
    method: "POST",
    body: payment,
  });
}
