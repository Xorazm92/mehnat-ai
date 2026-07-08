"use client";

import {
  Banknote,
  ArrowUpCircle,
  ArrowDownCircle,
  Building2,
  TrendingUp,
  CreditCard,
  ChevronRight,
  Wallet,
} from "lucide-react";

interface AssignedCompany {
  id: string;
  name: string;
  inn: string;
  bankClientName: string | null;
  bankClientId: string | null;
  contractAssignments: Array<{
    salaryType: string;
    salaryValue: number;
    role: string;
  }>;
}

interface KassaEntry {
  id: string;
  type: string;
  category: string;
  amount: number;
  description: string | null;
  date: string;
}

interface KpiRecord {
  id: string;
  calculatedScore: number;
  status: string;
  rule: { nameUz: string; category: string };
}

interface BankCabinetProps {
  userName: string;
  assignedCompanies: AssignedCompany[];
  companiesCount: number;
  kassaEntries: KassaEntry[];
  kpiRecords: KpiRecord[];
  balance: { income: number; expense: number; net: number };
  currentMonth: string;
}

export function BankCabinet({
  userName,
  assignedCompanies,
  companiesCount,
  kassaEntries,
  kpiRecords,
  balance,
  currentMonth,
}: BankCabinetProps) {
  const firstName = userName.split(" ")[0];
  const monthLabel = new Date(`${currentMonth}-01`).toLocaleDateString("uz-UZ", {
    month: "long",
    year: "numeric",
  });

  const categoryLabels: Record<string, string> = {
    salary: "Maosh",
    transfer: "O'tkazma",
    payment: "To'lov",
    tax: "Soliq",
    other: "Boshqa",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Salom, {firstName}! 💼</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }} suppressHydrationWarning>
            Bank-Klient kabinetingiz — {monthLabel}
          </p>
        </div>
        <div className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--accent-blue-light)", border: "1px solid var(--accent-blue)", color: "var(--accent-blue)" }}>
          🏦 Bank-Klient
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(34, 197, 94, 0.15)" }}>
              <ArrowUpCircle size={20} style={{ color: "var(--success)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Kirim</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--success)" }}>
            {balance.income.toLocaleString()}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>so&apos;m</div>
        </div>

        <div className="rounded-2xl p-5" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(239, 68, 68, 0.15)" }}>
              <ArrowDownCircle size={20} style={{ color: "var(--danger)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Chiqim</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--danger)" }}>
            {balance.expense.toLocaleString()}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>so&apos;m</div>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{
            background: balance.net >= 0 ? "var(--accent-blue-light)" : "var(--danger-bg)",
            border: balance.net >= 0 ? "1px solid var(--accent-blue)" : "1px solid var(--danger-border)"
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: balance.net >= 0 ? "rgba(59, 130, 246, 0.15)" : "rgba(239, 68, 68, 0.15)" }}
            >
              <Wallet size={20} style={{ color: balance.net >= 0 ? "var(--accent-blue)" : "var(--danger)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Sof Balans</span>
          </div>
          <div
            className="text-2xl font-bold"
            style={{ color: balance.net >= 0 ? "var(--accent-blue)" : "var(--danger)" }}
          >
            {balance.net >= 0 ? "+" : ""}
            {balance.net.toLocaleString()}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>so&apos;m</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Biriktirilgan Firmalar */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <div className="flex items-center gap-2">
              <Building2 size={18} style={{ color: "var(--accent-blue)" }} />
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Biriktirilgan Firmalar</h2>
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{companiesCount} ta</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
            {assignedCompanies.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Firma biriktirilmagan</p>
              </div>
            ) : (
              assignedCompanies.map((company) => {
                const assignment = company.contractAssignments[0];
                return (
                  <div
                    key={company.id}
                    className="flex items-center gap-4 p-4 transition-colors group"
                    style={{ borderBottom: "1px solid var(--card-border)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--table-row-hover)"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59, 130, 246, 0.15)" }}>
                      <Banknote size={14} style={{ color: "var(--accent-blue)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{company.name}</p>
                      {company.bankClientName && (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Bank: {company.bankClientName}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {assignment && (
                        <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
                          {assignment.salaryType === "percent"
                            ? `${assignment.salaryValue}%`
                            : `${Number(assignment.salaryValue).toLocaleString()} so'm`}
                        </span>
                      )}
                      <ChevronRight
                        size={14}
                        style={{ color: "var(--text-muted)" }}
                        className="transition-colors group-hover:opacity-85"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Kassa operatsiyalari */}
        <div className="space-y-4">
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <div className="flex items-center gap-2">
                <CreditCard size={18} style={{ color: "var(--accent-indigo)" }} />
                <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Kassa Operatsiyalar</h2>
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>So&apos;nggi {kassaEntries.length} ta</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {kassaEntries.length === 0 ? (
                <div className="p-8 text-center text-text-secondary">
                  <CreditCard size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Bu oyda operatsiya yo&apos;q</p>
                </div>
              ) : (
                kassaEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 p-3 transition-colors"
                    style={{ borderBottom: "1px solid var(--card-border)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--table-row-hover)"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: entry.type === "income" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)" }}
                    >
                      {entry.type === "income" ? (
                        <ArrowUpCircle size={13} style={{ color: "var(--success)" }} />
                      ) : (
                        <ArrowDownCircle size={13} style={{ color: "var(--danger)" }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {entry.description || categoryLabels[entry.category] || entry.category}
                      </p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        <span suppressHydrationWarning>{new Date(entry.date).toLocaleDateString("uz-UZ")}</span>
                      </p>
                    </div>
                    <span
                      className="text-sm font-bold"
                      style={{ color: entry.type === "income" ? "var(--success)" : "var(--danger)" }}
                    >
                      {entry.type === "income" ? "+" : "-"}
                      {Number(entry.amount).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* KPI */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} style={{ color: "var(--accent-indigo)" }} />
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Mening KPI</h2>
            </div>
            {kpiRecords.length === 0 ? (
              <p className="text-sm text-center py-3" style={{ color: "var(--text-muted)" }}>
                Bu oyda KPI yozuvi yo&apos;q
              </p>
            ) : (
              <div className="space-y-2">
                {kpiRecords.slice(0, 5).map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
                  >
                    <p className="text-xs font-medium flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                      {record.rule.nameUz}
                    </p>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {Number(record.calculatedScore).toFixed(1)}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          record.status === "approved"
                            ? "bg-emerald-400"
                            : "bg-yellow-400"
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
