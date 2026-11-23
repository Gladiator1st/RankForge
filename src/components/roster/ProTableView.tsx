import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Play, 
  Trash2, 
  Check, 
  ArrowUpDown, 
  Search, 
  Key, 
  Clock,
  Eye,
  EyeOff,
  Copy,
  Edit3,
  BarChart2,
  Filter,
  Shield,
  Target,
  Trophy
} from 'lucide-react';
import { Account, AppSettings, RiotStatus } from '../../types';
import { sound } from '../../services/soundEffects';

interface CooldownEntry {
  ready: boolean;
  seconds: number;
  countdown: string;
}

interface ProTableViewProps {
  accounts: Account[];
  cooldownMap: Map<string, CooldownEntry>;
  settings: AppSettings;
  activeRosterAccount?: Account | null;
  riotStatus?: RiotStatus;
  onLaunch: (id: string) => void;
  onDelete?: (id: string) => void;
  onBatchDelete?: (ids: string[]) => void | Promise<void>;
  onOpenHandover?: (account: Account) => void;
  onOpenStats?: (account: Account) => void;
  onRenameAccount?: (id: string, newUsername: string) => void;
  onUpdateAccount?: (id: string, updates: Partial<Account>) => void;
  role?: 'solo';
}

type SortField = 'username' | 'level' | 'remaining_xp' | 'first_win';
type SortOrder = 'asc' | 'desc';
type SoloFilter = 'all' | 'ready' | 'cooldown' | 'finished';

const ROW_HEIGHT = 44; // px

