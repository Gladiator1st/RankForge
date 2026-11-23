import React from 'react';
import { 
  Minus, 
  Square, 
  X, 
  Settings, 
  UserPlus, 
  ClipboardList, 
  Zap,
  LayoutGrid,
  Table as TableIcon,
  ShieldCheck,
  Archive
} from 'lucide-react';
import { RiotStatus, ViewMode } from '../../types';
import { sound } from '../../services/soundEffects';
import appIcon from '../../assets/app_icon.png';

interface TitleBarProps {
  riotStatus: RiotStatus;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenAddAccount: () => void;
  onOpenBulkImport: () => void;
  onOpenSettings: () => void;
  onCloseApp?: () => void;
  sessionElapsed?: string;
  showArchive?: boolean;
  onToggleShowArchive?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = React.memo(({
  riotStatus,
  viewMode,
  onViewModeChange,
  onOpenAddAccount,
  onOpenBulkImport,
  onOpenSettings,
  onCloseApp,
  sessionElapsed,
  showArchive = false,
  onToggleShowArchive,
}) => {
  const handleMinimize = () => {
    sound.playTacticalClick();
    window.rfrApi?.minimize();
  };

  const handleMaximize = () => {
    sound.playTacticalClick();
    window.rfrApi?.maximize();
  };

  const handleClose = () => {
    sound.playTacticalClick();
    if (onCloseApp) {
      onCloseApp();
    } else {
      window.rfrApi?.close();
    }
  };

  return (
    <header className="relative h-12 min-h-[48px] max-h-[48px] bg-val-bg/95 border-b border-val-border flex items-center justify-between px-3 select-none app-drag-region shrink-0 z-50 whitespace-nowrap overflow-hidden">
      {/* Left: Branding & Connection Status */}
      <div className="flex items-center gap-2.5 shrink-0 whitespace-nowrap z-20">
        <div className="flex items-center gap-2 shrink-0">
          <img 
            src={appIcon} 
            alt="RankForge" 
            className="w-6 h-6 rounded object-contain drop-shadow-[0_0_8px_rgba(255,70,85,0.4)] shrink-0 select-none pointer-events-none" 
          />
          <span className="font-display font-black text-sm tracking-wider uppercase bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent whitespace-nowrap shrink-0">
            RankForge
          </span>
        </div>

        {/* Live Riot Radar Status */}
        <div 
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono border bg-val-surface/90 app-no-drag shrink-0 whitespace-nowrap max-w-[170px] xl:max-w-[240px] truncate shadow-inner"
          style={{
            borderColor: riotStatus.is_connected ? 'rgba(0, 245, 212, 0.45)' : 'rgba(255, 255, 255, 0.08)',
          }}
          title={riotStatus.status_message}
        >
          <span 
            className={`w-2 h-2 rounded-full shrink-0 ${riotStatus.is_connected ? 'bg-val-mint animate-pulse shadow-[0_0_8px_#00f5d4]' : 'bg-val-muted'}`}
          />
          <span className={`truncate text-xs font-medium ${riotStatus.is_connected ? 'text-val-mint' : 'text-val-muted'}`}>
            {riotStatus.is_connected 
              ? `${riotStatus.login_username || riotStatus.game_name || 'Riot Hook'} • Lvl ${riotStatus.decimal_level ? riotStatus.decimal_level.toFixed(2) : riotStatus.current_level || 0}`
              : 'Riot Idle'}
          </span>
        </div>

        {/* Session Timer (VALORANT running) */}
        {riotStatus.is_connected && riotStatus.is_game_running && sessionElapsed && (
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 app-no-drag shrink-0 whitespace-nowrap shadow-sm shadow-emerald-950/20"
            title="Active in-game session timer (VALORANT running)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="tabular-nums font-semibold">{sessionElapsed}</span>
          </div>
        )}
      </div>

      {/* Center: Action Buttons & View Toggles */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 z-10 pointer-events-auto">
        {/* View Mode Toggle: Cards vs Pro Table */}
        <div className="flex items-center p-0.5 bg-val-card rounded-md border border-val-border shrink-0 app-no-drag">
          <button
            onClick={() => { sound.playTacticalClick(); onViewModeChange('table'); }}
            className={`h-7 flex items-center gap-1 px-2 rounded text-xs font-bold transition-all shrink-0 ${
              viewMode === 'table' ? 'bg-val-red text-white shadow-sm shadow-val-red/30' : 'text-val-muted hover:text-white'
            }`}
            title="Switch to Pro Table View"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Table</span>
          </button>
          <button
            onClick={() => { sound.playTacticalClick(); onViewModeChange('cards'); }}
            className={`h-7 flex items-center gap-1 px-2 rounded text-xs font-bold transition-all shrink-0 ${
              viewMode === 'cards' ? 'bg-val-red text-white shadow-sm shadow-val-red/30' : 'text-val-muted hover:text-white'
            }`}
            title="Switch to Cards Grid View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>

        {/* Mini HUD Overlay Launcher */}
        <button
          onClick={() => { sound.playTacticalClick(); onViewModeChange('hud'); }}
          className="h-7 flex items-center gap-1.5 px-2.5 rounded bg-val-card hover:bg-val-cardHover border border-val-border text-xs font-semibold text-amber-300 hover:text-amber-200 transition-all shrink-0 whitespace-nowrap app-no-drag shadow-sm"
          title="Launch Ultra-Compact Always-On-Top Mini HUD Overlay"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Mini HUD</span>
        </button>

        <div className="h-4 w-px bg-val-border mx-0.5 shrink-0" />

        {/* Add Account */}
        <button
          onClick={() => { sound.playTacticalClick(); onOpenAddAccount(); }}
          className="h-7 flex items-center gap-1.5 px-2.5 bg-val-red/90 hover:bg-val-red text-white text-xs font-medium rounded transition-all shadow-sm shadow-val-red/30 active:scale-95 shrink-0 whitespace-nowrap app-no-drag"
          title="Add single account"
        >
          <UserPlus className="w-3.5 h-3.5 shrink-0" />
          <span>Add Account</span>
        </button>

        {/* Import List */}
        <button
          onClick={() => { sound.playTacticalClick(); onOpenBulkImport(); }}
          className="h-7 flex items-center gap-1.5 px-2.5 bg-val-card hover:bg-val-cardHover border border-val-border text-val-light text-xs font-medium rounded transition-all active:scale-95 shrink-0 whitespace-nowrap app-no-drag"
          title="Bulk import from Discord / clipboard list"
        >
          <ClipboardList className="w-3.5 h-3.5 shrink-0" />
          <span>Import List</span>
        </button>

        {/* Archive Toggle */}
        <button
          onClick={() => { sound.playTacticalClick(); onToggleShowArchive?.(); }}
          className={`h-7 flex items-center gap-1.5 px-2.5 rounded text-xs font-semibold transition-all shrink-0 whitespace-nowrap app-no-drag shadow-sm ${
            showArchive
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-val-card hover:bg-val-cardHover border border-val-border text-val-muted hover:text-val-light'
          }`}
          title="Toggle Archive / Completed Accounts Vault"
        >
          <Archive className="w-3.5 h-3.5" />
          <span>{showArchive ? 'Viewing Vault' : 'Archive'}</span>
        </button>
      </div>

      {/* Right: Badge, Settings & Window Controls */}
      <div className="flex items-center gap-1.5 app-no-drag shrink-0 ml-auto z-20 pl-3 border-l border-val-border/50 whitespace-nowrap bg-val-bg/95">
        {/* Solo FOSS Badge */}
        <div 
          className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold select-none shrink-0 shadow-sm"
          title="RankForge is 100% Free & Open Source under MIT License"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Solo Grinder • FOSS</span>
        </div>

        {/* Settings Button */}
        <button
          onClick={() => { sound.playTacticalClick(); onOpenSettings(); }}
          className="w-8 h-8 rounded flex items-center justify-center text-val-muted hover:text-white hover:bg-val-card transition-colors shrink-0"
          title="Settings (Discord, Sound, Riot Path, Auto-Updates)"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-val-border mx-0.5 shrink-0" />

        {/* Window Controls */}
        <button
          onClick={handleMinimize}
          className="w-8 h-8 rounded flex items-center justify-center text-val-muted hover:text-white hover:bg-val-card transition-colors shrink-0"
          title="Minimize to taskbar / tray"
        >
          <Minus className="w-4 h-4" />
        </button>

        <button
          onClick={handleMaximize}
          className="w-8 h-8 rounded flex items-center justify-center text-val-muted hover:text-white hover:bg-val-card transition-colors shrink-0"
          title="Maximize window"
        >
          <Square className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleClose}
          className="w-8 h-8 rounded flex items-center justify-center text-val-muted hover:text-val-red hover:bg-val-red/10 transition-colors shrink-0"
          title="Close / Minimize to tray"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
});
