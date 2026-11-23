export interface Account {
  id: string;
  username: string;
  password?: string;
  encrypted_password?: string;
  puuid?: string;
  region: 'eu' | 'na' | 'ap' | 'kr' | 'latam' | 'br' | string;
  level: number;
  current_xp: number;
  decimal_level: number;
  remaining_xp: number;
  first_win_available_time?: string | null;
  first_win_ready?: boolean;
  first_win_seconds?: number;
  first_win_countdown?: string;
  last_active?: string;
  notes?: string;
  archived?: boolean;
  order_index?: number;

  // Account Quality Metadata
  email_verified?: boolean;
  health_status?: 'clean' | 'flagged' | 'banned';

  // Grind Telemetry
  total_playtime_seconds?: number;
  last_session_seconds?: number;
  last_session_started_at?: string | null;

  // MMR & Match Stats Dossier
  stats?: AccountMmrStats;

  // Valorant Inventory & Skins Dossier
  premium_skins?: AccountSkinItem[];

  // 30-Day Trash Bin Soft-Delete Protection
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export interface AccountSkinItem {
  uuid: string;
  name: string;
  weapon: string;
  tier: 'Select' | 'Deluxe' | 'Premium' | 'Exclusive' | 'Ultra';
  tier_price: number;
  icon_url?: string;
  source_type?: 'store' | 'battlepass' | 'agent';
  act_name?: string;
}

export interface AccountMmrStats {
  estimated_mmr?: string;
  mmr_tier?: number;
  peak_mmr?: string;
  mmr_source?: 'direct' | 'lobby' | 'heuristic';
  kd?: number;
  adr?: number;
  hs_pct?: number;
  acs?: number;
  win_rate?: number;
  matches_analyzed?: number;
  total_kills?: number;
  total_deaths?: number;
  riot_id?: string;
  recent_lobby_ranks?: string[];
  primary_mode?: string;
  mode_breakdown?: Record<string, number>;
  last_updated?: string;
}

export interface KpiStats {
  total_accounts: number;
  first_win_ready_count: number;
  ready_for_rank_count: number;
  average_level: number;
  total_xp_remaining: number;
  total_last_session_seconds?: number;
  total_grind_seconds?: number;
}

export interface AppSettings {
  volume: number;
  sfx_enabled: boolean;
  match_sound_enabled?: boolean;
  victory_sound_path?: string;
  defeat_sound_path?: string;
  auto_copy_password: boolean;
  close_to_tray: boolean;
  auto_start_windows?: boolean;
  window_preset: 'small' | 'medium' | 'large';

  // Modal confirmations & detection preferences
  confirm_delete_account?: boolean;
  confirm_exit?: boolean;
  prompt_on_new_account?: boolean;
  ignored_accounts?: string[];
  show_velocity_bar?: boolean;

  // Discord Webhook Add-on
  discord_enabled: boolean;
  discord_webhook_url: string;
  discord_notify_level_20: boolean;
  discord_notify_match_finish: boolean;
  discord_dashboard_message_id?: string;
  discord_live_dashboard_enabled?: boolean;

  // HUD Overlay Preferences
  hud_always_on_top?: boolean;
  hud_opacity?: number;
  hud_scale?: 'compact' | 'normal' | 'large';
  hud_show_session_timer?: boolean;
  hud_show_xp_progress?: boolean;
  hud_show_first_win?: boolean;
  hud_show_active_count?: boolean;
  hud_show_est_mmr?: boolean;

  // Riot Client Path
  riot_client_path?: string;

  // Role & License defaults (Permanent FOSS Solo Grinder)
  user_role?: 'solo';
  license_tier?: 'solo_pro';
  license_key?: string;
  supervisor_mode?: boolean;
  team_key?: string;
  worker_name?: string;
}

export interface RiotStatus {
  is_connected: boolean;
  is_game_running?: boolean;
  region?: string;
  puuid?: string;
  game_name?: string;
  tag_line?: string;
  login_username?: string;
  current_level?: number;
  current_xp?: number;
  decimal_level?: number;
  remaining_xp?: number;
  first_win_available_time?: string | null;
  first_win_ready?: boolean;
  first_win_countdown?: string;
  last_sync_time?: string;
  status_message: string;
  health_status?: 'clean' | 'flagged' | 'banned';
  health_reason?: string;
}

export type ViewMode = 'cards' | 'table' | 'hud';
export type ModalType =
  | 'add_account'
  | 'edit_account'
  | 'bulk_import'
  | 'settings'
  | 'handover'
  | 'confirm_delete'
  | 'confirm_exit'
  | 'detected_account'
  | 'account_stats'
  | null;

export interface IElectronAPI {
  // Window controls & Overlay Mode
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  minimizeToTray?: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  enterHudMode?: () => Promise<void>;
  exitHudMode?: () => Promise<void>;
  updateHudConfig?: (config: { alwaysOnTop?: boolean; scale?: 'compact' | 'normal' | 'large'; opacity?: number }) => Promise<boolean>;

  // Accounts & Storage
  getAccounts: () => Promise<Account[]>;
  saveAccount: (account: Partial<Account>) => Promise<Account>;
  deleteAccount: (id: string) => Promise<boolean>;
  deleteBatchAccounts?: (ids: string[]) => Promise<boolean>;
  archiveAccount: (id: string) => Promise<boolean>;
  restoreAccount: (id: string) => Promise<boolean>;
  reorderAccounts: (ids: string[]) => Promise<boolean>;
  bulkImportAccounts: (text: string, defaultRegion?: string) => Promise<Account[]>;
  bulkUpdateAccounts?: (updates: { id: string; changes: Partial<Account> }[]) => Promise<{ count: number; updated: Account[] }>;

  // 30-Day Soft-Delete Trash Bin
  getTrashAccounts?: () => Promise<Account[]>;
  restoreTrashAccount?: (id: string) => Promise<boolean>;
  permanentDeleteAccount?: (id: string) => Promise<boolean>;
  emptyTrash?: () => Promise<boolean>;

  // Backups & Vault
  exportEncryptedBackup: (password: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  importEncryptedBackup: (password: string) => Promise<{ success: boolean; importedCount?: number; error?: string }>;

  // Settings
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;

  // Game Launcher & Automation
  launchAccount: (id: string) => Promise<{ success: boolean; message: string }>;
  abortAutoLogin?: () => Promise<boolean>;
  killRunningGame: () => Promise<boolean>;
  detectRiotClientPath?: () => Promise<{ found: boolean; path: string; source: 'registry' | 'known_path' | 'none' }>;
  selectRiotClientPath?: () => Promise<{ canceled: boolean; filePath?: string }>;
  validateRiotClientPath?: (path: string) => Promise<{ valid: boolean; message: string }>;

  // Riot Live Engine
  getRiotStatus: () => Promise<RiotStatus>;
  triggerRiotSync: () => Promise<RiotStatus>;
  fetchAccountStats?: (accountId: string) => Promise<any>;

  // Integrations & Discord Webhook
  sendDiscordTestPing: (webhookUrl: string) => Promise<{ success: boolean; message: string }>;
  sendDiscordDigest: (accounts: Account[]) => Promise<{ success: boolean; message: string }>;
  sendDiscordLiveDashboard?: (accounts: Account[]) => Promise<{ success: boolean; message: string; messageId?: string }>;

  // Audio & Custom Sound Files
  selectAudioFile?: (type: 'victory' | 'defeat') => Promise<{ canceled: boolean; filePath?: string }>;
  readAudioFile?: (filePath: string) => Promise<string | null>;

  // Clipboard & Utilities
  copyToClipboard: (text: string) => Promise<void>;
  openExternal?: (url: string) => Promise<void>;

  // Auto-Updater via GitHub Releases
  getAppVersion?: () => Promise<string>;
  checkForUpdates?: () => Promise<{ status: string; currentVersion: string; latestVersion?: string; message?: string; updateAvailable?: boolean; error?: string }>;
  restartAndInstall?: () => Promise<void>;

  // Event Listeners from Main to Renderer
  onRiotStatusUpdate: (callback: (status: RiotStatus) => void) => () => void;
  onAccountsUpdated: (callback: (accounts: Account[]) => void) => () => void;
  onMatchFinished: (callback: (data: MatchFinishedData) => void) => () => void;
  onFirstWinReady: (callback: (account: Account) => void) => () => void;
  onAutoLoginStatus?: (callback: (status: AutoLoginStatusEvent) => void) => () => void;
  checkDetection?: () => Promise<void>;
  dismissDetection?: () => Promise<boolean>;
  onNewAccountDetected?: (callback: (data: { username: string; riotId?: string; level?: number; decimalLevel?: number; isArchived?: boolean }) => void) => () => void;
  onUpdateAvailable?: (callback: (info: { version: string }) => void) => () => void;
  onUpdateDownloaded?: (callback: (info: { version: string }) => void) => () => void;
  onUpdateProgress?: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => () => void;
  onUpdateNotAvailable?: (callback: (info: { version: string }) => void) => () => void;
}

export interface AutoLoginStatusEvent {
  accountId: string;
  username: string;
  status: 'starting' | 'focusing' | 'typing' | 'waiting-login' | 'retrying' | 'success' | 'failed' | 'aborted';
  attempt: number;
  maxAttempts: number;
  message?: string;
}

export interface MatchFinishedData {
  timestamp: string;
  level: number;
  prevLevel: number;
  prevXp: number;
  currentLevel: number;
  currentXp: number;
  xpGained: number;
  accountUsername: string;
  puuid?: string;
  won?: boolean;
  isWin?: boolean;
}

export interface PaidHistoryEntry {
  id: string;
  username: string;
  rate?: string;
  region?: string;
  level?: number;
  delivered_at?: string | null;
  paid_at: string;
  worker?: string;
  team_key?: string;
}

declare global {
  interface Window {
    rfrApi: IElectronAPI;
  }
}
