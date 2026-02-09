
import React, { useMemo } from 'react';
import { Company, OperationEntry, ReportStatus, Language } from '../types';
import { translations } from '../lib/translations';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';
import { Download, Calendar } from 'lucide-react';

interface Props {
  companies: Company[];
  operations: OperationEntry[];
  selectedPeriod: string;
  onPeriodChange: (p: string) => void;
  lang: Language;
  onFilterApply: (filterStr: string) => void;
}

const AnalysisModule: React.FC<Props> = ({ companies, operations, selectedPeriod, onPeriodChange, lang, onFilterApply }) => {
  const t = translations[lang];

  const handleExport = () => {
    const headers = ['Firma Nomi', 'INN', 'Soliq Rejimi', 'Foyda Solig\'i', 'Balans (F1)', 'Moliya (F2)', 'Statistika'];
    const rows = companies.map(c => {
      const op = operations.find(o => o.companyId === c.id && o.period === selectedPeriod);
      return [
        c.name,
        c.inn,
        c.taxType,
        op?.profitTaxStatus || '-',
        op?.form1Status || '-',
        op?.form2Status || '-',
        op?.statsStatus || '-'
      ].join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `hisobot_${selectedPeriod.replace(' ', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Status colors - macOS style
  const STATUS_COLORS: Record<string, string> = {
    '+': '#34C759',      // Success
    '-': '#FF3B30',      // Error
    '0': '#8E8E93',      // Gray
    'kartoteka': '#FF9500', // Warning
    'ariza': '#5856D6',    // Indigo
    'default': '#D1D1D6'
  };

  const filteredOperations = useMemo(() => {
    return operations.filter(op => op.period === selectedPeriod);
  }, [operations, selectedPeriod]);

  const reportStats = useMemo(() => {
    const categories = [
      { key: 'profitTaxStatus', label: t.profitTax },
      { key: 'form1Status', label: t.form1 },
      { key: 'form2Status', label: t.form2 },
      { key: 'statsStatus', label: t.stats }
    ];

    return categories.map(cat => {
      const statusCounts = filteredOperations.reduce((acc, op) => {
        const val = (op as any)[cat.key] || '-';
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const data = Object.entries(statusCounts).map(([status, count]) => ({
        name: status,
        value: count,
        color: STATUS_COLORS[status] || STATUS_COLORS['default'],
        filterKey: `${cat.key}:${status}`
      })).sort((a: any, b: any) => (b.value as number) - (a.value as number));

      return { ...cat, data };
    });
  }, [filteredOperations, t.profitTax, t.form1, t.form2, t.stats]);

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 6}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
      </g>
    );
  };

  const periods = [...new Set(operations.map(o => o.period))];

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <div className="bg-white dark:bg-apple-darkCard p-10 rounded-[2.5rem] shadow-sm border border-apple-border dark:border-apple-darkBorder flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-8 w-full md:w-auto">
          <div>
            <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight mb-2">{t.analysis}</h2>
            <p className="text-sm font-semibold text-slate-400">{t.totalFirms}: <span className="text-apple-accent">{companies.length}</span></p>
          </div>
          <div className="h-12 w-px bg-slate-100 dark:bg-apple-darkBorder hidden md:block"></div>
          <div className="flex-1 md:flex-none relative">
            <select
              value={selectedPeriod}
              onChange={(e) => onPeriodChange(e.target.value)}
              className="w-full md:w-48 appearance-none bg-slate-50 dark:bg-apple-darkBg border border-transparent focus:border-apple-accent rounded-2xl px-6 py-4 font-black text-slate-700 dark:text-white outline-none transition-all cursor-pointer"
            >
              {periods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <Calendar className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
          </div>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <button
            onClick={handleExport}
            className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-white dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder rounded-2xl px-6 py-4 font-black text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-sm active:scale-95"
          >
            <Download size={16} className="text-apple-accent" />
            Excelga Eksport
          </button>

          <div className="hidden xl:flex gap-2">
            {Object.entries(STATUS_COLORS).filter(([k]) => k !== 'default').map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 dark:bg-white/5 rounded-lg border border-apple-border dark:border-apple-darkBorder">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v }}></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase">{k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {reportStats.map(stat => (
          <div key={stat.key} className="bg-white dark:bg-apple-darkCard p-10 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder flex flex-col hover:shadow-2xl transition-all group min-w-0">
            <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 flex items-center gap-3">
              <div className="w-1.5 h-6 bg-apple-accent rounded-full group-hover:h-8 transition-all"></div>
              {stat.label}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8 ml-4">Segmentni bosing / Нажмите на сегмент</p>

            <div className="h-72 min-h-[288px] mb-8 relative">
              <ResponsiveContainer width="100%" height="100%" minHeight={288}>
                <PieChart>
                  <Pie
                    data={stat.data}
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                    className="cursor-pointer outline-none"
                    onClick={(data) => onFilterApply(data.filterKey)}
                    activeShape={renderActiveShape}
                  >
                    {stat.data.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        className="hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '20px',
                      border: 'none',
                      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                      background: 'rgba(255,255,255,0.95)',
                      padding: '12px 16px'
                    }}
                    itemStyle={{ fontWeight: '900', fontSize: '12px', textTransform: 'uppercase' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-3xl font-black text-slate-800 dark:text-white tracking-tighter">
                    {stat.data.reduce((a, b) => a + b.value, 0)}
                  </p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.total}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {stat.data.map((d) => (
                <button
                  key={d.name}
                  onClick={() => onFilterApply(d.filterKey)}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl hover:bg-white dark:hover:bg-apple-darkBg hover:shadow-lg hover:ring-2 hover:ring-apple-accent/10 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: d.color }}></div>
                    <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tight">{d.name}</span>
                  </div>
                  <span className="text-sm font-black text-slate-800 dark:text-white">{d.value}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnalysisModule;
