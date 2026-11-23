import React, { useMemo } from 'react';
import { Account, RiotStatus, AppSettings } from '../../types';
import { getSmartFlowRecommendation, findActiveRosterAccount, CooldownEntry } from '../../services/smartFlow';
import { Play, Maximize2, Clock, Zap, Pin, PinOff } from 'lucide-react';
import { sound } from '../../services/soundEffects';

interface MiniHudOverlayProps {
  accounts: Account[];
  activeAccount?: Account | null;
  riotStatus: RiotStatus | null;
  cooldownMap: Map<string, CooldownEntry>;
  sessionElapsed?: string;
  settings?: AppSettings;
  onLaunchAccount?: (id: string) => void;
  onExitHud: () => void;
  onUpdateSettings?: (settings: Partial<AppSettings>) => void;
}

export const MiniHudOverlay: React.FC<MiniHudOverlayProps> = ({
  accounts,
  riotStatus,
  cooldownMap,
  sessionElapsed,
  settings,
  onLaunchAccount,
  onExitHud,
  onUpdateSettings,
}) => {
  const activeGrindAccounts = useMemo(() => {
    return accounts.filter((a) => !a.archived && !a.is_deleted);
  }, [accounts]);

  const activeRosterAccount = useMemo(() => {
    return findActiveRosterAccount(accounts, riotStatus);
  }, [accounts, riotStatus]);

  const nextRecommendation = useMemo(() => {
    return getSmartFlowRecommendation(activeGrindAccounts, cooldownMap, {
      excludeAccountId: activeRosterAccount?.id,
    });
  }, [activeGrindAccounts, cooldownMap, activeRosterAccount?.id]);

  const defaultRecommendation = useMemo(() => {
    return getSmartFlowRecommendation(activeGrindAccounts, cooldownMap);
  }, [activeGrindAccounts, cooldownMap]);

  const displayedAcc = (activeRosterAccount && activeRosterAccount.level < 20)
    ? activeRosterAccount
    : (defaultRecommendation.account || activeGrindAccounts.find((a) => a.level < 20) || null);

  const isRosterAccountActive = Boolean(activeRosterAccount && activeRosterAccount.id === displayedAcc?.id);

  const nextAccToLaunch = activeRosterAccount
    ? (nextRecommendation.account || defaultRecommendation.account)
    : (defaultRecommendation.account || displayedAcc);

  const currentLevel = displayedAcc?.level || 0;
  const currentXp = displayedAcc?.current_xp || 0;
  const progressPct = Math.min(100, Math.round(((currentLevel * 5000 + currentXp) / 100000) * 100));
  const isFirstWinReady = displayedAcc?.first_win_ready ?? true;

  const opacity = settings?.hud_opacity ?? 0.95;
  const scale = settings?.hud_scale ?? 'normal';
  const alwaysOnTop = settings?.hud_always_on_top ?? true;
  const showSessionTimer = settings?.hud_show_session_timer ?? true;
  const showXpProgress = settings?.hud_show_xp_progress ?? true;
  const showFirstWin = settings?.hud_show_first_win ?? true;
  const showActiveCount = settings?.hud_show_active_count ?? true;
  const showEstMmr = settings?.hud_show_est_mmr ?? true;

  const isCompact = scale === 'compact';
  const isLarge = scale === 'large';

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextPin = !alwaysOnTop;
    onUpdateSettings?.({ hud_always_on_top: nextPin });
    window.rfrApi?.updateHudConfig?.({ alwaysOnTop: nextPin });
  };

  const mmrDisplay = displayedAcc?.stats?.estimated_mmr || displayedAcc?.stats?.peak_mmr;

  return (
    <div
      className={`w-full h-full select-none border border-cyan-500/35 rounded-xl flex flex-col justify-between font-sans shadow-[0_12px_40px_rgba(0,0,0,0.85),0_0_25px_rgba(0,245,212,0.18)] backdrop-blur-md overflow-hidden transition-all ${
        isCompact ? 'p-2' : isLarge ? 'p-3.5' : 'p-2.5'
      }`}
      style={{
        backgroundColor: `rgba(9, 13, 20, ${opacity})`,
      }}
    >
      {/* ── Top Bar: Drag region, Brand, Riot Status, Controls ── */}
      <div className="flex items-center justify-between gap-1 app-drag-region shrink-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-val-red/15 border border-val-red/40 text-val-red shadow-[0_0_8px_rgba(255,70,85,0.2)]">
            <Zap className="w-3 h-3 text-val-red fill-current" />
            <span>RANKFORGE HUD</span>
          </div>
          {riotStatus?.is_connected ? (
            <span className="flex items-center gap-1 text-[10px] text-val-mint font-semibold bg-val-mint/10 border border-val-mint/30 px-1.5 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-val-mint animate-pulse" />
              <span className="font-mono">{isRosterAccountActive ? 'Riot Active' : 'Personal Active'}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/60 border border-slate-700 px-1.5 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span>Riot Idle</span>
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 app-no-drag shrink-0">
          {showSessionTimer && riotStatus?.is_connected && riotStatus?.is_game_running && sessionElapsed && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded shadow-sm">
              <Clock className="w-2.5 h-2.5 animate-pulse" />
              <span>{sessionElapsed}</span>
            </div>
          )}

          <button
            onClick={handleTogglePin}
            className={`p-1 rounded transition-colors ${
              alwaysOnTop
                ? 'text-cyan-400 hover:text-cyan-300 bg-cyan-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title={alwaysOnTop ? 'Always on Top (Enabled)' : 'Always on Top (Disabled)'}
          >
            {alwaysOnTop ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
          </button>

          <button
            onClick={onExitHud}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Expand to Full Application Window"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Main Body Card ── */}
      {displayedAcc ? (
        <div className="flex-1 flex flex-col justify-center my-1.5 min-h-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-white text-xs truncate">
                {displayedAcc.username}
              </span>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                ({displayedAcc.region.toUpperCase()})
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {showEstMmr && mmrDisplay && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {mmrDisplay}
                </span>
              )}
              <span className="text-xs font-black font-mono text-val-mint">
                LVL {displayedAcc.decimal_level ? displayedAcc.decimal_level.toFixed(2) : displayedAcc.level}
              </span>
            </div>
          </div>

          {/* XP Progress Bar */}
          {showXpProgress && (
            <div className="space-y-0.5">
              <div className="w-full bg-slate-900/90 rounded-full h-1.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-val-red via-orange-500 to-val-mint h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                <span>{progressPct}% to Lvl 20</span>
                <span>{displayedAcc.remaining_xp?.toLocaleString() ?? 0} XP left</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center my-1">
          <span className="text-xs text-slate-400 font-mono">No active accounts in roster</span>
        </div>
      )}

      {/* ── Bottom Bar: Next Recommendation & Play Button ── */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-mono truncate">
          {showActiveCount && (
            <div className="text-slate-400 shrink-0">
              <span className="text-white font-bold">{activeGrindAccounts.length}</span> in roster
            </div>
          )}

          {showFirstWin && displayedAcc && (
            <span className={`shrink-0 ${isFirstWinReady ? 'text-val-mint font-bold' : 'text-slate-400'}`}>
              {isFirstWinReady ? '🎯 +1,000 AP READY' : '⏳ Cooling down'}
            </span>
          )}
        </div>

        {nextAccToLaunch && onLaunchAccount && (
          <button
            onClick={() => {
              sound.playTacticalClick();
              onLaunchAccount(nextAccToLaunch.id);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-val-red hover:bg-val-redHover text-white text-[11px] font-extrabold uppercase tracking-wider transition-all shadow-sm shadow-val-red/30 active:scale-95 shrink-0"
            title={`Launch ${nextAccToLaunch.username}`}
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            <span>Play Next</span>
          </button>
        )}
      </div>
    </div>
  );
};
