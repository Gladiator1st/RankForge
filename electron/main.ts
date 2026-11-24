import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard, dialog, NativeImage, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import { VaultStorage } from './services/vaultStorage';
import { RiotEngine } from './services/riotEngine';
import { GameLauncher } from './services/gameLauncher';
import { DiscordService } from './services/discordService';
import { Account, AppSettings } from './types';

process.on('uncaughtException', (err) => {
  console.error('[RankForge Main] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[RankForge Main] Unhandled Rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let preHudBounds = { width: 1350, height: 720, x: 100, y: 100 };
let isHudMode = false;
let wasMaximizedBeforeHud = false;

const statsAutoFetchedThisSession = new Set<string>();
const playtimeSessionStart = new Map<string, number>();

const vault = new VaultStorage();
const riot = new RiotEngine();

try {
  vault.sanitizeActiveSessions();
} catch (_) {}

function flushPlaytimeSession(reason = 'disconnect') {
  if (playtimeSessionStart.size === 0) {
    vault.sanitizeActiveSessions();
    return;
  }
  const nowMs = Date.now();
  for (const [accountId, startMs] of playtimeSessionStart.entries()) {
    const deltaSeconds = Math.floor((nowMs - startMs) / 1000);
    try {
      const allAccs = vault.getAllRawAccounts();
      const acc = allAccs.find((a) => a.id === accountId);
      if (acc) {
        vault.saveAccount({
          id: accountId,
          total_playtime_seconds: (acc.total_playtime_seconds || 0) + Math.max(0, deltaSeconds),
          last_session_seconds: deltaSeconds > 0 ? deltaSeconds : acc.last_session_seconds,
          last_session_started_at: null,
        });
        if (deltaSeconds > 0) {
          console.log(`[Playtime] ${reason}: +${deltaSeconds}s for ${acc.username} (total: ${(acc.total_playtime_seconds || 0) + deltaSeconds}s)`);
        }
      }
    } catch (err) {
      console.warn('[Playtime] Failed to persist playtime:', err);
    }
  }
  playtimeSessionStart.clear();
  vault.sanitizeActiveSessions();
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    try {
      mainWindow.webContents.send('accounts:updated', vault.getAccounts());
    } catch (_) {}
  }
}

let currentPromptedIdentity: string | null = null;

interface LaunchedAccountSession {
  id: string;
  username: string;
  timestamp: number;
}
let lastLaunchedAccount: LaunchedAccountSession | null = null;

function getAssetPath(filename: string): string {
  if (process.resourcesPath) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', filename);
    if (fs.existsSync(unpacked)) return unpacked;
  }
  const relPath = path.join(__dirname, '../assets', filename);
  if (fs.existsSync(relPath)) return relPath;
  const cwdPath = path.join(process.cwd(), 'assets', filename);
  if (fs.existsSync(cwdPath)) return cwdPath;
  return relPath;
}

function createWindow() {
  const settings = vault.getSettings();
  const DEFAULT_WIDTH = 1350;
  const DEFAULT_HEIGHT = 720;
  const MIN_WIDTH = 680;
  const MIN_HEIGHT = 450;
  let width = DEFAULT_WIDTH;
  let height = DEFAULT_HEIGHT;

  if (settings.window_preset === 'large') {
    width = 1680;
    height = 960;
  }

  const iconPath = getAssetPath('app_icon.ico');
  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    title: 'RankForge',
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    backgroundColor: '#080B10',
    show: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);

  const isDev = !app.isPackaged && (process.env.NODE_ENV === 'development' || process.argv.includes('--dev'));
  const isStartHidden = process.argv.includes('--minimized') || process.argv.includes('--hidden');

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-react/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (!isStartHidden) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!app.isPackaged && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  setTimeout(() => {
    if (!isStartHidden && mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1500);

  mainWindow.on('close', (e) => {
    const currentSettings = vault.getSettings();
    if (!isQuitting && currentSettings.close_to_tray && tray) {
      e.preventDefault();
      mainWindow?.hide();
    } else {
      isQuitting = true;
    }
  });

  createTray();
}

function createTray() {
  if (tray) return;
  try {
    const pngPath = getAssetPath('app_logo_32.png');
    const icoPath = getAssetPath('app_icon.ico');

    let trayIcon: NativeImage | undefined;
    if (fs.existsSync(pngPath)) {
      trayIcon = nativeImage.createFromPath(pngPath).resize({ width: 16, height: 16 });
    } else if (fs.existsSync(icoPath)) {
      trayIcon = nativeImage.createFromPath(icoPath).resize({ width: 16, height: 16 });
    }

    if (!trayIcon || trayIcon.isEmpty()) return;

    tray = new Tray(trayIcon);
    tray.setToolTip('RankForge — Valorant RFR Tracker');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open RankForge',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.setAlwaysOnTop(true);
            mainWindow.focus();
            mainWindow.setAlwaysOnTop(false);
          }
        },
      },
      {
        label: 'Rotate to Next Ready Account',
        click: async () => {
          const accounts = vault.getAccounts().filter((a) => !a.archived);
          const ready = accounts.find((a) => a.first_win_ready && a.level < 20);
          if (ready) {
            lastLaunchedAccount = { id: ready.id, username: ready.username, timestamp: Date.now() };
            await GameLauncher.launchAccount(ready.id, ready.username, ready.password || '', vault.getSettings().riot_client_path);
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit RankForge',
        click: () => {
          isQuitting = true;
          if (tray) {
            try { tray.destroy(); } catch (_) {}
            tray = null;
          }
          if (mainWindow) {
            mainWindow.destroy();
          }
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.error('[Tray] Creation failed:', err);
  }
}

function findMatchingAccount(
  accounts: Account[],
  status: any,
  lastLaunched?: LaunchedAccountSession | null
): Account | undefined {
  if (!status) return undefined;

  // 1. Direct PUUID match on account
  if (status.puuid) {
    const byPuuid = accounts.find((a) => a.puuid && a.puuid === status.puuid);
    if (byPuuid) return byPuuid;
  }

  // 2. Local PUUID mapping from mappings.json
  const mappedUname = status.puuid ? vault.getMapping(status.puuid) : undefined;
  if (mappedUname) {
    const norm = mappedUname.toLowerCase().trim();
    const byMapped = accounts.find((a) => a.username.toLowerCase().trim() === norm);
    if (byMapped) return byMapped;
  }

  // 3. Login username match
  if (status.login_username) {
    const normLogin = status.login_username.toLowerCase().trim();
    const byLogin = accounts.find((a) => a.username.toLowerCase().trim() === normLogin);
    if (byLogin) return byLogin;
  }

  // 4. In-game Riot ID match
  if (status.game_name) {
    const gn = status.game_name.toLowerCase().trim();
    const fullRiotId = status.tag_line ? `${gn}#${status.tag_line.toLowerCase().trim()}` : gn;

    const byRiotId = accounts.find((a) => {
      const accRiotId = a.stats?.riot_id?.toLowerCase().trim();
      const uname = a.username.toLowerCase().trim();
      return accRiotId === fullRiotId || uname === fullRiotId;
    });
    if (byRiotId) return byRiotId;

    const byGameName = accounts.find((a) => a.username.toLowerCase().trim() === gn);
    if (byGameName) return byGameName;
  }

  // 5. Recently launched account via tracker (< 3 mins)
  if (lastLaunched && (Date.now() - lastLaunched.timestamp < 3 * 60 * 1000)) {
    const launchedAcc = accounts.find(
      (a) => a.id === lastLaunched.id || a.username.toLowerCase().trim() === lastLaunched.username.toLowerCase().trim()
    );
    if (launchedAcc) {
      const statusLogin = status.login_username?.toLowerCase().trim();
      const launchedUname = launchedAcc.username.toLowerCase().trim();
      if (statusLogin && statusLogin !== launchedUname) return undefined;
      if (status.puuid && launchedAcc.puuid && status.puuid !== launchedAcc.puuid) return undefined;
      return launchedAcc;
    }
  }

  return undefined;
}

function checkAndNotifyNewAccount(status: any, force = false) {
  if (!status || !status.is_connected) {
    currentPromptedIdentity = null;
    return;
  }

  if (!status.login_username && !status.game_name && !status.puuid) return;

  const identityKey = (
    status.puuid ||
    status.login_username?.toLowerCase().trim() ||
    status.game_name?.toLowerCase().trim()
  );

  if (!identityKey) return;

  const settings = vault.getSettings();
  if (settings.prompt_on_new_account === false) return;

  const accounts = vault.getAccounts();
  const matched = findMatchingAccount(accounts, status, null);

  if (matched && !matched.is_deleted && !matched.archived) {
    if (!force) return;
  }

  const mappedUname = status.puuid ? vault.getMapping(status.puuid) : undefined;
  const detectedLogin = status.login_username || mappedUname || status.game_name || '';
  const loginLower = detectedLogin.toLowerCase().trim();

  const isIgnored = (settings.ignored_accounts || []).some((name) => {
    const n = name.toLowerCase().trim();
    return (
      (loginLower && n === loginLower) ||
      (status.login_username && n === status.login_username.toLowerCase().trim()) ||
      (status.game_name && n === status.game_name.toLowerCase().trim()) ||
      (mappedUname && n === mappedUname.toLowerCase().trim())
    );
  });

  if (isIgnored) return;

  if (!force && currentPromptedIdentity === identityKey) return;
  currentPromptedIdentity = identityKey;

  const isArchived = Boolean(matched?.archived);
  const riotIdStr = status.game_name
    ? `${status.game_name}${status.tag_line ? `#${status.tag_line}` : ''}`
    : undefined;

  const payload = {
    username: detectedLogin,
    riotId: riotIdStr,
    level: status.current_level || 1,
    decimalLevel: status.decimal_level,
    isArchived,
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('riot:newAccountDetected', payload);
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking GitHub Releases for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[AutoUpdater] Update available: v${info.version}`);
    mainWindow?.webContents.send('app:updateAvailable', { version: info.version });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('app:updateProgress', {
      percent: Math.round(progressObj.percent),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[AutoUpdater] Update downloaded: v${info.version}`);
    mainWindow?.webContents.send('app:updateDownloaded', { version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[AutoUpdater] RankForge is up to date: v${info.version}`);
    mainWindow?.webContents.send('app:updateNotAvailable', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Update check error:', err?.message || err);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[AutoUpdater] Initial update check error:', err?.message || err);
    });
  }, 5000);
}

function applyAutoStartSetting(enable: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden'],
    });
  } catch (err) {
    console.warn('[AutoStart] Failed to set openAtLogin:', err);
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.center();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    setupIpcHandlers();
    setupAutoUpdater();

    GameLauncher.onStatus((statusEvent) => {
      mainWindow?.webContents.send('launcher:autoLoginStatus', statusEvent);
    });

    riot.startPolling(4000);

    const initSettings = vault.getSettings();
    if (initSettings.auto_start_windows) {
      applyAutoStartSetting(true);
    }

    riot.on('status-updated', (status) => {
      mainWindow?.webContents.send('riot:statusUpdated', status);
      checkAndNotifyNewAccount(status);

      const isGameRunning = !!status.is_game_running;
      const isConnected = !!status.is_connected;

      if (!isConnected || !isGameRunning) {
        flushPlaytimeSession(!isConnected ? 'Riot Client disconnected' : 'Valorant closed');
      }

      if (!isConnected) {
        lastLaunchedAccount = null;
        currentPromptedIdentity = null;
        statsAutoFetchedThisSession.clear();
        return;
      }
      if (!status.login_username && !status.game_name && !status.puuid) return;

      const allActiveAccounts = vault.getAllRawAccounts().filter((a) => !a.is_deleted);
      const settings = vault.getSettings();
      const matched = findMatchingAccount(allActiveAccounts, status, lastLaunchedAccount);

      if (matched) {
        GameLauncher.notifyLoginSuccess(matched.id, matched.username);

        if (lastLaunchedAccount && matched.id !== lastLaunchedAccount.id) {
          lastLaunchedAccount = null;
        }

        if (matched.puuid && status.puuid && matched.puuid !== status.puuid) {
          console.warn(`[Main] PUUID mismatch! Skipping auto-sync.`);
          return;
        }

        if (status.puuid && !vault.getMapping(status.puuid)) {
          vault.saveMapping(status.puuid, matched.username);
        }

        if (isGameRunning) {
          for (const [activeAccId] of playtimeSessionStart.entries()) {
            if (activeAccId !== matched.id) {
              flushPlaytimeSession('Account switched');
              break;
            }
          }
          vault.sanitizeActiveSessions(matched.id);

          if (!playtimeSessionStart.has(matched.id)) {
            const nowIso = new Date().toISOString();
            playtimeSessionStart.set(matched.id, Date.now());
            try {
              vault.saveAccount({
                id: matched.id,
                last_session_started_at: nowIso,
              });
              mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
            } catch (_) {}
          }
        }

        if (status.current_level !== undefined || status.first_win_available_time !== undefined) {
          const riotId = (status.game_name && status.tag_line) ? `${status.game_name}#${status.tag_line}` : undefined;
          const detectedRegion = status.region || riot.detectRegion();
          const updated = vault.saveAccount({
            id: matched.id,
            puuid: matched.puuid || status.puuid,
            region: detectedRegion || matched.region,
            level: status.current_level ?? matched.level,
            current_xp: status.current_xp !== undefined ? status.current_xp : (matched.current_xp || 0),
            decimal_level: status.decimal_level !== undefined ? status.decimal_level : (status.current_level ? Number((status.current_level + (status.current_xp || 0) / 5000).toFixed(2)) : matched.decimal_level),
            remaining_xp: status.remaining_xp !== undefined ? status.remaining_xp : (status.current_level ? Math.max(0, 100000 - (status.current_level * 5000 + (status.current_xp || 0))) : matched.remaining_xp),
            first_win_available_time: status.first_win_available_time !== undefined ? status.first_win_available_time : matched.first_win_available_time,
            first_win_ready: status.first_win_ready !== undefined ? status.first_win_ready : matched.first_win_ready,
            last_active: new Date().toISOString(),
            archived: matched.archived,
            stats: riotId ? { ...(matched.stats || {}), riot_id: riotId } : matched.stats,
          });

          mainWindow?.webContents.send('accounts:updated', vault.getAccounts());

          if (matched.level < 20 && updated.level >= 20) {
            if (settings.discord_enabled && settings.discord_notify_level_20 && settings.discord_webhook_url) {
              DiscordService.sendLevel20Alert(settings.discord_webhook_url, updated);
            }
          }

          if (settings.discord_enabled && settings.discord_live_dashboard_enabled && settings.discord_webhook_url) {
            DiscordService.updateLiveDashboard(
              settings.discord_webhook_url,
              vault.getAccounts(),
              settings
            ).then((res) => {
              if (res.success && res.messageId && res.messageId !== settings.discord_dashboard_message_id) {
                vault.saveSettings({ discord_dashboard_message_id: res.messageId });
              }
            }).catch(() => {});
          }
        }

        if (status.puuid && matched) {
          const alreadyFetched = statsAutoFetchedThisSession.has(status.puuid);
          const staleStats = !matched.stats?.last_updated ||
            (Date.now() - new Date(matched.stats.last_updated).getTime() > 24 * 60 * 60 * 1000);

          if (!alreadyFetched && staleStats) {
            statsAutoFetchedThisSession.add(status.puuid);
            setTimeout(async () => {
              try {
                const liveStats = await riot.fetchMatchStatsAndMmr();
                if (liveStats) {
                  vault.saveAccount({
                    id: matched.id,
                    stats: { ...matched.stats, ...liveStats },
                  });
                  mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
                }
              } catch (_) {}
            }, 3000);
          }
        }
      }
    });

    riot.on('match-finished', async (data) => {
      mainWindow?.webContents.send('riot:matchFinished', data);

      const accounts = vault.getAccounts();
      const matched = accounts.find((a) => (data.puuid && a.puuid === data.puuid) || a.username === data.accountUsername);

      const settings = vault.getSettings();
      if (settings.discord_enabled && settings.discord_notify_match_finish && settings.discord_webhook_url) {
        DiscordService.sendMatchFinishedAlert(settings.discord_webhook_url, {
          accountUsername: matched?.username || data.accountUsername,
          prevLevel: data.prevLevel,
          level: data.currentLevel,
          xpGained: data.xpGained,
          won: data.isWin,
        });
      }

      if (matched && matched.level < 20 && data.currentLevel >= 20) {
        if (settings.discord_enabled && settings.discord_notify_level_20 && settings.discord_webhook_url) {
          DiscordService.sendLevel20Alert(settings.discord_webhook_url, { ...matched, level: data.currentLevel });
        }
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

function setupIpcHandlers() {
  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  ipcMain.handle('window:close', () => {
    const settings = vault.getSettings();
    if (settings.close_to_tray && tray) {
      mainWindow?.hide();
    } else {
      isQuitting = true;
      if (tray) {
        try { tray.destroy(); } catch (_) {}
        tray = null;
      }
      app.quit();
    }
  });
  ipcMain.handle('window:minimizeToTray', () => {
    if (mainWindow && tray) {
      mainWindow.hide();
    }
  });
  ipcMain.handle('app:quit', () => {
    isQuitting = true;
    if (tray) {
      try { tray.destroy(); } catch (_) {}
      tray = null;
    }
    app.quit();
  });
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false);

  // HUD Mode
  ipcMain.handle('window:enterHudMode', async () => {
    if (!mainWindow) return false;
    if (!isHudMode) {
      wasMaximizedBeforeHud = mainWindow.isMaximized();
      if (wasMaximizedBeforeHud) {
        mainWindow.unmaximize();
        await new Promise((r) => setTimeout(r, 60));
      } else {
        preHudBounds = mainWindow.getBounds();
      }
      isHudMode = true;
    }
    const settings = vault.getSettings();
    const alwaysOnTop = settings.hud_always_on_top ?? true;
    mainWindow.setAlwaysOnTop(alwaysOnTop, 'screen-saver');

    const opacity = typeof settings.hud_opacity === 'number' ? settings.hud_opacity : 0.95;
    mainWindow.setOpacity(Math.max(0.25, Math.min(1.0, opacity)));

    let width = 380;
    let height = 190;
    if (settings.hud_scale === 'compact') {
      width = 330;
      height = 155;
    } else if (settings.hud_scale === 'large') {
      width = 440;
      height = 220;
    }
    mainWindow.setResizable(true);
    mainWindow.setMaximizable(false);
    mainWindow.setMinimumSize(0, 0);
    mainWindow.setMaximumSize(0, 0);
    mainWindow.setMinimumSize(width, height);
    mainWindow.setMaximumSize(width, height);
    mainWindow.setSize(width, height);
    mainWindow.setResizable(false);
    return true;
  });

  ipcMain.handle('window:updateHudConfig', (_, config: { alwaysOnTop?: boolean; scale?: 'compact' | 'normal' | 'large'; opacity?: number }) => {
    if (!mainWindow) return false;
    if (config.alwaysOnTop !== undefined) {
      mainWindow.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver');
    }
    if (isHudMode && config.opacity !== undefined) {
      mainWindow.setOpacity(Math.max(0.25, Math.min(1.0, config.opacity)));
    }
    if (isHudMode && config.scale) {
      let width = 380;
      let height = 190;
      if (config.scale === 'compact') {
        width = 330;
        height = 155;
      } else if (config.scale === 'large') {
        width = 440;
        height = 220;
      }
      mainWindow.setResizable(true);
      mainWindow.setMinimumSize(0, 0);
      mainWindow.setMaximumSize(0, 0);
      mainWindow.setMinimumSize(width, height);
      mainWindow.setMaximumSize(width, height);
      mainWindow.setSize(width, height);
      mainWindow.setResizable(false);
    }
    return true;
  });

  ipcMain.handle('window:exitHudMode', () => {
    if (!mainWindow) return false;
    isHudMode = false;
    mainWindow.setOpacity(1.0);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setResizable(true);
    mainWindow.setMaximizable(true);
    mainWindow.setMinimumSize(0, 0);
    mainWindow.setMaximumSize(0, 0);

    if (wasMaximizedBeforeHud) {
      mainWindow.maximize();
    } else {
      const settings = vault.getSettings();
      let defaultW = 1350;
      let defaultH = 720;
      if (settings.window_preset === 'large') {
        defaultW = 1680;
        defaultH = 960;
      }

      const targetW = Math.max(preHudBounds?.width || defaultW, 680);
      const targetH = Math.max(preHudBounds?.height || defaultH, 450);
      const currentBounds = mainWindow.getBounds();
      const targetX = preHudBounds?.x !== undefined ? preHudBounds.x : currentBounds.x;
      const targetY = preHudBounds?.y !== undefined ? preHudBounds.y : currentBounds.y;

      mainWindow.setBounds({
        x: targetX,
        y: targetY,
        width: targetW,
        height: targetH,
      });
    }

    wasMaximizedBeforeHud = false;
    mainWindow.setMinimumSize(680, 450);
    return true;
  });

  // Accounts
  ipcMain.handle('accounts:getAll', () => vault.getAccounts());
  ipcMain.handle('accounts:save', async (_, account: Partial<Account>) => {
    const saved = vault.saveAccount(account);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return saved;
  });
  ipcMain.handle('accounts:delete', async (_, id: string) => {
    const res = vault.deleteAccount(id);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return res;
  });
  ipcMain.handle('accounts:deleteBatch', async (_, ids: string[]) => {
    const res = vault.deleteBatchAccounts(ids);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return res;
  });
  ipcMain.handle('accounts:archive', async (_, id: string) => {
    const res = vault.archiveAccount(id);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return res;
  });
  ipcMain.handle('accounts:restore', async (_, id: string) => {
    const res = vault.restoreAccount(id);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return res;
  });
  ipcMain.handle('accounts:reorder', (_, ids: string[]) => vault.reorderAccounts(ids));
  ipcMain.handle('accounts:bulkImport', async (_, text: string, region?: string) => {
    const imported = vault.bulkImportAccounts(text, region);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return imported;
  });
  ipcMain.handle('accounts:bulkUpdate', async (_, updates: { id: string; changes: Partial<Account> }[]) => {
    const res = vault.bulkUpdateAccounts(updates);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return res;
  });

  // Trash Bin
  ipcMain.handle('accounts:getTrash', () => vault.getTrashAccounts());
  ipcMain.handle('accounts:restoreTrash', (_, id: string) => {
    const res = vault.restoreTrashAccount(id);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return res;
  });
  ipcMain.handle('accounts:permanentDelete', async (_, id: string) => {
    const res = vault.permanentDeleteAccount(id);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return res;
  });
  ipcMain.handle('accounts:emptyTrash', async () => {
    const res = vault.emptyTrash();
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return res;
  });

  // Vault Export / Import
  ipcMain.handle('vault:export', (_, password: string) => vault.exportEncryptedBackup(password));
  ipcMain.handle('vault:import', async (_, password: string) => {
    const res = vault.importEncryptedBackup(password);
    mainWindow?.webContents.send('accounts:updated', vault.getAccounts());
    return res;
  });

  // Settings
  ipcMain.handle('settings:get', () => vault.getSettings());
  ipcMain.handle('settings:save', async (_, newSettings: Partial<AppSettings>) => {
    const updated = vault.saveSettings(newSettings);
    if (newSettings.auto_start_windows !== undefined) {
      applyAutoStartSetting(newSettings.auto_start_windows);
    }
    return updated;
  });

  // Launcher
  ipcMain.handle('launcher:launchAccount', async (_, id: string) => {
    const accounts = vault.getAccounts();
    const target = accounts.find((a) => a.id === id);
    if (!target) return { success: false, message: 'Account not found' };

    lastLaunchedAccount = { id: target.id, username: target.username, timestamp: Date.now() };
    const settings = vault.getSettings();
    const result = await GameLauncher.launchAccount(
      target.id,
      target.username,
      target.password || '',
      settings.riot_client_path
    );

    if (result.success && settings.auto_copy_password && target.password) {
      clipboard.writeText(target.password);
    }
    return result;
  });
  ipcMain.handle('launcher:abortAutoLogin', () => GameLauncher.abortAutoLogin());
  ipcMain.handle('launcher:killGame', () => GameLauncher.killRunningGame());
  ipcMain.handle('launcher:detectRiotPath', () => GameLauncher.detectRiotClient());
  ipcMain.handle('launcher:selectRiotPath', async () => {
    if (!mainWindow) return { canceled: true };
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select RiotClientServices.exe',
      filters: [{ name: 'Executable', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePath: res.filePaths[0] };
  });
  ipcMain.handle('launcher:validateRiotPath', (_, testPath: string) => GameLauncher.validateRiotPath(testPath));

  // Audio
  ipcMain.handle('audio:selectFile', async (_, type: string) => {
    if (!mainWindow) return { canceled: true };
    const res = await dialog.showOpenDialog(mainWindow, {
      title: `Select Custom ${type === 'victory' ? 'Victory' : 'Defeat'} Sound`,
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg'] }],
      properties: ['openFile'],
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePath: res.filePaths[0] };
  });
  ipcMain.handle('audio:readFile', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath).toString('base64');
      }
    } catch {}
    return null;
  });

  // Riot Live Engine
  ipcMain.handle('riot:getStatus', () => riot.getStatus());
  ipcMain.handle('riot:triggerSync', () => riot.poll());
  ipcMain.handle('riot:checkDetection', () => checkAndNotifyNewAccount(riot.getStatus(), true));
  ipcMain.handle('riot:dismissDetection', () => {
    currentPromptedIdentity = null;
    return true;
  });

  // Discord
  ipcMain.handle('integrations:discordPing', (_, url: string) => DiscordService.sendTestPing(url));
  ipcMain.handle('integrations:discordDigest', (_, accounts: Account[]) => DiscordService.sendRosterDigest(vault.getSettings().discord_webhook_url, accounts));
  ipcMain.handle('integrations:discordLiveDashboard', async (_, accounts: Account[]) => {
    const s = vault.getSettings();
    if (!s.discord_webhook_url) return { success: false, message: 'Discord webhook not configured' };
    return DiscordService.updateLiveDashboard(s.discord_webhook_url, accounts, s);
  });

  // Utilities
  ipcMain.handle('util:copyClipboard', (_, text: string) => clipboard.writeText(text));
  ipcMain.handle('util:openExternal', (_, url: string) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      return shell.openExternal(url);
    }
  });

  // Auto-Updater
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:restartAndInstall', () => {
    autoUpdater.quitAndInstall(true, true);
  });
  ipcMain.handle('app:checkForUpdates', async () => {
    const currentVersion = app.getVersion();
    if (!app.isPackaged) {
      return { status: 'dev', currentVersion, latestVersion: currentVersion, message: 'Running in development mode.' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      const latestVersion = result?.updateInfo?.version || currentVersion;
      return {
        status: 'checked',
        currentVersion,
        latestVersion,
        updateAvailable: latestVersion !== currentVersion,
      };
    } catch (e: any) {
      return { status: 'error', currentVersion, error: e?.message || String(e) };
    }
  });

  app.on('before-quit', () => {
    GameLauncher.abortAutoLogin('App quit');
    flushPlaytimeSession('App quit');
  });

  app.on('will-quit', () => {
    GameLauncher.abortAutoLogin('App will quit');
  });
}
