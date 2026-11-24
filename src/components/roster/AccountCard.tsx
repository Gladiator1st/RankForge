import React, { useState, memo } from 'react';
import { 
  Play, 
  Key, 
  Clock, 
  Trash2, 
  Check, 
  Eye, 
  EyeOff,
  Edit3
} from 'lucide-react';
import { Account } from '../../types';
import { sound } from '../../services/soundEffects';

interface AccountCardProps {
  account: Account;
  // Countdown is passed separately so the account object ref stays stable
  countdown: string;
  firstWinReady: boolean;
  onLaunch: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpenHandover?: (account: Account) => void;
  onRestore?: (id: string) => void;
  onRenameAccount?: (id: string, newUsername: string) => void;
  onUpdateAccount?: (id: string, updates: Partial<Account>) => void;
  isArchived?: boolean;
  slotNumber?: number;
  role?: 'supplier' | 'worker' | 'solo';
  isActive?: boolean;
  isGamePlaying?: boolean;
}

// Custom equality: only re-render when something visually meaningful changed.
// This is the critical gate — if stable, the 1-second cooldown ticker will NOT
// cause this card to re-render (only the parent VirtualCardGrid updates its map).
function arePropsEqual(prev: AccountCardProps, next: AccountCardProps): boolean {
  return (
    prev.account.id === next.account.id &&
    prev.account.username === next.account.username &&
    prev.account.password === next.account.password &&
    prev.account.region === next.account.region &&
    prev.account.level === next.account.level &&
    prev.account.decimal_level === next.account.decimal_level &&
    prev.account.remaining_xp === next.account.remaining_xp &&
    prev.account.archived === next.account.archived &&
    prev.account.notes === next.account.notes &&
    prev.account.email_verified === next.account.email_verified &&
    prev.account.health_status === next.account.health_status &&
    prev.firstWinReady === next.firstWinReady &&
    prev.countdown === next.countdown &&
    prev.isArchived === next.isArchived &&
    prev.onLaunch === next.onLaunch &&
    prev.onDelete === next.onDelete &&
    prev.onRestore === next.onRestore &&
    prev.onRenameAccount === next.onRenameAccount &&
    prev.onUpdateAccount === next.onUpdateAccount &&
    prev.slotNumber === next.slotNumber &&
    prev.isActive === next.isActive &&
    prev.isGamePlaying === next.isGamePlaying &&
    prev.role === next.role
  );
}

