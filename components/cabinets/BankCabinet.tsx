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
          <h1 className="text-2xl font-bold text-text-primary">Salom, {firstName}! 💼</h1>
          <p className="text-text-secondary text-sm mt-1" suppressHydrationWarning>
            Bank-Klient kabinetingiz — {monthLabel}
          </p>
        </div>
        <div className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
          🏦 Bank-Klient
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-600/20 to-emerald-600/5 border border-emerald-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <ArrowUpCircle size={20} className="text-emerald-400" />
            </div>
            <span className="text-text-secondary text-sm">Kirim</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {balance.income.toLocaleString()}
          </div>
          <div className="text-xs text-text-secondary mt-1">so'm</div>
        </div>

        <div className="bg-gradient-to-br from-red-600/20 to-red-600/5 border border-red-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <ArrowDownCircle size={20} className="text-red-400" />
            </div>
            <span className="text-text-secondary text-sm">Chiqim</span>
          </div>
          <div className="text-2xl font-bold text-red-400">
            {balance.expense.toLocaleString()}
          </div>
          <div className="text-xs text-text-secondary mt-1">so'm</div>
        </div>

        <div
          className={`bg-gradient-to-br ${
            balance.net >= 0
              ? "from-cyan-600/20 to-cyan-600/5 border-cyan-500/20"
              : "from-red-600/20 to-red-600/5 border-red-500/20"
          } border rounded-2xl p-5`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                balance.net >= 0 ? "bg-cyan-500/20" : "bg-red-500/20"
              }`}
            >
              <Wallet size={20} className={balance.net >= 0 ? "text-cyan-400" : "text-red-400"} />
            </div>
            <span className="text-text-secondary text-sm">Sof Balans</span>
          </div>
          <div
            className={`text-2xl font-bold ${
              balance.net >= 0 ? "text-cyan-400" : "text-red-400"
            }`}
          >
            {balance.net >= 0 ? "+" : ""}
            {balance.net.toLocaleString()}
          </div>
          <div className="text-xs text-text-secondary mt-1">so'm</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Biriktirilgan Firmalar */}
        <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border-glass">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-cyan-400" />
              <h2 className="text-text-primary font-semibold">Biriktirilgan Firmalar</h2>
            </div>
            <span className="text-xs text-text-secondary">{companiesCount} ta</span>
          </div>
          <div className="divide-y divide-slate-700/30">
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
                    className="flex items-center gap-4 p-4 hover:bg-black/5 dark:bg-white/5 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                      <Banknote size={14} className="text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-sm font-medium truncate">{company.name}</p>
                      {company.bankClientName && (
                        <p className="text-text-secondary text-xs">
                          Bank: {company.bankClientName}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {assignment && (
                        <span className="text-xs text-emerald-400 font-medium">
                          {assignment.salaryType === "percent"
                            ? `${assignment.salaryValue}%`
                            : `${Number(assignment.salaryValue).toLocaleString()} so'm`}
                        </span>
                      )}
                      <ChevronRight
                        size={14}
                        className="text-slate-600 group-hover:text-text-secondary transition-colors"
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
          <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border-glass">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-purple-400" />
                <h2 className="text-text-primary font-semibold">Kassa Operatsiyalar</h2>
              </div>
              <span className="text-xs text-text-secondary">So'nggi {kassaEntries.length} ta</span>
            </div>
            <div className="divide-y divide-slate-700/30 max-h-56 overflow-y-auto">
              {kassaEntries.length === 0 ? (
                <div className="p-8 text-center text-text-secondary">
                  <CreditCard size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Bu oyda operatsiya yo'q</p>
                </div>
              ) : (
                kassaEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 p-3 hover:bg-slate-700/20 transition-colors"
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        entry.type === "income"
                          ? "bg-emerald-500/20"
                          : "bg-red-500/20"
                      }`}
                    >
                      {entry.type === "income" ? (
                        <ArrowUpCircle size={13} className="text-emerald-400" />
                      ) : (
                        <ArrowDownCircle size={13} className="text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-xs font-medium truncate">
                        {entry.description || categoryLabels[entry.category] || entry.category}
                      </p>
                      <p className="text-text-secondary text-[10px]">
                        <span suppressHydrationWarning>{new Date(entry.date).toLocaleDateString("uz-UZ")}</span>
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        entry.type === "income" ? "text-emerald-400" : "text-red-400"
                      }`}
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
          <div className="bg-bg-card border border-border-glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-purple-400" />
              <h2 className="text-text-primary font-semibold">Mening KPI</h2>
            </div>
            {kpiRecords.length === 0 ? (
              <p className="text-text-secondary text-sm text-center py-3">
                Bu oyda KPI yozuvi yo'q
              </p>
            ) : (
              <div className="space-y-2">
                {kpiRecords.slice(0, 5).map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl"
                  >
                    <p className="text-text-primary text-xs font-medium flex-1 truncate">
                      {record.rule.nameUz}
                    </p>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-sm font-bold text-text-primary">
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
