
import React from 'react';
import { AccountantKPI } from '../types';

interface LeaderboardProps {
  kpis: AccountantKPI[];
}

const Leaderboard: React.FC<LeaderboardProps> = ({ kpis }) => {
  // Corrected sorting to use annualProgress as progress property is not defined in AccountantKPI interface
  const sortedKpis = [...kpis].sort((a, b) => b.annualProgress - a.annualProgress);

  return (
    <div className="card-neo p-10 mb-12">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Xodimlar Reytingi (Gamification)</h2>
          <p className="text-sm font-semibold text-slate-400 mt-1">Samaradorlik va intizom ko'rsatkichlari</p>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase rounded-lg border border-emerald-100">🏆 Yashil zona</span>
          <span className="px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-black uppercase rounded-lg border border-amber-100">🥈 Sariq zona</span>
          <span className="px-3 py-1 bg-rose-50 text-rose-600 text-[10px] font-black uppercase rounded-lg border border-rose-100">⚠️ Qizil zona</span>
        </div>
      </div>

      <div className="space-y-6">
        {sortedKpis.map((acc, idx) => (
          <div key={acc.name} className="flex items-center gap-6 p-4 rounded-3xl border border-slate-50 hover:border-slate-200 transition-all bg-slate-50/30">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-lg
              ${idx === 0 ? 'bg-indigo-600 scale-110 ring-4 ring-indigo-50' : 'bg-slate-300'}`}>
              {idx + 1}
            </div>
            
            <div className="flex-1">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-base">{acc.name}</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{acc.totalCompanies} ta korxona biriktirilgan</p>
                </div>
                <div className="text-right">
                  <span className={`text-xl font-black ${acc.zone === 'green' ? 'text-emerald-500' : acc.zone === 'yellow' ? 'text-amber-500' : 'text-rose-500'}`}>
                    {acc.annualProgress}%
                  </span>
                </div>
              </div>
              <div className="w-full h-3 bg-white rounded-full border border-slate-100 overflow-hidden shadow-inner">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 shadow-lg ${acc.zone === 'green' ? 'bg-emerald-500' : acc.zone === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${acc.annualProgress}%` }}
                ></div>
              </div>
            </div>
            
            {acc.zone === 'red' && (
              <button className="px-4 py-2 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-100 hover:bg-rose-600 transition-all animate-pulse">
                Yordam kerak!
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Leaderboard;