const AccountCardInner: React.FC<AccountCardProps> = ({
  account,
  countdown,
  firstWinReady,
  onLaunch,
  onDelete,
  onOpenHandover: _onOpenHandover,
  onRestore,
  onRenameAccount,
  onUpdateAccount,
  isArchived = false,
  slotNumber: _slotNumber,
  role: _role,
  isActive = false,
  isGamePlaying = false,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editUsername, setEditUsername] = useState(account.username);

  // Inline Note and Password Edit State
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(account.notes || '');
  const [isEditingPass, setIsEditingPass] = useState(false);
  const [passValue, setPassValue] = useState(account.password || '');

  const startEditingName = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    sound.playTacticalClick();
    setEditUsername(account.username);
    setIsEditingName(true);
  };

  const commitEditingName = () => {
    const trimmed = editUsername.trim();
    if (trimmed && trimmed !== account.username) {
      sound.playSuccessDing();
      onRenameAccount?.(account.id, trimmed);
    }
    setIsEditingName(false);
  };

  const cancelEditingName = () => {
    setIsEditingName(false);
  };

  const startEditingNote = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    sound.playTacticalClick();
    setNoteValue(account.notes || '');
    setIsEditingNote(true);
  };

  const commitNote = () => {
    const trimmed = noteValue.trim();
    if (trimmed !== (account.notes || '')) {
      sound.playSuccessDing();
      onUpdateAccount?.(account.id, { notes: trimmed });
    }
    setIsEditingNote(false);
  };

  const startEditingPass = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    sound.playTacticalClick();
    setPassValue(account.password || '');
    setIsEditingPass(true);
  };

  const commitPass = () => {
    const trimmed = passValue.trim();
    if (trimmed !== (account.password || '')) {
      sound.playSuccessDing();
      onUpdateAccount?.(account.id, { password: trimmed });
    }
    setIsEditingPass(false);
  };

  const isLevel20 = account.level >= 20;
  const progressPercent = Math.min(100, Math.max(0, (account.level / 20) * 100));

  const hasPassword = Boolean(account.password && account.password.trim().length > 0);

  const handleLaunch = async () => {
    if (!hasPassword) {
      await onLaunch(account.id);
      return;
    }
    setIsLaunching(true);
    try {
      await onLaunch(account.id);
    } finally {
      setTimeout(() => setIsLaunching(false), 3000);
    }
  };

  const handleCopyPassword = () => {
    if (!account.password) return;
    sound.playSuccessDing();
    window.rfrApi?.copyToClipboard(account.password);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  const cycleHealth = (e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playTacticalClick();
    const current = account.health_status || 'clean';
    const next = current === 'clean' ? 'flagged' : current === 'flagged' ? 'banned' : 'clean';
    onUpdateAccount?.(account.id, { health_status: next });
  };

  const toggleEmailVerified = (e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playTacticalClick();
    onUpdateAccount?.(account.id, { email_verified: !account.email_verified });
  };

  return (
    <div 
      className={`group relative rounded-2xl border transition-all duration-200 p-4 flex flex-col justify-between overflow-hidden ${
        isActive
          ? 'bg-[#061814]/95 border-emerald-500/60 shadow-[0_0_24px_rgba(16,185,129,0.18)] ring-1 ring-emerald-500/40 hover:border-emerald-400 hover:shadow-[0_0_28px_rgba(16,185,129,0.25)]'
          : isLevel20
          ? 'bg-[#0A0F18]/95 border-emerald-500/40 shadow-lg shadow-emerald-950/20 hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(52,211,153,0.15)]'
          : 'bg-[#0A0F18]/95 border-[#1E2C3D] hover:border-slate-500 hover:shadow-2xl hover:shadow-black/60'
      } ${isArchived ? 'opacity-60' : ''}`}
    >
      {/* Top subtle tactical edge indicator */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${
        isActive
          ? 'from-emerald-400 via-teal-400 to-transparent shadow-[0_0_12px_rgba(16,185,129,0.8)]'
          : isLevel20
          ? 'from-emerald-400 via-[#00F5D4] to-transparent shadow-[0_0_8px_rgba(0,245,212,0.6)]'
          : 'from-val-red via-orange-500 to-transparent shadow-[0_0_8px_rgba(255,70,85,0.4)]'
      }`} />

      <div className="flex flex-col justify-between flex-1">
      {/* Top Header: Level Badge, Username, and Delete/Archive */}
      <div>
        <div className="flex items-start justify-between gap-2">
          {/* Level Badge + Username */}
          <div className="flex items-center gap-2.5">
            <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-display font-black shrink-0 border shadow-sm ${
              isLevel20
                ? 'bg-emerald-500/15 border-emerald-500/50 text-[#00F5D4] shadow-[0_0_12px_rgba(0,245,212,0.2)]'
                : 'bg-[#06080D] border-[#1E2C3D] text-white'
            }`}>
              <span className="text-[9px] text-val-dim leading-none uppercase font-mono">Lvl</span>
              <span className="text-base font-extrabold leading-tight text-white">{account.level}</span>
            </div>

            <div>
              {isEditingName ? (
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    autoFocus
                    value={editUsername}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEditUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitEditingName();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEditingName();
                      }
                    }}
                    onBlur={commitEditingName}
                    className="px-2 py-0.5 bg-val-bg border border-val-red focus:border-val-red rounded text-xs font-bold text-white focus:outline-none ring-1 ring-val-red/50 max-w-[150px]"
                    placeholder="Account name..."
                  />
                  {account.region && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-val-border/60 text-val-muted">
                      {account.region}
                    </span>
                  )}
                </div>
              ) : (
                <div 
                  className="flex items-center gap-1.5 group/edit cursor-pointer py-0.5 px-1 -ml-1 rounded hover:bg-val-border/40 transition-colors"
                  onClick={startEditingName}
                  title="Click to rename"
                >
                  <h3 className="font-bold text-sm text-val-light group-hover/edit:text-val-red tracking-wide truncate max-w-[150px]">
                    {account.username}
                  </h3>
                  {account.region && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-val-border/60 text-val-muted">
                      {account.region}
                    </span>
                  )}
                </div>
              )}
              <p className="text-xs text-val-muted font-mono mt-0.5">
                {isLevel20 ? (
                  <span className="text-val-mint font-semibold">🏆 Ready For Rank</span>
                ) : (
                  <span>{account.remaining_xp.toLocaleString()} AP to Rank</span>
                )}
              </p>

              {/* Status & Health Badges */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={cycleHealth}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-all ${
                    (account.health_status || 'clean') === 'clean'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                      : account.health_status === 'flagged'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
                  }`}
                  title="Click to toggle account health (Clean / Flagged / Banned)"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    (account.health_status || 'clean') === 'clean' ? 'bg-emerald-400' : account.health_status === 'flagged' ? 'bg-amber-400' : 'bg-rose-400'
                  }`} />
                  <span className="capitalize">{account.health_status || 'clean'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleEmailVerified}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-all ${
                    !account.email_verified
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                  title="Click to toggle email verification (Unverified is prized for resale)"
                >
                  <span>{account.email_verified ? '🔒 Verified' : '🔓 Unverified'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card Top Actions: Trash / Restore */}
          <div className="flex items-center gap-1">
            {!isArchived ? (
              onDelete && (
                <button
                  onClick={() => { sound.playTacticalClick(); onDelete(account.id); }}
                  className="w-7 h-7 rounded flex items-center justify-center text-val-muted hover:text-val-red hover:bg-val-red/10 transition-colors"
                  title="Delete Account"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )
            ) : (
              onRestore && (
                <button
                  onClick={() => { sound.playSuccessDing(); onRestore(account.id); }}
                  className="px-2 py-1 text-xs rounded bg-val-mint/20 text-val-mint font-medium hover:bg-val-mint/30 transition-colors"
                >
                  Restore
                </button>
              )
            )}
          </div>
        </div>

        {/* Level Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[11px] font-mono text-val-dim mb-1.5">
            <span className="font-display uppercase tracking-wider text-[10px]">Progress (Lvl {account.decimal_level || account.level})</span>
            <span className="font-bold text-white">{progressPercent.toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full bg-[#080B10] rounded-full overflow-hidden border border-[#1E2C3D] shadow-inner">
            <div 
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isLevel20
                  ? 'bg-gradient-to-r from-emerald-400 to-[#00F5D4] shadow-[0_0_10px_rgba(0,245,212,0.4)]'
                  : 'bg-gradient-to-r from-val-red via-rose-500 to-amber-500 shadow-[0_0_10px_rgba(255,70,85,0.35)]'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* First Win of the Day Timer — driven by cooldown prop, not account ref */}
        <div className="mt-3 flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-[#0C121D] border border-[#1E2C3D]">
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-val-dim" />
            <span className="text-val-dim font-display uppercase tracking-wider text-[10px]">First Win (+1,000 AP):</span>
          </div>
          <span className={`text-xs font-mono font-semibold tabular-nums ${
            firstWinReady 
              ? 'text-amber-300 animate-pulse font-bold' 
              : 'text-val-dim'
          }`}>
            {countdown}
          </span>
        </div>

        {/* Notes Preview / Inline Edit */}
        {isEditingNote ? (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              autoFocus
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitNote(); }
                else if (e.key === 'Escape') { e.preventDefault(); setIsEditingNote(false); }
              }}
              onBlur={commitNote}
              className="w-full px-2 py-1 bg-val-bg border border-cyan-500 rounded text-xs text-white focus:outline-none ring-1 ring-cyan-500/50"
              placeholder="Add note..."
            />
          </div>
        ) : account.notes ? (
          <div 
            onClick={startEditingNote}
            className="mt-2 flex items-center justify-between gap-1 text-[11px] text-val-dim italic cursor-pointer hover:text-white group/cardnote transition-colors"
            title="Click to edit note"
          >
            <p className="truncate">"{account.notes}"</p>
            <Edit3 className="w-3 h-3 opacity-0 group-hover/cardnote:opacity-70 flex-shrink-0" />
          </div>
        ) : (
          <button
            onClick={startEditingNote}
            className="mt-2 text-[11px] text-val-dim/60 hover:text-[#00F5D4] italic transition-colors block text-left"
            title="Add notes"
          >
            + Add note
          </button>
        )}
      </div>

      {/* Footer Actions: Play & Credentials */}
      <div className="mt-4 pt-3 border-t border-[#1E2C3D] flex items-center gap-2">
        <button
          onClick={handleLaunch}
          disabled={isLaunching}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-display font-black uppercase tracking-wider transition-all shadow-md active:scale-95 ${
            isLaunching
              ? (hasPassword ? 'bg-val-red/60 text-white cursor-wait' : 'bg-slate-800/60 text-slate-500 cursor-wait')
              : isGamePlaying
              ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-[0_0_16px_rgba(16,185,129,0.45)] hover:shadow-[0_0_22px_rgba(16,185,129,0.7)] ring-1 ring-emerald-400/50 cursor-pointer'
              : hasPassword
              ? 'bg-gradient-to-r from-val-red to-[#FF2E40] hover:brightness-110 text-white shadow-[0_0_12px_rgba(255,70,85,0.35)] hover:shadow-[0_0_18px_rgba(255,70,85,0.6)] cursor-pointer'
              : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 border border-slate-700/60 shadow-none cursor-pointer'
          }`}
          title={
            isGamePlaying
              ? 'VALORANT is currently running — Click to refocus'
              : !hasPassword
              ? 'Password not set — Click to enter password and play'
              : 'Auto-launch Riot Client and type credentials'
          }
        >
          {isGamePlaying ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span>Playing</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isLaunching ? 'Launching...' : 'Play'}</span>
            </>
          )}
        </button>

        {isEditingPass ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              autoFocus
              value={passValue}
              onChange={(e) => setPassValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitPass(); }
                else if (e.key === 'Escape') { e.preventDefault(); setIsEditingPass(false); }
              }}
              onBlur={commitPass}
              className="w-28 px-2 py-1 bg-val-bg border border-cyan-500 rounded text-xs font-mono text-white focus:outline-none ring-1 ring-cyan-500/50"
              placeholder="Password..."
            />
          </div>
        ) : account.password ? (
          <div className="flex items-center gap-1 group/cardpass">
            <button
              onClick={handleCopyPassword}
              className="h-8 px-2.5 rounded-lg bg-val-bg hover:bg-val-card border border-val-border text-val-light text-xs font-mono flex items-center gap-1.5 transition-all active:scale-95"
              title="Click to copy password"
            >
              {copiedPass ? (
                <>
                  <Check className="w-3.5 h-3.5 text-val-mint" />
                  <span className="text-val-mint font-sans text-[11px]">Copied</span>
                </>
              ) : (
                <>
                  <Key className="w-3.5 h-3.5 text-val-muted" />
                  <span>{showPassword ? account.password : '••••••••'}</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowPassword(!showPassword)}
              className="w-8 h-8 rounded-lg bg-val-bg hover:bg-val-card border border-val-border flex items-center justify-center text-val-muted hover:text-val-light transition-colors"
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={startEditingPass}
              className="w-8 h-8 rounded-lg bg-val-bg hover:bg-val-card border border-val-border flex items-center justify-center text-val-muted hover:text-cyan-400 opacity-0 group-hover/cardpass:opacity-100 transition-all"
              title="Edit password"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={startEditingPass}
            className="h-8 px-2.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-400 text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95"
            title="Add password"
          >
            <Key className="w-3.5 h-3.5 text-cyan-400" />
            <span>+ Password</span>
          </button>
        )}
      </div>
      </div>
    </div>
  );
};

export const AccountCard = memo(AccountCardInner, arePropsEqual);
