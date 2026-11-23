import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Edit3, Check, Copy, Shield, Award, Crosshair, Flame, TrendingUp, Timer, Clock, Swords, Zap } from 'lucide-react';
import { Account, AccountMmrStats } from '../../types';

interface AccountStatsModalProps {
  isOpen: boolean;
  account: Account | null;
  onClose: () => void;
  onSaveAccount: (account: Partial<Account>) => void;
}

const VALORANT_RANKS = [
  'Unranked',
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant',
];

function getRankColorTheme(rank?: string) {
  const r = (rank || '').toLowerCase();
  if (r.includes('iron')) {
    return {
      border: 'border-zinc-400',
      bg: 'bg-zinc-800/40',
      text: 'text-zinc-300',
      glow: 'shadow-zinc-500/20',
      badge: 'bg-zinc-700/50 text-zinc-200 border-zinc-500',
      accent: '#9ca3af',
    };
  }
  if (r.includes('bronze')) {
    return {
      border: 'border-amber-700',
      bg: 'bg-amber-950/40',
      text: 'text-amber-400',
      glow: 'shadow-amber-700/20',
      badge: 'bg-amber-900/50 text-amber-300 border-amber-600',
      accent: '#b45309',
    };
  }
  if (r.includes('silver')) {
    return {
      border: 'border-slate-300',
      bg: 'bg-slate-800/40',
      text: 'text-slate-200',
      glow: 'shadow-slate-400/20',
      badge: 'bg-slate-700/50 text-slate-100 border-slate-400',
      accent: '#cbd5e1',
    };
  }
  if (r.includes('gold')) {
    return {
      border: 'border-yellow-400',
      bg: 'bg-yellow-950/40',
      text: 'text-yellow-400',
      glow: 'shadow-yellow-500/25',
      badge: 'bg-yellow-900/50 text-yellow-300 border-yellow-500',
      accent: '#facc15',
    };
  }
  if (r.includes('platinum') || r.includes('plat')) {
    return {
      border: 'border-cyan-400',
      bg: 'bg-cyan-950/40',
      text: 'text-cyan-300',
      glow: 'shadow-cyan-500/25',
      badge: 'bg-cyan-900/50 text-cyan-200 border-cyan-400',
      accent: '#22d3ee',
    };
  }
  if (r.includes('diamond')) {
    return {
      border: 'border-fuchsia-400',
      bg: 'bg-fuchsia-950/40',
      text: 'text-fuchsia-300',
      glow: 'shadow-fuchsia-500/25',
      badge: 'bg-fuchsia-900/50 text-fuchsia-200 border-fuchsia-400',
      accent: '#e879f9',
    };
  }
  if (r.includes('ascendant')) {
    return {
      border: 'border-emerald-400',
      bg: 'bg-emerald-950/40',
      text: 'text-emerald-300',
      glow: 'shadow-emerald-500/25',
      badge: 'bg-emerald-900/50 text-emerald-200 border-emerald-400',
      accent: '#34d399',
    };
  }
  if (r.includes('immortal') || r.includes('radiant')) {
    return {
      border: 'border-rose-500',
      bg: 'bg-rose-950/40',
      text: 'text-rose-400',
      glow: 'shadow-rose-600/30',
      badge: 'bg-rose-900/50 text-rose-200 border-rose-500',
      accent: '#f43f5e',
    };
  }
  return {
    border: 'border-val-mint',
    bg: 'bg-val-mint/10',
    text: 'text-val-mint',
    glow: 'shadow-val-mint/20',
    badge: 'bg-val-border/60 text-val-light border-val-border',
    accent: '#00f5a0',
  };
}

