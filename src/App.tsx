import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';
import { TitleBar } from './components/layout/TitleBar';
import { SoloView } from './roles/solo/SoloView';
import { AddAccountModal } from './components/modals/AddAccountModal';
import { BulkImportModal } from './components/modals/BulkImportModal';
import { HandoverModal } from './components/modals/HandoverModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { ConfirmDeleteModal } from './components/modals/ConfirmDeleteModal';
import { ConfirmExitModal } from './components/modals/ConfirmExitModal';
import { DetectedAccountModal } from './components/modals/DetectedAccountModal';
import { AccountStatsModal } from './components/modals/AccountStatsModal';
import { AccountPasswordLaunchModal } from './components/modals/AccountPasswordLaunchModal';
import { MiniHudOverlay } from './components/overlay/MiniHudOverlay';
import { InAppUpdaterBanner } from './components/common/InAppUpdaterBanner';
import { Account, AppSettings, KpiStats, RiotStatus, ViewMode, ModalType, AutoLoginStatusEvent } from './types';
import { sound } from './services/soundEffects';

type CooldownMap = Map<string, { ready: boolean; seconds: number; countdown: string }>;

function buildCooldownMap(accounts: Account[]): CooldownMap {
  const nowMs = Date.now();
  const map: CooldownMap = new Map();
  for (const acc of accounts) {
    if (!acc.first_win_available_time) {
      map.set(acc.id, { ready: true, seconds: 0, countdown: '🎯 READY (+1,000 AP)' });
      continue;
    }
    const resetMs = new Date(acc.first_win_available_time).getTime();
    if (isNaN(resetMs)) {
      map.set(acc.id, { ready: true, seconds: 0, countdown: '🎯 READY (+1,000 AP)' });
      continue;
    }
    const diffSec = Math.floor((resetMs - nowMs) / 1000);
    if (diffSec <= 0) {
      map.set(acc.id, { ready: true, seconds: 0, countdown: '🎯 READY (+1,000 AP)' });
    } else {
      const h = Math.floor(diffSec / 3600);
      const m = Math.floor((diffSec % 3600) / 60);
      const s = diffSec % 60;
      map.set(acc.id, {
        ready: false,
        seconds: diffSec,
        countdown: `⏳ Resets in ${h}h ${m}m ${s}s`,
      });
    }
  }
  return map;
}

