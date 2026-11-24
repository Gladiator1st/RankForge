import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Settings, 
  Volume2, 
  Bell, 
  Shield, 
  Save, 
  Send, 
  Download, 
  Upload, 
  Check, 
  AlertCircle,
  UserX,
  UserCheck,
  Plus,
  Trash2,
  Info,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  ArrowDownCircle,
  RotateCcw,
  FolderOpen,
  Gamepad2,
  Crosshair,
  Pin,
  Sliders,
  Eye,
  Trophy,
  Zap,
  Music,
  Play,
  Square
} from 'lucide-react';
import { AppSettings, Account } from '../../types';
import { sound } from '../../services/soundEffects';

export type TabType = 'general' | 'hud' | 'personal' | 'discord' | 'vault' | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: TabType;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
  accounts: Account[];
  onAddAccountToRoster?: (username: string) => void;
  onOpenRoleSelection?: () => void;
  onEnterHudMode?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  initialTab = 'general',
  onClose,
  settings,
  onSaveSettings,
  accounts,
  onAddAccountToRoster,
  onOpenRoleSelection: _onOpenRoleSelection,
  onEnterHudMode,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState<AppSettings>({ ...settings });
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [newIgnoreInput, setNewIgnoreInput] = useState('');

  // Auto-Update & Version states
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up_to_date' | 'error'>('idle');
  const [updateProgress, setUpdateProgress] = useState<number>(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Riot Client Path states
  const [detectedRiotPath, setDetectedRiotPath] = useState<string>('');
  const [riotPathStatus, setRiotPathStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const [isDetectingPath, setIsDetectingPath] = useState<boolean>(false);

  // Keep formData in sync whenever modal opens or settings update
  useEffect(() => {
    if (isOpen) {
      setFormData({ ...settings });
      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, settings, initialTab]);

  // Reset scroll position to top whenever active tab changes
  useEffect(() => {
    contentContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  // Inspect and validate Riot Client path when modal opens or path changes
  useEffect(() => {
    if (!isOpen) return;

    if (formData.riot_client_path) {
      window.rfrApi?.validateRiotClientPath?.(formData.riot_client_path).then((res) => {
        if (res) setRiotPathStatus(res);
      });
    } else {
      window.rfrApi?.detectRiotClientPath?.().then((res) => {
        if (res?.found) {
          setDetectedRiotPath(res.path);
          setRiotPathStatus({
            valid: true,
            message: `Auto-detected from ${res.source === 'registry' ? 'Riot system registry' : 'drive search'}: ${res.path}`,
          });
        } else {
          setRiotPathStatus({
            valid: false,
            message: 'Riot Client not found in standard directories. Click Browse to locate RiotClientServices.exe.',
          });
        }
      });
    }
  }, [isOpen, formData.riot_client_path]);

  useEffect(() => {
    if (window.rfrApi?.getAppVersion) {
      window.rfrApi.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      });
    }

    const unsubAvail = window.rfrApi?.onUpdateAvailable?.((info) => {
      setLatestVersion(info.version);
      setUpdateStatus('downloading');
    });

    const unsubNotAvail = window.rfrApi?.onUpdateNotAvailable?.((info) => {
      setLatestVersion(info.version);
      setUpdateStatus('up_to_date');
    });

    const unsubProg = window.rfrApi?.onUpdateProgress?.((prog) => {
      setUpdateStatus('downloading');
      setUpdateProgress(prog.percent);
    });

    const unsubDown = window.rfrApi?.onUpdateDownloaded?.((info) => {
      setLatestVersion(info.version);
      setUpdateStatus('downloaded');
    });

    return () => {
      unsubAvail?.();
      unsubNotAvail?.();
      unsubProg?.();
      unsubDown?.();
    };
  }, []);

  if (!isOpen) return null;

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleSave = async () => {
    const finalPayload = { 
      ...formData,
      user_role: 'solo' as const,
      license_tier: 'solo_pro' as const,
    };

    sound.playSuccessDing();
    try {
      await onSaveSettings(finalPayload);
      sound.setConfig(
        formData.volume,
        formData.sfx_enabled,
        formData.match_sound_enabled !== false,
        formData.victory_sound_path || '',
        formData.defeat_sound_path || ''
      );
      showStatus('success', 'Settings saved successfully!');
    } catch (err: any) {
      showStatus('error', err?.message || 'Failed to save settings');
    }
  };

  const handleSelectAudioFile = async (type: 'victory' | 'defeat') => {
    sound.playTacticalClick();
    if (!window.rfrApi?.selectAudioFile) return;
    try {
      const res = await window.rfrApi.selectAudioFile(type);
      if (!res.canceled && res.filePath) {
        if (type === 'victory') {
          setFormData((prev) => ({ ...prev, victory_sound_path: res.filePath }));
          sound.setConfig(
            formData.volume,
            formData.sfx_enabled,
            formData.match_sound_enabled !== false,
            res.filePath,
            formData.defeat_sound_path || ''
          );
        } else {
          setFormData((prev) => ({ ...prev, defeat_sound_path: res.filePath }));
          sound.setConfig(
            formData.volume,
            formData.sfx_enabled,
            formData.match_sound_enabled !== false,
            formData.victory_sound_path || '',
            res.filePath
          );
        }
        showStatus('success', `Custom ${type === 'victory' ? 'victory' : 'defeat'} audio selected!`);
      }
    } catch (err: any) {
      showStatus('error', err.message || 'Failed to select audio file');
    }
  };

  const handleResetAudioFile = (type: 'victory' | 'defeat') => {
    sound.playTacticalClick();
    if (type === 'victory') {
      setFormData((prev) => ({ ...prev, victory_sound_path: '' }));
      sound.setConfig(
        formData.volume,
        formData.sfx_enabled,
        formData.match_sound_enabled !== false,
        '',
        formData.defeat_sound_path || ''
      );
    } else {
      setFormData((prev) => ({ ...prev, defeat_sound_path: '' }));
      sound.setConfig(
        formData.volume,
        formData.sfx_enabled,
        formData.match_sound_enabled !== false,
        formData.victory_sound_path || '',
        ''
      );
    }
    showStatus('success', `Reset ${type === 'victory' ? 'victory' : 'defeat'} audio to default!`);
  };

  const handleTestDiscordPing = async () => {
    if (!formData.discord_webhook_url) {
      showStatus('error', 'Please enter a Discord Webhook URL first.');
      return;
    }
    sound.playTacticalClick();
    const res = await window.rfrApi?.sendDiscordTestPing(formData.discord_webhook_url);
    if (res?.success) {
      sound.playSuccessDing();
      showStatus('success', 'Test ping sent to Discord channel!');
    } else {
      showStatus('error', res?.message || 'Failed to ping Discord.');
    }
  };

  const handleSendDiscordDigest = async () => {
    sound.playTacticalClick();
    const res = await window.rfrApi?.sendDiscordDigest(accounts);
    if (res?.success) {
      sound.playSuccessDing();
      showStatus('success', 'Roster Radar digest posted to Discord!');
    } else {
      showStatus('error', res?.message || 'Failed to send digest.');
    }
  };


  const handleExportBackup = async () => {
    if (!backupPassword || backupPassword.length < 4) {
      showStatus('error', 'Please enter a backup passphrase (at least 4 characters).');
      return;
    }
    sound.playTacticalClick();
    const res = await window.rfrApi?.exportEncryptedBackup(backupPassword);
    if (res?.success) {
      sound.playSuccessDing();
      showStatus('success', `Backup exported to Desktop: ${res.filePath}`);
    } else {
      showStatus('error', res?.error || 'Failed to export backup.');
    }
  };

  const handleImportBackup = async () => {
    if (!backupPassword) {
      showStatus('error', 'Please enter your backup passphrase first.');
      return;
    }
    sound.playTacticalClick();
    const res = await window.rfrApi?.importEncryptedBackup(backupPassword);
    if (res?.success) {
      sound.playSuccessDing();
      showStatus('success', `Imported ${res.importedCount} accounts successfully!`);
    } else {
      showStatus('error', res?.error || 'Failed to import backup.');
    }
  };


  const handleCheckForUpdates = async () => {
    sound.playTacticalClick();
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      const res = await window.rfrApi?.checkForUpdates?.();
      if (res?.currentVersion) setAppVersion(res.currentVersion);
      if (res?.latestVersion) setLatestVersion(res.latestVersion);

      if (res?.status === 'dev') {
        setUpdateStatus('up_to_date');
        showStatus('success', 'Running in developer mode (latest build).');
      } else if (res?.status === 'error') {
        setUpdateStatus('error');
        setUpdateError(res.error || 'Failed to check update server.');
        showStatus('error', res.error || 'Update check failed.');
      } else if (res?.updateAvailable) {
        setUpdateStatus('available');
        showStatus('success', `Update v${res.latestVersion} available! Downloading in background...`);
      } else {
        setUpdateStatus('up_to_date');
        showStatus('success', 'You are running the latest version.');
      }
    } catch (err: any) {
      setUpdateStatus('error');
      setUpdateError(err?.message || 'Error checking for updates.');
      showStatus('error', 'Update check failed.');
    }
  };

  const handleAutoDetectRiotPath = async () => {
    sound.playTacticalClick();
    setIsDetectingPath(true);
    try {
      const res = await window.rfrApi?.detectRiotClientPath?.();
      if (res?.found) {
        sound.playSuccessDing();
        setFormData((prev) => ({ ...prev, riot_client_path: res.path }));
        onSaveSettings({ riot_client_path: res.path });
        setDetectedRiotPath(res.path);
        setRiotPathStatus({
          valid: true,
          message: `Auto-detected from ${res.source === 'registry' ? 'Riot system registry' : 'drive scan'}!`,
        });
        showStatus('success', `Riot Client auto-detected: ${res.path}`);
      } else {
        sound.playTacticalClick();
        setRiotPathStatus({
          valid: false,
          message: 'Could not auto-detect Riot Client. Please click Browse.',
        });
        showStatus('error', 'Could not locate Riot Client in standard directories. Click Browse.');
      }
    } catch {
      showStatus('error', 'Failed to scan for Riot Client.');
    } finally {
      setIsDetectingPath(false);
    }
  };

  const handleBrowseRiotPath = async () => {
    sound.playTacticalClick();
    try {
      const res = await window.rfrApi?.selectRiotClientPath?.();
      if (res && !res.canceled && res.filePath) {
        sound.playSuccessDing();
        setFormData((prev) => ({ ...prev, riot_client_path: res.filePath }));
        onSaveSettings({ riot_client_path: res.filePath });
        setRiotPathStatus({
          valid: true,
          message: 'Custom executable path configured.',
        });
        showStatus('success', `Riot Client set to: ${res.filePath}`);
      }
    } catch {
      showStatus('error', 'Failed to open file browser.');
    }
  };

  const handleResetRiotPath = () => {
    sound.playTacticalClick();
    setFormData((prev) => ({ ...prev, riot_client_path: '' }));
    onSaveSettings({ riot_client_path: '' });
    window.rfrApi?.detectRiotClientPath?.().then((res) => {
      if (res?.found) {
        setDetectedRiotPath(res.path);
        setRiotPathStatus({
          valid: true,
          message: `Restored to auto-detected default: ${res.path}`,
        });
      } else {
        setRiotPathStatus({
          valid: false,
          message: 'No default Riot Client found. Please click Browse.',
        });
      }
    });
    showStatus('success', 'Riot Client path reset to auto-detection.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-val-card border border-val-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col h-[560px]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-val-border bg-val-bg/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-val-red" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider">
              Settings & Add-ons Control Center
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-val-muted hover:text-white hover:bg-val-border transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Layout: Left Sidebar Tabs + Right Form View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Tabs */}
          <div className="w-48 bg-val-bg/60 border-r border-val-border p-3 space-y-1 shrink-0 select-none">
            <button
              onClick={() => { sound.playTacticalClick(); setActiveTab('general'); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                activeTab === 'general' ? 'bg-val-card border border-val-border text-white shadow-sm' : 'text-val-muted hover:text-white'
              }`}
            >
              <Volume2 className="w-4 h-4 text-val-red" />
              <span>General & Audio</span>
            </button>

            <button
              onClick={() => { sound.playTacticalClick(); setActiveTab('hud'); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                activeTab === 'hud' ? 'bg-val-card border border-val-border text-white shadow-sm' : 'text-val-muted hover:text-white'
              }`}
            >
              <Crosshair className="w-4 h-4 text-amber-400" />
              <span>In-Game Mini-HUD</span>
            </button>


            <button
              onClick={() => { sound.playTacticalClick(); setActiveTab('personal'); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                activeTab === 'personal' ? 'bg-val-card border border-val-border text-white shadow-sm' : 'text-val-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <UserX className="w-4 h-4 text-amber-400" />
                <span>Ignored Accounts</span>
              </div>
              {(formData.ignored_accounts?.length ?? 0) > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-400 border border-amber-400/40 font-mono">
                  {formData.ignored_accounts?.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { sound.playTacticalClick(); setActiveTab('discord'); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                activeTab === 'discord' ? 'bg-val-card border border-val-border text-white shadow-sm' : 'text-val-muted hover:text-white'
              }`}
            >
              <Bell className="w-4 h-4 text-[#5865F2]" />
              <span>Discord Dashboard</span>
            </button>

            <button
              onClick={() => { sound.playTacticalClick(); setActiveTab('vault'); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                activeTab === 'vault' ? 'bg-val-card border border-val-border text-white shadow-sm' : 'text-val-muted hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4 text-val-gold" />
              <span>Vault & Backups</span>
            </button>

            <button
              onClick={() => { sound.playTacticalClick(); setActiveTab('about'); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                activeTab === 'about' ? 'bg-val-card border border-val-border text-white shadow-sm' : 'text-val-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Info className="w-4 h-4 text-cyan-400" />
                <span>About & Updates</span>
              </div>
              {updateStatus === 'downloaded' ? (
                <span className="w-2 h-2 rounded-full bg-val-mint animate-pulse" />
              ) : updateStatus === 'available' || updateStatus === 'downloading' ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              ) : null}
            </button>
          </div>

          {/* Right Panel Content */}
          <div ref={contentContainerRef} className="flex-1 p-6 overflow-y-auto">
            {/* Status Message Banner */}
            {statusMsg && (
              <div className={`p-3 rounded-lg text-xs font-medium mb-4 flex items-center gap-2 ${
                statusMsg.type === 'success' 
                  ? 'bg-val-mint/15 text-val-mint border border-val-mint/30' 
                  : 'bg-val-red/15 text-val-red border border-val-red/30'
              }`}>
                {statusMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{statusMsg.text}</span>
              </div>
            )}

            {/* TAB 1: General & Audio */}
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider mb-1">
                    Esports UI Audio Design
                  </h4>
                  <p className="text-xs text-val-muted leading-relaxed mb-3">
                    Subtle tactical feedback on clicks, First Win ready timers, and Level 20 celebrations.
                  </p>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.sfx_enabled}
                        onChange={(e) => setFormData({ ...formData, sfx_enabled: e.target.checked })}
                        className="rounded bg-val-bg border-val-border text-val-red focus:ring-0"
                      />
                      <span>Enable Sound Effects</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        sound.setConfig(formData.volume, true);
                        sound.playFirstWinChime();
                      }}
                      className="px-2.5 py-1 rounded bg-val-bg border border-val-border text-xs text-val-light hover:text-white transition-colors"
                    >
                      Test Audio Chime
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-val-muted mb-1">
                      <span>Master Volume</span>
                      <span>{Math.round(formData.volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={formData.volume}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setFormData({ ...formData, volume: v });
                        sound.setConfig(
                          v,
                          formData.sfx_enabled,
                          formData.match_sound_enabled !== false,
                          formData.victory_sound_path || '',
                          formData.defeat_sound_path || ''
                        );
                      }}
                      className="w-full accent-val-red"
                    />
                  </div>

                  {/* Match Outcome Audio (Victory & Defeat) */}
                  <div className="mt-5 pt-4 border-t border-val-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Music className="w-4 h-4 text-emerald-400" />
                        <h4 className="font-bold text-xs text-white uppercase tracking-wider">
                          Match Outcome Audio (Victory & Defeat)
                        </h4>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.match_sound_enabled !== false}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            setFormData({ ...formData, match_sound_enabled: enabled });
                            sound.setConfig(
                              formData.volume,
                              formData.sfx_enabled,
                              enabled,
                              formData.victory_sound_path || '',
                              formData.defeat_sound_path || ''
                            );
                          }}
                          className="rounded bg-val-bg border-val-border text-emerald-500 focus:ring-0"
                        />
                        <span className="text-val-muted hover:text-white transition-colors">Enabled</span>
                      </label>
                    </div>
                    <p className="text-xs text-val-muted leading-relaxed mb-3">
                      Plays distinct victory and defeat audio tracks when a Valorant match ends. You can customize either sound with any MP3/WAV/OGG on your PC, or use the defaults.
                    </p>

                    {/* Victory Sound Customizer */}
                    <div className="p-3 rounded-lg bg-val-bg/80 border border-emerald-500/20 mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                            Match Victory Audio
                          </span>
                        </div>
                        <span className="text-[11px] text-val-muted font-mono truncate max-w-[200px]" title={formData.victory_sound_path || 'Default (The Winner Takes All)'}>
                          {formData.victory_sound_path ? formData.victory_sound_path.split(/[\\/]/).pop() : 'Default (The Winner Takes All)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            sound.playMatchVictorySound(formData.victory_sound_path || './sounds/victory.mp3');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-medium text-emerald-300 hover:text-white transition-all active:scale-95"
                          title="Preview Victory Sound"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Test Victory</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectAudioFile('victory')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-val-border/40 hover:bg-val-border border border-val-border text-xs text-val-light hover:text-white transition-all active:scale-95"
                          title="Select custom victory sound file"
                        >
                          <FolderOpen className="w-3 h-3" />
                          <span>Browse...</span>
                        </button>
                        {formData.victory_sound_path && (
                          <button
                            type="button"
                            onClick={() => handleResetAudioFile('victory')}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-transparent hover:bg-val-border/30 text-xs text-val-muted hover:text-rose-400 transition-colors"
                            title="Reset to default victory sound"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Defeat Sound Customizer */}
                    <div className="p-3 rounded-lg bg-val-bg/80 border border-rose-500/20 mb-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-xs font-semibold text-rose-400 uppercase tracking-wide">
                            Match Defeat Audio
                          </span>
                        </div>
                        <span className="text-[11px] text-val-muted font-mono truncate max-w-[200px]" title={formData.defeat_sound_path || 'Default (Sad Horn)'}>
                          {formData.defeat_sound_path ? formData.defeat_sound_path.split(/[\\/]/).pop() : 'Default (Sad Horn)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            sound.playMatchDefeatSound(formData.defeat_sound_path || './sounds/defeat.mp3');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-medium text-rose-300 hover:text-white transition-all active:scale-95"
                          title="Preview Defeat Sound"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Test Defeat</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectAudioFile('defeat')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-val-border/40 hover:bg-val-border border border-val-border text-xs text-val-light hover:text-white transition-all active:scale-95"
                          title="Select custom defeat sound file"
                        >
                          <FolderOpen className="w-3 h-3" />
                          <span>Browse...</span>
                        </button>
                        {formData.defeat_sound_path && (
                          <button
                            type="button"
                            onClick={() => handleResetAudioFile('defeat')}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-transparent hover:bg-val-border/30 text-xs text-val-muted hover:text-rose-400 transition-colors"
                            title="Reset to default defeat sound"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => sound.stopCurrentAudio()}
                        className="text-[11px] text-val-muted hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <Square className="w-2.5 h-2.5 fill-current" />
                        <span>Stop Audio Preview</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Riot Client Executable Path Selector & Auto-Detect */}
                <div className="pt-4 border-t border-val-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="w-4 h-4 text-val-red" />
                      <h4 className="font-bold text-xs text-white uppercase tracking-wider">
                        Riot Client Executable (`RiotClientServices.exe`)
                      </h4>
                    </div>
                    {riotPathStatus && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        riotPathStatus.valid
                          ? 'bg-val-mint/20 text-val-mint border border-val-mint/30'
                          : 'bg-val-red/20 text-val-red border border-val-red/30'
                      }`}>
                        {riotPathStatus.valid ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {riotPathStatus.valid ? 'Ready' : 'Not Found'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-val-muted leading-relaxed mb-3">
                    Used to automatically launch accounts and auto-fill credentials. Drives C:, D:, E: and Riot system manifests are scanned automatically.
                  </p>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.riot_client_path || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...formData, riot_client_path: val });
                          if (val) {
                            window.rfrApi?.validateRiotClientPath?.(val).then((res) => {
                              if (res) setRiotPathStatus(res);
                            });
                          }
                        }}
                        placeholder={detectedRiotPath || 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe'}
                        className="flex-1 bg-val-bg border border-val-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-val-red placeholder:text-val-muted/50"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseRiotPath}
                        className="px-3 py-2 rounded-lg bg-val-card hover:bg-val-cardHover border border-val-border hover:border-white/40 text-xs font-semibold text-val-light hover:text-white transition-all flex items-center gap-1.5 shrink-0"
                        title="Browse Windows Explorer for RiotClientServices.exe"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-val-gold" />
                        <span>Browse...</span>
                      </button>
                      <button
                        type="button"
                        disabled={isDetectingPath}
                        onClick={handleAutoDetectRiotPath}
                        className="px-3 py-2 rounded-lg bg-val-card hover:bg-val-cardHover border border-val-border hover:border-val-mint/50 text-xs font-semibold text-val-mint hover:text-white transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                        title="Auto-scan drives and registry for Riot Client"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isDetectingPath ? 'animate-spin' : ''}`} />
                        <span>{isDetectingPath ? 'Detecting...' : 'Auto-Detect'}</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-val-muted px-0.5">
                      <span className="truncate max-w-[420px]" title={riotPathStatus?.message || detectedRiotPath}>
                        {riotPathStatus?.message || (detectedRiotPath ? `Active: ${detectedRiotPath}` : 'Standard path will be scanned.')}
                      </span>
                      {formData.riot_client_path && (
                        <button
                          type="button"
                          onClick={handleResetRiotPath}
                          className="text-[11px] text-val-muted hover:text-val-red flex items-center gap-1 transition-colors shrink-0 ml-2"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset to Default</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-val-border">
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider mb-2">
                    Window & System Tray
                  </h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.close_to_tray}
                        onChange={(e) => setFormData({ ...formData, close_to_tray: e.target.checked })}
                        className="rounded bg-val-bg border-val-border text-val-red focus:ring-0"
                      />
                      <span>Minimize to System Tray on close (runs quietly in background)</span>
                    </label>

                    <label className="flex items-start gap-2 text-xs font-medium text-val-light cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.auto_start_windows ?? false}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setFormData({ ...formData, auto_start_windows: val });
                          onSaveSettings({ auto_start_windows: val });
                        }}
                        className="rounded bg-val-bg border-val-border text-val-red focus:ring-0 mt-0.5"
                      />
                      <div>
                        <span className="text-white font-medium">Auto-Start with Windows (Minimized to Tray)</span>
                        <p className="text-[11px] text-val-muted leading-relaxed mt-0.5">
                          Launches automatically when Windows boots and sits quietly in the system tray. (Default: Off)
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t border-val-border">
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider mb-2">
                    Safety & Confirmation Prompts
                  </h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.confirm_delete_account ?? true}
                        onChange={(e) => setFormData({ ...formData, confirm_delete_account: e.target.checked })}
                        className="rounded bg-val-bg border-val-border text-val-red focus:ring-0"
                      />
                      <span>Confirm before deleting accounts from roster</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.confirm_exit ?? true}
                        onChange={(e) => setFormData({ ...formData, confirm_exit: e.target.checked })}
                        className="rounded bg-val-bg border-val-border text-val-red focus:ring-0"
                      />
                      <span>Confirm before quitting tracker</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.prompt_on_new_account ?? true}
                        onChange={(e) => setFormData({ ...formData, prompt_on_new_account: e.target.checked })}
                        className="rounded bg-val-bg border-val-border text-val-red focus:ring-0"
                      />
                      <span>Prompt when unrecognized game account is detected</span>
                    </label>

                  </div>

                  <div className="mt-3 pt-3 border-t border-val-border/40 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white">Ignored Accounts</span>
                      <p className="text-[11px] text-val-muted">
                        {(formData.ignored_accounts || []).length === 0
                          ? 'No accounts currently ignored.'
                          : `${(formData.ignored_accounts || []).length} account(s) currently ignored.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTacticalClick();
                        setActiveTab('personal');
                      }}
                      className="px-2.5 py-1 rounded bg-val-bg border border-val-border hover:border-amber-400 text-xs font-medium text-amber-300 hover:text-white transition-colors flex items-center gap-1.5"
                    >
                      <UserX className="w-3.5 h-3.5 text-amber-400" />
                      <span>View & Manage ({(formData.ignored_accounts || []).length})</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: In-Game Mini-HUD & Display Customization */}
            {activeTab === 'hud' && (
              <div className="space-y-5">
                {/* Header & Launch action */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-2">
                      <Crosshair className="w-4 h-4 text-val-gold" />
                      <span>In-Game Mini-HUD Overlay & Display</span>
                    </h4>
                    <p className="text-xs text-val-muted leading-relaxed mt-0.5">
                      Floating live dashboard that stays visible above Valorant during grinding sessions.
                    </p>
                  </div>
                  {onEnterHudMode && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTacticalClick();
                        onEnterHudMode();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-val-red hover:bg-val-redHover text-white text-xs font-bold shadow-md shadow-val-red/30 transition-all flex items-center gap-1.5 shrink-0 active:scale-95"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>Launch Mini-HUD</span>
                    </button>
                  )}
                </div>

                {/* Interactive Live Preview Box */}
                <div className="p-3.5 border border-val-border rounded-xl space-y-2.5 relative overflow-hidden bg-slate-950">
                  {/* High-contrast game tactical grid backdrop to visibly demonstrate opacity */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: `
                        radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.25) 0%, transparent 65%),
                        linear-gradient(to right, rgba(56, 189, 248, 0.2) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(56, 189, 248, 0.2) 1px, transparent 1px)
                      `,
                      backgroundSize: '100% 100%, 24px 24px, 24px 24px',
                    }}
                  />
                  <div className="flex items-center justify-between text-[11px] text-val-muted font-medium relative z-10">
                    <span className="flex items-center gap-1.5 text-white font-semibold">
                      <Eye className="w-3.5 h-3.5 text-val-mint" />
                      <span>Live HUD Appearance Preview</span>
                    </span>
                    <span className="font-mono text-[10px] text-val-muted">
                      Scale: <span className="text-white capitalize">{formData.hud_scale || 'normal'}</span> • Opacity:{' '}
                      <span className="text-val-gold font-bold">{Math.round((formData.hud_opacity ?? 0.95) * 100)}%</span>
                    </span>
                  </div>

                  {/* Simulated HUD card */}
                  <div
                    className="border border-slate-600/80 rounded-lg p-2.5 flex flex-col justify-between font-sans shadow-2xl backdrop-blur-md transition-all select-none mx-auto max-w-sm relative z-10"
                    style={{
                      backgroundColor: `rgba(11, 17, 24, ${formData.hud_opacity ?? 0.95})`,
                      boxShadow: `0 8px 32px 0 rgba(0, 0, 0, ${(formData.hud_opacity ?? 0.95) * 0.8})`,
                    }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1.5 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider text-red-400">
                          <Zap className="w-3 h-3 text-red-400 fill-current" />
                          <span>RFR HUD</span>
                        </div>
                        <span className="flex items-center space-x-1 text-[10px] text-emerald-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Riot Active</span>
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className={`p-1 rounded text-[10px] border ${
                          (formData.hud_always_on_top ?? true)
                            ? 'bg-red-500/20 text-red-400 border-red-500/40'
                            : 'bg-slate-800/80 text-slate-500 border-slate-700/50'
                        }`}>
                          <Pin className="w-2.5 h-2.5 fill-current" />
                        </span>
                      </div>
                    </div>

                    {/* Account Body */}
                    <div className="py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-xs text-slate-100 tracking-wide">
                            {accounts[0]?.username || 'GrinderPro#EUW'}
                          </span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono">
                            BATCH-A
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {(formData.hud_show_est_mmr ?? true) && (
                            <span className="flex items-center space-x-1 text-[9px] font-bold text-amber-300 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded">
                              <Trophy className="w-2.5 h-2.5 text-amber-400" />
                              <span>Gold 2 (45 RR)</span>
                            </span>
                          )}
                          {(formData.hud_show_first_win ?? true) && (
                            <span className="flex items-center space-x-1 text-[9px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-1.5 py-0.5 rounded">
                              <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                              <span>+1K XP</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* XP Progress */}
                      {(formData.hud_show_xp_progress ?? true) && (
                        <div className="space-y-1 pt-0.5">
                          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                            <span className="text-slate-200 font-semibold">Lvl 17 <span className="text-slate-500 text-[9px]">(17.45)</span></span>
                            <span className="text-red-400 font-medium">78% to Lvl 20</span>
                          </div>
                          <div className="w-full bg-slate-900/90 rounded-full h-1.5 border border-slate-800 overflow-hidden">
                            <div className="bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 h-full w-[78%] rounded-full" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
                      <div className="flex flex-col gap-0.2">
                        {(formData.hud_show_active_count ?? true) && (
                          <div className="text-[9px] text-slate-400">
                            <span className="text-slate-200 font-medium">{accounts.length || 8}</span> accounts
                          </div>
                        )}
                        {(formData.hud_show_session_timer ?? true) && (
                          <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500">
                            <span>⏱</span>
                            <span className="tabular-nums text-slate-400 font-medium">01:42:15</span>
                          </div>
                        )}
                      </div>
                      <span className="bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold rounded px-2.5 py-0.5 text-[10px] shadow-sm">
                        PLAY NEXT
                      </span>
                    </div>
                  </div>
                </div>

                {/* Window & Display Sliders */}
                <div className="pt-2 border-t border-val-border space-y-4">
                  {/* Always On Top */}
                  <div>
                    <label className="flex items-center gap-2.5 text-xs font-semibold text-white cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.hud_always_on_top ?? true}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setFormData({ ...formData, hud_always_on_top: v });
                          onSaveSettings({ hud_always_on_top: v });
                          window.rfrApi?.updateHudConfig?.({ alwaysOnTop: v });
                        }}
                        className="rounded bg-val-bg border-val-border text-val-red focus:ring-0 w-4 h-4"
                      />
                      <div className="flex items-center gap-1.5">
                        <Pin className="w-3.5 h-3.5 text-val-red" />
                        <span>Always On Top (Pinned above Valorant borderless window)</span>
                      </div>
                    </label>
                    <p className="text-[11px] text-val-muted mt-1 ml-6.5 leading-relaxed">
                      Maintains Windows topmost priority so the overlay never disappears behind game windows.
                    </p>
                  </div>

                  {/* Background Opacity */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-val-gold" />
                        <span>Background Opacity / Transparency</span>
                      </span>
                      <span className="font-mono text-xs text-val-gold font-bold">
                        {Math.round((formData.hud_opacity ?? 0.95) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.30"
                      max="1.0"
                      step="0.05"
                      value={formData.hud_opacity ?? 0.95}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setFormData({ ...formData, hud_opacity: v });
                        onSaveSettings({ hud_opacity: v });
                        window.rfrApi?.updateHudConfig?.({ opacity: v });
                      }}
                      className="w-full accent-val-red cursor-pointer"
                    />
                    <div className="flex items-center justify-between mt-1 text-[10px] text-val-muted">
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, hud_opacity: 0.60 });
                          onSaveSettings({ hud_opacity: 0.60 });
                          window.rfrApi?.updateHudConfig?.({ opacity: 0.60 });
                        }}
                        className="hover:text-white transition-colors"
                      >
                        Subtle Glass (60%)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, hud_opacity: 0.85 });
                          onSaveSettings({ hud_opacity: 0.85 });
                          window.rfrApi?.updateHudConfig?.({ opacity: 0.85 });
                        }}
                        className="hover:text-white transition-colors"
                      >
                        Tactical Dark (85%)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, hud_opacity: 0.95 });
                          onSaveSettings({ hud_opacity: 0.95 });
                          window.rfrApi?.updateHudConfig?.({ opacity: 0.95 });
                        }}
                        className="hover:text-white transition-colors font-semibold text-val-light"
                      >
                        Default (95%)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, hud_opacity: 1.0 });
                          onSaveSettings({ hud_opacity: 1.0 });
                          window.rfrApi?.updateHudConfig?.({ opacity: 1.0 });
                        }}
                        className="hover:text-white transition-colors"
                      >
                        Solid (100%)
                      </button>
                    </div>
                  </div>

                  {/* HUD Scale / Size */}
                  <div>
                    <label className="block text-xs font-semibold text-white mb-2">
                      HUD Display Dimensions & Scale
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'compact', label: 'Compact', dims: '330 × 155 px', desc: 'Minimal screen real-estate' },
                        { id: 'normal', label: 'Normal', dims: '380 × 190 px', desc: 'Balanced standard view' },
                        { id: 'large', label: 'Large', dims: '440 × 220 px', desc: '1440p / 4K monitors' },
                      ].map((preset) => {
                        const isSelected = (formData.hud_scale || 'normal') === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              sound.playTacticalClick();
                              setFormData({ ...formData, hud_scale: preset.id as any });
                              onSaveSettings({ hud_scale: preset.id as any });
                              window.rfrApi?.updateHudConfig?.({ scale: preset.id as any });
                            }}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-val-card border-val-red text-white shadow-md shadow-val-red/20'
                                : 'bg-val-bg border-val-border text-val-muted hover:text-val-light hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span>{preset.label}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-val-red" />}
                            </div>
                            <div className="font-mono text-[10px] text-val-light/70 mt-0.5">{preset.dims}</div>
                            <div className="text-[10px] text-val-muted mt-1 leading-tight">{preset.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Display Metrics & Badges Customizer */}
                <div className="pt-3 border-t border-val-border space-y-2.5">
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider mb-2">
                    Visible Metrics & Overlay Elements
                  </h4>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer bg-val-bg/80 border border-val-border/60 p-2.5 rounded-lg hover:border-val-border transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.hud_show_xp_progress ?? true}
                        onChange={(e) => {
                          setFormData({ ...formData, hud_show_xp_progress: e.target.checked });
                          onSaveSettings({ hud_show_xp_progress: e.target.checked });
                        }}
                        className="rounded bg-val-card border-val-border text-val-red focus:ring-0"
                      />
                      <span>Level & XP Progress Bar to Lvl 20</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer bg-val-bg/80 border border-val-border/60 p-2.5 rounded-lg hover:border-val-border transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.hud_show_first_win ?? true}
                        onChange={(e) => {
                          setFormData({ ...formData, hud_show_first_win: e.target.checked });
                          onSaveSettings({ hud_show_first_win: e.target.checked });
                        }}
                        className="rounded bg-val-card border-val-border text-val-red focus:ring-0"
                      />
                      <span>First Win Ready (+1,000 XP) Status</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer bg-val-bg/80 border border-val-border/60 p-2.5 rounded-lg hover:border-val-border transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.hud_show_est_mmr ?? true}
                        onChange={(e) => {
                          setFormData({ ...formData, hud_show_est_mmr: e.target.checked });
                          onSaveSettings({ hud_show_est_mmr: e.target.checked });
                        }}
                        className="rounded bg-val-card border-val-border text-val-red focus:ring-0"
                      />
                      <span>Estimated MMR / Peak Rank Badge</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer bg-val-bg/80 border border-val-border/60 p-2.5 rounded-lg hover:border-val-border transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.hud_show_session_timer ?? true}
                        onChange={(e) => {
                          setFormData({ ...formData, hud_show_session_timer: e.target.checked });
                          onSaveSettings({ hud_show_session_timer: e.target.checked });
                        }}
                        className="rounded bg-val-card border-val-border text-val-red focus:ring-0"
                      />
                      <span>Active Session Elapsed Timer</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer bg-val-bg/80 border border-val-border/60 p-2.5 rounded-lg hover:border-val-border transition-colors col-span-2">
                      <input
                        type="checkbox"
                        checked={formData.hud_show_active_count ?? true}
                        onChange={(e) => {
                          setFormData({ ...formData, hud_show_active_count: e.target.checked });
                          onSaveSettings({ hud_show_active_count: e.target.checked });
                        }}
                        className="rounded bg-val-card border-val-border text-val-red focus:ring-0"
                      />
                      <span>Active Accounts Count in Roster</span>
                    </label>
                  </div>
                </div>
              </div>
            )}


            {/* TAB: Ignored Accounts */}
            {activeTab === 'personal' && (
              <div className="space-y-4">
                <div className="pb-3 border-b border-val-border flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <UserX className="w-4 h-4 text-amber-400" />
                      <h4 className="font-bold text-xs text-white uppercase tracking-wider">
                        Ignored Accounts ({(formData.ignored_accounts || []).length})
                      </h4>
                    </div>
                    <p className="text-xs text-val-muted mt-1 leading-relaxed">
                      Accounts marked as ignored are excluded from your grinding roster and won't trigger detection prompts when you log into them.
                    </p>
                  </div>
                  {(formData.ignored_accounts || []).length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTacticalClick();
                        setFormData({ ...formData, ignored_accounts: [] });
                        onSaveSettings({ ignored_accounts: [] });
                        showStatus('success', 'Cleared all ignored accounts.');
                      }}
                      className="text-xs font-semibold text-val-red hover:underline px-2 py-1 rounded hover:bg-val-red/10 transition-colors shrink-0"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {/* Add new ignored account input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter account username or Riot ID to ignore..."
                    value={newIgnoreInput}
                    onChange={(e) => setNewIgnoreInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const trimmed = newIgnoreInput.trim();
                        if (!trimmed) return;
                        const current = formData.ignored_accounts || [];
                        if (current.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
                          showStatus('error', 'Account is already in ignored accounts.');
                          return;
                        }
                        const updated = [...current, trimmed];
                        setFormData({ ...formData, ignored_accounts: updated });
                        onSaveSettings({ ignored_accounts: updated });
                        setNewIgnoreInput('');
                        sound.playSuccessDing();
                        showStatus('success', `Added "${trimmed}" to ignored accounts.`);
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-val-bg border border-val-border focus:border-amber-400 rounded-lg text-xs text-white font-mono focus:outline-none placeholder:text-val-muted"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = newIgnoreInput.trim();
                      if (!trimmed) return;
                      const current = formData.ignored_accounts || [];
                      if (current.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
                        showStatus('error', 'Account is already in ignored accounts.');
                        return;
                      }
                      const updated = [...current, trimmed];
                      setFormData({ ...formData, ignored_accounts: updated });
                      onSaveSettings({ ignored_accounts: updated });
                      setNewIgnoreInput('');
                      sound.playSuccessDing();
                      showStatus('success', `Added "${trimmed}" to ignored accounts.`);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold transition-all active:scale-95 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ignore Account</span>
                  </button>
                </div>

                {/* List of Ignored Accounts */}
                {(formData.ignored_accounts || []).length === 0 ? (
                  <div className="py-12 border border-dashed border-val-border rounded-xl flex flex-col items-center justify-center text-center p-6 bg-val-bg/30">
                    <UserX className="w-8 h-8 text-val-muted/60 mb-2" />
                    <h5 className="font-bold text-xs text-white uppercase tracking-wider mb-1">
                      No Ignored Accounts Saved
                    </h5>
                    <p className="text-xs text-val-muted max-w-sm leading-relaxed">
                      When you log into an account in the Riot Client, choose <strong>"Ignore Account"</strong> on the detection prompt to automatically ignore it.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {(formData.ignored_accounts || []).map((accName, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-lg bg-val-bg border border-val-border hover:border-val-border/80 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
                            <UserX className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-mono text-xs font-bold text-white">
                              {accName}
                            </div>
                            <div className="text-[10px] text-amber-400/80 font-medium">
                              Ignored from Grinder Detection
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            title="Move this account from ignored list into active grinding roster"
                            onClick={() => {
                              sound.playSuccessDing();
                              const updated = (formData.ignored_accounts || []).filter((_, idx) => idx !== i);
                              setFormData({ ...formData, ignored_accounts: updated });
                              onSaveSettings({ ignored_accounts: updated });
                              if (onAddAccountToRoster) {
                                onAddAccountToRoster(accName);
                              }
                              showStatus('success', `Moved "${accName}" to active grinding roster!`);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-val-mint/15 hover:bg-val-mint/25 border border-val-mint/40 text-[11px] font-semibold text-val-mint transition-colors"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>Move to Roster</span>
                          </button>

                          <button
                            type="button"
                            title="Remove from ignored list (game detector will ask again)"
                            onClick={() => {
                              sound.playTacticalClick();
                              const updated = (formData.ignored_accounts || []).filter((_, idx) => idx !== i);
                              setFormData({ ...formData, ignored_accounts: updated });
                              onSaveSettings({ ignored_accounts: updated });
                              showStatus('success', `Un-ignored "${accName}".`);
                            }}
                            className="p-1.5 rounded hover:bg-val-red/20 text-val-muted hover:text-val-red border border-transparent hover:border-val-red/30 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Discord Webhooks */}
            {activeTab === 'discord' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider mb-1">
                    Discord Webhook Automation
                  </h4>
                  <p className="text-xs text-val-muted leading-relaxed mb-3">
                    Send real-time match completions, Level 20 deliverable milestone embeds, and roster digests to your server.
                  </p>

                  <label className="block text-xs font-semibold text-val-muted uppercase mb-1.5">
                    Discord Webhook URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={formData.discord_webhook_url}
                    onChange={(e) => setFormData({ ...formData, discord_webhook_url: e.target.value })}
                    className="w-full px-3 py-2 bg-val-bg border border-val-border focus:border-val-red rounded-lg text-xs text-white font-mono focus:outline-none"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.discord_notify_level_20}
                      onChange={(e) => setFormData({ ...formData, discord_notify_level_20: e.target.checked })}
                      className="rounded bg-val-bg border-val-border text-val-red"
                    />
                    <span>Notify immediately when any account hits Level 20 (Ready for Rank)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-val-light cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.discord_notify_match_finish}
                      onChange={(e) => setFormData({ ...formData, discord_notify_match_finish: e.target.checked })}
                      className="rounded bg-val-bg border-val-border text-val-red"
                    />
                    <span>Notify on Valorant match completion with gained XP</span>
                  </label>
                </div>

                <div className="pt-3 border-t border-val-border flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestDiscordPing}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-val-bg border border-val-border text-xs text-val-light hover:text-white transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Test Ping</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendDiscordDigest}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#5865F2]/20 border border-[#5865F2]/40 text-xs text-white hover:bg-[#5865F2]/30 transition-colors"
                  >
                    <span>📋 Post Roster Radar Digest</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: Encrypted Vault & Backups */}
            {activeTab === 'vault' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider mb-1">
                    Encrypted Local Vault & Portable Backups
                  </h4>
                  <p className="text-xs text-val-muted leading-relaxed mb-3">
                    All credentials are encrypted locally with AES-256-GCM. Export an encrypted, password-protected archive file (<code className="text-val-gold">.rfrbackup</code>) to securely transfer accounts between computers.
                  </p>

                  <label className="block text-xs font-semibold text-val-muted uppercase mb-1.5">
                    Backup Passphrase / Master Password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter passphrase to encrypt / decrypt backup file"
                    value={backupPassword}
                    onChange={(e) => setBackupPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-val-bg border border-val-border focus:border-val-gold rounded-lg text-xs text-white font-mono focus:outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-val-border flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-val-card hover:bg-val-cardHover border border-val-gold/40 text-val-gold text-xs font-bold transition-all shadow-sm active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Encrypted Backup</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleImportBackup}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-val-card hover:bg-val-cardHover border border-val-border text-val-light hover:text-white text-xs font-bold transition-all shadow-sm active:scale-95"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Import Backup File</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 7: About App & Software Updates */}
            {activeTab === 'about' && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider mb-1">
                    Application Details & Software Updates
                  </h4>
                  <p className="text-xs text-val-muted leading-relaxed mb-4">
                    Manage client updates, check server release channels, and verify system integrity.
                  </p>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {/* Current Installed Version */}
                    <div className="p-3.5 rounded-xl bg-val-bg/80 border border-val-border flex flex-col justify-between">
                      <span className="text-[11px] font-semibold text-val-muted uppercase tracking-wider">
                        Installed App Version
                      </span>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="font-mono text-base font-black text-white">
                          v{appVersion}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                          Current
                        </span>
                      </div>
                    </div>

                    {/* Latest Cloud Version */}
                    <div className="p-3.5 rounded-xl bg-val-bg/80 border border-val-border flex flex-col justify-between">
                      <span className="text-[11px] font-semibold text-val-muted uppercase tracking-wider">
                        Latest Available Version
                      </span>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="font-mono text-base font-black text-white">
                          v{latestVersion || appVersion}
                        </span>
                        {updateStatus === 'downloaded' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-val-mint/20 text-val-mint border border-val-mint/40 animate-pulse">
                            Ready To Install
                          </span>
                        ) : updateStatus === 'downloading' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-400 border border-amber-400/40 animate-pulse">
                            Downloading {updateProgress}%
                          </span>
                        ) : updateStatus === 'available' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-400 border border-amber-400/40">
                            Available
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-val-mint/20 text-val-mint border border-val-mint/40">
                            Up to Date
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Update Status Card */}
                  <div className="p-4 rounded-xl bg-val-card border border-val-border space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {updateStatus === 'downloaded' ? (
                          <CheckCircle2 className="w-5 h-5 text-val-mint" />
                        ) : updateStatus === 'downloading' ? (
                          <ArrowDownCircle className="w-5 h-5 text-amber-400 animate-bounce" />
                        ) : updateStatus === 'checking' ? (
                          <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                        ) : updateStatus === 'error' ? (
                          <AlertCircle className="w-5 h-5 text-val-red" />
                        ) : (
                          <Sparkles className="w-5 h-5 text-val-gold" />
                        )}
                        <div>
                          <div className="text-xs font-bold text-white">
                            {updateStatus === 'downloaded'
                              ? `Update v${latestVersion || appVersion} Downloaded!`
                              : updateStatus === 'downloading'
                              ? `Downloading Background Update (${updateProgress}%)`
                              : updateStatus === 'checking'
                              ? 'Checking Cloud Update Server...'
                              : updateStatus === 'available'
                              ? `New Release v${latestVersion} Available!`
                              : updateStatus === 'error'
                              ? 'Update Server Notice'
                              : 'Your Client Is Up To Date'}
                          </div>
                          <div className="text-[11px] text-val-muted">
                            {updateStatus === 'downloaded'
                              ? 'The update has been downloaded. Restarting will apply it instantly with zero wizard prompts.'
                              : updateStatus === 'downloading'
                              ? 'Patching in the background. You can continue leveling accounts without interruption.'
                              : updateStatus === 'checking'
                              ? 'Connecting to update server...'
                              : updateStatus === 'error'
                              ? (updateError || 'Unable to connect to update server.')
                              : 'You are on the latest verified release with real-time cloud sync.'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar if Downloading */}
                    {updateStatus === 'downloading' && (
                      <div className="w-full bg-val-bg rounded-full h-2 overflow-hidden border border-val-border">
                        <div
                          className="bg-gradient-to-r from-amber-400 to-val-mint h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(5, updateProgress)}%` }}
                        />
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleCheckForUpdates}
                        disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-val-bg hover:bg-val-border border border-val-border text-xs font-bold text-white transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${updateStatus === 'checking' ? 'animate-spin text-cyan-400' : 'text-val-muted'}`} />
                        <span>{updateStatus === 'checking' ? 'Checking for Updates...' : 'Check for Updates'}</span>
                      </button>

                      {updateStatus === 'downloaded' && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playLevelUpFanfare();
                            window.rfrApi?.restartAndInstall?.();
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-val-mint to-emerald-600 hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-val-mint/20 animate-pulse active:scale-95 transition-all"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restart Now & Apply Update</span>
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-val-border bg-val-bg/90 flex items-center justify-between shrink-0">
          <span className="text-xs text-val-muted">
            RankForge v{appVersion} • Free & Open Source on GitHub (<a href="https://github.com/Gladiator1st/RankForge" target="_blank" rel="noreferrer" className="text-val-mint hover:underline">Gladiator1st/RankForge</a>)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-val-muted hover:text-white transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-val-red hover:bg-val-redHover text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-val-red/30 active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
