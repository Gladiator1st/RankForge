import React from 'react';
import { Zap, Sparkles, Flame, X } from 'lucide-react';
import { Account } from '../../types';

interface VelocityCardProps {
  selectedAccount?: Account | null;
  isActive?: boolean;
  onClose?: () => void;
}

export const VelocityCard: React.FC<VelocityCardProps> = React.memo(({ selectedAccount, isActive, onClose }) => {
  if (!selectedAccount || selectedAccount.level >= 20) return null;

  const remainingXp = selectedAccount.remaining_xp || (20 - selectedAccount.level) * 5000;
  
  // Helper: Format total minutes dynamically (e.g. 18m, 45m, or 1h 15m)
  const formatEtaTime = (totalMinutes: number): string => {
    if (totalMinutes < 60) {
      return `${Math.round(totalMinutes)}m`;
    }
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // Game Mode estimates & durations:
  // 1. Skirmish (Fastest mode): ~900 XP / match, ~6 min / match
  const skirmishMatches = Math.ceil(remainingXp / 900);
  const skirmishMins = skirmishMatches * 6;

  // 2. Spike Rush: ~900 XP / match, ~9 min / match
  const spikeRushMatches = Math.ceil(remainingXp / 900);
  const spikeRushMins = spikeRushMatches * 9;

  // 3. Swiftplay: ~1,200 XP / match, ~13 min / match
  const swiftplayMatches = Math.ceil(remainingXp / 1200);
  const swiftplayMins = swiftplayMatches * 13;

  // 4. Unrated: ~3,500 XP / match, ~35 min / match
  const unratedMatches = Math.ceil(remainingXp / 3500);
  const unratedMins = unratedMatches * 35;

  return (
    <div className="relative rounded-xl p-3 mb-3 border border-[#1E2C3D] bg-gradient-to-r from-[#0E1522] via-[#0A0F18] to-[#080B10] shadow-lg shadow-black/40 flex items-center justify-between gap-3 select-none overflow-hidden group">
      {/* Top subtle red/cyan tactical edge */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-val-red via-[#00F5D4] to-transparent opacity-80" />

      {/* Left: Indicator & Description */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-val-red/15 border border-val-red/40 flex items-center justify-center text-val-red shrink-0 shadow-[0_0_12px_rgba(255,70,85,0.25)]">
          <Flame className="w-4 h-4 text-val-red animate-pulse" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="font-display text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap shrink-0">
              Grinding Mode ETA Matrix
            </span>
            <div className="flex items-center gap-1.5 truncate max-w-[240px] xl:max-w-none">
              <span className="text-[11px] font-mono text-val-dim truncate">
                ({selectedAccount.username} • {remainingXp.toLocaleString()} AP remaining)
              </span>
              {isActive && (
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[#00F5D4] bg-[#00F5D4]/10 border border-[#00F5D4]/30 px-1.5 py-0.2 rounded shrink-0 shadow-[0_0_8px_rgba(0,245,212,0.2)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00F5D4] animate-ping" />
                  Riot Active
                </span>
              )}
            </div>
          </div>
          <span className="text-[10px] text-val-dim block truncate whitespace-nowrap font-sans">
            Estimated matches and time required to cross Level 20 Ready for Rank
          </span>
        </div>
      </div>

      {/* Right: Mode Estimates Breakdown & Close Button */}
      <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
        {/* 1. Skirmish (Shortest / Fastest Mode) */}
        <div className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center shrink-0 whitespace-nowrap hover:border-amber-400/50 transition-colors">
          <span className="font-display text-[9px] uppercase font-bold text-amber-400 flex items-center justify-center gap-0.5 tracking-wider">
            <Zap className="w-2.5 h-2.5 fill-current" /> Skirmish (Fastest)
          </span>
          <span className="text-xs font-bold font-mono text-amber-300">
            ~{skirmishMatches} <span className="text-[10px] text-amber-400/80 font-normal">games ({formatEtaTime(skirmishMins)})</span>
          </span>
        </div>

        {/* 2. Spike Rush */}
        <div className="px-2.5 py-1 rounded-lg bg-[#0C121D] border border-[#1E2C3D] text-center shrink-0 whitespace-nowrap hover:border-slate-600 transition-colors">
          <span className="font-display text-[9px] uppercase font-bold text-val-dim tracking-wider block">Spike Rush</span>
          <span className="text-xs font-bold font-mono text-white">
            ~{spikeRushMatches} <span className="text-[10px] text-val-dim font-normal">games ({formatEtaTime(spikeRushMins)})</span>
          </span>
        </div>

        {/* 3. Swiftplay (Recommended) */}
        <div className="px-2.5 py-1 rounded-lg bg-[#00F5D4]/10 border border-[#00F5D4]/30 text-center shrink-0 whitespace-nowrap hover:border-[#00F5D4]/60 transition-colors shadow-[0_0_10px_rgba(0,245,212,0.1)]">
          <span className="font-display text-[9px] uppercase font-bold text-[#00F5D4] flex items-center justify-center gap-1 tracking-wider">
            <Sparkles className="w-2.5 h-2.5" /> Swiftplay
          </span>
          <span className="text-xs font-bold font-mono text-[#00F5D4]">
            ~{swiftplayMatches} <span className="text-[10px] text-[#00F5D4]/80 font-normal">games ({formatEtaTime(swiftplayMins)})</span>
          </span>
        </div>

        {/* 4. Unrated */}
        <div className="px-2.5 py-1 rounded-lg bg-[#0C121D] border border-[#1E2C3D] text-center shrink-0 whitespace-nowrap hover:border-slate-600 transition-colors">
          <span className="font-display text-[9px] uppercase font-bold text-val-dim tracking-wider block">Unrated</span>
          <span className="text-xs font-bold font-mono text-white">
            ~{unratedMatches} <span className="text-[10px] text-val-dim font-normal">games ({formatEtaTime(unratedMins)})</span>
          </span>
        </div>

        {/* Close / Dismiss Bar button */}
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-val-dim hover:text-white hover:bg-[#1E2C3D]/60 transition-colors ml-1 cursor-pointer"
            title="Hide this bar (can be re-enabled in Settings)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});
