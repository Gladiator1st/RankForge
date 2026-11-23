import { contextBridge, ipcRenderer } from 'electron';
import { Account, AppSettings, RiotStatus } from './types';

contextBridge.exposeInMainWorld('rfrApi', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  quit: () => ipcRenderer.invoke('app:quit'),
  minimizeToTray: () => ipcRenderer.invoke('window:minimizeToTray'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  enterHudMode: () => ipcRenderer.invoke('window:enterHudMode'),
  exitHudMode: () => ipcRenderer.invoke('window:exitHudMode'),
  updateHudConfig: (config: { alwaysOnTop?: boolean; scale?: 'compact' | 'normal' | 'large'; opacity?: number }) => ipcRenderer.invoke('window:updateHudConfig', config),

  // Accounts & Storage
  getAccounts: () => ipcRenderer.invoke('accounts:getAll'),
  saveAccount: (account: Partial<Account>) => ipcRenderer.invoke('accounts:save', account),
  deleteAccount: (id: string) => ipcRenderer.invoke('accounts:delete', id),
  deleteBatchAccounts: (ids: string[]) => ipcRenderer.invoke('accounts:deleteBatch', ids),
  archiveAccount: (id: string) => ipcRenderer.invoke('accounts:archive', id),
  restoreAccount: (id: string) => ipcRenderer.invoke('accounts:restore', id),
  reorderAccounts: (ids: string[]) => ipcRenderer.invoke('accounts:reorder', ids),
  bulkImportAccounts: (text: string, defaultRegion?: string) => ipcRenderer.invoke('accounts:bulkImport', text, defaultRegion),
  bulkUpdateAccounts: (updates: { id: string; changes: Partial<Account> }[]) => ipcRenderer.invoke('accounts:bulkUpdate', updates),

  // 30-Day Soft-Delete Trash Bin
  getTrashAccounts: () => ipcRenderer.invoke('accounts:getTrash'),
  restoreTrashAccount: (id: string) => ipcRenderer.invoke('accounts:restoreTrash', id),
  permanentDeleteAccount: (id: string) => ipcRenderer.invoke('accounts:permanentDelete', id),
  emptyTrash: () => ipcRenderer.invoke('accounts:emptyTrash'),

  // Backups & Local Vault
  exportEncryptedBackup: (password: string) => ipcRenderer.invoke('vault:export', password),
  importEncryptedBackup: (password: string) => ipcRenderer.invoke('vault:import', password),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings),

  // Game Launcher & Automation
  launchAccount: (id: string) => ipcRenderer.invoke('launcher:launchAccount', id),
  abortAutoLogin: () => ipcRenderer.invoke('launcher:abortAutoLogin'),
  killRunningGame: () => ipcRenderer.invoke('launcher:killGame'),
  detectRiotClientPath: () => ipcRenderer.invoke('launcher:detectRiotPath'),
  selectRiotClientPath: () => ipcRenderer.invoke('launcher:selectRiotPath'),
  validateRiotClientPath: (path: string) => ipcRenderer.invoke('launcher:validateRiotPath', path),

  // Riot Live Engine & Match Stats
  getRiotStatus: () => ipcRenderer.invoke('riot:getStatus'),
  triggerRiotSync: () => ipcRenderer.invoke('riot:triggerSync'),
  fetchAccountStats: (accountId: string) => ipcRenderer.invoke('accounts:fetchStats', accountId),

  // Integrations & Discord Webhook
  sendDiscordTestPing: (webhookUrl: string) => ipcRenderer.invoke('integrations:discordPing', webhookUrl),
  sendDiscordDigest: (accounts: Account[]) => ipcRenderer.invoke('integrations:discordDigest', accounts),
  sendDiscordLiveDashboard: (accounts: Account[]) => ipcRenderer.invoke('integrations:discordLiveDashboard', accounts),

  // Audio & Custom Sound Files
  selectAudioFile: (type: 'victory' | 'defeat') => ipcRenderer.invoke('audio:selectFile', type),
  readAudioFile: (filePath: string) => ipcRenderer.invoke('audio:readFile', filePath),

  // Clipboard & Utilities
  copyToClipboard: (text: string) => ipcRenderer.invoke('util:copyClipboard', text),
  openExternal: (url: string) => ipcRenderer.invoke('util:openExternal', url),

  // Event Listeners
  onRiotStatusUpdate: (callback: (status: RiotStatus) => void) => {
    const handler = (_: any, data: RiotStatus) => callback(data);
    ipcRenderer.on('riot:statusUpdated', handler);
    return () => ipcRenderer.removeListener('riot:statusUpdated', handler);
  },
  onAccountsUpdated: (callback: (accounts: Account[]) => void) => {
    const handler = (_: any, data: Account[]) => callback(data);
    ipcRenderer.on('accounts:updated', handler);
    return () => ipcRenderer.removeListener('accounts:updated', handler);
  },
  onMatchFinished: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('riot:matchFinished', handler);
    return () => ipcRenderer.removeListener('riot:matchFinished', handler);
  },
  onFirstWinReady: (callback: (account: Account) => void) => {
    const handler = (_: any, data: Account) => callback(data);
    ipcRenderer.on('riot:firstWinReady', handler);
    return () => ipcRenderer.removeListener('riot:firstWinReady', handler);
  },
  checkDetection: () => ipcRenderer.invoke('riot:checkDetection'),
  dismissDetection: () => ipcRenderer.invoke('riot:dismissDetection'),
  onNewAccountDetected: (callback: (data: { username: string; riotId?: string; level?: number; decimalLevel?: number; isArchived?: boolean }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('riot:newAccountDetected', handler);
    return () => ipcRenderer.removeListener('riot:newAccountDetected', handler);
  },
  onAutoLoginStatus: (callback: (status: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('launcher:autoLoginStatus', handler);
    return () => ipcRenderer.removeListener('launcher:autoLoginStatus', handler);
  },

  // Auto-Updater via GitHub Releases
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  restartAndInstall: () => ipcRenderer.invoke('app:restartAndInstall'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_: any, data: { version: string }) => callback(data);
    ipcRenderer.on('app:updateAvailable', handler);
    return () => ipcRenderer.removeListener('app:updateAvailable', handler);
  },
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_: any, data: { version: string }) => callback(data);
    ipcRenderer.on('app:updateNotAvailable', handler);
    return () => ipcRenderer.removeListener('app:updateNotAvailable', handler);
  },
  onUpdateProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('app:updateProgress', handler);
    return () => ipcRenderer.removeListener('app:updateProgress', handler);
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_: any, data: { version: string }) => callback(data);
    ipcRenderer.on('app:updateDownloaded', handler);
    return () => ipcRenderer.removeListener('app:updateDownloaded', handler);
  },
});
