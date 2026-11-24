import React, { useMemo } from 'react';
import { Account, RiotStatus, AppSettings } from '../../types';
import { getSmartFlowRecommendation, findActiveRosterAccount, CooldownEntry } from '../../services/smartFlow';
import { Play, Maximize2, Sparkles, Clock, Zap, Pin, PinOff, Trophy } from 'lucide-react';

interface MiniHudOverlayProps {
  accounts: Account[];
  riotStatus: RiotStatus | null;
  cooldownMap: Map<string, CooldownEntry>;
  onLaunchAccount: (account: Account) => void;
  onExitHud: () => void;
  sessionElapsed?: string;
  settings?: AppSettings;
  onUpdateSettings?: (settings: Partial<AppSettings>) => void;
}

export const MiniHudOverlay: React.FC<MiniHudOverlayProps> = ({
  accounts,
  riotStatus,
  cooldownMap,
  onLaunchAccount,
  onExitHud,
  sessionElapsed,
  settings,
  onUpdateSettings,
}) => {
  // Only active, non-archived grinding accounts
  const activeGrindAccounts = useMemo(() => {
    return accounts.filter((a) => !a.archived && !a.is_deleted);
  }, [accounts]);

  // 1. Identify if an active grinding account is currently connected in Riot Client
  const activeRosterAccount = useMemo(() => {
    return findActiveRosterAccount(accounts, riotStatus);
  }, [accounts, riotStatus]);

  // 2. Next recommended account for Smart Rotation (excluding active account if playing)
  const nextRecommendation = useMemo(() => {
    return getSmartFlowRecommendation(activeGrindAccounts, cooldownMap, {
      excludeAccountId: activeRosterAccount?.id,
    });
  }, [activeGrindAccounts, cooldownMap, activeRosterAccount?.id]);

  // Default recommendation (when no account is currently active)
  const defaultRecommendation = useMemo(() => {
    return getSmartFlowRecommendation(activeGrindAccounts, cooldownMap);
  }, [activeGrindAccounts, cooldownMap]);

  // 3. The account displayed in the HUD main card:
  const displayedAcc = (activeRosterAccount && activeRosterAccount.level < 20)
    ? activeRosterAccount
    : (defaultRecommendation.account || activeGrindAccounts.find((a) => a.level < 20) || null);

  const isRosterAccountActive = Boolean(activeRosterAccount && activeRosterAccount.id === displayedAcc?.id);

  // 4. The account to launch when clicking "PLAY NEXT":
  const nextAccToLaunch = activeRosterAccount
    ? (nextRecommendation.account || defaultRecommendation.account)
    : (defaultRecommendation.account || displayedAcc);

  const currentLevel = displayedAcc?.level || 0;
  const currentXp = displayedAcc?.current_xp || 0;
  const progressPct = Math.min(100, Math.round(((currentLevel * 5000 + currentXp) / 100000) * 100));
  const isFirstWinReady = displayedAcc?.first_win_ready ?? true;

  // HUD Preferences
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
        backgroundColor: `rgba(8, 11, 16, ${opacity})`,
      }}
    >
      {/* Draggable Header */}
      <div
        className="flex items-center justify-between pb-1.5 border-b border-val-border/60 shrink-0 cursor-move"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-display font-bold tracking-wider shadow-sm bg-val-red/15 border border-val-red/40 text-val-red shadow-[0_0_8px_rgba(255,70,85,0.2)]">
            <Zap className="w-3 h-3 text-val-red fill-current" />
            <span>RANKFORGE HUD</span>
          </div>
          {riotStatus?.is_connected ? (
            <span className="flex items-center space-x-1.5 text-[10px] text-val-mint font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-val-mint animate-pulse shadow-[0_0_6px_#00f5d4]" />
              <span className="font-mono">{isRosterAccountActive ? 'Riot Active' : 'Personal Active'}</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-[10px] text-val-dim">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              <span>Client Idle</span>
            </span>
          )}
        </div>

        {/* Non-draggable controls */}
        <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleTogglePin}
            title={alwaysOnTop ? 'Always On Top: ENABLED (Click to unpin)' : 'Always On Top: DISABLED (Click to pin)'}
            className={`p-1 rounded-md transition-all border cursor-pointer ${
              alwaysOnTop
                ? 'bg-val-red/20 text-val-red border-val-red/40 hover:bg-val-red/30 shadow-[0_0_8px_rgba(255,70,85,0.25)]'
                : 'bg-val-card text-val-muted border-val-border hover:text-white'
            }`}
          >
            {alwaysOnTop ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />}
          </button>
          <button
            onClick={onExitHud}
            title="Expand to Full Roster Window"
            className="p-1 rounded-md bg-val-card hover:bg-val-cardHover text-val-muted hover:text-white transition-colors border border-val-border cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Body: Displayed Grinding Account */}
      {displayedAcc ? (
        <div className="flex-1 py-1.5 flex flex-col justify-center min-h-0">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center space-x-1.5 truncate min-w-0 pr-1">
              <span className={`font-bold font-display text-white truncate tracking-wide ${isCompact ? 'text-xs' : 'text-sm'}`}>
                {displayedAcc.username}
              </span>
              {isRosterAccountActive && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-val-mint/15 border border-val-mint/40 text-val-mint font-mono shrink-0 flex items-center gap-1 shadow-[0_0_6px_rgba(0,245,212,0.15)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-val-mint animate-pulse" />
                  Active
                </span>
              )}
              {displayedAcc.region && (
                <span className="text-[9px] px-1 py-0.2 rounded bg-val-border/60 text-val-muted font-mono uppercase shrink-0">
                  {displayedAcc.region}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1 shrink-0">
              {showEstMmr && mmrDisplay && (
                <span className="flex items-center space-x-1 text-[9px] font-bold text-amber-300 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded font-mono shadow-sm">
                  <Trophy className="w-2.5 h-2.5 text-amber-400" />
                  <span className="truncate max-w-[85px]">{mmrDisplay}</span>
                </span>
              )}

              {showFirstWin && (
                isFirstWinReady ? (
                  <span className="flex items-center space-x-1 text-[9px] font-semibold text-val-mint bg-emerald-950/60 border border-emerald-800/50 px-1.5 py-0.5 rounded font-mono">
                    <Sparkles className="w-2.5 h-2.5 text-val-mint" />
                    <span>+1K XP</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-[9px] text-amber-400 bg-amber-950/50 border border-amber-800/40 px-1.5 py-0.5 rounded font-mono">
                    <Clock className="w-2.5 h-2.5 text-amber-400" />
                    <span>CD</span>
                  </span>
                )
              )}
            </div>
          </div>

          {/* XP Progress Bar */}
          {showXpProgress && (
            <div className="mt-1.5 space-y-1">
              <div className="flex justify-between text-[10px] text-val-muted font-mono">
                <span className="text-slate-200 font-semibold">
                  Lvl {currentLevel}{' '}
                  <span className="text-val-dim text-[9px]">
                    ({displayedAcc.decimal_level?.toFixed(2) ?? currentLevel})
                  </span>
                </span>
                <span className="text-cyan-400 font-medium">{progressPct}% to Lvl 20</span>
              </div>
              <div className="w-full bg-slate-950/90 rounded-full h-1.5 border border-slate-800/80 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-400 via-sky-400 to-val-mint h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(0,245,212,0.4)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-1 px-2">
          <p className="text-[11px] text-val-dim font-display">
            {activeGrindAccounts.length === 0
              ? 'No active accounts in roster'
              : 'All accounts at Level 20 or on cooldown'}
          </p>
        </div>
      )}

      {/* Footer / Launch Action */}
      <div
        className="pt-1.5 flex items-center justify-between border-t border-val-border/60 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <div className="flex flex-col gap-0.2">
          {showActiveCount && (
            <div className="text-[9px] text-val-muted font-mono">
              <span className="text-white font-bold">{activeGrindAccounts.length}</span> active roster
            </div>
          )}
          {/* Session Timer — visible strictly while VALORANT game is running */}
          {showSessionTimer && riotStatus?.is_connected && riotStatus?.is_game_running && sessionElapsed && (
            <div className="flex items-center gap-1 text-[9px] font-mono text-val-mint">
              <span className="w-1.5 h-1.5 rounded-full bg-val-mint animate-pulse shrink-0" />
              <span className="tabular-nums font-semibold">{sessionElapsed}</span>
            </div>
          )}
        </div>

        {nextAccToLaunch && (() => {
          const hasPassword = Boolean(nextAccToLaunch.password && nextAccToLaunch.password.trim());
          return (
            <button
              onClick={() => onLaunchAccount(nextAccToLaunch)}
              title={!hasPassword ? 'Password not set — Click to launch & enter password' : `Launch ${nextAccToLaunch.username}`}
              className={`flex items-center space-x-1.5 font-display font-bold tracking-wider rounded-lg shadow-md transition-all active:scale-95 border cursor-pointer ${
                hasPassword
                  ? 'bg-gradient-to-r from-val-red to-rose-600 hover:from-val-redHover hover:to-rose-500 text-white shadow-val-red/30 border-white/20'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700 shadow-none'
              } ${
                isCompact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
              }`}
            >
              <Play className="w-3 h-3 fill-current" />
              <span>PLAY NEXT</span>
            </button>
          );
        })()}
      </div>
    </div>
  );
};

export default MiniHudOverlay;
