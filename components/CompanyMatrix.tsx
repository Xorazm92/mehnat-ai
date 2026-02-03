
import React, { useState, useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, TaxRegime } from '../types';
import StatusBadge from './StatusBadge';

interface MatrixProps {
  companies: Company[];
  operations: OperationEntry[];
  activeFilter: string;
  onCompanySelect: (company: Company) => void;
}

const CompanyMatrix: React.FC<MatrixProps> = ({ companies, operations, activeFilter, onCompanySelect }) => {
  const [search, setSearch] = useState('');

  const filteredData = useMemo(() => {
    return companies.filter(c => {
      const op = operations.find(o => o.companyId === c.id);
      if (!op) return false;

      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.inn.includes(search);
      
      let matchesActiveFilter = true;
      if (activeFilter === 'delayed') {
        matchesActiveFilter = op.profitTaxStatus === ReportStatus.NOT_SUBMITTED || op.form1Status === ReportStatus.NOT_SUBMITTED || op.statsStatus === ReportStatus.NOT_SUBMITTED;
      } else if (activeFilter === 'rejected') {
        matchesActiveFilter = op.profitTaxStatus === ReportStatus.REJECTED || op.form1Status === ReportStatus.REJECTED;
      } else if (activeFilter === 'progress') {
        matchesActiveFilter = op.form1Status === ReportStatus.ACCEPTED;
      }

      return matchesSearch && matchesActiveFilter;
    });
  }, [companies, operations, search, activeFilter]);

  return (
    <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-12 animate-fade-in">
      <div className="p-10 border-b border-slate-100 bg-slate-50/20 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">To'liq Monitoring Matritsasi</h2>
          <p className="text-sm font-semibold text-slate-400 mt-1">4 ta asosiy yo'nalish bo'yicha real-vaqt nazorati</p>
        </div>
        <div className="relative group w-full max-w-md">
          <input 
            type="text" 
            placeholder="Firma nomi yoki INN qidirish..." 
            className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="absolute left-5 top-4.5 text-slate-400">🔍</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100">
              <th className="px-10 py-6">Firma & Buxgalter</th>
              <th className="px-6 py-6 text-center">Foyda Solig'i 💰</th>
              <th className="px-6 py-6 text-center">Balans (F1) 🏢</th>
              <th className="px-6 py-6 text-center">Natija (F2) 📊</th>
              <th className="px-6 py-6 text-center">Statistika 📈</th>
              <th className="px-10 py-6 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredData.map(c => {
              const op = operations.find(o => o.companyId === c.id)!;
              return (
                <tr key={c.id} className="hover:bg-indigo-50/20 transition-all duration-300 group cursor-pointer" onClick={() => onCompanySelect(c)}>
                  <td className="px-10 py-8">
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-xl shadow-indigo-100 bg-indigo-600 group-hover:rotate-6 transition-transform`}>
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-800 text-base">{c.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-slate-400 px-2 py-0.5 bg-slate-100 rounded">INN: {c.inn}</span>
                          <span className="text-[10px] font-black text-indigo-500 uppercase">{c.accountantId}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-8 text-center">
                    <StatusBadge status={c.taxRegime === TaxRegime.TURNOVER ? ReportStatus.NOT_REQUIRED : op.profitTaxStatus} type="money" />
                  </td>
                  <td className="px-6 py-8 text-center"><StatusBadge status={op.form1Status} /></td>
                  <td className="px-6 py-8 text-center"><StatusBadge status={op.form2Status} /></td>
                  <td className="px-6 py-8 text-center">
                    <div className="flex flex-col items-center">
                      <StatusBadge status={op.statsStatus} />
                      <span className="text-[9px] font-black text-slate-300 mt-2 uppercase">[{c.statsType}]</span>
                    </div>
                  </td>
                  <td className="px-10 py-8 text-right">
                    <button className="p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:shadow-lg transition-all active:scale-90">
                      👁️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CompanyMatrix;
