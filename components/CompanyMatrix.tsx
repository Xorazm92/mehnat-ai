
import React, { useState, useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, TaxType, Language } from '../types';
import StatusBadge from './StatusBadge';
import { translations } from '../lib/translations';

interface MatrixProps {
  companies: Company[];
  operations: OperationEntry[];
  activeFilter: string;
  onCompanySelect: (company: Company) => void;
  lang: Language;
}

const CompanyMatrix: React.FC<MatrixProps> = ({ companies, operations, activeFilter, onCompanySelect, lang }) => {
  const t = translations[lang as keyof typeof translations];
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
    <div className="c1-card animate-fade-in">
      <div className="p-6 border-b border-[#DEE2E6] dark:border-[#3A3D44] bg-[#FAFBFC] dark:bg-[#22252B] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white uppercase tracking-tight">
            {t.matrixTitle}
          </h2>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
            {t.matrixSub}
          </p>
        </div>

        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder={t.searchMatrix}
            className="c1-input w-full pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-none relative z-10">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <thead>
            <tr className="bg-[#FAFBFC] dark:bg-[#1e2025] text-[9px] font-bold uppercase tracking-widest text-[#6c757d] dark:text-[#ADB5BD] border-b border-[#DEE2E6] dark:border-[#3A3D44]">
              <th className="px-6 py-4">{t.organizations || 'Kompaniya'}</th>
              <th className="px-4 py-4 text-center">{t.inn || 'INN'}</th>
              <th className="px-4 py-4 text-center">{t.taxRegimeLabel || 'Soliq turi'}</th>
              <th className="px-4 py-4 text-center">Foyda solig'i</th>
              <th className="px-4 py-4 text-center">Forma 1</th>
              <th className="px-4 py-4 text-center">Forma 2</th>
              <th className="px-4 py-4 text-center">Statistika</th>
              <th className="px-6 py-4 text-right">{t.actions || 'Amallar'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DEE2E6] dark:divide-[#3A3D44]">
            {filteredData.map(c => {
              const op = operations.find(o => o.companyId === c.id);
              if (!op) return null;

              return (
                <tr
                  key={c.id}
                  className="hover:bg-white/10 dark:hover:bg-white/5 transition-all duration-500 group cursor-pointer"
                  onClick={() => onCompanySelect(c)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-sm flex items-center justify-center font-black text-base text-white border border-black/10"
                        style={{ background: `linear-gradient(135deg, ${c.name.charCodeAt(0) % 2 === 0 ? '#3366CC' : '#007AFF'} 0%, #1e1b4b 100%)` }}
                      >
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-[#3366CC] transition-colors mb-0.5 uppercase">{c.name}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest px-1.5 py-0.5 bg-gray-50 dark:bg-[#2A2D33] border border-gray-100 dark:border-gray-800 rounded-sm">INN: {c.inn}</span>
                          <span className="text-[8px] font-bold text-blue-600 bg-blue-50 dark:bg-[#1e2025] px-1.5 py-0.5 rounded-sm uppercase tracking-widest">{c.accountantName || '—'}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-[10px] font-black font-mono text-gray-500 tabular-nums">{c.inn}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="c1-badge">
                      {c.taxType?.replace('_', ' ') || 'VAT'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge status={c.taxType === TaxType.TURNOVER ? ReportStatus.NOT_REQUIRED : op.profitTaxStatus} size="sm" />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge status={op.form1Status} size="sm" />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge status={op.form2Status} size="sm" />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <StatusBadge status={op.statsStatus} size="sm" />
                      <span className="text-[7px] font-bold text-gray-400 uppercase tracking-widest">[{c.statsType || '1-M'}]</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="c1-btn c1-btn-secondary p-2 inline-flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div >
  );
};

export default CompanyMatrix;
