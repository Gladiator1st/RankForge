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
  ClipboardList,
  X,
  Edit3,
  Sparkles,
  BarChart2,
  Award,
  UserPlus,
  Filter,
  Columns2,
  CheckCircle2,
  GripVertical,
  Target,
  Trophy,
  ChevronDown
} from 'lucide-react';
import { Account, AppSettings, RiotStatus } from '../../types';
import { sound } from '../../services/soundEffects';
import { getSmartFlowRecommendation } from '../../services/smartFlow';

export type ColumnKey = 'account' | 'password' | 'status' | 'level' | 'first_win';

const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
  'account',
  'password',
  'status',
  'level',
  'first_win',
];

const COLUMN_WEIGHTS: Record<ColumnKey, number> = {
  account: 30,
  level: 25,
  first_win: 25,
  password: 10,
  status: 10,
};

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
  role?: string;
  isSoloFree?: boolean;
  onOpenPaywall?: () => void;
}

type SortField = 'username' | 'level' | 'remaining_xp' | 'first_win';
type SortOrder = 'asc' | 'desc';
type SoloFilter = 'all' | 'ready' | 'cooldown' | 'finished';

const ROW_HEIGHT = 48; // px

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

  const [sortField, setSortField] = useState<SortField>('username');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [copiedState, setCopiedState] = useState<{ id: string; field: 'username' | 'password' } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Password Inline Editing State
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [editingPasswordValue, setEditingPasswordValue] = useState('');
  const [revealedPassIds, setRevealedPassIds] = useState<Set<string>>(new Set());

  // Filter state
  const [soloFilter, setSoloFilter] = useState<SoloFilter>('all');

  // Multi-Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Shift-click range selection
  const lastClickedIndexRef = useRef<number | null>(null);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; account: Account } | null>(null);

  // Column visibility toggles (persisted in localStorage)
  const [showPasswordCol, setShowPasswordCol] = useState<boolean>(() => {
    try { return localStorage.getItem('rfr_col_password') !== 'false'; } catch { return true; }
  });
  const [showStatusCol, setShowStatusCol] = useState<boolean>(() => {
    try { return localStorage.getItem('rfr_col_status') !== 'false'; } catch { return true; }
  });
  const [showLevelCol, setShowLevelCol] = useState<boolean>(() => {
    try { return localStorage.getItem('rfr_col_level') !== 'false'; } catch { return true; }
  });
  const [showFirstWinCol, setShowFirstWinCol] = useState<boolean>(() => {
    try { return localStorage.getItem('rfr_col_first_win') !== 'false'; } catch { return true; }
  });
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false);

  const togglePasswordCol = () => setShowPasswordCol((v) => {
    const next = !v;
    try { localStorage.setItem('rfr_col_password', String(next)); } catch {}
    return next;
  });
  const toggleStatusCol = () => setShowStatusCol((v) => {
    const next = !v;
    try { localStorage.setItem('rfr_col_status', String(next)); } catch {}
    return next;
  });
  const toggleLevelCol = () => setShowLevelCol((v) => {
    const next = !v;
    try { localStorage.setItem('rfr_col_level', String(next)); } catch {}
    return next;
  });
  const toggleFirstWinCol = () => setShowFirstWinCol((v) => {
    const next = !v;
    try { localStorage.setItem('rfr_col_first_win', String(next)); } catch {}
    return next;
  });

  // Column Drag and Drop Reordering State
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem('rfr_table_col_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((k: any): k is ColumnKey => DEFAULT_COLUMN_ORDER.includes(k));
          const missing = DEFAULT_COLUMN_ORDER.filter((k) => !valid.includes(k));
          return [...valid, ...missing];
        }
      }
    } catch {}
    return DEFAULT_COLUMN_ORDER;
  });

  const [draggedCol, setDraggedCol] = useState<ColumnKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnKey | null>(null);
  const [dropPosition, setDropPosition] = useState<'left' | 'right' | null>(null);
  const isDraggingColRef = useRef(false);

  const resetColumnOrder = () => {
    sound.playTacticalClick();
    setColumnOrder(DEFAULT_COLUMN_ORDER);
    try {
      localStorage.removeItem('rfr_table_col_order');
    } catch {}
    setActionSuccessMsg('Reset column order to default!');
    setTimeout(() => setActionSuccessMsg(null), 2500);
  };

  const handleColDragStart = (colKey: ColumnKey, e: React.DragEvent) => {
    isDraggingColRef.current = true;
    setDraggedCol(colKey);
    e.dataTransfer.setData('text/plain', colKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColDragOver = (colKey: ColumnKey, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedCol && draggedCol !== colKey) {
      const rect = e.currentTarget.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const pos = e.clientX < midpoint ? 'left' : 'right';
      setDragOverCol(colKey);
      setDropPosition(pos);
    }
  };

  const handleColDragLeave = (colKey: ColumnKey) => {
    if (dragOverCol === colKey) {
      setDragOverCol(null);
      setDropPosition(null);
    }
  };

  const handleColDrop = (targetCol: ColumnKey, e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetCol) {
      setDraggedCol(null);
      setDragOverCol(null);
      setDropPosition(null);
      return;
    }

    setColumnOrder((prev) => {
      const filtered = prev.filter((k) => k !== draggedCol);
      const targetIdx = filtered.indexOf(targetCol);
      const insertIdx = dropPosition === 'left' ? targetIdx : targetIdx + 1;
      const next = [...filtered];
      next.splice(insertIdx, 0, draggedCol);
      try {
        localStorage.setItem('rfr_table_col_order', JSON.stringify(next));
      } catch {}
      return next;
    });

    sound.playTacticalClick();
    setDraggedCol(null);
    setDragOverCol(null);
    setDropPosition(null);
  };

  const handleColDragEnd = () => {
    setDraggedCol(null);
    setDragOverCol(null);
    setDropPosition(null);
    setTimeout(() => {
      isDraggingColRef.current = false;
    }, 150);
  };

  const activeColumns = useMemo(() => {
    return columnOrder.filter((colKey) => {
      switch (colKey) {
        case 'account': return true;
        case 'password': return showPasswordCol;
        case 'status': return showStatusCol;
        case 'level': return showLevelCol;
        case 'first_win': return showFirstWinCol;
        default: return false;
      }
    });
  }, [columnOrder, showPasswordCol, showStatusCol, showLevelCol, showFirstWinCol]);

  // Dynamically compute column percentage widths
  const colWidths = useMemo(() => {
    const totalWeight = activeColumns.reduce((sum, col) => sum + (COLUMN_WEIGHTS[col] || 10), 0);
    const widths: Record<ColumnKey, string> = {} as any;
    activeColumns.forEach((col) => {
      const pct = ((COLUMN_WEIGHTS[col] || 10) / (totalWeight || 1)) * 100;
      widths[col] = `${pct.toFixed(2)}%`;
    });
    return widths;
  }, [activeColumns]);

  const resetColumnsToDefault = () => {
    setShowPasswordCol(true);
    setShowStatusCol(true);
    setShowLevelCol(true);
    setShowFirstWinCol(true);
    setColumnOrder(DEFAULT_COLUMN_ORDER);
    try {
      localStorage.setItem('rfr_col_password', 'true');
      localStorage.setItem('rfr_col_status', 'true');
      localStorage.setItem('rfr_col_level', 'true');
      localStorage.setItem('rfr_col_first_win', 'true');
      localStorage.removeItem('rfr_table_col_order');
    } catch {}
    setActionSuccessMsg('Reset all columns and order to default!');
    setTimeout(() => setActionSuccessMsg(null), 2500);
  };

  const hiddenCount = [showPasswordCol, showStatusCol, showLevelCol, showFirstWinCol].filter((v) => !v).length;

  const parentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Smart Flow Recommendation (Auto-Rotation)
  const smartRecommendation = useMemo(() => {
    return getSmartFlowRecommendation(accounts, cooldownMap);
  }, [accounts, cooldownMap]);

  const handleSmartRotate = () => {
    if (smartRecommendation.account) {
      sound.playLevelUpFanfare();
      setActionSuccessMsg(`🎯 Auto-Rotating to ${smartRecommendation.account.username} (${smartRecommendation.reason})`);
      onLaunch(smartRecommendation.account.id);
      setTimeout(() => setActionSuccessMsg(null), 3500);
    }
  };

  // Keyboard shortcut Ctrl+F to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const active = document.activeElement;
        const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        if (!isInput) {
          e.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter and tab counts
  const counts = useMemo(() => {
    let soloReady = 0;
    let soloCooldown = 0;
    let soloFinished = 0;

    accounts.forEach((a) => {
      if (a.level >= 20) {
        soloFinished++;
      } else {
        const cd = cooldownMap.get(a.id);
        const isReady = cd?.ready ?? a.first_win_ready ?? true;
        if (isReady) {
          soloReady++;
        } else {
          soloCooldown++;
        }
      }
    });

    return {
      all: accounts.length,
      soloReady,
      soloCooldown,
      soloFinished,
    };
  }, [accounts, cooldownMap]);

  // Filtering accounts
  const filteredAndSorted = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();

    return accounts
      .filter((a) => {
        if (a.is_deleted) return false;

        // Search query
        if (q) {
          const matchUname = a.username.toLowerCase().includes(q);
          const matchRegion = a.region ? a.region.toLowerCase().includes(q) : false;
          const matchNotes = a.notes ? a.notes.toLowerCase().includes(q) : false;
          const matchMmr = a.stats?.estimated_mmr ? a.stats.estimated_mmr.toLowerCase().includes(q) : false;
          if (!matchUname && !matchRegion && !matchNotes && !matchMmr) return false;
        }

        // Segmented filter
        if (soloFilter === 'ready') {
          const cd = cooldownMap.get(a.id);
          const isReady = cd?.ready ?? a.first_win_ready ?? true;
          if (!isReady || a.level >= 20) return false;
        } else if (soloFilter === 'cooldown') {
          const cd = cooldownMap.get(a.id);
          const isReady = cd?.ready ?? a.first_win_ready ?? true;
          if (isReady || a.level >= 20) return false;
        } else if (soloFilter === 'finished') {
          if (a.level < 20) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let valA: any = a[sortField as keyof Account];
        let valB: any = b[sortField as keyof Account];

        if (sortField === 'username') {
          valA = (a.username || '').toLowerCase();
          valB = (b.username || '').toLowerCase();
        } else if (sortField === 'level') {
          valA = a.decimal_level || a.level;
          valB = b.decimal_level || b.level;
        } else if (sortField === 'first_win') {
          const cdA = cooldownMap.get(a.id);
          const cdB = cooldownMap.get(b.id);
          const readyA = cdA ? cdA.ready : a.first_win_ready ? 1 : 0;
          const readyB = cdB ? cdB.ready : b.first_win_ready ? 1 : 0;
          valA = readyA;
          valB = readyB;
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [accounts, debouncedQuery, soloFilter, sortField, sortOrder, cooldownMap]);

  const handleSort = (field: SortField) => {
    sound.playTacticalClick();
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleCopy = (id: string, text: string, field: 'username' | 'password') => {
    sound.playSuccessDing();
    window.rfrApi?.copyToClipboard(text);
    setCopiedState({ id, field });
    setTimeout(() => setCopiedState(null), 1500);
  };

  const startEditing = (account: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playTacticalClick();
    setEditingId(account.id);
    setEditingName(account.username);
  };

  const commitEdit = (account: Account) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== account.username) {
      sound.playSuccessDing();
      onRenameAccount?.(account.id, trimmed);
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const startEditingPassword = (account: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playTacticalClick();
    setEditingPasswordId(account.id);
    setEditingPasswordValue(account.password || '');
  };

  const commitPasswordEdit = (account: Account) => {
    const trimmed = editingPasswordValue.trim();
    if (trimmed !== (account.password || '')) {
      sound.playSuccessDing();
      onUpdateAccount?.(account.id, { password: trimmed });
    }
    setEditingPasswordId(null);
  };

  const cancelPasswordEdit = () => {
    setEditingPasswordId(null);
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

  const cycleHealth = (acc: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playTacticalClick();
    const cur = acc.health_status || 'clean';
    const next = cur === 'clean' ? 'flagged' : cur === 'flagged' ? 'banned' : 'clean';
    onUpdateAccount?.(acc.id, { health_status: next });
  };

  const toggleEmailVerified = (acc: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playTacticalClick();
    onUpdateAccount?.(acc.id, { email_verified: !acc.email_verified });
  };

  // Selection logic
  const toggleSelect = (id: string, e: React.MouseEvent, clickedIndex?: number) => {
    sound.playTacticalClick();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastClickedIndexRef.current !== null && clickedIndex !== undefined) {
        const start = Math.min(lastClickedIndexRef.current, clickedIndex);
        const end = Math.max(lastClickedIndexRef.current, clickedIndex);
        for (let i = start; i <= end; i++) {
          const item = filteredAndSorted[i];
          if (item) next.add(item.id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    if (clickedIndex !== undefined) {
      lastClickedIndexRef.current = clickedIndex;
    }
  };

  const toggleSelectAll = (visibleItems: Account[]) => {
    sound.playTacticalClick();
    setSelectedIds((prev) => {
      const allSelected = visibleItems.every((a) => prev.has(a.id));
      const next = new Set(prev);
      if (allSelected) {
        visibleItems.forEach((a) => next.delete(a.id));
      } else {
        visibleItems.forEach((a) => next.add(a.id));
      }
      return next;
    });
  };

  const handleExportSelected = () => {
    const selectedAccs = accounts.filter((a) => selectedIds.has(a.id));
    const lines = selectedAccs.map((a) => `${a.username}:${a.password || ''}`);
    window.rfrApi?.copyToClipboard(lines.join('\n'));
    sound.playSuccessDing();
    setActionSuccessMsg(`Copied ${lines.length} account credentials (user:pass) to clipboard!`);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    sound.playTacticalClick();
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    if (onBatchDelete) {
      await onBatchDelete(ids);
    } else if (onDelete) {
      ids.forEach((id) => onDelete(id));
    }
    setActionSuccessMsg(`Deleted ${count} account${count > 1 ? 's' : ''}!`);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  // Keyboard shortcut Esc to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds.size]);

  // Context Menu: close on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close, { once: true });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  const rowVirtualizer = useVirtualizer({
    count: filteredAndSorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const clearAllFilters = () => {
    sound.playTacticalClick();
    setSearchQuery('');
    setSoloFilter('all');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 px-4 pb-4">
      {/* Top Controls Bar */}
      <div className="relative z-20 flex items-center justify-between gap-2 mb-3 shrink-0 min-w-0">
        {/* Left Side: Search Bar, Smart Rotate & Columns Visibility */}
        <div className="flex items-center gap-2 shrink min-w-0">
          {/* Stable-width Search Bar */}
          <div className="relative w-40 sm:w-48 lg:w-56 min-w-[130px] shrink">
            <Search className="w-3.5 h-3.5 text-val-dim absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search roster... (Ctrl+F)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && searchQuery) {
                  e.stopPropagation();
                  setSearchQuery('');
                }
              }}
              className="w-full pl-8 pr-7 py-1.5 bg-[#0A0F1A]/90 border border-[#1A2536] hover:border-[#24334A] focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none transition-all font-mono shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5 rounded transition-colors"
                title="Clear search (Esc)"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Smart Rotate Compact Action Button */}
          <button
            type="button"
            onClick={handleSmartRotate}
            disabled={!smartRecommendation.account}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-display font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 shrink-0 ${
              smartRecommendation.account
                ? 'bg-[#0E1726] hover:bg-[#132238] border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.12)]'
                : 'bg-slate-900/60 text-slate-500 cursor-not-allowed border border-slate-800/80'
            }`}
            title={smartRecommendation.tooltip || smartRecommendation.reason}
          >
            <Sparkles className={`w-3.5 h-3.5 ${smartRecommendation.account ? 'text-cyan-400 fill-cyan-400/20' : 'text-slate-600'}`} />
            <span>Rotate</span>
            {smartRecommendation.account && (
              <span className="text-[10px] font-mono bg-cyan-950/70 px-1.5 py-0.5 rounded text-cyan-300 border border-cyan-500/30 whitespace-nowrap">
                {smartRecommendation.account.username}
              </span>
            )}
          </button>

          {/* Columns Visibility Dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-display uppercase tracking-wider font-semibold transition-all ${
                hiddenCount > 0
                  ? 'bg-[#00F5D4]/15 border-[#00F5D4]/40 text-[#00F5D4]'
                  : 'bg-[#0A0F1A]/90 border-[#1A2536] hover:border-[#24334A] text-slate-300 hover:text-white'
              }`}
              title="Toggle Columns Visibility"
            >
              <Columns2 className="w-3.5 h-3.5 text-[#00F5D4]" />
              <span className="hidden sm:inline">Columns</span>
              {hiddenCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#00F5D4] text-slate-950 font-mono font-bold text-[10px]">
                  {hiddenCount}
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isColumnsMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsColumnsMenuOpen(false)} />
                <div className="absolute left-0 mt-1 w-52 bg-slate-900 border border-[#1E2C3D] rounded-xl shadow-2xl z-50 p-2 text-xs animate-in fade-in zoom-in-95 duration-150 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 border-b border-slate-800 flex items-center justify-between">
                    <span>Columns</span>
                    <div className="flex items-center gap-1.5 lowercase text-[10px]">
                      <button
                        type="button"
                        onClick={resetColumnOrder}
                        className="text-cyan-400 hover:text-cyan-300 hover:underline"
                        title="Reset column order to default"
                      >
                        order
                      </button>
                      <span className="text-slate-600">•</span>
                      <button
                        type="button"
                        onClick={resetColumnsToDefault}
                        className="text-cyan-400 hover:text-cyan-300 hover:underline"
                        title="Reset all columns and order"
                      >
                        reset all
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 cursor-pointer text-slate-200">
                    <input
                      type="checkbox"
                      checked={showPasswordCol}
                      onChange={togglePasswordCol}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 bg-slate-950"
                    />
                    <span>Password</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 cursor-pointer text-slate-200">
                    <input
                      type="checkbox"
                      checked={showStatusCol}
                      onChange={toggleStatusCol}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 bg-slate-950"
                    />
                    <span>Status</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 cursor-pointer text-slate-200">
                    <input
                      type="checkbox"
                      checked={showLevelCol}
                      onChange={toggleLevelCol}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 bg-slate-950"
                    />
                    <span>Level Progress</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 cursor-pointer text-slate-200">
                    <input
                      type="checkbox"
                      checked={showFirstWinCol}
                      onChange={toggleFirstWinCol}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 bg-slate-950"
                    />
                    <span>First Win Bonus</span>
                  </label>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Side: Solo Filter Tabs & Tier Badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Segmented Filter Control */}
          <div className="flex items-center p-0.5 bg-[#080C14]/90 rounded-lg border border-[#162234] text-xs backdrop-blur-md">
            <button
              onClick={() => { sound.playTacticalClick(); setSoloFilter('all'); }}
              className={`px-2.5 py-1 rounded-md transition-all font-display uppercase tracking-wider text-[11px] ${
                soloFilter === 'all'
                  ? 'bg-[#131F30] text-cyan-300 border border-cyan-500/30 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              All ({counts.all})
            </button>
            <button
              onClick={() => { sound.playTacticalClick(); setSoloFilter('ready'); }}
              className={`px-2.5 py-1 rounded-md transition-all font-display uppercase tracking-wider text-[11px] flex items-center gap-1 ${
                soloFilter === 'ready'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/40'
              }`}
              title="First win bonus ready (+1,000 AP)"
            >
              <Target className="w-3 h-3 text-amber-400" />
              <span>Ready ({counts.soloReady})</span>
            </button>
            <button
              onClick={() => { sound.playTacticalClick(); setSoloFilter('cooldown'); }}
              className={`px-2.5 py-1 rounded-md transition-all font-display uppercase tracking-wider text-[11px] flex items-center gap-1 ${
                soloFilter === 'cooldown'
                  ? 'bg-[#00F5D4]/15 text-[#00F5D4] border border-[#00F5D4]/40 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800/40'
              }`}
              title="First win bonus in cooldown"
            >
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>Cooldown ({counts.soloCooldown})</span>
            </button>
            <button
              onClick={() => { sound.playTacticalClick(); setSoloFilter('finished'); }}
              className={`px-2.5 py-1 rounded-md transition-all font-display uppercase tracking-wider text-[11px] flex items-center gap-1 ${
                soloFilter === 'finished'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/40'
              }`}
              title="Level 20+ accounts ready for competitive rank"
            >
              <Trophy className="w-3 h-3 text-emerald-400" />
              <span>Rank Ready ({counts.soloFinished})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Batch Action Bar (Triggers when 1+ rows selected) */}
      {selectedIds.size > 0 && (
        <div className="shrink-0 mb-3 px-4 py-2.5 rounded-xl bg-slate-900/95 border border-cyan-500/40 shadow-xl shadow-cyan-950/30 flex items-center justify-between gap-3 text-xs animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
              {selectedIds.size} Selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 hover:text-white text-[11px] underline transition-colors"
              title="Clear selection (Esc)"
            >
              Deselect (Esc)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportSelected}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
              title="Copy user:pass list to clipboard"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Export user:pass</span>
            </button>

            <div className="h-4 w-[1px] bg-slate-700/80 mx-0.5" />

            <button
              type="button"
              onClick={handleBatchDelete}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 border border-rose-500/30 font-semibold flex items-center gap-1.5 transition-colors text-xs active:scale-95 cursor-pointer shadow-sm"
              title={`Delete ${selectedIds.size} selected account${selectedIds.size > 1 ? 's' : ''}`}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Clear selection (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Action Notification Banner */}
      {actionSuccessMsg && (
        <div className="shrink-0 mb-3 px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Table with virtualized body */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-[#1E2C3D] bg-[#0A0E17]/95 shadow-2xl flex flex-col min-h-0 relative backdrop-blur-md">
        {/* Sticky Header */}
        <div className="shrink-0 border-b border-[#1E2C3D] bg-[#080B10]/95 backdrop-blur-md z-10 overflow-hidden">
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <thead>
              <tr className="border-b border-[#1E2C3D]/60">
                {/* Multi-Select Checkbox Column */}
                <th className="w-[36px] min-w-[36px] max-w-[36px] py-3 pl-3 pr-1 select-none group/th">
                  <input
                    type="checkbox"
                    checked={filteredAndSorted.length > 0 && filteredAndSorted.every((a) => selectedIds.has(a.id))}
                    onChange={() => toggleSelectAll(filteredAndSorted)}
                    className={`w-3.5 h-3.5 rounded border-slate-700 text-[#00F5D4] focus:ring-[#00F5D4] bg-slate-950 cursor-pointer transition-opacity duration-150 ${
                      selectedIds.size > 0 ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-60 hover:!opacity-100'
                    }`}
                  />
                </th>

                {/* Dynamically Reorderable Columns */}
                {activeColumns.map((colKey) => {
                  const isDragged = draggedCol === colKey;
                  const isDropTarget = dragOverCol === colKey && draggedCol !== colKey;
                  const indicatorLeft = isDropTarget && dropPosition === 'left';
                  const indicatorRight = isDropTarget && dropPosition === 'right';

                  switch (colKey) {
                    case 'account':
                      return (
                        <th
                          key="account"
                          style={{ width: colWidths['account'] }}
                          draggable
                          onDragStart={(e) => handleColDragStart('account', e)}
                          onDragOver={(e) => handleColDragOver('account', e)}
                          onDragLeave={() => handleColDragLeave('account')}
                          onDrop={(e) => handleColDrop('account', e)}
                          onDragEnd={handleColDragEnd}
                          className={`min-w-[180px] py-3 px-3 font-display uppercase tracking-wider text-[11px] font-bold cursor-grab active:cursor-grabbing hover:text-white select-none relative group/th transition-all duration-150 ${
                            sortField === 'username' ? 'text-[#00F5D4]' : 'text-val-dim'
                          } ${isDragged ? 'opacity-30 bg-cyan-500/10' : ''}`}
                          onClick={() => handleSort('username')}
                          title="Click to sort • Drag to rearrange column"
                        >
                          {indicatorLeft && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          {indicatorRight && <div className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          <div className="flex items-center gap-1.5">
                            <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover/th:opacity-80 transition-opacity shrink-0" />
                            <span>Account</span>
                            <ArrowUpDown className={`w-3 h-3 ${sortField === 'username' ? 'text-[#00F5D4]' : 'text-val-dim'}`} />
                          </div>
                        </th>
                      );

                    case 'password':
                      return (
                        <th
                          key="password"
                          style={{ width: colWidths['password'] }}
                          draggable
                          onDragStart={(e) => handleColDragStart('password', e)}
                          onDragOver={(e) => handleColDragOver('password', e)}
                          onDragLeave={() => handleColDragLeave('password')}
                          onDrop={(e) => handleColDrop('password', e)}
                          onDragEnd={handleColDragEnd}
                          className={`min-w-[95px] py-3 px-3 font-display uppercase tracking-wider text-[11px] font-bold text-val-dim select-none cursor-grab active:cursor-grabbing hover:text-slate-200 relative group/th transition-all duration-150 ${
                            isDragged ? 'opacity-30 bg-cyan-500/10' : ''
                          }`}
                          title="Drag to rearrange column"
                        >
                          {indicatorLeft && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          {indicatorRight && <div className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          <div className="flex items-center gap-1.5">
                            <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover/th:opacity-80 transition-opacity shrink-0" />
                            <span>Password</span>
                          </div>
                        </th>
                      );

                    case 'status':
                      return (
                        <th
                          key="status"
                          style={{ width: colWidths['status'] }}
                          draggable
                          onDragStart={(e) => handleColDragStart('status', e)}
                          onDragOver={(e) => handleColDragOver('status', e)}
                          onDragLeave={() => handleColDragLeave('status')}
                          onDrop={(e) => handleColDrop('status', e)}
                          onDragEnd={handleColDragEnd}
                          className={`min-w-[95px] py-3 px-3 font-display uppercase tracking-wider text-[11px] font-bold text-val-dim select-none cursor-grab active:cursor-grabbing hover:text-slate-200 relative group/th transition-all duration-150 ${
                            isDragged ? 'opacity-30 bg-cyan-500/10' : ''
                          }`}
                          title="Drag to rearrange column"
                        >
                          {indicatorLeft && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          {indicatorRight && <div className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          <div className="flex items-center gap-1.5">
                            <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover/th:opacity-80 transition-opacity shrink-0" />
                            <span>Status</span>
                          </div>
                        </th>
                      );

                    case 'level':
                      return (
                        <th
                          key="level"
                          style={{ width: colWidths['level'] }}
                          draggable
                          onDragStart={(e) => handleColDragStart('level', e)}
                          onDragOver={(e) => handleColDragOver('level', e)}
                          onDragLeave={() => handleColDragLeave('level')}
                          onDrop={(e) => handleColDrop('level', e)}
                          onDragEnd={handleColDragEnd}
                          className={`min-w-[140px] py-3 px-3 font-display uppercase tracking-wider text-[11px] font-bold cursor-grab active:cursor-grabbing hover:text-white select-none relative group/th transition-all duration-150 ${
                            sortField === 'level' ? 'text-[#00F5D4]' : 'text-val-dim'
                          } ${isDragged ? 'opacity-30 bg-cyan-500/10' : ''}`}
                          onClick={() => handleSort('level')}
                          title="Click to sort • Drag to rearrange column"
                        >
                          {indicatorLeft && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          {indicatorRight && <div className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          <div className="flex items-center gap-1.5">
                            <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover/th:opacity-80 transition-opacity shrink-0" />
                            <span>Level Progress</span>
                            <ArrowUpDown className={`w-3 h-3 ${sortField === 'level' ? 'text-[#00F5D4]' : 'text-val-dim'}`} />
                          </div>
                        </th>
                      );

                    case 'first_win':
                      return (
                        <th
                          key="first_win"
                          style={{ width: colWidths['first_win'] }}
                          draggable
                          onDragStart={(e) => handleColDragStart('first_win', e)}
                          onDragOver={(e) => handleColDragOver('first_win', e)}
                          onDragLeave={() => handleColDragLeave('first_win')}
                          onDrop={(e) => handleColDrop('first_win', e)}
                          onDragEnd={handleColDragEnd}
                          className={`min-w-[190px] py-3 px-3.5 font-display uppercase tracking-wider text-[11px] font-bold cursor-grab active:cursor-grabbing hover:text-white select-none relative group/th transition-all duration-150 ${
                            sortField === 'first_win' ? 'text-[#00F5D4]' : 'text-val-dim'
                          } ${isDragged ? 'opacity-30 bg-cyan-500/10' : ''}`}
                          onClick={() => handleSort('first_win')}
                          title="Click to sort • Drag to rearrange column"
                        >
                          {indicatorLeft && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          {indicatorRight && <div className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#00F5D4] pointer-events-none z-30 animate-pulse" />}
                          <div className="flex items-center gap-1.5">
                            <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover/th:opacity-80 transition-opacity shrink-0" />
                            <span>First Win Bonus</span>
                            <ArrowUpDown className={`w-3 h-3 ${sortField === 'first_win' ? 'text-[#00F5D4]' : 'text-val-dim'}`} />
                          </div>
                        </th>
                      );

                    default:
                      return null;
                  }
                })}

                <th className="w-[130px] min-w-[130px] max-w-[130px] py-3 px-3 font-display uppercase tracking-wider text-[11px] font-bold text-val-dim text-right select-none pr-4">Actions</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable Virtual Body */}
        <div
          ref={parentRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
          {filteredAndSorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center select-none">
              {accounts.length === 0 ? (
                /* Zero accounts in roster */
                <>
                  <div className="relative mb-5">
                    <div className="w-20 h-20 rounded-2xl bg-val-card border-2 border-dashed border-val-border/60 flex items-center justify-center">
                      <svg className="w-10 h-10 text-val-border" viewBox="0 0 48 48" fill="none">
                        <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="2.5" strokeDasharray="4 3"/>
                        <circle cx="24" cy="20" r="5" stroke="currentColor" strokeWidth="2.5"/>
                        <path d="M14 34c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        <circle cx="36" cy="12" r="5" fill="#FF4654" stroke="#0B1118" strokeWidth="2"/>
                        <path d="M36 9.5v2.5l1.5 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-val-red flex items-center justify-center text-white font-bold text-base shadow-lg shadow-val-red/30">
                      +
                    </div>
                  </div>
                  <h3 className="font-bold text-sm text-white mb-1.5">
                    Your Grinding Roster is Empty
                  </h3>
                  <p className="text-[11px] text-val-muted max-w-[320px] mb-5 leading-relaxed">
                    Add your first account or bulk import from Discord to start tracking Level 20 progression.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      className="flex items-center gap-1.5 px-4 py-2 bg-val-red hover:bg-val-redHover text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-md shadow-val-red/30 active:scale-95"
                      onClick={() => {
                        document.dispatchEvent(new CustomEvent('rfr:openAddAccount'));
                      }}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add Account
                    </button>
                    <span className="text-val-border text-xs">or</span>
                    <button
                      className="flex items-center gap-1.5 px-4 py-2 bg-val-card hover:bg-val-cardHover border border-val-border text-val-light text-xs font-medium rounded-lg transition-all active:scale-95"
                      onClick={() => {
                        document.dispatchEvent(new CustomEvent('rfr:openBulkImport'));
                      }}
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Import List
                    </button>
                  </div>
                  <p className="mt-4 text-[10px] text-val-muted/50">
                    Tip: Press <kbd className="px-1 py-0.5 rounded bg-val-border/60 text-val-muted font-mono">Ctrl+N</kbd> to add ·
                    <kbd className="px-1 py-0.5 rounded bg-val-border/60 text-val-muted font-mono ml-1">Ctrl+B</kbd> to import
                  </p>
                </>
              ) : (
                /* Accounts exist but filter returned zero */
                <>
                  <div className="w-16 h-16 rounded-2xl bg-val-card border border-val-border/60 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-val-muted" viewBox="0 0 48 48" fill="none">
                      <circle cx="22" cy="22" r="13" stroke="currentColor" strokeWidth="2.5"/>
                      <path d="M31.5 31.5L40 40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                      <path d="M17 22h10M22 17v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
                    </svg>
                  </div>
                  <h3 className="font-bold text-sm text-white mb-1.5">No Accounts Match</h3>
                  <p className="text-[11px] text-val-muted max-w-[260px] mb-4 leading-relaxed">
                    Try adjusting your search query or filter selection.
                  </p>
                  <button
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-val-card hover:bg-val-cardHover border border-val-border text-val-light text-xs font-medium rounded-lg transition-all active:scale-95 shadow-sm"
                    onClick={clearAllFilters}
                  >
                    <Filter className="w-3 h-3 text-cyan-400" />
                    Clear All Filters
                  </button>
                  <p className="mt-3 text-[10px] text-val-muted/50">
                    <kbd className="px-1 py-0.5 rounded bg-val-border/60 text-val-muted font-mono">Ctrl+F</kbd> to focus search
                  </p>
                </>
              )}
            </div>
          ) : (
            <div
              style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
            >
              <table
                className="w-full text-left text-xs border-collapse table-fixed"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%' }}
              >
                <tbody>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const account = filteredAndSorted[virtualRow.index];
                    const isLevel20 = account.level >= 20;
                    const progressPct = Math.min(100, Math.max(0, (account.level / 20) * 100));
                    const cd = cooldownMap.get(account.id);
                    const firstWinReady = cd?.ready ?? account.first_win_ready ?? true;
                    const countdown = cd?.countdown ?? (firstWinReady ? '🎯 READY (+1,000 AP)' : '⏳ In Cooldown');
                    const isSelected = selectedIds.has(account.id);

                    const isActive = Boolean(
                      (activeRosterAccount && activeRosterAccount.id === account.id) ||
                      (riotStatus?.is_connected && (
                        (riotStatus.login_username && account.username?.toLowerCase().trim() === riotStatus.login_username.toLowerCase().trim()) ||
                        (riotStatus.game_name && account.username?.toLowerCase().trim() === riotStatus.game_name.toLowerCase().trim())
                      ))
                    );

                    return (
                      <tr
                        key={account.id}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${ROW_HEIGHT}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          display: 'table',
                          tableLayout: 'fixed',
                        }}
                        className={`group transition-all border-b cursor-pointer ${
                          isActive
                            ? isSelected
                              ? 'bg-emerald-950/60 hover:bg-emerald-950/70 border-emerald-400/70 shadow-[inset_0_0_24px_rgba(16,185,129,0.22)] ring-1 ring-inset ring-emerald-400/50'
                              : 'bg-emerald-950/35 hover:bg-emerald-950/50 border-emerald-500/40 shadow-[inset_0_0_20px_rgba(16,185,129,0.12)] ring-1 ring-inset ring-emerald-500/30'
                            : isSelected
                            ? 'bg-[#00F5D4]/10 hover:bg-[#101724]/90 border-[#00F5D4]/30'
                            : 'hover:bg-[#101724]/90 border-[#1E2C3D]/50'
                        }`}
                        onClick={(e) => {
                          const tag = (e.target as HTMLElement).closest('button, input, a, label, [data-no-select]');
                          if (!tag) toggleSelect(account.id, e, virtualRow.index);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, account });
                        }}
                      >
                        {/* Checkbox */}
                        <td className="w-[36px] min-w-[36px] max-w-[36px] py-2.5 pl-3 pr-1 relative">
                          {isActive && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-emerald-400 via-teal-400 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                          )}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleSelect(account.id, e as any, virtualRow.index)}
                            className={`w-3.5 h-3.5 rounded border-slate-700 text-cyan-500 focus:ring-cyan-400 bg-slate-950 cursor-pointer transition-opacity duration-150 ${
                              isSelected
                                ? 'opacity-100'
                                : selectedIds.size > 0
                                ? 'opacity-30 hover:!opacity-100'
                                : 'opacity-0 hover:!opacity-60'
                            }`}
                          />
                        </td>

                        {/* Dynamically Reorderable Row Cells */}
                        {activeColumns.map((colKey) => {
                          switch (colKey) {
                            case 'account':
                              return (
                                <td key="account" style={{ width: colWidths['account'] }} className="min-w-[180px] py-2.5 px-3 overflow-hidden">
                                  <div className="flex items-center gap-1.5 flex-nowrap">
                                    {editingId === account.id ? (
                                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="text"
                                          autoFocus
                                          value={editingName}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => setEditingName(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') { e.preventDefault(); commitEdit(account); }
                                            else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                                          }}
                                          onBlur={() => commitEdit(account)}
                                          className="px-2 py-0.5 bg-val-bg border border-cyan-500 rounded text-xs font-bold text-white focus:outline-none ring-1 ring-cyan-500/50 w-[140px]"
                                          placeholder="Account name..."
                                        />
                                        {account.region ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-val-border text-val-muted uppercase ml-0.5 shrink-0">
                                            {account.region}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div 
                                        className="flex items-center gap-1.5 group/edit cursor-pointer py-0.5 px-1 -ml-1 rounded hover:bg-val-border/40 transition-colors min-w-0"
                                        onClick={(e) => startEditing(account, e)}
                                        title="Click to rename"
                                      >
                                        <span className="font-bold text-white tracking-wide group-hover/edit:text-cyan-400 transition-colors truncate shrink-0 max-w-[170px]" title={account.username}>
                                          {account.username}
                                        </span>
                                        {account.region ? (
                                          <span className="px-1 py-0.2 text-[9px] font-mono bg-val-border text-val-muted uppercase shrink-0">
                                            {account.region}
                                          </span>
                                        ) : null}

                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleCopy(account.id, account.username, 'username');
                                          }}
                                          className="opacity-0 group-hover/edit:opacity-100 p-0.5 rounded text-val-muted hover:text-white transition-opacity shrink-0"
                                          title="Copy username"
                                        >
                                          {copiedState?.id === account.id && copiedState.field === 'username' ? (
                                            <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">
                                              <Check className="w-2.5 h-2.5" /> Copied
                                            </span>
                                          ) : (
                                            <Copy className="w-3 h-3 text-slate-500" />
                                          )}
                                        </button>

                                        {account.stats?.estimated_mmr && account.stats.estimated_mmr !== 'Unranked' && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onOpenStats?.(account);
                                            }}
                                            className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:border-amber-400 flex items-center gap-0.5 shrink-0 transition-colors"
                                            title={`Estimated MMR: ${account.stats.estimated_mmr} (Click to view full dossier)`}
                                          >
                                            <Award className="w-2.5 h-2.5 text-amber-400" />
                                            <span>{account.stats.estimated_mmr}</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );

                            case 'password':
                              return (
                                <td key="password" style={{ width: colWidths['password'] }} className="min-w-[95px] py-2.5 px-3 whitespace-nowrap">
                                  {editingPasswordId === account.id ? (
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="text"
                                        autoFocus
                                        value={editingPasswordValue}
                                        onChange={(e) => setEditingPasswordValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') { e.preventDefault(); commitPasswordEdit(account); }
                                          else if (e.key === 'Escape') { e.preventDefault(); cancelPasswordEdit(); }
                                        }}
                                        onBlur={() => commitPasswordEdit(account)}
                                        className="w-[95px] px-1.5 py-0.5 bg-slate-950 border border-cyan-500 rounded text-[11px] font-mono text-white focus:outline-none ring-1 ring-cyan-500/50"
                                        placeholder="Password..."
                                      />
                                    </div>
                                  ) : account.password ? (
                                    <div className="flex items-center gap-1.5 group/pass">
                                      <button
                                        onClick={() => handleCopy(account.id, account.password!, 'password')}
                                        className="flex items-center gap-1 text-[11px] font-mono text-val-muted hover:text-white bg-val-bg px-2 py-0.5 rounded border border-val-border hover:border-val-borderHover transition-all"
                                        title="Click to copy password"
                                      >
                                        {copiedState?.id === account.id && copiedState.field === 'password' ? (
                                          <>
                                            <Check className="w-3 h-3 text-val-mint" />
                                            <span className="text-val-mint">Copied</span>
                                          </>
                                        ) : (
                                          <>
                                            <Key className="w-3 h-3 text-val-muted" />
                                            <span>{revealedPassIds.has(account.id) ? account.password : '••••••••'}</span>
                                          </>
                                        )}
                                      </button>
                                      <button
                                        onClick={(e) => toggleRevealPass(account.id, e)}
                                        className="opacity-0 group-hover/pass:opacity-100 p-0.5 rounded text-val-muted hover:text-slate-200 transition-all"
                                        title={revealedPassIds.has(account.id) ? 'Hide password' : 'Show password'}
                                      >
                                        {revealedPassIds.has(account.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                      </button>
                                      <button
                                        onClick={(e) => startEditingPassword(account, e)}
                                        className="opacity-0 group-hover/pass:opacity-100 p-0.5 rounded text-val-muted hover:text-cyan-400 hover:bg-val-border/40 transition-all"
                                        title="Edit password"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={(e) => startEditingPassword(account, e)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 transition-all active:scale-95"
                                      title="Add password for this account"
                                    >
                                      <Key className="w-3 h-3 text-cyan-400" />
                                      <span>+ Password</span>
                                    </button>
                                  )}
                                </td>
                              );

                            case 'status':
                              return (
                                <td key="status" style={{ width: colWidths['status'] }} className="min-w-[95px] py-2.5 px-3 whitespace-nowrap overflow-hidden">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => cycleHealth(account, e)}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-all ${
                                        (account.health_status || 'clean') === 'clean'
                                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                                          : account.health_status === 'flagged'
                                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                                          : 'bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
                                      }`}
                                      title="Click to cycle health (Clean / Flagged / Banned)"
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        (account.health_status || 'clean') === 'clean' ? 'bg-emerald-400' : account.health_status === 'flagged' ? 'bg-amber-400' : 'bg-rose-400'
                                      }`} />
                                      <span className="capitalize">{account.health_status || 'clean'}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => toggleEmailVerified(account, e)}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-0.5 transition-all ${
                                        !account.email_verified
                                          ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25'
                                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                      }`}
                                      title="Click to toggle email verification"
                                    >
                                      <span>{account.email_verified ? '🔒' : '🔓'}</span>
                                    </button>
                                  </div>
                                </td>
                              );

                            case 'level':
                              return (
                                <td key="level" style={{ width: colWidths['level'] }} className="min-w-[140px] py-2.5 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-white text-xs w-10">
                                      {account.decimal_level ? account.decimal_level.toFixed(2) : account.level}
                                    </span>
                                    <div className="w-24 sm:w-28 h-2 bg-[#080B10] rounded-full overflow-hidden border border-[#1E2C3D] shadow-inner">
                                      <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                          isLevel20
                                            ? 'bg-gradient-to-r from-emerald-400 to-[#00F5D4] shadow-[0_0_8px_rgba(0,245,212,0.4)]'
                                            : 'bg-gradient-to-r from-val-red via-rose-500 to-amber-500 shadow-[0_0_8px_rgba(255,70,85,0.3)]'
                                        }`}
                                        style={{ width: `${progressPct}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                              );

                            case 'first_win':
                              return (
                                <td key="first_win" style={{ width: colWidths['first_win'] }} className="min-w-[190px] py-2.5 px-3.5 whitespace-nowrap overflow-hidden">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold tabular-nums ${
                                      firstWinReady
                                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/35 shadow-[0_0_8px_rgba(245,158,11,0.15)] animate-pulse'
                                        : 'bg-[#0C121D] text-val-dim border border-[#1E2C3D]'
                                    }`}
                                  >
                                    <Clock className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{countdown}</span>
                                  </span>
                                </td>
                              );

                            default:
                              return null;
                          }
                        })}

                        {/* Actions */}
                        <td className="w-[130px] min-w-[130px] max-w-[130px] py-2.5 px-3 text-right whitespace-nowrap pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                sound.playLaunchSound();
                                onLaunch(account.id);
                              }}
                              className={`px-3 py-1 rounded text-xs font-display font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 ${
                                isActive
                                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                                  : 'bg-val-red hover:bg-val-redHover text-white shadow-val-red/30'
                              }`}
                              title={isActive ? 'Currently Active In-Game' : '1-Click Launch Riot Client'}
                            >
                              <div className="flex items-center gap-1">
                                <Play className="w-3 h-3 fill-current" />
                                <span>{isActive ? 'Active' : 'Play'}</span>
                              </div>
                            </button>

                            {onOpenStats && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sound.playTacticalClick();
                                  onOpenStats(account);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                title="View match telemetry and account stats"
                              >
                                <BarChart2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {onDelete && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sound.playTacticalClick();
                                  onDelete(account.id);
                                }}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Delete account"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 w-52 bg-[#0D1522] border border-[#1E2C3D] rounded-xl shadow-2xl p-1.5 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-slate-400 border-b border-[#1E2C3D]/80 flex items-center justify-between mb-1">
            <span className="truncate">{contextMenu.account.username}</span>
            {contextMenu.account.region && (
              <span className="font-mono text-cyan-400 uppercase text-[9px]">{contextMenu.account.region}</span>
            )}
          </div>

          <button
            onClick={() => {
              onLaunch(contextMenu.account.id);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-val-red hover:text-white text-left transition-colors font-medium text-xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Riot Client</span>
          </button>

          <button
            onClick={() => {
              handleCopy(contextMenu.account.id, contextMenu.account.username, 'username');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors text-xs"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Copy Username</span>
          </button>

          {contextMenu.account.password && (
            <button
              onClick={() => {
                handleCopy(contextMenu.account.id, contextMenu.account.password!, 'password');
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors text-xs"
            >
              <Key className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy Password</span>
            </button>
          )}

          {onOpenStats && (
            <button
              onClick={() => {
                onOpenStats(contextMenu.account);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors text-xs"
            >
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Telemetry Dossier</span>
            </button>
          )}

          <div className="h-px bg-[#1E2C3D] my-1" />

          {onDelete && (
            <button
              onClick={() => {
                onDelete(contextMenu.account.id);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 text-left transition-colors text-xs"
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
