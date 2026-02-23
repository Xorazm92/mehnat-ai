
import React from 'react';
import { AccountantKPI } from '../types';

interface LeaderboardProps {
  kpis: AccountantKPI[];
}

const Leaderboard: React.FC<LeaderboardProps> = ({ kpis }) => {
  // Corrected sorting to use annualProgress as progress property is not defined in AccountantKPI interface
  const sortedKpis = [...kpis].sort((a, b) => b.annualProgress - a.annualProgress);

  return (
    <div className="liquid-glass-card rounded-[3.5rem] border border-white/20 shadow-glass-lg p-12 mb-20 animate-fade-in relative overflow-hidden group">
      {/* Background accents */}
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 mb-12 relative z-10">
        <div>
          <h2 className="text-4xl font-black tracking-tighter premium-text-gradient uppercase leading-tight mb-2">
            Xodimlar Reytingi
          </h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">
            Precision & Performance Gamification
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <span className="px-5 py-2.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase rounded-2xl border border-emerald-500/20 backdrop-blur-md tracking-widest">🏆 Yashil zona</span>
          <span className="px-5 py-2.5 bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase rounded-2xl border border-amber-500/20 backdrop-blur-md tracking-widest">🥈 Sariq zona</span>
          <span className="px-5 py-2.5 bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase rounded-2xl border border-rose-500/20 backdrop-blur-md tracking-widest">⚠️ Qizil zona</span>
        </div>
      </div>

      <div className="space-y-6 relative z-10">
        {sortedKpis.map((acc, idx) => {
          const isTop = idx === 0;
          return (
            <div
              key={acc.name}
              className={`flex items-center gap-8 p-6 rounded-[2.5rem] border transition-all duration-500 group/item ${isTop
                  ? 'bg-indigo-500/10 border-indigo-500/30 shadow-glass-indigo scale-[1.02]'
                  : 'bg-white/5 border-white/10 border-white/10 hover:bg-white/10'
                }`}
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-glass transition-all duration-500 ${isTop
                  ? 'bg-indigo-500 text-white scale-110 rotate-3 group-hover/item:rotate-12'
                  : 'bg-white/10 text-slate-400 group-hover/item:text-indigo-500'}`}>
                {idx + 1}
              </div>

              <div className="flex-1">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <h4 className={`font-black text-xl tracking-tight mb-1 transition-colors ${isTop ? 'text-indigo-500' : 'text-slate-800 dark:text-white group-hover/item:text-indigo-500'}`}>
                      {acc.name}
                    </h4>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{acc.totalCompanies} ta korxona biriktirilgan</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-3xl font-black tabular-nums ${acc.zone === 'green' ? 'text-emerald-500' : acc.zone === 'yellow' ? 'text-amber-500' : 'text-rose-500'}`}>
                      {acc.annualProgress}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-3 bg-white/10 dark:bg-white/5 rounded-full border border-white/10 overflow-hidden shadow-inner relative group/bar">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(79,70,229,0.2)] ${acc.zone === 'green' ? 'bg-emerald-500' : acc.zone === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${acc.annualProgress}%` }}
                  ></div>
                </div>
              </div>

              {acc.zone === 'red' && (
                <button className="px-6 py-3 bg-rose-500 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-glass-rose hover:bg-rose-600 transition-all animate-pulse-slow">
                  Yordam kerak!
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
