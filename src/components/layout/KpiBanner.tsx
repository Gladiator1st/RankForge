import React from 'react';
import { Target, Trophy, TrendingUp, Zap, Clock } from 'lucide-react';
import { KpiStats } from '../../types';

interface KpiBannerProps {
  stats: KpiStats;
}

const formatSessionTotal = (totalSeconds: number): string => {
  if (!totalSeconds || totalSeconds <= 0) return '0m';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const KpiBanner: React.FC<KpiBannerProps> = React.memo(({ stats }) => {
  const hasFirstWinReady = stats.first_win_ready_count > 0;
  const hasReadyForRank = stats.ready_for_rank_count > 0;

  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 px-4 py-2 shrink-0">
      {/* 1. First Win Queue */}
      <div className="rounded-xl p-3 flex items-center justify-between bg-slate-900/60 backdrop-blur-md border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/80 relative overflow-hidden group transition-all duration-200">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-slate-700/50 to-transparent group-hover:via-amber-500/40 transition-colors" />
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 font-display tracking-wider block">
            First Win Queue
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className={`text-2xl font-bold font-mono tracking-tight ${hasFirstWinReady ? 'text-amber-400' : 'text-slate-100'}`}>
              {stats.first_win_ready_count}
            </span>
            <span className="text-[11px] text-slate-500 font-medium font-sans">
              / {stats.total_accounts} ready
            </span>
          </div>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
          hasFirstWinReady
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
            : 'bg-slate-800/70 border border-slate-700/60 text-slate-400 group-hover:text-slate-300'
        }`}>
          <Target className="w-4 h-4" />
        </div>
      </div>

      {/* 2. Ready for Rank */}
      <div className="rounded-xl p-3 flex items-center justify-between bg-slate-900/60 backdrop-blur-md border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/80 relative overflow-hidden group transition-all duration-200">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-slate-700/50 to-transparent group-hover:via-cyan-500/40 transition-colors" />
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 font-display tracking-wider block">
            Ready For Rank
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className={`text-2xl font-bold font-mono tracking-tight ${hasReadyForRank ? 'text-cyan-400' : 'text-slate-100'}`}>
              {stats.ready_for_rank_count}
            </span>
            <span className="text-[11px] text-slate-500 font-medium font-sans">
              accounts (Lvl 20+)
            </span>
          </div>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
          hasReadyForRank
            ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
            : 'bg-slate-800/70 border border-slate-700/60 text-slate-400 group-hover:text-slate-300'
        }`}>
          <Trophy className="w-4 h-4" />
        </div>
      </div>

      {/* 3. Roster Average Progress */}
      <div className="rounded-xl p-3 flex items-center justify-between bg-slate-900/60 backdrop-blur-md border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/80 relative overflow-hidden group transition-all duration-200">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-slate-700/50 to-transparent group-hover:via-slate-600 transition-colors" />
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 font-display tracking-wider block">
            Roster Average
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-100">
              Lvl {stats.average_level.toFixed(1)}
            </span>
            <span className="text-[11px] text-slate-500 font-medium font-sans">
              progress
            </span>
          </div>
        </div>
        <div className="w-9 h-9 rounded-lg bg-slate-800/70 border border-slate-700/60 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 group-hover:border-slate-600 transition-colors shrink-0">
          <TrendingUp className="w-4 h-4" />
        </div>
      </div>

      {/* 4. Total Remaining AP */}
      <div 
        className="rounded-xl p-3 flex items-center justify-between bg-slate-900/60 backdrop-blur-md border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/80 relative overflow-hidden group transition-all duration-200"
        title="Account Points (AP) needed across active roster to reach Level 20 (Ready for Rank). In Valorant, account leveling uses AP (5,000 AP per level), while XP is for Battlepass/Agents."
      >
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-slate-700/50 to-transparent group-hover:via-slate-600 transition-colors" />
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 font-display tracking-wider block">
            Remaining To Rank
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-100">
              {stats.total_xp_remaining.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-500 font-medium font-sans">
              AP total
            </span>
          </div>
        </div>
        <div className="w-9 h-9 rounded-lg bg-slate-800/70 border border-slate-700/60 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 group-hover:border-slate-600 transition-colors shrink-0">
          <Zap className="w-4 h-4" />
        </div>
      </div>

      {/* 5. Last Sessions & Total Grind Time */}
      <div 
        className="rounded-xl p-3 flex items-center justify-between bg-slate-900/60 backdrop-blur-md border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/80 relative overflow-hidden group transition-all duration-200"
        title={`Last Session Playtime: ${formatSessionTotal(stats.total_last_session_seconds || 0)} across active roster\nTotal Grind Time: ${formatSessionTotal(stats.total_grind_seconds || 0)} on all accounts in roster`}
      >
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-slate-700/50 to-transparent group-hover:via-cyan-500/40 transition-colors" />
        <div className="min-w-0 pr-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 font-display tracking-wider block truncate">
            Last Session & Total
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5 whitespace-nowrap">
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-100">
              {formatSessionTotal(stats.total_last_session_seconds || 0)}
            </span>
            <span className="text-[11px] text-slate-500 font-medium font-sans">
              last <span className="text-slate-600 font-normal">/</span>{' '}
              <span className="text-cyan-400 font-mono font-semibold">
                {formatSessionTotal(stats.total_grind_seconds || 0)}
              </span>{' '}
              total
            </span>
          </div>
        </div>
        <div className="w-9 h-9 rounded-lg bg-slate-800/70 border border-slate-700/60 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 group-hover:border-slate-600 transition-colors shrink-0">
          <Clock className="w-4 h-4" />
        </div>
      </div>
    </section>
  );
});

KpiBanner.displayName = 'KpiBanner';