export const ProTableView: React.FC<ProTableViewProps> = React.memo(({
  accounts,
  cooldownMap,
  settings: _settings,
  activeRosterAccount,
  riotStatus,
  onLaunch,
  onDelete,
  onBatchDelete,
  onOpenHandover: _onOpenHandover,
  onOpenStats,
  onRenameAccount,
  onUpdateAccount,
}) => {
  // Search and sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 120);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const [sortField, setSortField] = useState<SortField>('level');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusFilter, setStatusFilter] = useState<SoloFilter>('all');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editingPassId, setEditingPassId] = useState<string | null>(null);
  const [editPassValue, setEditPassValue] = useState('');
  const [revealedPassIds, setRevealedPassIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedUser, setCopiedUser] = useState<string | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; account: Account } | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (a.is_deleted) return false;

      // Status filter
      if (statusFilter === 'ready') {
        const cd = cooldownMap.get(a.id);
        const isReady = cd ? cd.ready : a.first_win_ready;
        if (!isReady || a.level >= 20) return false;
      } else if (statusFilter === 'cooldown') {
        const cd = cooldownMap.get(a.id);
        const isReady = cd ? cd.ready : a.first_win_ready;
        if (isReady || a.level >= 20) return false;
      } else if (statusFilter === 'finished') {
        if (a.level < 20) return false;
      }

      // Search query
      if (!debouncedQuery) return true;
      const q = debouncedQuery.toLowerCase().trim();
      return (
        a.username.toLowerCase().includes(q) ||
        (a.region && a.region.toLowerCase().includes(q)) ||
        (a.notes && a.notes.toLowerCase().includes(q))
      );
    });
  }, [accounts, statusFilter, debouncedQuery, cooldownMap]);

  // Sort accounts
  const sortedAccounts = useMemo(() => {
    return [...filteredAccounts].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'username') {
        comparison = a.username.localeCompare(b.username);
      } else if (sortField === 'level') {
        comparison = (a.decimal_level || a.level) - (b.decimal_level || b.level);
      } else if (sortField === 'remaining_xp') {
        comparison = (a.remaining_xp || 0) - (b.remaining_xp || 0);
      } else if (sortField === 'first_win') {
        const cdA = cooldownMap.get(a.id);
        const cdB = cooldownMap.get(b.id);
        const readyA = cdA ? cdA.ready : a.first_win_ready ? 1 : 0;
        const readyB = cdB ? cdB.ready : b.first_win_ready ? 1 : 0;
        comparison = (readyB as number) - (readyA as number);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredAccounts, sortField, sortOrder, cooldownMap]);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: sortedAccounts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const handleSort = (field: SortField) => {
    sound.playTacticalClick();
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleSelectAll = () => {
    sound.playTacticalClick();
    if (selectedIds.size === sortedAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAccounts.map((a) => a.id)));
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playTacticalClick();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyUsername = (uname: string, id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    sound.playSuccessDing();
    window.rfrApi?.copyToClipboard(uname);
    setCopiedUser(id);
    setTimeout(() => setCopiedUser(null), 1500);
  };

  const handleCopyPassword = (pass: string, id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    sound.playSuccessDing();
    window.rfrApi?.copyToClipboard(pass);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleRevealPass = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    sound.playTacticalClick();
    setRevealedPassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cycleHealth = (acc: Account, e?: React.MouseEvent) => {
    e?.stopPropagation();
    sound.playTacticalClick();
    const cur = acc.health_status || 'clean';
    const next = cur === 'clean' ? 'flagged' : cur === 'flagged' ? 'banned' : 'clean';
    onUpdateAccount?.(acc.id, { health_status: next });
  };

  // Close context menu on global click
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#070B12] text-slate-200">
      {/* Top Filter and Search Action Bar */}
      <div className="p-3 border-b border-[#1E2C3D] flex items-center justify-between gap-3 bg-[#0A0F18]/90 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username, region, or note..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#05080E] border border-[#1E2C3D] rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-[#05080E] border border-[#1E2C3D] p-0.5 rounded-lg text-xs">
            <button
              onClick={() => { sound.playTacticalClick(); setStatusFilter('all'); }}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                statusFilter === 'all'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({accounts.length})
            </button>
            <button
              onClick={() => { sound.playTacticalClick(); setStatusFilter('ready'); }}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                statusFilter === 'ready'
                  ? 'bg-emerald-500/20 text-[#00F5D4] border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              🎯 Ready
            </button>
            <button
              onClick={() => { sound.playTacticalClick(); setStatusFilter('cooldown'); }}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                statusFilter === 'cooldown'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              ⏳ Cooldown
            </button>
            <button
              onClick={() => { sound.playTacticalClick(); setStatusFilter('finished'); }}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                statusFilter === 'finished'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-cyan-300'
              }`}
            >
              🏆 Level 20
            </button>
          </div>
        </div>

        {/* Selected Batch Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-[#05080E] border border-cyan-500/40 px-3 py-1 rounded-lg">
            <span className="text-xs font-mono text-cyan-300 font-semibold">
              {selectedIds.size} Selected
            </span>
            <button
              onClick={() => {
                sound.playTacticalClick();
                if (onBatchDelete) {
                  onBatchDelete(Array.from(selectedIds));
                } else if (onDelete) {
                  selectedIds.forEach((id) => onDelete(id));
                }
                setSelectedIds(new Set());
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-medium transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Deselect
            </button>
          </div>
        )}
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-[#1E2C3D] bg-[#0A0F18] text-xs font-display font-semibold uppercase tracking-wider text-slate-400 select-none shrink-0">
        <div className="col-span-1 flex items-center gap-2">
          <input
            type="checkbox"
            checked={sortedAccounts.length > 0 && selectedIds.size === sortedAccounts.length}
            onChange={toggleSelectAll}
            className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 text-val-red focus:ring-0 cursor-pointer"
          />
          <span>Status</span>
        </div>

        <div
          onClick={() => handleSort('username')}
          className="col-span-3 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
        >
          <span>Account</span>
          <ArrowUpDown className="w-3 h-3 text-slate-500" />
        </div>

        <div
          onClick={() => handleSort('level')}
          className="col-span-2 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
        >
          <span>Level & Progression</span>
          <ArrowUpDown className="w-3 h-3 text-slate-500" />
        </div>

        <div
          onClick={() => handleSort('first_win')}
          className="col-span-2 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
        >
          <span>First Win Bonus</span>
          <ArrowUpDown className="w-3 h-3 text-slate-500" />
        </div>

        <div className="col-span-2">Password</div>
        <div className="col-span-1">Health</div>
        <div className="col-span-1 text-right">Actions</div>
      </div>

      {/* Table Body (Virtualized) */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {sortedAccounts.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-slate-500 gap-2 font-sans">
            <Filter className="w-6 h-6 stroke-1 text-slate-600" />
            <p className="text-xs">No accounts match the active filter or search query</p>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
              width: '100%',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const account = sortedAccounts[virtualRow.index];
              const isSelected = selectedIds.has(account.id);
              const cd = cooldownMap.get(account.id);
              const isReady = cd ? cd.ready : account.first_win_ready;
              const isFinished = account.level >= 20;

              const isAccountActive = Boolean(
                (activeRosterAccount && activeRosterAccount.id === account.id) ||
                (riotStatus?.is_connected && (
                  (riotStatus.login_username && account.username?.toLowerCase().trim() === riotStatus.login_username.toLowerCase().trim()) ||
                  (riotStatus.game_name && account.username?.toLowerCase().trim() === riotStatus.game_name.toLowerCase().trim())
                ))
              );
              const isPlaying = Boolean(isAccountActive && riotStatus?.is_game_running);

              return (
                <div
                  key={account.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, account });
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${ROW_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`grid grid-cols-12 gap-2 px-4 items-center text-xs border-b border-[#141F2D] transition-colors select-none ${
                    isPlaying
                      ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                      : isAccountActive
                      ? 'bg-cyan-950/20 hover:bg-cyan-950/30'
                      : isSelected
                      ? 'bg-slate-800/40 hover:bg-slate-800/60'
                      : virtualRow.index % 2 === 0
                      ? 'bg-[#080D15] hover:bg-[#0E1522]'
                      : 'bg-[#060A10] hover:bg-[#0E1522]'
                  }`}
                >
                  {/* Select + Active Indicator */}
                  <div className="col-span-1 flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => toggleSelectOne(account.id, e)}
                      onChange={() => {}}
                      className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 text-val-red focus:ring-0 cursor-pointer"
                    />
                    {isPlaying ? (
                      <span className="relative flex h-2.5 w-2.5" title="VALORANT is currently running">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                    ) : isAccountActive ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 ring-2 ring-cyan-500/30 shrink-0" title="Riot Client Logged In" />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-700 shrink-0" />
                    )}
                  </div>

                  {/* Account / Username */}
                  <div className="col-span-3 flex items-center gap-2 truncate">
                    {editingId === account.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        onBlur={() => {
                          const trimmed = editNameValue.trim();
                          if (trimmed && trimmed !== account.username) {
                            sound.playSuccessDing();
                            onRenameAccount?.(account.id, trimmed);
                          }
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const trimmed = editNameValue.trim();
                            if (trimmed && trimmed !== account.username) {
                              sound.playSuccessDing();
                              onRenameAccount?.(account.id, trimmed);
                            }
                            setEditingId(null);
                          } else if (e.key === 'Escape') {
                            setEditingId(null);
                          }
                        }}
                        className="px-2 py-0.5 bg-val-bg border border-val-red rounded text-xs font-bold text-white focus:outline-none"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 truncate group/uname">
                        <span
                          onClick={() => {
                            setEditingId(account.id);
                            setEditNameValue(account.username);
                          }}
                          className="font-bold text-white hover:text-cyan-400 cursor-pointer truncate max-w-[150px]"
                          title="Click to rename"
                        >
                          {account.username}
                        </span>
                        <button
                          onClick={(e) => handleCopyUsername(account.username, account.id, e)}
                          className="opacity-0 group-hover/uname:opacity-100 text-slate-500 hover:text-white transition-opacity"
                          title="Copy username"
                        >
                          {copiedUser === account.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <span className="px-1 py-0.2 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-400 border border-slate-700">
                          {account.region || 'EU'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Level & Progress */}
                  <div className="col-span-2 flex flex-col justify-center">
                    <div className="flex items-center justify-between text-[11px] font-mono leading-none mb-1">
                      <span className="font-bold text-white">Lvl {account.level}</span>
                      <span className="text-slate-400">
                        {isFinished ? '🏆 Ready' : `${account.remaining_xp.toLocaleString()} AP`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isFinished
                            ? 'bg-gradient-to-r from-emerald-500 to-[#00F5D4]'
                            : 'bg-gradient-to-r from-val-red to-orange-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, (account.level / 20) * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* First Win Bonus */}
                  <div className="col-span-2 font-mono text-[11px] truncate">
                    {isFinished ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Trophy className="w-3 h-3" />
                        <span>Ready For Rank</span>
                      </span>
                    ) : isReady ? (
                      <span className="text-[#00F5D4] font-semibold flex items-center gap-1">
                        <Target className="w-3 h-3 text-[#00F5D4]" />
                        <span>READY (+1,000 AP)</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>{cd?.countdown || '⏳ Cooldown'}</span>
                      </span>
                    )}
                  </div>

                  {/* Password */}
                  <div className="col-span-2 flex items-center gap-1.5 truncate">
                    {editingPassId === account.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editPassValue}
                        onChange={(e) => setEditPassValue(e.target.value)}
                        onBlur={() => {
                          const trimmed = editPassValue.trim();
                          if (trimmed !== (account.password || '')) {
                            sound.playSuccessDing();
                            onUpdateAccount?.(account.id, { password: trimmed });
                          }
                          setEditingPassId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const trimmed = editPassValue.trim();
                            if (trimmed !== (account.password || '')) {
                              sound.playSuccessDing();
                              onUpdateAccount?.(account.id, { password: trimmed });
                            }
                            setEditingPassId(null);
                          } else if (e.key === 'Escape') {
                            setEditingPassId(null);
                          }
                        }}
                        className="px-2 py-0.5 bg-val-bg border border-cyan-500 rounded text-xs font-mono text-white focus:outline-none w-28"
                      />
                    ) : account.password ? (
                      <div className="flex items-center gap-1 group/pass truncate">
                        <span
                          onClick={(e) => handleCopyPassword(account.password || '', account.id, e)}
                          className="font-mono text-slate-300 hover:text-white cursor-pointer truncate max-w-[100px]"
                          title="Click to copy password"
                        >
                          {revealedPassIds.has(account.id) ? account.password : '••••••••'}
                        </span>
                        <button
                          onClick={(e) => toggleRevealPass(account.id, e)}
                          className="text-slate-500 hover:text-white transition-colors"
                          title={revealedPassIds.has(account.id) ? 'Hide' : 'Show'}
                        >
                          {revealedPassIds.has(account.id) ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={(e) => handleCopyPassword(account.password || '', account.id, e)}
                          className="text-slate-500 hover:text-white transition-colors"
                          title="Copy password"
                        >
                          {copiedId === account.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setEditingPassId(account.id);
                            setEditPassValue(account.password || '');
                          }}
                          className="opacity-0 group-hover/pass:opacity-100 text-slate-500 hover:text-cyan-400 transition-opacity"
                          title="Edit password"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingPassId(account.id);
                          setEditPassValue('');
                        }}
                        className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <Key className="w-3 h-3" />
                        <span>+ Password</span>
                      </button>
                    )}
                  </div>

                  {/* Health */}
                  <div className="col-span-1">
                    <button
                      onClick={(e) => cycleHealth(account, e)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-all ${
                        (account.health_status || 'clean') === 'clean'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                          : account.health_status === 'flagged'
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
                      }`}
                      title="Click to toggle health (Clean / Flagged / Banned)"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        (account.health_status || 'clean') === 'clean'
                          ? 'bg-emerald-400'
                          : account.health_status === 'flagged'
                          ? 'bg-amber-400'
                          : 'bg-rose-400'
                      }`} />
                      <span className="capitalize">{account.health_status || 'clean'}</span>
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => onLaunch(account.id)}
                      className={`p-1.5 rounded-lg text-white font-medium transition-all shadow-sm active:scale-95 ${
                        isPlaying
                          ? 'bg-emerald-600 hover:bg-emerald-500 ring-1 ring-emerald-400/50'
                          : 'bg-val-red hover:bg-[#FF2E40]'
                      }`}
                      title={isPlaying ? 'VALORANT Running (Focus)' : 'Launch Riot Client'}
                    >
                      <Play className="w-3 h-3 fill-current" />
                    </button>

                    {onOpenStats && (
                      <button
                        onClick={() => onOpenStats(account)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="View Detailed Telemetry & Match Stats"
                      >
                        <BarChart2 className="w-3 h-3" />
                      </button>
                    )}

                    {onDelete && (
                      <button
                        onClick={() => onDelete(account.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete account"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context Menu on Right Click */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 w-48 bg-[#0D1522] border border-[#1E2C3D] rounded-xl shadow-2xl p-1 text-xs text-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onLaunch(contextMenu.account.id);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-val-red hover:text-white text-left transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Account</span>
          </button>

          <button
            onClick={(e) => {
              handleCopyUsername(contextMenu.account.username, contextMenu.account.id, e);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Username</span>
          </button>

          {contextMenu.account.password && (
            <button
              onClick={(e) => {
                handleCopyPassword(contextMenu.account.password || '', contextMenu.account.id, e);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Copy Password</span>
            </button>
          )}

          <div className="h-px bg-slate-800 my-1" />

          <button
            onClick={(e) => {
              cycleHealth(contextMenu.account, e);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Toggle Health</span>
          </button>

          {onDelete && (
            <button
              onClick={() => {
                onDelete(contextMenu.account.id);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 text-left transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Account</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});
