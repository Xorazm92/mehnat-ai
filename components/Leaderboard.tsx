
import React from 'react';
import { AccountantKPI } from '../types';

interface LeaderboardProps {
  kpis: AccountantKPI[];
}

const Leaderboard: React.FC<LeaderboardProps> = ({ kpis }) => {
  const sortedKpis = [...kpis].sort((a, b) => b.annualProgress - a.annualProgress);

  return (
    <div className="c1-card animate-fade-in relative overflow-hidden">
      <div className="c1-section-header">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div>
            <h2 className="text-base font-bold text-gray-800 dark:text-white uppercase tracking-tight">
              Xodimlar Reytingi
            </h2>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
              Samaradorlik va natijalar monitoringi
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="c1-badge inline-flex items-center gap-1 border-emerald-500/20 text-emerald-600 bg-emerald-50">🏆 Yashil</span>
            <span className="c1-badge inline-flex items-center gap-1 border-amber-500/20 text-amber-600 bg-amber-50">🥈 Sariq</span>
            <span className="c1-badge inline-flex items-center gap-1 border-red-500/20 text-red-600 bg-red-50">⚠️ Qizil</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2">
        {sortedKpis.map((acc, idx) => {
          const isTop = idx === 0;
          return (
            <div
              key={acc.name}
              className={`flex items-center gap-4 p-4 border rounded-sm transition-all ${isTop
                  ? 'bg-blue-50/30 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800 shadow-sm'
                  : 'bg-white dark:bg-[#1A1D23] border-[#DEE2E6] dark:border-[#3A3D44]'
                }`}
            >
              <div className={`w-10 h-10 rounded-sm flex items-center justify-center font-black text-lg border ${isTop
                  ? 'bg-[#3366CC] text-white border-blue-600'
                  : 'bg-gray-50 dark:bg-[#2A2D33] text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                {idx + 1}
              </div>

              <div className="flex-1">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <h4 className={`font-bold text-sm tracking-tight mb-0.5 ${isTop ? 'text-[#3366CC]' : 'text-gray-900 dark:text-white'}`}>
                      {acc.name}
                    </h4>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{acc.totalCompanies} ta korxona</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xl font-black tabular-nums ${acc.zone === 'green' ? 'text-emerald-500' : acc.zone === 'yellow' ? 'text-amber-500' : 'text-red-500'}`}>
                      {acc.annualProgress}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-[#2A2D33] rounded-full overflow-hidden border border-gray-200 dark:border-gray-800">
                  <div
                    className={`h-full transition-all duration-1000 ${acc.zone === 'green' ? 'bg-[#339933]' : acc.zone === 'yellow' ? 'bg-[#FFCC33]' : 'bg-[#CC3333]'}`}
                    style={{ width: `${acc.annualProgress}%` }}
                  ></div>
                </div>
              </div>

              {acc.zone === 'red' && (
                <button className="c1-btn c1-btn-danger text-[8px] px-3 py-1.5 animate-pulse">
                  Yordam!
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;