export const AccountStatsModal: React.FC<AccountStatsModalProps> = ({
  isOpen,
  account,
  onClose,
  onSaveAccount,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [liveSessionSeconds, setLiveSessionSeconds] = useState(0);
  const sessionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form states for manual calibration
  const [editRank, setEditRank] = useState(account?.stats?.estimated_mmr || 'Unranked');
  const [editKd, setEditKd] = useState<string>(account?.stats?.kd?.toString() || '');
  const [editAdr, setEditAdr] = useState<string>(account?.stats?.adr?.toString() || '');
  const [editHsPct, setEditHsPct] = useState<string>(account?.stats?.hs_pct?.toString() || '');
  const [editWinRate, setEditWinRate] = useState<string>(account?.stats?.win_rate?.toString() || '');

  useEffect(() => {
    if (account) {
      setEditRank(account.stats?.estimated_mmr || 'Unranked');
      setEditKd(account.stats?.kd !== undefined ? account.stats.kd.toString() : '');
      setEditAdr(account.stats?.adr !== undefined ? account.stats.adr.toString() : '');
      setEditHsPct(account.stats?.hs_pct !== undefined ? account.stats.hs_pct.toString() : '');
      setEditWinRate(account.stats?.win_rate !== undefined ? account.stats.win_rate.toString() : '');
      setIsEditing(false);
      setRefreshMessage(null);
    }
  }, [account?.id, isOpen]);

  // Live session timer: tick every second while a session is active on this account
  useEffect(() => {
    if (sessionIntervalRef.current) {
      clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    }
    if (!account?.last_session_started_at) {
      setLiveSessionSeconds(0);
      return;
    }
    const startMs = new Date(account.last_session_started_at).getTime();
    if (isNaN(startMs)) {
      setLiveSessionSeconds(0);
      return;
    }
    const tick = () => setLiveSessionSeconds(Math.floor((Date.now() - startMs) / 1000));
    tick(); // immediate first tick
    sessionIntervalRef.current = setInterval(tick, 1000);
    return () => {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    };
  }, [account?.id, account?.last_session_started_at, isOpen]);

  if (!isOpen || !account) return null;

  const currentStats = account.stats || {};
  const estimatedMmr = currentStats.estimated_mmr || 'Unranked';
  const primaryMode = currentStats.primary_mode || (currentStats.matches_analyzed ? 'Skirmish 2v2' : 'Skirmish');
  const isSkirmish = primaryMode.toLowerCase().includes('skirmish');
  const kdDisplay = currentStats.kd !== undefined ? currentStats.kd.toFixed(1) : '--';
  const adrDisplay = currentStats.adr !== undefined && currentStats.adr > 0 ? currentStats.adr.toString() : '--';
  const hsPctDisplay = (currentStats.hs_pct !== undefined && currentStats.hs_pct > 0)
    ? `${currentStats.hs_pct}%`
    : (isSkirmish ? '—' : (currentStats.hs_pct !== undefined ? `${currentStats.hs_pct}%` : '--'));
  const winRateDisplay = currentStats.win_rate !== undefined ? `${currentStats.win_rate}%` : '--';
  const acsDisplay = currentStats.acs !== undefined && currentStats.acs > 0 ? currentStats.acs.toString() : '--';

  // ── Playtime helpers ──────────────────────────────────────────────────────
  const formatPlaytime = (totalSeconds: number): string => {
    if (totalSeconds <= 0) return '0m';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatSessionTime = (seconds: number): string => {
    if (seconds <= 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s > 0 ? `${s}s` : ''}`.trim();
    return `${s}s`;
  };

  const storedSeconds = account.total_playtime_seconds || 0;
  const totalPlaytimeSeconds = storedSeconds + liveSessionSeconds;
  const isSessionActive = !!account.last_session_started_at;
  const playtimeDisplay = totalPlaytimeSeconds > 0 ? formatPlaytime(totalPlaytimeSeconds) : isSessionActive ? '< 1m' : '—';
  // ─────────────────────────────────────────────────────────────────────────

  const theme = getRankColorTheme(estimatedMmr);

  const handleRefreshLive = async () => {
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      if (window.rfrApi?.fetchAccountStats) {
        const res = await window.rfrApi.fetchAccountStats(account.id);
        if (res.success && res.stats) {
          setRefreshMessage(res.fromLive ? '✨ Synced live match stats from Riot Client!' : 'Loaded stored stats (Launch account in Riot to refresh live)');
        } else {
          setRefreshMessage(res.message || 'Could not fetch live stats. Launch Valorant to analyze match lobbies.');
        }
      }
    } catch (err: any) {
      setRefreshMessage(`Sync error: ${err?.message || err}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveEdit = () => {
    const updatedStats: AccountMmrStats = {
      ...currentStats,
      estimated_mmr: editRank,
      kd: editKd ? parseFloat(editKd) : undefined,
      adr: editAdr ? parseInt(editAdr, 10) : undefined,
      hs_pct: editHsPct ? parseFloat(editHsPct) : undefined,
      win_rate: editWinRate ? parseInt(editWinRate, 10) : undefined,
      last_updated: new Date().toISOString(),
    };

    onSaveAccount({
      id: account.id,
      stats: updatedStats,
    });
    setIsEditing(false);
  };

  const handleCopyDossier = () => {
    const lines = [
      `📊 Valorant Account Dossier: ${account.username}`,
      `🎯 Estimated MMR: ${estimatedMmr} (${primaryMode})`,
      `⚔️ K/D: ${kdDisplay} | ADR: ${adrDisplay} | ACS: ${acsDisplay} | HS%: ${hsPctDisplay} | Win Rate: ${winRateDisplay}`,
      `⚡ Level: ${account.decimal_level ? account.decimal_level.toFixed(1) : account.level} (${(account.remaining_xp || 0).toLocaleString()} AP to Lvl 20)`,
      `⏱️ Grind Time: ${playtimeDisplay} | Last Session: ${isSessionActive ? formatSessionTime(liveSessionSeconds) : (account.last_session_seconds ? formatSessionTime(account.last_session_seconds) : '—')}`,
      `🌍 Region: ${(account.region || 'eu').toUpperCase()} | Health: ${(account.health_status || 'clean').toUpperCase()}`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      {/* Outer Tactical Card - Exactly matching sketch structure */}
      <div className={`bg-[#0a0f18] border-2 ${theme.border} rounded-3xl w-full max-w-[440px] overflow-hidden shadow-2xl ${theme.glow} p-6 relative flex flex-col items-center text-center transition-all duration-300`}>
        
        {/* Top Controls Row (Copy, Edit, Close) */}
        <div className="w-full flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyDossier}
              className="px-2.5 py-1 rounded-lg bg-val-surface/70 border border-val-border/60 hover:border-val-mint/60 text-xs text-val-muted hover:text-white flex items-center gap-1.5 transition-all"
              title="Copy Stats Dossier"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-val-mint" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Share'}</span>
            </button>

            <button
              onClick={() => {
                if (!isEditing) {
                  setEditRank(estimatedMmr);
                  setEditKd(currentStats.kd?.toString() || '');
                  setEditAdr(currentStats.adr?.toString() || '');
                  setEditHsPct(currentStats.hs_pct?.toString() || '');
                  setEditWinRate(currentStats.win_rate?.toString() || '');
                }
                setIsEditing(!isEditing);
              }}
              className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                isEditing
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-val-surface/70 border-val-border/60 hover:border-val-mint/60 text-val-muted hover:text-white'
              }`}
              title="Manually calibrate MMR & Stats"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Cancel' : 'Edit MMR'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-val-muted hover:text-white hover:bg-val-border/40 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── 1. Top Oval Badge: ESTIMATED MMR & MODE ── */}
        <div className="my-2 w-full flex flex-col items-center">
          <div className={`px-8 py-3.5 rounded-full border-2 ${theme.border} ${theme.bg} shadow-lg ${theme.glow} flex flex-col items-center justify-center min-w-[220px] transition-all transform hover:scale-[1.02]`}>
            <span className="text-[11px] font-black uppercase tracking-widest text-val-muted flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-val-mint" />
              Estimated MMR
            </span>
            <span className={`text-2xl font-black tracking-wider ${theme.text} mt-0.5 drop-shadow-md`}>
              {estimatedMmr}
            </span>
          </div>

          {/* Mode Pill & Lobby Tiers */}
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap justify-center">
            <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-val-surface border border-val-mint/40 text-val-mint flex items-center gap-1" title="Primary gameplay queue analyzed">
              <Swords className="w-3 h-3 text-val-mint" />
              {primaryMode}
            </span>
            {currentStats.recent_lobby_ranks && currentStats.recent_lobby_ranks.length > 0 && (
              currentStats.recent_lobby_ranks.map((r, i) => (
                <span key={i} className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-val-surface border border-val-border text-white">
                  {r}
                </span>
              ))
            )}
          </div>
        </div>

        {/* ── 2. Username Header (Directly matching sketch) ── */}
        <div className="mt-3 mb-4 flex flex-col items-center">
          <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
            {account.username}
          </h2>
          {currentStats.riot_id && (
            <span className="text-xs font-semibold text-val-mint mt-0.5">
              Riot ID: {currentStats.riot_id}
            </span>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-val-light">
            <span className="px-2 py-0.5 rounded bg-val-surface border border-val-border font-mono font-bold text-val-mint">
              Lvl {account.decimal_level ? account.decimal_level.toFixed(1) : account.level}
            </span>
            <span>•</span>
            <span className="font-mono text-val-muted">
              {account.remaining_xp && account.remaining_xp > 0
                ? `${account.remaining_xp.toLocaleString()} AP to Lvl 20`
                : 'Ready for Ranked (Lvl 20+)'}
            </span>
          </div>
        </div>

        {/* ── Editing Form (Shown when in Edit Mode) ── */}
        {isEditing ? (
          <div className="w-full bg-val-surface/90 border border-val-border rounded-2xl p-4 my-2 text-left animate-fade-in space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" /> Manual MMR & Stats Override
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-val-muted uppercase mb-1">
                Estimated MMR Rank
              </label>
              <select
                value={editRank}
                onChange={(e) => setEditRank(e.target.value)}
                className="w-full bg-val-bg border border-val-border rounded-lg px-3 py-1.5 text-sm text-white font-bold focus:outline-none focus:border-val-mint"
              >
                {VALORANT_RANKS.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-val-muted uppercase mb-1">
                  K/D Ratio (e.g. 1.5)
                </label>
                <input
                  type="number"
                  step="0.05"
                  placeholder="1.5"
                  value={editKd}
                  onChange={(e) => setEditKd(e.target.value)}
                  className="w-full bg-val-bg border border-val-border rounded-lg px-3 py-1 text-sm text-white font-mono focus:outline-none focus:border-val-mint"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-val-muted uppercase mb-1">
                  ADR (Avg Damage)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="165"
                  value={editAdr}
                  onChange={(e) => setEditAdr(e.target.value)}
                  className="w-full bg-val-bg border border-val-border rounded-lg px-3 py-1 text-sm text-white font-mono focus:outline-none focus:border-val-mint"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-val-muted uppercase mb-1">
                  HS% (e.g. 28)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="28"
                  value={editHsPct}
                  onChange={(e) => setEditHsPct(e.target.value)}
                  className="w-full bg-val-bg border border-val-border rounded-lg px-3 py-1 text-sm text-white font-mono focus:outline-none focus:border-val-mint"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-val-muted uppercase mb-1">
                  Win Rate % (e.g. 65)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="65"
                  value={editWinRate}
                  onChange={(e) => setEditWinRate(e.target.value)}
                  className="w-full bg-val-bg border border-val-border rounded-lg px-3 py-1 text-sm text-white font-mono focus:outline-none focus:border-val-mint"
                />
              </div>
            </div>

            <button
              onClick={handleSaveEdit}
              className="w-full py-2 bg-val-mint text-val-bg font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-val-mint/90 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-val-mint/20 mt-2"
            >
              <Check className="w-4 h-4" /> Save MMR & Stats
            </button>
          </div>
        ) : (
          /* ── Center Progression Overview ── */
          <div className="w-full my-3 px-2">
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-val-border/40">
              <span className="text-val-muted flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-val-mint" /> Account Health:
              </span>
              <span className={`font-bold uppercase ${
                account.health_status === 'banned' ? 'text-red-400' : account.health_status === 'flagged' ? 'text-amber-400' : 'text-val-mint'
              }`}>
                {account.health_status || 'Clean'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs py-1.5 border-b border-val-border/40">
              <span className="text-val-muted flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" /> Win Rate:
              </span>
              <span className="font-mono font-bold text-white">
                {winRateDisplay} {currentStats.matches_analyzed ? `(${currentStats.matches_analyzed} matches)` : ''}
              </span>
            </div>

            {currentStats.mode_breakdown && Object.keys(currentStats.mode_breakdown).length > 1 && (
              <div className="flex items-center justify-between text-xs py-1.5 border-b border-val-border/40">
                <span className="text-val-muted flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5 text-val-mint" /> Modes Played:
                </span>
                <span className="font-mono text-[11px] text-val-light">
                  {Object.entries(currentStats.mode_breakdown)
                    .map(([m, count]) => `${count} ${m}`)
                    .join(' • ')}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs py-1.5 border-b border-val-border/40">
              <span className="text-val-muted flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-purple-400" /> Total Grind Time:
              </span>
              <span className="font-mono font-bold text-white flex items-center gap-1.5">
                {isSessionActive && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Session active" />
                )}
                {playtimeDisplay}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs py-1.5">
              <span className="text-val-muted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" /> {isSessionActive ? 'Current Session:' : 'Last Session Time:'}
              </span>
              <span className="font-mono font-bold text-white flex items-center gap-1.5">
                {isSessionActive ? (
                  <>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-400 font-semibold">{formatSessionTime(liveSessionSeconds)}</span>
                  </>
                ) : account.last_session_seconds && account.last_session_seconds > 0 ? (
                  <span>{formatSessionTime(account.last_session_seconds)}</span>
                ) : (
                  <span className="text-val-muted font-normal">—</span>
                )}
              </span>
            </div>
          </div>

        )}

        {/* ── 3. Bottom Stats Grid: K/D, ADR, ACS ── */}
        <div className="w-full mt-auto pt-4 border-t border-val-border/60">
          <div className="grid grid-cols-3 gap-2">
            {/* Left Metric: K/D */}
            <div className="bg-val-surface/80 border border-val-border rounded-xl p-2.5 flex flex-col items-center justify-center hover:border-val-mint/50 transition-all">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-val-muted flex items-center gap-1">
                <Crosshair className="w-3 h-3 text-val-mint" /> K/D Ratio
              </span>
              <span className="text-xl font-black font-mono text-white mt-0.5 tracking-tight">
                {kdDisplay}
              </span>
            </div>

            {/* Center Metric: ADR */}
            <div 
              className="bg-val-surface/80 border border-val-border rounded-xl p-2.5 flex flex-col items-center justify-center hover:border-val-mint/50 transition-all"
              title={isSkirmish ? "Estimated Combat Damage per Round (calculated from kills & assists in Skirmish)" : "Average Damage per Round"}
            >
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-val-muted flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-400" /> ADR
              </span>
              <span className="text-xl font-black font-mono text-white mt-0.5 tracking-tight">
                {adrDisplay}
              </span>
            </div>

            {/* Right Metric: ACS */}
            <div 
              className="bg-val-surface/80 border border-val-border rounded-xl p-2.5 flex flex-col items-center justify-center hover:border-val-mint/50 transition-all"
              title="Average Combat Score per Round"
            >
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-val-muted flex items-center gap-1">
                <Zap className="w-3 h-3 text-yellow-400" /> ACS
              </span>
              <span className="text-xl font-black font-mono text-white mt-0.5 tracking-tight">
                {acsDisplay}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div 
              className="bg-val-surface/40 border border-val-border/50 rounded-xl py-1.5 px-3 flex items-center justify-between text-xs"
              title={isSkirmish ? "Riot omits bullet hitboxes in Skirmish mode" : "Headshot Accuracy"}
            >
              <span className="text-val-muted text-[10px] font-bold uppercase">HS Accuracy:</span>
              <span className="font-mono font-bold text-val-light flex items-center gap-1">
                {hsPctDisplay}
                {isSkirmish && (
                  <span className="text-[9px] font-semibold text-val-muted font-sans">(Skirmish)</span>
                )}
              </span>
            </div>
            <div className="bg-val-surface/40 border border-val-border/50 rounded-xl py-1.5 px-3 flex items-center justify-between text-xs">
              <span className="text-val-muted text-[10px] font-bold uppercase">Region:</span>
              <span className="font-mono font-bold text-val-mint uppercase">{account.region}</span>
            </div>
          </div>
        </div>

        {/* ── Refresh Live Button ── */}
        <div className="w-full mt-4 flex flex-col items-center gap-1.5">
          <button
            onClick={handleRefreshLive}
            disabled={isRefreshing}
            className="w-full py-2.5 rounded-xl bg-val-surface hover:bg-val-border/60 border border-val-border hover:border-val-mint text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-val-mint ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Analyzing Riot Lobbies...' : 'Refresh Live from Riot'}</span>
          </button>

          {refreshMessage && (
            <p className="text-[11px] text-val-light mt-1 px-1">
              {refreshMessage}
            </p>
          )}
        </div>

      </div>
    </div>
  );
};