export const App: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cooldownMap, setCooldownMap] = useState<CooldownMap>(new Map());
  const accountsRef = useRef<Account[]>([]);
  const cooldownMapRef = useRef<CooldownMap>(cooldownMap);
  cooldownMapRef.current = cooldownMap;

  const [settings, setSettings] = useState<AppSettings>({
    volume: 0.5,
    sfx_enabled: true,
    auto_copy_password: true,
    close_to_tray: true,
    window_preset: 'medium',
    confirm_delete_account: true,
    confirm_exit: true,
    prompt_on_new_account: true,
    ignored_accounts: [],
    discord_enabled: false,
    discord_webhook_url: '',
    discord_notify_level_20: true,
    discord_notify_match_finish: true,
    discord_live_dashboard_enabled: false,
    user_role: 'solo',
    license_tier: 'solo_pro',
  });
  const settingsRef = useRef<AppSettings>(settings);
  settingsRef.current = settings;

  const [riotStatus, setRiotStatus] = useState<RiotStatus>({
    is_connected: false,
    status_message: 'Hooking into Riot Client...',
  });

  const prevGameRunningRef = useRef(false);
  const sessionStartTimeRef = useRef<number | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState<string>('');
  const [autoLoginStatus, setAutoLoginStatus] = useState<AutoLoginStatusEvent | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('rankforge_view_mode');
      return (saved === 'table' || saved === 'cards' || saved === 'hud') ? saved : 'table';
    } catch {
      return 'table';
    }
  });

  const handleViewModeChange = async (mode: ViewMode) => {
    if (mode === 'hud') {
      await window.rfrApi?.enterHudMode?.();
    } else if (viewMode === 'hud') {
      await window.rfrApi?.exitHudMode?.();
    }
    setViewMode(mode);
    try {
      localStorage.setItem('rankforge_view_mode', mode);
    } catch {}
  };

  useEffect(() => {
    if (viewMode === 'hud') {
      window.rfrApi?.enterHudMode?.();
    }
  }, []);

  const [showArchive, setShowArchive] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [statsAccount, setStatsAccount] = useState<Account | null>(null);
  const [launchPasswordAccount, setLaunchPasswordAccount] = useState<Account | null>(null);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [detectedAccountData, setDetectedAccountData] = useState<{
    username: string;
    riotId?: string;
    level?: number;
    decimalLevel?: number;
    isArchived?: boolean;
  } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null);

  const handleOpenStats = useCallback((account: Account) => {
    setStatsAccount(account);
    setActiveModal('account_stats' as any);
  }, []);

  useEffect(() => {
    if (statsAccount) {
      const fresh = accounts.find((a) => a.id === statsAccount.id);
      if (fresh && fresh !== statsAccount) {
        setStatsAccount(fresh);
      }
    }
  }, [accounts, statsAccount]);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  const setAccountsWithCooldown = useCallback((newAccounts: Account[], prevForChimes?: Account[]) => {
    if (prevForChimes) {
      const nowMs = Date.now();
      for (const acc of newAccounts) {
        if (!acc.first_win_available_time) continue;
        const resetMs = new Date(acc.first_win_available_time).getTime();
        if (resetMs - nowMs <= 0) {
          const prev = prevForChimes.find((p) => p.id === acc.id);
          if (prev?.first_win_available_time) {
            const prevMs = new Date(prev.first_win_available_time).getTime();
            if (prevMs - Date.now() > 0) {
              sound.playFirstWinChime();
            }
          }
        }
      }
    }
    setAccounts(newAccounts);
    setCooldownMap(buildCooldownMap(newAccounts));
  }, []);

  // Load initial data
  useEffect(() => {
    const initApp = async () => {
      if (typeof window !== 'undefined' && window.rfrApi) {
        try {
          const [loadedAccounts, loadedSettings, status] = await Promise.all([
            window.rfrApi.getAccounts(),
            window.rfrApi.getSettings(),
            window.rfrApi.getRiotStatus(),
          ]);

          setAccountsWithCooldown(loadedAccounts || []);
          if (loadedSettings) {
            setSettings({
              ...loadedSettings,
              user_role: 'solo',
              license_tier: 'solo_pro',
            });
            sound.setConfig(
              loadedSettings.volume,
              loadedSettings.sfx_enabled,
              loadedSettings.match_sound_enabled !== false,
              loadedSettings.victory_sound_path || '',
              loadedSettings.defeat_sound_path || ''
            );
          }
          if (status) setRiotStatus(status);
        } catch (err) {
          console.error('[RankForge] Error initializing app data:', err);
        }
      }
    };

    initApp();

    const unsubStatus = window.rfrApi?.onRiotStatusUpdate((status: RiotStatus) => {
      setRiotStatus(status);
    });

    const unsubAccounts = window.rfrApi?.onAccountsUpdated((accs: Account[]) => {
      setAccountsWithCooldown(accs || [], accountsRef.current);
    });

    const unsubMatch = window.rfrApi?.onMatchFinished((match: any) => {
      if (match?.currentLevel >= 20 && match?.prevLevel !== undefined && match.prevLevel < 20) {
        sound.playLevelUpFanfare();
      } else if (match?.won === true || match?.isWin === true) {
        sound.playMatchVictorySound();
      } else if (match?.won === false || match?.isWin === false) {
        sound.playMatchDefeatSound();
      }

      window.rfrApi?.getAccounts().then((accs: Account[]) => {
        setAccountsWithCooldown(accs || [], accountsRef.current);
      });
    });

    const unsubDetected = window.rfrApi?.onNewAccountDetected?.((data) => {
      setDetectedAccountData(data);
      setActiveModal('detected_account' as any);
    });

    const unsubUpdate = window.rfrApi?.onUpdateDownloaded?.((info) => {
      setUpdateInfo(info);
    });

    const unsubAutoLogin = window.rfrApi?.onAutoLoginStatus?.((event) => {
      setAutoLoginStatus(event);

      if (event.status === 'success') {
        sound.playSuccessDing();
        setTimeout(() => {
          setAutoLoginStatus((current) => (current?.status === 'success' ? null : current));
        }, 2600);
      } else if (event.status === 'aborted') {
        sound.playTacticalClick();
        setTimeout(() => {
          setAutoLoginStatus((current) => (current?.status === 'aborted' ? null : current));
        }, 2600);
      } else if (event.status === 'failed') {
        sound.playErrorBuzz();
        setTimeout(() => {
          setAutoLoginStatus((current) => (current?.status === 'failed' ? null : current));
        }, 4500);
      }
    });

    window.rfrApi?.checkDetection?.();

    return () => {
      unsubStatus?.();
      unsubAccounts?.();
      unsubMatch?.();
      unsubDetected?.();
      unsubUpdate?.();
      unsubAutoLogin?.();
    };
  }, [setAccountsWithCooldown]);

  // Physical Escape key listener to abort autologin
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (autoLoginStatus && ['starting', 'focusing', 'typing', 'waiting-login', 'retrying'].includes(autoLoginStatus.status)) {
          e.preventDefault();
          e.stopPropagation();
          window.rfrApi?.abortAutoLogin?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [autoLoginStatus]);

  // 1-second countdown interval
  useEffect(() => {
    const interval = setInterval(() => {
      const currentAccs = accountsRef.current;
      if (currentAccs.length === 0) return;

      const now = Date.now();
      const nextMap: CooldownMap = new Map();
      let hasChanges = false;
      const prevMap = cooldownMapRef.current;

      for (const acc of currentAccs) {
        if (!acc.first_win_available_time) {
          nextMap.set(acc.id, { ready: true, seconds: 0, countdown: '🎯 READY (+1,000 AP)' });
          continue;
        }
        const resetMs = new Date(acc.first_win_available_time).getTime();
        if (isNaN(resetMs)) {
          nextMap.set(acc.id, { ready: true, seconds: 0, countdown: '🎯 READY (+1,000 AP)' });
          continue;
        }
        const diffSec = Math.floor((resetMs - now) / 1000);
        if (diffSec <= 0) {
          nextMap.set(acc.id, { ready: true, seconds: 0, countdown: '🎯 READY (+1,000 AP)' });
          const prevEntry = prevMap.get(acc.id);
          if (prevEntry && !prevEntry.ready) {
            hasChanges = true;
            sound.playFirstWinChime();
          }
        } else {
          const h = Math.floor(diffSec / 3600);
          const m = Math.floor((diffSec % 3600) / 60);
          const s = diffSec % 60;
          const str = `⏳ Resets in ${h}h ${m}m ${s}s`;
          const prevEntry = prevMap.get(acc.id);
          if (!prevEntry || prevEntry.countdown !== str) {
            hasChanges = true;
          }
          nextMap.set(acc.id, { ready: false, seconds: diffSec, countdown: str });
        }
      }

      if (hasChanges || nextMap.size !== prevMap.size) {
        setCooldownMap(nextMap);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // In-Game Session Timer
  useEffect(() => {
    const isGameRunning = !!(riotStatus.is_connected && riotStatus.is_game_running);
    if (isGameRunning && !prevGameRunningRef.current) {
      sessionStartTimeRef.current = Date.now();
      setSessionElapsed('00:00');
    } else if (!isGameRunning && prevGameRunningRef.current) {
      sessionStartTimeRef.current = null;
      setSessionElapsed('');
    }
    prevGameRunningRef.current = isGameRunning;

    if (!isGameRunning) return;

    const timer = setInterval(() => {
      if (!sessionStartTimeRef.current) return;
      const totalSec = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setSessionElapsed(h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [riotStatus.is_connected, riotStatus.is_game_running]);

  // Active roster account matching Riot Client
  const activeRosterAccount = useMemo(() => {
    if (!riotStatus.is_connected) return null;
    return (
      accounts.find(
        (a) =>
          !a.is_deleted &&
          !a.archived &&
          ((riotStatus.puuid && a.puuid === riotStatus.puuid) ||
            (riotStatus.login_username && a.username.toLowerCase().trim() === riotStatus.login_username.toLowerCase().trim()) ||
            (riotStatus.game_name && a.username.toLowerCase().trim() === riotStatus.game_name.toLowerCase().trim()))
      ) || null
    );
  }, [accounts, riotStatus]);

  // KPI Calculations
  const kpiStats = useMemo<KpiStats>(() => {
    const active = accounts.filter((a) => !a.archived && !a.is_deleted);
    const total = active.length;
    if (total === 0) {
      return {
        total_accounts: 0,
        first_win_ready_count: 0,
        ready_for_rank_count: 0,
        average_level: 0,
        total_xp_remaining: 0,
        total_last_session_seconds: 0,
        total_grind_seconds: 0,
      };
    }

    const firstWinReady = active.filter((a) => {
      const cd = cooldownMap.get(a.id);
      return (cd?.ready ?? a.first_win_ready) && a.level < 20;
    }).length;

    const readyForRank = active.filter((a) => a.level >= 20).length;
    const avgLevel = Number((active.reduce((sum, a) => sum + (a.decimal_level || a.level), 0) / total).toFixed(1));
    const totalXpRemaining = active.reduce((sum, a) => sum + (a.remaining_xp || Math.max(0, 100000 - ((a.decimal_level || a.level) * 5000))), 0);
    const totalLastSession = active.reduce((sum, a) => sum + (a.last_session_seconds || 0), 0);
    const totalGrindSeconds = active.reduce((sum, a) => sum + (a.total_playtime_seconds || 0), 0);

    return {
      total_accounts: total,
      first_win_ready_count: firstWinReady,
      ready_for_rank_count: readyForRank,
      average_level: avgLevel,
      total_xp_remaining: totalXpRemaining,
      total_last_session_seconds: totalLastSession,
      total_grind_seconds: totalGrindSeconds,
    };
  }, [accounts, cooldownMap]);

  // Displayed Accounts
  const displayedAccounts = useMemo(() => {
    return accounts.filter((a) => (showArchive ? !!a.archived : !a.archived) && !a.is_deleted);
  }, [accounts, showArchive]);

  // ── Action Handlers ──

  const handleSaveAccount = useCallback(async (accountData: Partial<Account>): Promise<boolean> => {
    sound.playTacticalClick();
    const saved = await window.rfrApi?.saveAccount(accountData);
    if (saved) {
      setAccounts((prev) => {
        const idx = prev.findIndex((a) => a.id === saved.id);
        const next = idx >= 0 ? prev.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...prev];
        setCooldownMap(buildCooldownMap(next));
        return next;
      });
      return true;
    }
    return false;
  }, []);

  const handleDeleteAccount = useCallback(async (id: string) => {
    sound.playTacticalClick();
    const ok = await window.rfrApi?.deleteAccount(id);
    if (ok) {
      setAccounts((prev) => {
        const next = prev.filter((a) => a.id !== id);
        setCooldownMap(buildCooldownMap(next));
        return next;
      });
      setActiveModal(null);
      setDeleteTargetIds(null);
    }
  }, []);

  const handleBatchDelete = useCallback(async (ids: string[]) => {
    sound.playTacticalClick();
    const ok = await window.rfrApi?.deleteBatchAccounts?.(ids);
    if (ok) {
      const idSet = new Set(ids);
      setAccounts((prev) => {
        const next = prev.filter((a) => !idSet.has(a.id));
        setCooldownMap(buildCooldownMap(next));
        return next;
      });
      setActiveModal(null);
      setDeleteTargetIds(null);
    }
  }, []);

  const handleLaunchAccount = useCallback(async (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    if (acc && (!acc.password || !acc.password.trim())) {
      sound.playTacticalClick();
      setLaunchPasswordAccount(acc);
      return { success: false, message: 'Password not set' };
    }
    sound.playLaunchSound();
    return window.rfrApi?.launchAccount(id);
  }, [accounts]);

  const handleSavePasswordAndLaunch = useCallback(async (accountId: string, newPassword: string) => {
    const trimmed = newPassword.trim();
    if (!trimmed) return;
    const existing = accounts.find((a) => a.id === accountId);
    if (!existing) return;

    const updated = { ...existing, password: trimmed };
    await handleSaveAccount(updated);

    setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, password: trimmed } : a)));
    setLaunchPasswordAccount(null);

    sound.playLaunchSound();
    await window.rfrApi?.launchAccount(accountId);
  }, [accounts, handleSaveAccount]);

  const handleBulkImport = useCallback(async (text: string, defaultRegion = 'na') => {
    sound.playSuccessDing();
    try {
      const imported = await window.rfrApi?.bulkImportAccounts(text, defaultRegion);
      if (imported && imported.length > 0) {
        const freshAccounts = await window.rfrApi?.getAccounts();
        if (freshAccounts) {
          setAccountsWithCooldown(freshAccounts);
        }
      }
    } catch (err) {
      console.error('[RankForge] Error during bulk import:', err);
    }
  }, [setAccountsWithCooldown]);

  const handleSaveSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    sound.playTacticalClick();
    const updated = await window.rfrApi?.saveSettings(newSettings);
    if (updated) {
      setSettings(updated);
      sound.setConfig(
        updated.volume,
        updated.sfx_enabled,
        updated.match_sound_enabled !== false,
        updated.victory_sound_path || '',
        updated.defeat_sound_path || ''
      );
    }
  }, []);

  const handleRenameAccount = useCallback(async (id: string, newUsername: string) => {
    sound.playTacticalClick();
    await handleSaveAccount({ id, username: newUsername });
  }, [handleSaveAccount]);

  const handleUpdateAccount = useCallback(async (id: string, updates: Partial<Account>) => {
    await handleSaveAccount({ id, ...updates });
  }, [handleSaveAccount]);

  const handleRestoreAccount = useCallback(async (id: string) => {
    sound.playSuccessDing();
    const ok = await window.rfrApi?.restoreAccount(id);
    if (ok) {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, archived: false } : a)));
    }
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-val-bg text-val-light select-none overflow-hidden font-sans">
      <InAppUpdaterBanner />

      <TitleBar
        riotStatus={riotStatus}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onOpenAddAccount={() => { sound.playTacticalClick(); setActiveModal('add_account'); }}
        onOpenBulkImport={() => { sound.playTacticalClick(); setActiveModal('bulk_import'); }}
        onOpenSettings={() => { sound.playTacticalClick(); setActiveModal('settings'); }}
        onCloseApp={() => {
          if (settings.confirm_exit) {
            setIsExitModalOpen(true);
          } else {
            window.rfrApi?.close();
          }
        }}
        sessionElapsed={sessionElapsed}
        showArchive={showArchive}
        onToggleShowArchive={() => setShowArchive((prev) => !prev)}
      />

      {viewMode === 'hud' ? (
        <MiniHudOverlay
          accounts={accounts}
          activeAccount={activeRosterAccount}
          riotStatus={riotStatus}
          cooldownMap={cooldownMap}
          sessionElapsed={sessionElapsed}
          settings={settings}
          onLaunchAccount={handleLaunchAccount}
          onExitHud={() => handleViewModeChange('table')}
        />
      ) : (
        <SoloView
          accounts={accounts}
          displayedAccounts={displayedAccounts}
          cooldownMap={cooldownMap}
          settings={settings}
          kpiStats={kpiStats}
          viewMode={viewMode}
          showArchive={showArchive}
          activeRosterAccount={activeRosterAccount}
          riotStatus={riotStatus}
          grindEtaAccount={activeRosterAccount}
          onLaunchAccount={handleLaunchAccount}
          onDeleteRequest={(id) => {
            setDeleteTargetIds([id]);
            if (settings.confirm_delete_account) {
              setActiveModal('confirm_delete');
            } else {
              handleDeleteAccount(id);
            }
          }}
          onBatchDeleteRequest={(ids) => {
            setDeleteTargetIds(ids);
            if (settings.confirm_delete_account) {
              setActiveModal('confirm_delete');
            } else {
              handleBatchDelete(ids);
            }
          }}
          onOpenHandover={(account) => {
            setSelectedAccount(account);
            setActiveModal('handover');
          }}
          onOpenStats={handleOpenStats}
          onRenameAccount={handleRenameAccount}
          onUpdateAccount={handleUpdateAccount}
          onRestoreAccount={handleRestoreAccount}
          onSaveSettings={handleSaveSettings}
          onOpenAddAccount={() => { sound.playTacticalClick(); setActiveModal('add_account'); }}
        />
      )}

      {/* ── Modals ── */}
      <AddAccountModal
        isOpen={activeModal === 'add_account'}
        onClose={() => setActiveModal(null)}
        onSaveAccount={handleSaveAccount}
        accounts={accounts}
      />

      <BulkImportModal
        isOpen={activeModal === 'bulk_import'}
        onClose={() => setActiveModal(null)}
        onImport={handleBulkImport}
      />

      <HandoverModal
        isOpen={activeModal === 'handover' && !!selectedAccount}
        account={selectedAccount}
        accounts={accounts}
        onClose={() => {
          setActiveModal(null);
          setSelectedAccount(null);
        }}
        onArchive={(id) => {
          setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, archived: true } : a)));
          window.rfrApi?.archiveAccount?.(id);
          setActiveModal(null);
          setSelectedAccount(null);
        }}
      />

      <SettingsModal
        isOpen={activeModal === 'settings'}
        onClose={() => setActiveModal(null)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        accounts={accounts}
      />

      <ConfirmDeleteModal
        isOpen={activeModal === 'confirm_delete' && !!deleteTargetIds}
        accountCount={deleteTargetIds?.length || 1}
        accountName={
          deleteTargetIds && deleteTargetIds.length === 1
            ? accounts.find((a) => a.id === deleteTargetIds[0])?.username || 'this account'
            : undefined
        }
        onConfirm={() => {
          if (deleteTargetIds) {
            if (deleteTargetIds.length === 1) {
              handleDeleteAccount(deleteTargetIds[0]);
            } else {
              handleBatchDelete(deleteTargetIds);
            }
          }
        }}
        onCancel={() => {
          setActiveModal(null);
          setDeleteTargetIds(null);
        }}
      />

      <ConfirmExitModal
        isOpen={isExitModalOpen}
        onConfirm={() => {
          setIsExitModalOpen(false);
          window.rfrApi?.close();
        }}
        onClose={() => setIsExitModalOpen(false)}
      />

      <DetectedAccountModal
        isOpen={activeModal === 'detected_account' && !!detectedAccountData}
        data={detectedAccountData}
        onClose={() => {
          setActiveModal(null);
          setDetectedAccountData(null);
        }}
        onAddToRoster={async () => {
          if (!detectedAccountData) return;
          sound.playSuccessDing();
          await handleSaveAccount({
            username: detectedAccountData.username,
            password: '',
            region: 'na',
            level: detectedAccountData.level || 1,
            decimal_level: detectedAccountData.decimalLevel || detectedAccountData.level || 1,
            archived: false,
          });
          setActiveModal(null);
          setDetectedAccountData(null);
        }}
        onIgnore={async (remember) => {
          if (!detectedAccountData) return;
          sound.playTacticalClick();
          if (remember) {
            const current = settings.ignored_accounts || [];
            if (!current.some((n) => n.toLowerCase() === detectedAccountData.username.toLowerCase())) {
              await handleSaveSettings({ ignored_accounts: [...current, detectedAccountData.username] });
            }
          }
          setActiveModal(null);
          setDetectedAccountData(null);
        }}
      />

      <AccountStatsModal
        isOpen={activeModal === 'account_stats' && !!statsAccount}
        account={statsAccount}
        onClose={() => {
          setActiveModal(null);
          setStatsAccount(null);
        }}
        onSaveAccount={(updates) => {
          if (updates.id) {
            handleUpdateAccount(updates.id, updates);
            setStatsAccount((prev) => (prev && prev.id === updates.id ? { ...prev, ...updates } : prev));
          }
        }}
      />

      <AccountPasswordLaunchModal
        isOpen={launchPasswordAccount !== null}
        account={launchPasswordAccount}
        onClose={() => setLaunchPasswordAccount(null)}
        onSavePasswordAndLaunch={handleSavePasswordAndLaunch}
      />

      {/* Floating Auto-Login HUD Toast */}
      {autoLoginStatus && (
        <div className="fixed bottom-6 right-6 z-[9999] pointer-events-auto transition-all animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`flex items-center gap-3.5 px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl ${
              autoLoginStatus.status === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200 shadow-emerald-950/60'
                : autoLoginStatus.status === 'aborted'
                ? 'bg-slate-900/95 border-amber-500/40 text-amber-200 shadow-slate-950/60'
                : autoLoginStatus.status === 'failed'
                ? 'bg-rose-950/95 border-rose-500/50 text-rose-200 shadow-rose-950/60'
                : autoLoginStatus.status === 'retrying'
                ? 'bg-amber-950/95 border-amber-500/50 text-amber-200 shadow-amber-950/60 animate-pulse'
                : 'bg-slate-950/95 border-cyan-500/40 text-cyan-100 shadow-cyan-950/60'
            }`}
          >
            {autoLoginStatus.status === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : autoLoginStatus.status === 'aborted' ? (
              <XCircle className="w-5 h-5 text-amber-400 shrink-0" />
            ) : autoLoginStatus.status === 'failed' ? (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : autoLoginStatus.status === 'retrying' ? (
              <RefreshCw className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
            ) : (
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />
            )}

            <div className="flex flex-col text-xs leading-snug">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white tracking-wide">
                  {autoLoginStatus.username}
                </span>
                {['starting', 'focusing', 'typing', 'waiting-login', 'retrying'].includes(autoLoginStatus.status) && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wider font-semibold ${
                      autoLoginStatus.status === 'retrying'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    ATTEMPT {autoLoginStatus.attempt}/{autoLoginStatus.maxAttempts}
                  </span>
                )}
              </div>
              <span className="text-[11px] opacity-85">
                {autoLoginStatus.message}
              </span>
            </div>

            {['starting', 'focusing', 'typing', 'waiting-login', 'retrying'].includes(autoLoginStatus.status) && (
              <button
                onClick={() => window.rfrApi?.abortAutoLogin?.()}
                className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-rose-950/80 border border-slate-700/80 hover:border-rose-500/50 text-slate-300 hover:text-rose-200 text-[11px] font-medium transition-colors cursor-pointer group"
                title="Abort autologin immediately (or press Escape)"
              >
                <kbd className="px-1 py-0.5 text-[9px] font-mono font-bold bg-slate-900 border border-slate-700 rounded text-slate-400 group-hover:text-rose-300">
                  ESC
                </kbd>
                <span>Cancel</span>
              </button>
            )}

            {['success', 'aborted', 'failed'].includes(autoLoginStatus.status) && (
              <button
                onClick={() => setAutoLoginStatus(null)}
                className="ml-2 text-slate-400 hover:text-white transition-colors cursor-pointer p-0.5"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Auto-Update Banner */}
      {updateInfo && (
        <div className="fixed bottom-4 right-4 z-50 p-3.5 bg-val-card/95 backdrop-blur-md border border-val-mint/60 rounded-xl shadow-2xl shadow-black/80 flex items-center gap-3 animate-fade-in select-none">
          <div className="w-8 h-8 rounded-lg bg-val-mint/20 border border-val-mint/50 flex items-center justify-center text-val-mint font-bold text-sm shrink-0">
            🚀
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Update v{updateInfo.version} Ready!
            </h4>
            <p className="text-[11px] text-val-muted">
              Restart RankForge now to apply the latest update.
            </p>
          </div>
          <button
            onClick={() => window.rfrApi?.restartAndInstall?.()}
            className="px-3 py-1.5 rounded-lg bg-val-mint hover:bg-val-mint/90 text-val-bg font-extrabold text-xs tracking-wider uppercase transition-all shadow-md active:scale-95 shrink-0"
          >
            Restart
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
