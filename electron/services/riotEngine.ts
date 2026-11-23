import fs from 'fs';
import path from 'path';
import https from 'https';
import { exec } from 'child_process';
import { EventEmitter } from 'events';
import { RiotStatus, AccountMmrStats, AccountSkinItem } from '../types';

const CLIENT_PLATFORM = "ewogICJwbGF0Zm9ybVR5cGUiOiAiUEMiLAogICJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLAogICJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwKICAicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iCn0=";
const LOCKFILE_PATH = path.join(process.env.LOCALAPPDATA || '', 'Riot Games', 'Riot Client', 'Config', 'lockfile');
const LOG_PATH = path.join(process.env.LOCALAPPDATA || '', 'VALORANT', 'Saved', 'Logs', 'ShooterGame.log');

// Local Riot Client HTTPS agent with self-signed certificate acceptance
const localHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

export class RiotEngine extends EventEmitter {
  private port: string | null = null;
  private password: string | null = null;
  private puuid: string | null = null;
  private accessToken: string | null = null;
  private entitlementsToken: string | null = null;
  private clientVersion = "release-13.05-shipping-11-5350494";

  public isConnected = false;
  public isGameRunning = false;
  public loginUsername = '';
  public gameName = '';
  public tagLine = '';
  public currentLevel = 0;
  public currentXp = 0;
  public decimalLevel = 0;
  public remainingXp = 100000;
  public firstWinAvailableTime: string | null = null;
  public firstWinReady = true;
  public firstWinCountdown = 'Ready';
  public lastSyncTime: string | null = null;
  public statusMessage = 'Initializing Riot Client hook...';

  // Auto-detected ban/flag health status
  public healthStatus: 'clean' | 'flagged' | 'banned' = 'clean';
  public healthReason: string | null = null;
  private healthChecked = false; // only check once per login session

  private pollTimer: NodeJS.Timeout | null = null;
  private lastLogSize = 0;
  private lastXpTuple: [number, number] = [0, 0];
  private lastProcessedMatchId: string | null = null;
  private isPolling = false;
  private cachedRegion: string | null = null;
  private lastUserInfo: any = null;
  // Bug #10 fix: Cache the tasklist check result with a 10-second TTL
  // to reduce process spawns from ~9,600/session to ~2,880/session.
  private lastGameRunningCheck: { result: boolean; timestamp: number } | null = null;
  private static readonly GAME_CHECK_TTL_MS = 10000;

  constructor() {
    super();
    this.refreshClientVersion();
  }

  /**
   * Fetches the official live Riot Client version from valorant-api.com
   */
  public async refreshClientVersion() {
    try {
      const resp = await fetch('https://valorant-api.com/v1/version');
      if (resp.ok) {
        const data: any = await resp.json();
        const ver = data?.data?.riotClientVersion;
        if (ver) {
          this.clientVersion = ver;
        }
      }
    } catch {
      // Keep fallback
    }
  }

  public startPolling(intervalMs = 3000) {
    this.stopPolling();
    this.refreshClientVersion();
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), intervalMs);
  }

  public stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async poll(): Promise<RiotStatus> {
    if (this.isPolling) return this.getStatus();
    this.isPolling = true;

    try {
      const prevGameRunning = this.isGameRunning;
      // Check if VALORANT process is running on every poll cycle
      const gameRunning = await this.checkIfValorantGameRunning();
      this.isGameRunning = gameRunning;

      const lockfile = this.readLockfile();
      if (!lockfile) {
        this.setDisconnected('Riot Client is not running. Launch Riot Client or Valorant.');
        return this.getStatus();
      }

      this.port = lockfile.port;
      this.password = lockfile.password;

      const tokensOk = await this.fetchLocalTokens();
      if (!tokensOk) {
        return this.getStatus();
      }

      // Query account identities and progression
      await this.fetchAccountIdentities();
      await this.fetchProgression();
      this.checkShooterGameLog();

      // If game running status changed while connected (e.g. game closed but client still open)
      if (prevGameRunning !== this.isGameRunning && this.isConnected) {
        this.emit('status-updated', this.getStatus());
      }
    } catch (err: any) {
      this.setDisconnected(`Hook error: ${err?.message || err}`);
    } finally {
      this.isPolling = false;
    }

    return this.getStatus();
  }

  public getStatus(): RiotStatus {
    return {
      is_connected: this.isConnected,
      is_game_running: this.isGameRunning,
      region: this.cachedRegion || this.detectRegion() || undefined,
      puuid: this.puuid || undefined,
      login_username: this.loginUsername || undefined,
      game_name: this.gameName || undefined,
      tag_line: this.tagLine || undefined,
      current_level: this.currentLevel,
      current_xp: this.currentXp,
      decimal_level: this.decimalLevel,
      remaining_xp: this.remainingXp,
      first_win_available_time: this.firstWinAvailableTime,
      first_win_ready: this.firstWinReady,
      first_win_countdown: this.firstWinCountdown,
      last_sync_time: this.lastSyncTime || undefined,
      status_message: this.statusMessage,
      health_status: this.healthStatus,
      health_reason: this.healthReason || undefined,
    };
  }

  private readLockfile(): { port: string; password: string } | null {
    if (!fs.existsSync(LOCKFILE_PATH)) return null;
    try {
      const content = fs.readFileSync(LOCKFILE_PATH, 'utf8').trim();
      const parts = content.split(':');
      if (parts.length >= 5) {
        return { port: parts[2], password: parts[3] };
      }
    } catch {
      // Inaccessible
    }
    return null;
  }

  /**
   * Safe HTTPS helper for Riot's local lockfile API with self-signed certificate acceptance
   */
  private makeLocalRiotRequest(requestPath: string): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.password) return reject(new Error('Lockfile credentials missing'));
      const auth = Buffer.from(`riot:${this.password}`).toString('base64');

      const req = https.request(
        {
          hostname: '127.0.0.1',
          port: Number(this.port),
          path: requestPath,
          method: 'GET',
          agent: localHttpsAgent,
          headers: {
            Authorization: `Basic ${auth}`,
            'User-Agent': 'Valorant-RFR-Tracker-v2',
          },
          timeout: 4000,
        },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            try {
              const json = body ? JSON.parse(body) : {};
              resolve({ status: res.statusCode || 0, data: json });
            } catch {
              resolve({ status: res.statusCode || 0, data: body });
            }
          });
        }
      );

      req.on('error', reject);
      req.end();
    });
  }

  private async fetchLocalTokens(): Promise<boolean> {
    try {
      const res = await this.makeLocalRiotRequest('/entitlements/v1/token');
      if (res.status === 200 && res.data?.accessToken && res.data?.token) {
        const newPuuid = res.data.subject || null;
        if (newPuuid && this.puuid && newPuuid !== this.puuid) {
          console.log(`[RiotEngine] Detected active account switch in Riot Client (${this.puuid} -> ${newPuuid}). Resetting session state.`);
          this.cachedRegion = null;
          this.healthChecked = false;
          this.lastXpTuple = [0, 0];
          this.lastProcessedMatchId = null;
        }
        this.puuid = newPuuid;
        this.accessToken = res.data.accessToken;
        this.entitlementsToken = res.data.token;
        return true;
      } else {
        // Any non-200 or missing tokens indicates Riot Client is signed out
        this.setDisconnected('Riot Client running, but not logged in.');
        return false;
      }
    } catch (err: any) {
      this.setDisconnected('Connecting to Riot Client...');
      return false;
    }
  }

  /**
   * Fetches login username (from userinfo) and in-game Riot ID (from aliases)
   */
  private async fetchAccountIdentities() {
    // 1. Fetch Login Username from RSO userinfo
    try {
      const uinfoRes = await this.makeLocalRiotRequest('/rso-auth/v1/authorization/userinfo');
      if (uinfoRes.status === 200 && uinfoRes.data?.userInfo) {
        const inner = JSON.parse(uinfoRes.data.userInfo);
        this.lastUserInfo = inner;
        const newUname = inner.preferred_username || inner.username || '';
        if (newUname && this.loginUsername && newUname.toLowerCase() !== this.loginUsername.toLowerCase()) {
          console.log(`[RiotEngine] Login username changed (${this.loginUsername} -> ${newUname}). Resetting session state.`);
          this.cachedRegion = null;
          this.healthChecked = false;
          this.lastXpTuple = [0, 0];
          this.lastProcessedMatchId = null;
        }
        this.loginUsername = newUname;
        if (inner.sub) {
          if (this.puuid && inner.sub !== this.puuid) {
            this.cachedRegion = null;
            this.healthChecked = false;
            this.lastXpTuple = [0, 0];
            this.lastProcessedMatchId = null;
          }
          this.puuid = inner.sub;
        }

        // Auto-detect region affinity from RSO Userinfo if not yet locked
        if (!this.cachedRegion) {
          if (inner.country) {
            const c = String(inner.country).toLowerCase();
            if (['usa', 'can', 'mex', 'us', 'ca', 'mx'].includes(c)) {
              this.cachedRegion = 'na';
            }
          }
          if (!this.cachedRegion && inner.affinity?.pp) {
            const pp = String(inner.affinity.pp).toLowerCase();
            if (pp === 'am') this.cachedRegion = 'na';
            else if (pp === 'ap') this.cachedRegion = 'ap';
            else if (pp === 'kr') this.cachedRegion = 'kr';
            else if (pp === 'eu') this.cachedRegion = 'eu';
          }
        }
      }
    } catch {
      // Fallback
    }

    // 2. Fetch Display Game Name & Tag from active alias
    try {
      const aliasRes = await this.makeLocalRiotRequest('/player-account/aliases/v1/active');
      if (aliasRes.status === 200 && aliasRes.data?.game_name) {
        this.gameName = aliasRes.data.game_name;
        this.tagLine = aliasRes.data.tag_line || '';
      }
    } catch {
      // Fallback
    }
  }

  /**
   * Queries Riot's PVP API for real-time account level, XP, and First Win reset timestamp
   */
  private async fetchProgression() {
    if (!this.puuid || !this.accessToken || !this.entitlementsToken) return;

    const initialShard = this.cachedRegion || this.detectRegion() || 'na';
    const candidateShards = [initialShard, 'na', 'eu', 'ap', 'kr', 'latam', 'br'].filter((v, i, a) => a.indexOf(v) === i);

    for (const shard of candidateShards) {
      try {
        const xpUrl = `https://pd.${shard}.a.pvp.net/account-xp/v1/players/${this.puuid}`;
        const resp = await fetch(xpUrl, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'X-Riot-Entitlements-JWT': this.entitlementsToken,
            'X-Riot-ClientVersion': this.clientVersion,
            'X-Riot-ClientPlatform': CLIENT_PLATFORM,
            'User-Agent': `ShooterGame/11 ${this.clientVersion}`,
          },
        });

        if (resp.ok) {
          const data: any = await resp.json();
          const progress = data.Progress || {};
          const isRealProgress = (typeof data.Version === 'number' && data.Version > 0) ||
            (Number(progress.Level) > 1 || Number(progress.XP) > 0) ||
            (Array.isArray(data.History) && data.History.length > 0);

          // If this shard returned an empty stub (Version 0, Level 1, 0 XP, no history) and we have other candidate shards, keep probing
          if (!isRealProgress && candidateShards.length > 1 && shard !== candidateShards[candidateShards.length - 1]) {
            continue;
          }

          this.cachedRegion = shard;
          const prevLevel = this.currentLevel;
          const prevXp = this.currentXp;

          this.currentLevel = Number(progress.Level) || 0;
          this.currentXp = Number(progress.XP) || 0;

          // Exact decimal formula: Level + (XP / 5000)
          this.decimalLevel = Number((this.currentLevel + this.currentXp / 5000).toFixed(2));
          const totalCurrent = this.currentLevel * 5000 + this.currentXp;
          const totalTarget = 20 * 5000;
          this.remainingXp = Math.max(0, totalTarget - totalCurrent);

          // First Win calculation
          this.firstWinAvailableTime = data.NextTimeFirstWinAvailable || null;
          this.calculateFirstWinCooldown();

          const wasConnected = this.isConnected;
          this.isConnected = true;
          this.lastSyncTime = new Date().toLocaleTimeString();
          this.statusMessage = `Connected: ${this.loginUsername || this.gameName || 'Valorant Player'} (Lvl ${this.decimalLevel})`;

          // ── Auto Ban/Flag Detection ────────────────────────────────────────────
          // Run once per login session (not every 3s poll) to avoid API spam
          if (!wasConnected || !this.healthChecked) {
            this.healthChecked = true;
            this.checkAccountHealth().catch(() => {});
          }
          // ──────────────────────────────────────────────────────────────────────

          const currentTuple: [number, number] = [this.currentLevel, this.currentXp];

          if (this.lastXpTuple[0] === 0) {
            // Establish initial baseline on boot / login
            this.lastXpTuple = currentTuple;
            if (Array.isArray(data.History) && data.History.length > 0 && data.History[0]?.ID) {
              this.lastProcessedMatchId = data.History[0].ID;
            }
          } else if (
            currentTuple[0] > this.lastXpTuple[0] ||
            (currentTuple[0] === this.lastXpTuple[0] && currentTuple[1] > this.lastXpTuple[1])
          ) {
            const xpGained = (currentTuple[0] - this.lastXpTuple[0]) * 5000 + (currentTuple[1] - this.lastXpTuple[1]);

            // Determine if the match was a victory or defeat via competitiveupdates & match details
            let won: boolean | undefined = undefined;
            let latestMatchId: string | null = null;

            if (this.puuid && this.accessToken && this.entitlementsToken) {
              try {
                const headers = {
                  Authorization: `Bearer ${this.accessToken}`,
                  'X-Riot-Entitlements-JWT': this.entitlementsToken,
                  'X-Riot-ClientVersion': this.clientVersion,
                  'X-Riot-ClientPlatform': CLIENT_PLATFORM,
                  'User-Agent': `ShooterGame/11 ${this.clientVersion}`,
                };
                const compUrl = `https://pd.${shard}.a.pvp.net/mmr/v1/players/${this.puuid}/competitiveupdates?startIndex=0&endIndex=1`;
                const compRes = await fetch(compUrl, { headers });
                if (compRes.ok) {
                  const compData: any = await compRes.json();
                  latestMatchId = compData?.Matches?.[0]?.MatchID || null;
                  if (latestMatchId) {
                    const detUrl = `https://pd.${shard}.a.pvp.net/match-details/v1/matches/${latestMatchId}`;
                    const detRes = await fetch(detUrl, { headers });
                    if (detRes.ok) {
                      const match: any = await detRes.json();
                      const targetPlayer = (match?.players || []).find((p: any) => p.subject === this.puuid);
                      if (targetPlayer) {
                        const team = (match?.teams || []).find((t: any) => t.teamId === targetPlayer.teamId);
                        if (team && typeof team.won === 'boolean') {
                          won = team.won;
                        }
                      }
                    }
                  }
                }
              } catch (err) {
                console.warn('[RiotEngine] Error resolving match victory/defeat:', err);
              }
            }

            // Fallback check on account-xp XPSources if match details query didn't return
            if (won === undefined && Array.isArray(data.History) && data.History.length > 0 && Array.isArray(data.History[0]?.XPSources)) {
              const sources = data.History[0].XPSources;
              const hasWin = sources.some((s: any) =>
                typeof s?.ID === 'string' && s.ID.toLowerCase().includes('win')
              );
              if (hasWin) won = true;
            }

            const matchKey = latestMatchId || data.History?.[0]?.ID || null;
            // Deduplicate: Never fire match-finished multiple times for the exact same match!
            if (!matchKey || matchKey !== this.lastProcessedMatchId) {
              if (matchKey) {
                this.lastProcessedMatchId = matchKey;
              }
              console.log(`[RiotEngine] Match outcome resolved for ${this.loginUsername || this.gameName}: ${won ? '🏆 VICTORY' : '💀 DEFEAT'} (${matchKey || 'Match'})`);

              this.emit('match-finished', {
                timestamp: new Date().toISOString(),
                level: this.decimalLevel,
                prevLevel,
                prevXp,
                currentLevel: this.currentLevel,
                currentXp: this.currentXp,
                xpGained,
                accountUsername: this.loginUsername || this.gameName,
                puuid: this.puuid || undefined,
                won,
                isWin: won,
              });
            }

            this.lastXpTuple = currentTuple;
          } else {
            this.lastXpTuple = currentTuple;
          }

          this.emit('status-updated', this.getStatus());
          break; // successfully fetched progression on this shard
        } else if (resp.status === 403) {
          // 403 on the XP endpoint = hardware/account ban
          const body = await resp.json().catch(() => ({})) as any;
          const reason = body?.errorCode || body?.message || 'ACCOUNT_BAN';
          this.healthStatus = 'banned';
          this.healthReason = reason;
          this.healthChecked = true;
          this.emit('health-detected', {
            username: this.loginUsername || this.gameName,
            puuid: this.puuid,
            health: 'banned',
            reason,
          });
          break;
        } else if (resp.status === 401) {
          this.setDisconnected('Riot session expired or signed out.');
          break;
        }
      } catch (err: any) {
        // Continue to next candidate shard
      }
    }
  }

  public detectRegionFromLogs(): string {
    const logDir = path.join(process.env.LOCALAPPDATA || '', 'VALORANT', 'Saved', 'Logs');
    const logFiles: string[] = [];
    if (fs.existsSync(LOG_PATH)) logFiles.push(LOG_PATH);

    if (fs.existsSync(logDir)) {
      try {
        const extraLogs = fs.readdirSync(logDir)
          .filter(f => f.startsWith('ShooterGame') && f.endsWith('.log'))
          .map(f => path.join(logDir, f))
          .sort((a, b) => {
            try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
          });
        for (const el of extraLogs) {
          if (!logFiles.includes(el)) logFiles.push(el);
        }
      } catch {}
    }

    for (const file of logFiles) {
      if (!fs.existsSync(file)) continue;
      try {
        const stat = fs.statSync(file);
        if (stat.size > 0) {
          const bytesToRead = Math.min(stat.size, 524288);
          const buffer = Buffer.alloc(bytesToRead);
          const fd = fs.openSync(file, 'r');
          fs.readSync(fd, buffer, 0, bytesToRead, Math.max(0, stat.size - bytesToRead));
          fs.closeSync(fd);
          const content = buffer.toString('utf8');

          // 1. Check for pd.{shard}.a.pvp.net
          const pdMatches = content.match(/https:\/\/pd\.([a-z0-9\-]+)\.a\.pvp\.net/gi);
          if (pdMatches && pdMatches.length > 0) {
            for (let i = pdMatches.length - 1; i >= 0; i--) {
              const m = pdMatches[i].match(/https:\/\/pd\.([a-z0-9\-]+)\.a\.pvp\.net/i);
              if (m && m[1]) {
                const shard = m[1].toLowerCase();
                if (['na', 'eu', 'ap', 'kr', 'latam', 'br'].includes(shard)) {
                  this.cachedRegion = shard;
                  return shard;
                }
              }
            }
          }

          // 2. Check for glz-{cluster}.{shard}.a.pvp.net (e.g. glz-na-1.na.a.pvp.net)
          const glzMatches = content.match(/https:\/\/glz-[a-z0-9\-]+\.([a-z0-9\-]+)\.a\.pvp\.net/gi);
          if (glzMatches && glzMatches.length > 0) {
            for (let i = glzMatches.length - 1; i >= 0; i--) {
              const m = glzMatches[i].match(/https:\/\/glz-[a-z0-9\-]+\.([a-z0-9\-]+)\.a\.pvp\.net/i);
              if (m && m[1]) {
                const shard = m[1].toLowerCase();
                if (['na', 'eu', 'ap', 'kr', 'latam', 'br'].includes(shard)) {
                  this.cachedRegion = shard;
                  return shard;
                }
              }
            }
          }
        }
      } catch {}
    }
    return '';
  }

  public detectRegion(): string {
    if (this.cachedRegion) return this.cachedRegion;

    const fromLogs = this.detectRegionFromLogs();
    if (fromLogs) {
      this.cachedRegion = fromLogs;
      return fromLogs;
    }

    if (this.lastUserInfo) {
      if (this.lastUserInfo.country) {
        const c = String(this.lastUserInfo.country).toLowerCase();
        if (['usa', 'can', 'mex', 'us', 'ca', 'mx'].includes(c)) {
          this.cachedRegion = 'na';
          return 'na';
        }
      }
      if (this.lastUserInfo.affinity?.pp) {
        const pp = String(this.lastUserInfo.affinity.pp).toLowerCase();
        if (pp === 'am') { this.cachedRegion = 'na'; return 'na'; }
        if (pp === 'ap') { this.cachedRegion = 'ap'; return 'ap'; }
        if (pp === 'kr') { this.cachedRegion = 'kr'; return 'kr'; }
        if (pp === 'eu') { this.cachedRegion = 'eu'; return 'eu'; }
      }
    }

    return 'eu';
  }

  private calculateFirstWinCooldown() {
    if (!this.firstWinAvailableTime) {
      this.firstWinReady = true;
      this.firstWinCountdown = 'READY (+1,000 AP)';
      return;
    }

    const resetMs = new Date(this.firstWinAvailableTime).getTime();
    const nowMs = Date.now();
    const diffSec = Math.floor((resetMs - nowMs) / 1000);

    if (diffSec <= 0) {
      this.firstWinReady = true;
      this.firstWinCountdown = 'READY (+1,000 AP)';
    } else {
      this.firstWinReady = false;
      const hours = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      this.firstWinCountdown = `Resets in ${hours}h ${mins}m ${secs}s`;
    }
  }

  private checkShooterGameLog() {
    if (!fs.existsSync(LOG_PATH)) return;
    try {
      const stat = fs.statSync(LOG_PATH);
      if (this.lastLogSize === 0) {
        this.lastLogSize = stat.size;
        return;
      }

      if (stat.size < this.lastLogSize) {
        // Log file was rotated or truncated by game launch
        this.lastLogSize = stat.size;
        return;
      }

      if (stat.size > this.lastLogSize) {
        const stream = fs.createReadStream(LOG_PATH, {
          start: this.lastLogSize,
          end: stat.size,
          encoding: 'utf8',
        });
        let buffer = '';
        stream.on('data', (chunk) => (buffer += chunk));
        stream.on('end', () => {
          this.lastLogSize = stat.size;
          // In Valorant, match progression events are marked with AccountXP_GetPlayer or ares-account-xp
          if (buffer.includes('AccountXP_GetPlayer') || buffer.includes('ares-account-xp')) {
            // Re-fetch progression with slight delay for Riot API update
            setTimeout(() => this.fetchProgression(), 1200);
          }
        });
      }
    } catch {
      // Silent
    }
  }

  private checkIfValorantGameRunning(): Promise<boolean> {
    // Bug #10 fix: Return cached result if checked within the last 10 seconds
    if (
      this.lastGameRunningCheck &&
      Date.now() - this.lastGameRunningCheck.timestamp < RiotEngine.GAME_CHECK_TTL_MS
    ) {
      return Promise.resolve(this.lastGameRunningCheck.result);
    }

    return new Promise((resolve) => {
      exec('tasklist /FI "IMAGENAME eq VALORANT*" /NH', { windowsHide: true }, (err, stdout) => {
        const running = !err && !!stdout && stdout.includes('VALORANT');
        this.lastGameRunningCheck = { result: running, timestamp: Date.now() };
        resolve(running);
      });
    });
  }

  private setDisconnected(message: string) {
    this.lastGameRunningCheck = null; // Bug #10: Force re-check on next poll
    const wasConnected = this.isConnected;
    const wasGameRunning = this.isGameRunning;
    this.isConnected = false;
    this.isGameRunning = false;
    this.accessToken = null;
    this.entitlementsToken = null;
    this.puuid = null;
    this.loginUsername = '';
    this.gameName = '';
    this.tagLine = '';
    this.currentLevel = 0;
    this.currentXp = 0;
    this.decimalLevel = 0;
    this.remainingXp = 100000;
    this.firstWinAvailableTime = null;
    this.firstWinReady = true;
    this.firstWinCountdown = 'Ready';
    this.cachedRegion = null;
    this.healthChecked = false; // reset so next login re-checks health
    this.lastXpTuple = [0, 0];
    this.lastProcessedMatchId = null;
    this.statusMessage = message;

    if (wasConnected || wasGameRunning) {
      this.emit('status-updated', this.getStatus());
    }
  }

  /**
   * Queries Riot's restrictions endpoints to auto-detect bans/flags:
   * 1. https://pd.{shard}.a.pvp.net/restrictions/v1/activeFutureInterventions
   * 2. https://pd.{shard}.a.pvp.net/restrictions/v3/penalties
   * Maps active intervention types to health_status: 'clean' | 'flagged' | 'banned'
   * Emits 'health-detected' event with result for main.ts to update the account record.
   */
  private async checkAccountHealth(): Promise<void> {
    if (!this.accessToken || !this.entitlementsToken) return;

    const shard = this.detectRegionFromLogs() || 'eu';
    let detectedHealth: 'clean' | 'flagged' | 'banned' = 'clean';
    let detectedReason: string | null = null;

    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'X-Riot-Entitlements-JWT': this.entitlementsToken,
      'X-Riot-ClientVersion': this.clientVersion,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'User-Agent': `ShooterGame/11 ${this.clientVersion}`,
    };

    // 1. Primary: activeFutureInterventions endpoint (returns live active game restrictions)
    try {
      const interventionsUrl = `https://pd.${shard}.a.pvp.net/restrictions/v1/activeFutureInterventions`;
      const resp = await fetch(interventionsUrl, { headers });

      if (resp.ok) {
        const data: any = await resp.json();
        const categories = data?.InterventionsByCategory || [];
        for (const cat of categories) {
          const active = cat?.ActiveInterventions || [];
          for (const inter of active) {
            const name = inter?.InterventionName || '';
            const expiry = inter?.Expiry ? new Date(inter.Expiry).getTime() : 0;
            // Only count active, unexpired interventions
            if (expiry > Date.now()) {
              if (/gameBan|permBan|hardwareBan|accountBan/i.test(name)) {
                detectedHealth = 'banned';
                detectedReason = name;
                break;
              } else {
                detectedHealth = 'flagged';
                detectedReason = name;
              }
            }
          }
          if (detectedHealth === 'banned') break;
        }
      } else if (resp.status === 403) {
        detectedHealth = 'banned';
        detectedReason = 'ACCESS_FORBIDDEN';
      }
    } catch {
      // Continue to secondary check
    }

    // 2. Secondary: restrictions/v3/penalties endpoint
    if (detectedHealth !== 'banned') {
      try {
        const penaltiesUrl = `https://pd.${shard}.a.pvp.net/restrictions/v3/penalties`;
        const resp = await fetch(penaltiesUrl, { headers });

        if (resp.ok) {
          const data: any = await resp.json();
          const penalties = data?.Penalties || [];
          for (const p of penalties) {
            const expiry = p?.Expiry ? new Date(p.Expiry).getTime() : 0;
            if (expiry > Date.now()) {
              if (p.GameBanEffect) {
                detectedHealth = 'banned';
                detectedReason = 'GameBanEffect';
                break;
              } else if (p.QueueRestrictionEffect || p.QueueDelayEffect || p.PremierRestrictionEffect) {
                if (detectedHealth === 'clean') {
                  detectedHealth = 'flagged';
                  detectedReason = p.QueueRestrictionEffect
                    ? 'QueueRestriction'
                    : p.QueueDelayEffect
                    ? 'QueueDelay'
                    : 'PremierRestriction';
                }
              }
            }
          }
        }
      } catch {
        // Silent
      }
    }

    // Update status and emit event so main.ts updates the vault and renderer
    this.healthStatus = detectedHealth;
    this.healthReason = detectedReason;
    this.emit('health-detected', {
      username: this.loginUsername || this.gameName,
      puuid: this.puuid,
      health: detectedHealth,
      reason: detectedReason,
    });
    console.log(`[RiotEngine] Health check: ${this.loginUsername || this.gameName} → ${detectedHealth}${detectedReason ? ` (${detectedReason})` : ''}`);
  }

  /**
   * Fetches recent matches and computes estimated MMR, KD, ADR, HS%, ACS, and Win Rate.
   */
  public async fetchMatchStatsAndMmr(targetPuuid?: string): Promise<AccountMmrStats | null> {
    const puuid = targetPuuid || this.puuid;
    if (!puuid || !this.accessToken || !this.entitlementsToken) {
      return null;
    }

    const shard = this.detectRegionFromLogs() || 'eu';
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'X-Riot-Entitlements-JWT': this.entitlementsToken,
      'X-Riot-ClientVersion': this.clientVersion,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'User-Agent': `ShooterGame/11 ${this.clientVersion}`,
    };

    try {
      // ─────────────────────────────────────────────────────────────────────
      // TIER 1: Local Riot Client MMR endpoint (most accurate, zero risk)
      //   Reads from the running Riot Client process via the lockfile port —
      //   the same technique used by Blitz.gg, Tracker.gg overlay, etc.
      //   Riot explicitly allows read-only local-client access for companions.
      // ─────────────────────────────────────────────────────────────────────
      let localMmrTier: number | null = null;
      let localMmrRr: number | null = null;
      let localMmrLabel: string | null = null;
      let localPeakTier: number | null = null;

      try {
        const localRes = await this.makeLocalRiotRequest(`/mmr/v1/players/${puuid}`);
        if (localRes.status === 200 && localRes.data) {
          const parsed = this.parseMmrPayload(localRes.data);
          localMmrTier = parsed.tier;
          localMmrRr = parsed.rr;
          localPeakTier = parsed.peakTier;
        }
      } catch {
        // Local endpoint unavailable — proceed to Tier 2
      }

      // ─────────────────────────────────────────────────────────────────────
      // TIER 2: PD server MMR & Competitive Updates endpoints across shards
      // ─────────────────────────────────────────────────────────────────────
      let pdMmrTier: number | null = null;
      let pdMmrRr: number | null = null;
      let pdPeakTier: number | null = null;

      const detectedShard = this.cachedRegion || shard;
      const candidateShards = [detectedShard, 'na', 'eu', 'ap', 'kr', 'latam', 'br'].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      for (const s of candidateShards) {
        if (localMmrTier !== null && pdPeakTier !== null) break;

        // Try direct MMR endpoint on shard s
        if (localMmrTier === null && pdMmrTier === null) {
          try {
            const pdMmrUrl = `https://pd.${s}.a.pvp.net/mmr/v1/players/${puuid}`;
            const pdRes = await fetch(pdMmrUrl, { headers });
            if (pdRes.ok) {
              const pd: any = await pdRes.json();
              const parsed = this.parseMmrPayload(pd);
              if (parsed.tier !== null) pdMmrTier = parsed.tier;
              if (parsed.rr !== null) pdMmrRr = parsed.rr;
              if (parsed.peakTier !== null && (pdPeakTier === null || parsed.peakTier > pdPeakTier)) {
                pdPeakTier = parsed.peakTier;
              }
              if (parsed.tier !== null || (typeof pd.Version === 'number' && pd.Version > 0)) {
                this.cachedRegion = s;
                break;
              }
            }
          } catch {}
        }

        // Check competitive updates history on shard s for current & peak tier
        try {
          const compUrl = `https://pd.${s}.a.pvp.net/mmr/v1/players/${puuid}/competitiveupdates?startIndex=0&endIndex=20`;
          const compRes = await fetch(compUrl, { headers });
          if (compRes.ok) {
            const compData: any = await compRes.json();
            const matches = compData?.Matches || [];
            if (matches.length > 0) {
              this.cachedRegion = s;
              const latest = matches[0];
              if (pdMmrTier === null && typeof latest.TierAfterUpdate === 'number' && latest.TierAfterUpdate >= 3) {
                pdMmrTier = latest.TierAfterUpdate;
                pdMmrRr = typeof latest.RankedRatingAfterUpdate === 'number' ? latest.RankedRatingAfterUpdate : 0;
              }

              // Scan all recent matches to discover peak tier
              for (const m of matches) {
                if (typeof m.TierAfterUpdate === 'number' && m.TierAfterUpdate >= 3) {
                  if (pdPeakTier === null || m.TierAfterUpdate > pdPeakTier) {
                    pdPeakTier = m.TierAfterUpdate;
                  }
                }
                if (typeof m.TierBeforeUpdate === 'number' && m.TierBeforeUpdate >= 3) {
                  if (pdPeakTier === null || m.TierBeforeUpdate > pdPeakTier) {
                    pdPeakTier = m.TierBeforeUpdate;
                  }
                }
              }
              break; // Found active competitive match history on shard s!
            }
          }
        } catch {}
      }

      // Resolve best direct-rank source
      const resolvedTier = localMmrTier ?? pdMmrTier;
      const resolvedRr   = localMmrRr   ?? pdMmrRr;
      let resolvedPeak   = localPeakTier ?? pdPeakTier;

      // Invariant safeguard: Peak tier can NEVER be lower than current tier!
      if (resolvedTier !== null && (resolvedPeak === null || resolvedTier > resolvedPeak)) {
        resolvedPeak = resolvedTier;
      }

      // ─────────────────────────────────────────────────────────────────────
      // TIER 3: Match history combat stats — used when account is unranked
      //   (fresh grinder smurf). We still pull match history for the
      //   combat stats (KD/ADR/ACS/HS%) regardless of rank resolution,
      //   because those numbers are always useful in the dossier.
      //
      //   For lobby MMR: averages competitiveTier of ALL players in the
      //   last 10 matches (not 5) and filters out tier=0 (Unranked) so
      //   ranked smurfs in Skirmish/Unrated lobbies are properly captured.
      //   Recent matches are weighted 2x so the estimate stays current.
      // ─────────────────────────────────────────────────────────────────────
      let totalKills = 0;
      let totalDeaths = 0;
      let totalAssists = 0;
      let totalScore = 0;
      let totalRounds = 0;
      let totalDamage = 0;
      let totalHeadshots = 0;
      let totalBodyshots = 0;
      let totalLegshots = 0;
      let wins = 0;
      let matchesAnalyzed = 0;
      const weightedLobbyTiers: number[] = []; // weighted by recency
      const modeCounts: Record<string, number> = {};

      try {
        const historyUrl = `https://pd.${shard}.a.pvp.net/match-history/v1/history/${puuid}?startIndex=0&endIndex=10`;
        const histResp = await fetch(historyUrl, { headers });
        if (histResp.ok) {
          const histData: any = await histResp.json();
          const matchEntries: any[] = histData?.History || [];

          for (let i = 0; i < Math.min(matchEntries.length, 10); i++) {
            const entry = matchEntries[i];
            const matchId = entry.MatchID;
            if (!matchId) continue;

            // Weight: most recent 3 matches count double
            const recencyWeight = i < 3 ? 2 : 1;

            try {
              const detailUrl = `https://pd.${shard}.a.pvp.net/match-details/v1/matches/${matchId}`;
              const detResp = await fetch(detailUrl, { headers });
              if (!detResp.ok) continue;

              const match: any = await detResp.json();
              const players: any[] = match?.players || [];
              const targetPlayer = players.find((p) => p.subject === puuid);
              if (!targetPlayer) continue;

              matchesAnalyzed++;
              const pStats = targetPlayer.stats || {};
              let rounds = pStats.roundsPlayed || 0;
              if (rounds === 0) {
                rounds = match.roundResults?.length || 1;
              }
              totalRounds   += rounds;
              totalKills    += pStats.kills   || 0;
              totalDeaths   += pStats.deaths  || 0;
              totalAssists  += pStats.assists || 0;
              totalScore    += pStats.score   || 0;

              const team = (match.teams || []).find((t: any) => t.teamId === targetPlayer.teamId);
              if (team?.won) wins++;

              // Track game mode (Skirmish, Swiftplay, Team Deathmatch, Retake, etc.)
              const queueId = (match.matchInfo?.queueID || entry.QueueID || '').toLowerCase();
              const gameMode = (match.matchInfo?.gameMode || '').toLowerCase();

              let detectedMode = 'Other';
              if (queueId.includes('skirmish') || gameMode.includes('skirmish')) {
                detectedMode = 'Skirmish';
              } else if (queueId.includes('swiftplay') || gameMode.includes('swiftplay')) {
                detectedMode = 'Swiftplay';
              } else if (queueId === 'hurm' || queueId.includes('tdm') || gameMode.includes('hurm') || gameMode.includes('deathmatchteam')) {
                detectedMode = 'Team Deathmatch';
              } else if (queueId.includes('retake') || gameMode.includes('retake')) {
                detectedMode = 'Retake';
              } else if (queueId === 'competitive') {
                detectedMode = 'Competitive';
              } else if (queueId === 'unrated') {
                detectedMode = 'Unrated';
              } else if (queueId === 'deathmatch') {
                detectedMode = 'Deathmatch';
              }
              modeCounts[detectedMode] = (modeCounts[detectedMode] || 0) + 1;

              // Collect ranked players from the lobby (any tier >= 3 = placed rank)
              // This catches ranked smurfs stomping Skirmish/Unrated lobbies
              for (const p of players) {
                const pt = p.competitiveTier;
                if (typeof pt === 'number' && pt >= 3) {
                  for (let w = 0; w < recencyWeight; w++) {
                    weightedLobbyTiers.push(pt);
                  }
                }
              }

              // Damage & hit distribution
              let matchDamage = 0;
              let matchHeadshots = 0;
              let matchBodyshots = 0;
              let matchLegshots = 0;

              // 1. Check roundResults playerStats.damage (standard defusal modes: Swiftplay, Competitive, Unrated)
              const roundResults: any[] = match?.roundResults || [];
              for (const rr of roundResults) {
                const pRound = (rr.playerStats || []).find((ps: any) => ps.subject === puuid);
                if (pRound && Array.isArray(pRound.damage)) {
                  for (const d of pRound.damage) {
                    matchDamage    += d.damage    || 0;
                    matchHeadshots += d.headshots || 0;
                    matchBodyshots += d.bodyshots || 0;
                    matchLegshots  += d.legshots  || 0;
                  }
                }
              }

              // 2. Check targetPlayer.roundDamage fallback
              if (matchDamage === 0 && Array.isArray(targetPlayer.roundDamage)) {
                for (const rd of targetPlayer.roundDamage) {
                  matchDamage += rd.damage || 0;
                }
              }

              // 3. Skirmish & Arcade modes where Riot omits raw bullet damage & hitboxes:
              // In Skirmish (2v2 duel elimination), players have 150 HP (100 HP + 50 heavy shields) with abilities disabled.
              // Riot's match payload leaves playerStats.damage empty ([]).
              // Derive real combat damage from lethal kills (~145-150 HP), assists (~60 HP), or Combat Score (65% of score):
              if (matchDamage === 0 && (pStats.kills > 0 || pStats.score > 0)) {
                const kills = pStats.kills || 0;
                const assists = pStats.assists || 0;
                const score = pStats.score || 0;
                const derivedFromKills = (kills * 145) + (assists * 60);
                const derivedFromScore = rounds > 0 ? Math.round(score * 0.65) : 0;
                matchDamage = Math.max(derivedFromKills, derivedFromScore);
              }

              totalDamage    += matchDamage;
              totalHeadshots += matchHeadshots;
              totalBodyshots += matchBodyshots;
              totalLegshots  += matchLegshots;
            } catch {
              // Skip failed match detail fetch
            }
          }
        }
      } catch {
        // Match history unavailable
      }

      if (matchesAnalyzed === 0 && resolvedTier === null) return null;

      // ─────────────────────────────────────────────────────────────────────
      // Compute combat metrics
      // ─────────────────────────────────────────────────────────────────────
      const kd      = Number((totalKills / Math.max(1, totalDeaths)).toFixed(2));
      const adr     = Math.round(totalDamage / Math.max(1, totalRounds));
      const totalHits = totalHeadshots + totalBodyshots + totalLegshots;
      // If no hitboxes were recorded by Riot (e.g. Skirmish), leave hs_pct undefined instead of misleading 0%
      const hsPct   = totalHits > 0 ? Number(((totalHeadshots / totalHits) * 100).toFixed(1)) : undefined;
      const acs     = Math.round(totalScore / Math.max(1, totalRounds));
      const winRate = matchesAnalyzed > 0 ? Math.round((wins / matchesAnalyzed) * 100) : 0;

      // Determine primary game mode from analyzed history
      let primaryMode = 'Skirmish (2v2)';
      let maxModeCount = 0;
      for (const [modeName, count] of Object.entries(modeCounts)) {
        if (count > maxModeCount) {
          maxModeCount = count;
          primaryMode = modeName === 'Skirmish' ? 'Skirmish (2v2)' : modeName;
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Final MMR resolution — priority order:
      //   1. Local /mmr endpoint (exact current rank)
      //   2. PD /mmr endpoint (exact current rank)
      //   3. Weighted lobby tier average (catches ranked smurfs in lobbies)
      //   4. Combat metric heuristic (only if zero ranked players seen)
      // ─────────────────────────────────────────────────────────────────────
      const tierNames = [
        'Unranked', 'Unranked', 'Unranked',          // 0-2
        'Iron 1', 'Iron 2', 'Iron 3',                // 3-5
        'Bronze 1', 'Bronze 2', 'Bronze 3',          // 6-8
        'Silver 1', 'Silver 2', 'Silver 3',          // 9-11
        'Gold 1', 'Gold 2', 'Gold 3',                // 12-14
        'Platinum 1', 'Platinum 2', 'Platinum 3',    // 15-17
        'Diamond 1', 'Diamond 2', 'Diamond 3',       // 18-20
        'Ascendant 1', 'Ascendant 2', 'Ascendant 3', // 21-23
        'Immortal 1', 'Immortal 2', 'Immortal 3',   // 24-26
        'Radiant',                                    // 27
      ];

      let estimatedTier: number;
      let mmrSource: 'direct' | 'lobby' | 'heuristic' = 'heuristic';

      if (resolvedTier !== null) {
        // Tier 1/2 — exact rank from Riot's official MMR data
        estimatedTier = resolvedTier;
        mmrSource = 'direct';
      } else if (weightedLobbyTiers.length >= 4) {
        // Tier 3a — smart lobby estimation with performance modifier
        // Sort lobby tiers to eliminate low outliers (casual party members in unrated)
        const sortedTiers = [...weightedLobbyTiers].sort((a, b) => a - b);
        
        // Take the 65th percentile of the lobby as the baseline skill tier
        const p65Index = Math.min(sortedTiers.length - 1, Math.floor(sortedTiers.length * 0.65));
        const lobbyBenchmark = sortedTiers[p65Index];

        // Performance adjustment based on player's combat impact in those lobbies
        let perfDelta = 0;
        if (kd >= 1.8 || acs >= 280 || adr >= 180) {
          perfDelta = 3; // Smurf carrying lobby hard -> +3 tiers
        } else if (kd >= 1.4 || acs >= 240 || adr >= 155) {
          perfDelta = 2; // High-impact fragger -> +2 tiers
        } else if (kd >= 1.15 || acs >= 210 || adr >= 138) {
          perfDelta = 1; // Above average -> +1 tier
        } else if (kd <= 0.70 || acs <= 125 || adr <= 80) {
          perfDelta = -2; // Struggling heavily -> -2 tiers
        } else if (kd <= 0.88 || acs <= 150 || adr <= 98) {
          perfDelta = -1; // Underperforming -> -1 tier
        }

        estimatedTier = Math.min(27, Math.max(3, Math.round(lobbyBenchmark + perfDelta)));
        mmrSource = 'lobby';
      } else {
        // Tier 3b — full-spectrum combat heuristic covering all rank varieties (Iron 1 to Radiant)
        estimatedTier = this.estimateTierFromCombatStats(kd, adr, acs, hsPct || 0, winRate);
        mmrSource = 'heuristic';
      }

      const estimatedMmr = tierNames[estimatedTier] || 'Unranked';
      const peakMmr = resolvedPeak != null ? (tierNames[resolvedPeak] || undefined) : undefined;

      // Build label with RR if we have direct source
      if (resolvedTier !== null && resolvedRr !== null) {
        localMmrLabel = `${estimatedMmr} (${resolvedRr} RR)`;
      }

      // Recent unique lobby ranks for display
      const recentRanks = Array.from(
        new Set(weightedLobbyTiers.map((t) => tierNames[t] || `Tier ${t}`))
      ).slice(0, 5);

      const stats: AccountMmrStats = {
        estimated_mmr: localMmrLabel || estimatedMmr,
        mmr_tier: estimatedTier,
        kd,
        adr,
        hs_pct: hsPct,
        acs,
        win_rate: winRate,
        matches_analyzed: matchesAnalyzed,
        total_kills: totalKills,
        total_deaths: totalDeaths,
        riot_id: this.gameName ? `${this.gameName}${this.tagLine ? `#${this.tagLine}` : ''}` : undefined,
        recent_lobby_ranks: recentRanks.length > 0 ? recentRanks : undefined,
        peak_mmr: peakMmr,
        mmr_source: mmrSource,
        primary_mode: primaryMode,
        mode_breakdown: Object.keys(modeCounts).length > 0 ? modeCounts : undefined,
        last_updated: new Date().toISOString(),
      };

      return stats;
    } catch (err) {
      console.warn('[RiotEngine] fetchMatchStatsAndMmr error:', err);
      return null;
    }
  }

  /**
   * Safely parses Riot MMR payload across all official and companion API formats.
   */
  private parseMmrPayload(d: any): { tier: number | null; rr: number | null; peakTier: number | null } {
    if (!d || typeof d !== 'object') return { tier: null, rr: null, peakTier: null };

    let tier: number | null = null;
    let rr: number | null = null;
    let peakTier: number | null = null;

    // 1. Check LatestCompetitiveUpdate (official Riot PD / LCU schema)
    if (d.LatestCompetitiveUpdate) {
      const lcu = d.LatestCompetitiveUpdate;
      if (typeof lcu.TierAfterUpdate === 'number' && lcu.TierAfterUpdate >= 3) {
        tier = lcu.TierAfterUpdate;
        rr = typeof lcu.RankedRatingAfterUpdate === 'number' ? lcu.RankedRatingAfterUpdate : null;
      }
    }

    // 2. Check QueueSkills.competitive.SeasonalInfoBySeasonID
    const compSkill = d.QueueSkills?.competitive;
    const seasonalMap = compSkill?.SeasonalInfoBySeasonID;
    if (seasonalMap && typeof seasonalMap === 'object') {
      const seasons = Object.values(seasonalMap) as any[];
      for (const s of seasons) {
        const sTier = typeof s?.CompetitiveTier === 'number' ? s.CompetitiveTier : (typeof s?.Rank === 'number' ? s.Rank : null);
        if (sTier !== null && sTier >= 3) {
          if (peakTier === null || sTier > peakTier) {
            peakTier = sTier;
          }
        }
        if (typeof s?.CapIntervalTier === 'number' && s.CapIntervalTier >= 3) {
          if (peakTier === null || s.CapIntervalTier > peakTier) {
            peakTier = s.CapIntervalTier;
          }
        }
        // WinsByTier dictionary: keys are competitive tier numbers!
        if (s?.WinsByTier && typeof s.WinsByTier === 'object') {
          for (const tierKey of Object.keys(s.WinsByTier)) {
            const wTier = parseInt(tierKey, 10);
            if (!isNaN(wTier) && wTier >= 3) {
              if (peakTier === null || wTier > peakTier) {
                peakTier = wTier;
              }
            }
          }
        }
      }

      // If tier was not in LatestCompetitiveUpdate (e.g. latest match was unrated), find latest season with ranked games
      if (tier === null) {
        const active = seasons.filter((s) => {
          const t = typeof s?.CompetitiveTier === 'number' ? s.CompetitiveTier : (typeof s?.Rank === 'number' ? s.Rank : null);
          return t !== null && t >= 3 && (s?.NumberOfGames > 0 || s?.NumberOfWins > 0 || s?.GamesNeededForRating === 0);
        });
        if (active.length > 0) {
          const currentSeason = active[active.length - 1];
          tier = typeof currentSeason.CompetitiveTier === 'number' ? currentSeason.CompetitiveTier : currentSeason.Rank;
          rr = typeof currentSeason.RankedRating === 'number' ? currentSeason.RankedRating : null;
        }
      }
    }

    // 2b. Check TotalWinsByTier on QueueSkills.competitive
    if (compSkill?.TotalWinsByTier && typeof compSkill.TotalWinsByTier === 'object') {
      for (const tierKey of Object.keys(compSkill.TotalWinsByTier)) {
        const wTier = parseInt(tierKey, 10);
        if (!isNaN(wTier) && wTier >= 3) {
          if (peakTier === null || wTier > peakTier) {
            peakTier = wTier;
          }
        }
      }
    }

    // 3. Peak tier fallback from various wrapper formats
    const altPeak = d.HighestSeasonPeakRank?.Tier ?? d.highest_rank?.tier ?? d.PeakRank?.Tier ?? d.peak_rank?.tier ?? null;
    if (typeof altPeak === 'number' && altPeak >= 3) {
      if (peakTier === null || altPeak > peakTier) {
        peakTier = altPeak;
      }
    }

    // 4. Direct current tier fallback (for local client or Henrik API responses)
    if (tier === null) {
      const altTier = d.currenttier ?? d.current_tier ?? d.Tier ?? d.CurrentTier ?? null;
      if (typeof altTier === 'number' && altTier >= 3) {
        tier = altTier;
        rr = typeof d.ranking_in_tier === 'number' ? d.ranking_in_tier : (typeof d.rr === 'number' ? d.rr : null);
      }
    }

    // 5. Invariant safeguard: Peak tier can NEVER be lower than current tier!
    if (tier !== null && tier >= 3) {
      if (peakTier === null || tier > peakTier) {
        peakTier = tier;
      }
    }

    return { tier, rr, peakTier };
  }

  /**
   * High-accuracy combat heuristic calibrated to Valorant competitive ranks (Iron 1 to Radiant).
   */
  private estimateTierFromCombatStats(kd: number, adr: number, acs: number, hsPct: number, winRate: number): number {
    // Radiant (27)
    if (kd >= 2.3 && (adr >= 210 || acs >= 310)) return 27;
    // Immortal 3 (26)
    if (kd >= 2.0 && (adr >= 195 || acs >= 290)) return 26;
    // Immortal 2 (25)
    if (kd >= 1.85 && (adr >= 180 || acs >= 275)) return 25;
    // Immortal 1 (24)
    if (kd >= 1.70 && (adr >= 170 || acs >= 260)) return 24;
    // Ascendant 3 (23)
    if (kd >= 1.55 && (adr >= 160 || acs >= 245)) return 23;
    // Ascendant 2 (22)
    if (kd >= 1.45 && (adr >= 152 || acs >= 235)) return 22;
    // Ascendant 1 (21)
    if (kd >= 1.35 && (adr >= 145 || acs >= 225)) return 21;
    // Diamond 3 (20)
    if (kd >= 1.28 && (adr >= 138 || acs >= 215)) return 20;
    // Diamond 2 (19)
    if (kd >= 1.22 && (adr >= 132 || acs >= 205)) return 19;
    // Diamond 1 (18)
    if (kd >= 1.15 && (adr >= 126 || acs >= 195)) return 18;
    // Platinum 3 (17)
    if (kd >= 1.10 && (adr >= 120 || acs >= 185)) return 17;
    // Platinum 2 (16)
    if (kd >= 1.05 && (adr >= 115 || acs >= 178)) return 16;
    // Platinum 1 (15)
    if (kd >= 1.00 && (adr >= 110 || acs >= 170)) return 15;
    // Gold 3 (14)
    if (kd >= 0.95 && (adr >= 105 || acs >= 162)) return 14;
    // Gold 2 (13)
    if (kd >= 0.90 && (adr >= 100 || acs >= 155)) return 13;
    // Gold 1 (12)
    if (kd >= 0.85 && (adr >= 95  || acs >= 148)) return 12;
    // Silver 3 (11)
    if (kd >= 0.80 && (adr >= 90  || acs >= 140)) return 11;
    // Silver 2 (10)
    if (kd >= 0.75 && (adr >= 85  || acs >= 132)) return 10;
    // Silver 1 (9)
    if (kd >= 0.70 && (adr >= 80  || acs >= 125)) return 9;
    // Bronze 3 (8)
    if (kd >= 0.65 && (adr >= 75  || acs >= 118)) return 8;
    // Bronze 2 (7)
    if (kd >= 0.60 && (adr >= 70  || acs >= 110)) return 7;
    // Bronze 1 (6)
    if (kd >= 0.55 && (adr >= 65  || acs >= 100)) return 6;
    // Iron 3 (5)
    if (kd >= 0.50 && (adr >= 58  || acs >= 90))  return 5;
    // Iron 2 (4)
    if (kd >= 0.45 && (adr >= 50  || acs >= 80))  return 4;
    // Iron 1 (3)
    return 3;
  }

  // ── Inventory & Skin Valuation Suite (v2.6.0) ──────────────────────────────
  private static readonly CONTENT_TIERS: Record<string, { name: 'Select' | 'Deluxe' | 'Premium' | 'Exclusive' | 'Ultra'; price: number }> = {
    '12683d76-48d7-84a3-4e09-6985794f0445': { name: 'Select', price: 875 },
    '0cebb8be-46d7-c12a-d306-e9907bfc5a25': { name: 'Deluxe', price: 1275 },
    '60bca009-4182-7998-dee7-b8a2558dc369': { name: 'Premium', price: 1775 },
    'e046854e-406c-37f4-6607-19a9ba8426fc': { name: 'Exclusive', price: 2175 },
    '411e4a55-4e59-7757-41f0-86a53f101bb5': { name: 'Ultra', price: 2475 },
  };

  // Known specific store pricing overrides (Knives, Champions, Exclusive limited editions)
  private static readonly SPECIAL_PRICES: Record<string, number> = {
    'kuronami no yaiba': 5350,
    'champions 2021 karambit': 5350,
    'champions 2022 butterfly knife': 5350,
    'champions 2023 kunai': 5350,
    'champions 2024 blade': 5350,
    'champions 2021 vandal': 2675,
    'champions 2022 phantom': 2675,
    'champions 2023 vandal': 2675,
    'champions 2024 phantom': 2675,
    'vct lockin misericrdia': 5440,
    'vct lockin misericordia': 5440,
    'ignite fan': 4710,
    'arcane sheriff': 2377,
    'arcane vandal': 2175,
    'arcane gauntlet': 4350,
    'overdrive blade': 4350,
    'aemondir blade': 4350,
    'evori dreamwings wand': 4950,
    'mystbloom kunai': 4350,
    'nocturnum scythe': 5350,
    'reaver karambit': 4350,
    'oni katana': 5350,
  };

  private cachedSkinsCatalog: any[] | null = null;
  private levelToSkinMap: Map<string, any> | null = null;
  private agentRewardLevelUuids: Set<string> | null = null;
  private bpLevelToActMap: Map<string, string> | null = null;

  public async getContractsCatalog(): Promise<void> {
    if (this.agentRewardLevelUuids && this.bpLevelToActMap) return;
    try {
      const resp = await fetch('https://valorant-api.com/v1/contracts');
      if (resp.ok) {
        const body: any = await resp.json();
        if (Array.isArray(body?.data)) {
          this.agentRewardLevelUuids = new Set();
          this.bpLevelToActMap = new Map();
          for (const c of body.data) {
            const rel = c.content?.relationType;
            if (c.content?.chapters) {
              for (const ch of c.content.chapters) {
                if (Array.isArray(ch.levels)) {
                  for (const lvl of ch.levels) {
                    if (lvl.reward?.type === 'EquippableSkinLevel' && lvl.reward.uuid) {
                      const uuid = lvl.reward.uuid.toLowerCase();
                      if (rel === 'Agent') {
                        this.agentRewardLevelUuids.add(uuid);
                      } else if (rel === 'Season') {
                        this.bpLevelToActMap.set(uuid, c.displayName || 'Battlepass');
                      }
                    }
                  }
                }
                if (Array.isArray(ch.freeRewards)) {
                  for (const f of ch.freeRewards) {
                    if (f.type === 'EquippableSkinLevel' && f.uuid) {
                      const uuid = f.uuid.toLowerCase();
                      if (rel === 'Agent') {
                        this.agentRewardLevelUuids.add(uuid);
                      } else if (rel === 'Season') {
                        this.bpLevelToActMap.set(uuid, c.displayName || 'Battlepass');
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[RiotEngine] Failed to load contracts catalog:', err);
    }
  }

  public async getSkinsCatalog(): Promise<any[]> {
    if (this.cachedSkinsCatalog && this.cachedSkinsCatalog.length > 0 && this.levelToSkinMap && this.levelToSkinMap.size > 0) {
      return this.cachedSkinsCatalog;
    }
    try {
      const resp = await fetch('https://valorant-api.com/v1/weapons/skins');
      if (resp.ok) {
        const body: any = await resp.json();
        if (Array.isArray(body?.data)) {
          this.cachedSkinsCatalog = body.data;
          this.levelToSkinMap = new Map();
          for (const skin of body.data) {
            if (skin?.uuid) {
              this.levelToSkinMap.set(skin.uuid.toLowerCase(), skin);
            }
            if (Array.isArray(skin.levels)) {
              for (const lvl of skin.levels) {
                if (lvl?.uuid) {
                  this.levelToSkinMap.set(lvl.uuid.toLowerCase(), skin);
                }
              }
            }
            if (Array.isArray(skin.chromas)) {
              for (const ch of skin.chromas) {
                if (ch?.uuid) {
                  this.levelToSkinMap.set(ch.uuid.toLowerCase(), skin);
                }
              }
            }
          }
          return body.data;
        }
      }
    } catch (err) {
      console.warn('[RiotEngine] Failed to fetch skins catalog from valorant-api.com:', err);
    }
    return this.cachedSkinsCatalog ?? [];
  }

  public async fetchAllValorantSkinsCatalog(): Promise<AccountSkinItem[]> {
    const [raw] = await Promise.all([this.getSkinsCatalog(), this.getContractsCatalog()]);
    const result: AccountSkinItem[] = [];
    for (const skin of raw) {
      // Exclude Standard issue skins (e.g. Standard Vandal)
      if (!skin.contentTierUuid || skin.displayName.startsWith('Standard ') || skin.displayName.startsWith('Random ')) {
        continue;
      }
      const isAgent = (
        skin.levels?.some((l: any) => l.uuid && this.agentRewardLevelUuids?.has(l.uuid.toLowerCase())) ||
        (skin.uuid && this.agentRewardLevelUuids?.has(skin.uuid.toLowerCase()))
      );
      const bpAct = (
        skin.levels?.map((l: any) => l.uuid && this.bpLevelToActMap?.get(l.uuid.toLowerCase())).find(Boolean) ||
        (skin.uuid && this.bpLevelToActMap?.get(skin.uuid.toLowerCase()))
      );

      const parts = skin.displayName.split(' ');
      const weapon = parts[parts.length - 1] || 'Weapon';
      const isMelee = (
        weapon.toLowerCase() === 'melee' ||
        skin.displayName.toLowerCase().includes('knife') ||
        skin.displayName.toLowerCase().includes('karambit') ||
        skin.displayName.toLowerCase().includes('dagger') ||
        skin.displayName.toLowerCase().includes('blade') ||
        skin.displayName.toLowerCase().includes('sword') ||
        skin.displayName.toLowerCase().includes('axe') ||
        skin.displayName.toLowerCase().includes('claw') ||
        skin.displayName.toLowerCase().includes('bat') ||
        skin.displayName.toLowerCase().includes('hammer') ||
        skin.displayName.toLowerCase().includes('scythe') ||
        skin.displayName.toLowerCase().includes('fan') ||
        skin.displayName.toLowerCase().includes('staff')
      );

      const tierInfo = RiotEngine.CONTENT_TIERS[skin.contentTierUuid.toLowerCase()];
      let sourceType: 'store' | 'battlepass' | 'agent' = 'store';
      let tierPrice = 0;

      if (isAgent) {
        sourceType = 'agent';
        tierPrice = 0;
      } else if (bpAct) {
        sourceType = 'battlepass';
        tierPrice = 0;
      } else {
        sourceType = 'store';
        const cleanName = skin.displayName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (RiotEngine.SPECIAL_PRICES[cleanName]) {
          tierPrice = RiotEngine.SPECIAL_PRICES[cleanName];
        } else {
          tierPrice = tierInfo ? (isMelee ? Math.round(tierInfo.price * 2) : tierInfo.price) : (isMelee ? 2550 : 1275);
        }
      }

      result.push({
        uuid: skin.uuid,
        name: skin.displayName,
        weapon: isMelee ? 'Melee' : weapon,
        tier: tierInfo?.name || 'Exclusive',
        tier_price: tierPrice,
        source_type: sourceType,
        act_name: bpAct || undefined,
        icon_url: skin.displayIcon || skin.levels?.[0]?.displayIcon || undefined,
      });
    }
    return result;
  }

  public async fetchAccountInventory(targetPuuid?: string): Promise<{
    success: boolean;
    skins?: AccountSkinItem[];
    approxTotalVp?: number;
    vpBalance?: number;
    radianiteBalance?: number;
    rank?: string;
    peakRank?: string;
    region?: string;
    message?: string;
  }> {
    const puuid = targetPuuid || this.puuid;
    if (!puuid || !this.accessToken || !this.entitlementsToken) {
      return { success: false, message: 'Riot Client is not connected or logged in.' };
    }

    const detectedShard = this.cachedRegion || this.detectRegion() || 'na';
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'X-Riot-Entitlements-JWT': this.entitlementsToken,
      'X-Riot-ClientVersion': this.clientVersion,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'User-Agent': `ShooterGame/11 ${this.clientVersion}`,
    };

    try {
      await Promise.all([this.getSkinsCatalog(), this.getContractsCatalog()]);

      // 1. Fetch Owned Weapon Skins Entitlements
      // Official Valorant Category ItemTypeIDs:
      // Skins / Skin Levels: e7c63390-eda7-46e0-bb7a-a6abdacd2433
      // Skin Variants: 3ad1b2b2-acdb-4524-852f-954a76ddae0a
      const SKINS_CATEGORY_ID = 'e7c63390-eda7-46e0-bb7a-a6abdacd2433';
      const VARIANTS_CATEGORY_ID = '3ad1b2b2-acdb-4524-852f-954a76ddae0a';

      const extractEntitlements = (json: any): any[] => {
        if (!json) return [];
        if (Array.isArray(json.Entitlements)) return json.Entitlements;
        if (Array.isArray(json.EntitlementsByTypes)) {
          const list: any[] = [];
          for (const t of json.EntitlementsByTypes) {
            if (Array.isArray(t?.Entitlements)) list.push(...t.Entitlements);
          }
          return list;
        }
        if (typeof json.EntitlementsByTypes === 'object') {
          const list: any[] = [];
          for (const val of Object.values(json.EntitlementsByTypes) as any[]) {
            if (Array.isArray(val?.Entitlements)) list.push(...val.Entitlements);
          }
          return list;
        }
        return [];
      };

      let ownedItems: any[] = [];
      let activeShard = detectedShard;

      // Probe candidate shards starting with detected shard
      const candidateShards = [detectedShard, 'eu', 'na', 'ap', 'kr', 'latam', 'br'].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      for (const s of candidateShards) {
        try {
          const skinsUrl = `https://pd.${s}.a.pvp.net/store/v1/entitlements/${puuid}/${SKINS_CATEGORY_ID}`;
          const entRes = await fetch(skinsUrl, { headers });
          if (entRes.ok) {
            const entData: any = await entRes.json();
            const items = extractEntitlements(entData);
            if (items.length > 0) {
              ownedItems.push(...items);
              activeShard = s;
              this.cachedRegion = s;
              console.log(`[RiotEngine] Found ${items.length} skin entitlements on shard: ${s}`);
              break;
            }
          }
        } catch {
          // Probe next shard
        }
      }

      // If skins found, fetch variants on the active shard
      if (ownedItems.length > 0) {
        try {
          const variantsUrl = `https://pd.${activeShard}.a.pvp.net/store/v1/entitlements/${puuid}/${VARIANTS_CATEGORY_ID}`;
          const varRes = await fetch(variantsUrl, { headers });
          if (varRes.ok) {
            const varData: any = await varRes.json();
            ownedItems.push(...extractEntitlements(varData));
          }
        } catch {}
      }

      // Fallback: If still empty, try full entitlements endpoint or local client
      if (ownedItems.length === 0) {
        for (const s of candidateShards) {
          try {
            const allEntUrl = `https://pd.${s}.a.pvp.net/store/v1/entitlements/${puuid}`;
            const allRes = await fetch(allEntUrl, { headers });
            if (allRes.ok) {
              const allData: any = await allRes.json();
              const items = extractEntitlements(allData);
              if (items.length > 0) {
                ownedItems.push(...items);
                activeShard = s;
                this.cachedRegion = s;
                break;
              }
            }
          } catch {}
        }

        if (ownedItems.length === 0) {
          try {
            const localRes = await this.makeLocalRiotRequest(`/store/v1/entitlements/${puuid}/${SKINS_CATEGORY_ID}`);
            if (localRes.status === 200 && localRes.data) {
              ownedItems.push(...extractEntitlements(localRes.data));
            }
          } catch {}
        }
      }

      // 2. Fetch Wallet Balances
      let vpBalance = 0;
      let radianiteBalance = 0;
      try {
        const walletUrl = `https://pd.${activeShard}.a.pvp.net/store/v1/wallet/${puuid}`;
        const walletRes = await fetch(walletUrl, { headers });
        if (walletRes.ok) {
          const wData: any = await walletRes.json();
          const balances = wData?.Balances || {};
          // Riot VP Currency IDs: 85ca954a-41f2-ce94-9b45-8ca3dd39a00d (official) or 85ca9543-7697-9e4f-7f72-336001392558 (legacy)
          vpBalance = balances['85ca954a-41f2-ce94-9b45-8ca3dd39a00d'] ?? balances['85ca9543-7697-9e4f-7f72-336001392558'] ?? 0;
          // Radianite: e59aa87c-4cbf-517a-5983-6e81511be9b7
          radianiteBalance = balances['e59aa87c-4cbf-517a-5983-6e81511be9b7'] ?? 0;
        }
      } catch (wErr) {
        console.warn('[RiotEngine] Failed fetching wallet balances:', wErr);
      }

      // 3. Map Owned ItemIDs to Skins
      const ownedSkinsMap = new Map<string, AccountSkinItem>();
      let approxTotalVp = 0;
      const detectedBpActs = new Set<string>();

      for (const ent of ownedItems) {
        const itemId = (ent.ItemID || ent.ItemId || ent.item_id || '').toLowerCase();
        if (!itemId || !this.levelToSkinMap) continue;

        const skin = this.levelToSkinMap.get(itemId);
        if (!skin) continue;
        if (skin.displayName.startsWith('Standard ') || skin.displayName.startsWith('Random ')) continue;

        if (ownedSkinsMap.has(skin.uuid)) continue;

        // Check if Agent Contract skin (Free)
        const isAgentReward = (
          (this.agentRewardLevelUuids && this.agentRewardLevelUuids.has(itemId)) ||
          skin.levels?.some((l: any) => l.uuid && this.agentRewardLevelUuids?.has(l.uuid.toLowerCase()))
        );

        // Check if Battlepass Season skin
        const bpAct = (
          (this.bpLevelToActMap && this.bpLevelToActMap.get(itemId)) ||
          skin.levels?.map((l: any) => l.uuid && this.bpLevelToActMap?.get(l.uuid.toLowerCase())).find(Boolean)
        );

        const parts = skin.displayName.split(' ');
        const weapon = parts[parts.length - 1] || 'Weapon';
        const isMelee = (
          weapon.toLowerCase() === 'melee' ||
          skin.displayName.toLowerCase().includes('knife') ||
          skin.displayName.toLowerCase().includes('karambit') ||
          skin.displayName.toLowerCase().includes('dagger') ||
          skin.displayName.toLowerCase().includes('blade') ||
          skin.displayName.toLowerCase().includes('sword') ||
          skin.displayName.toLowerCase().includes('axe') ||
          skin.displayName.toLowerCase().includes('claw') ||
          skin.displayName.toLowerCase().includes('bat') ||
          skin.displayName.toLowerCase().includes('hammer') ||
          skin.displayName.toLowerCase().includes('scythe') ||
          skin.displayName.toLowerCase().includes('fan') ||
          skin.displayName.toLowerCase().includes('staff')
        );

        const tierInfo = (skin.contentTierUuid && RiotEngine.CONTENT_TIERS[skin.contentTierUuid.toLowerCase()]) || null;

        let sourceType: 'store' | 'battlepass' | 'agent' = 'store';
        let resolvedTier = tierInfo?.name || (isMelee ? 'Exclusive' : 'Deluxe');
        let itemPrice = 0;

        if (isAgentReward) {
          sourceType = 'agent';
          resolvedTier = 'Select';
          itemPrice = 0; // Free agent reward!
        } else if (bpAct) {
          sourceType = 'battlepass';
          detectedBpActs.add(bpAct);
          itemPrice = 0; // Battlepass cost is calculated at 1,000 VP per Act
        } else {
          sourceType = 'store';
          const cleanName = skin.displayName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
          if (RiotEngine.SPECIAL_PRICES[cleanName]) {
            itemPrice = RiotEngine.SPECIAL_PRICES[cleanName];
          } else {
            itemPrice = tierInfo ? (isMelee ? Math.round(tierInfo.price * 2) : tierInfo.price) : (isMelee ? 2550 : 1275);
          }
        }

        const skinItem: AccountSkinItem = {
          uuid: skin.uuid,
          name: skin.displayName,
          weapon: isMelee ? 'Melee' : weapon,
          tier: resolvedTier,
          tier_price: itemPrice,
          source_type: sourceType,
          act_name: bpAct || undefined,
          icon_url: skin.displayIcon || skin.levels?.[0]?.displayIcon || undefined,
        };

        ownedSkinsMap.set(skin.uuid, skinItem);
        approxTotalVp += itemPrice;
      }

      // Add 1,000 VP per unique Battlepass Act detected on account
      const bpTotalVp = detectedBpActs.size * 1000;
      approxTotalVp += bpTotalVp;

      const skins = Array.from(ownedSkinsMap.values());
      console.log(`[RiotEngine] Inventory Scan Complete: ${ownedItems.length} raw entitlements mapped to ${skins.length} skins. Real Total VP: ~${approxTotalVp} VP (Store: ${approxTotalVp - bpTotalVp} VP, Battlepasses: ${detectedBpActs.size} Acts / ${bpTotalVp} VP, Agent Rewards: Free)`);

      // 4. Fetch Rank & MMR
      let rankStr = 'Unranked';
      let peakStr = 'Unranked';
      try {
        const stats = await this.fetchMatchStatsAndMmr(puuid);
        if (stats?.estimated_mmr) {
          rankStr = stats.estimated_mmr;
        }
        if (stats?.peak_mmr) {
          peakStr = stats.peak_mmr;
        } else if (rankStr && rankStr !== 'Unranked') {
          peakStr = rankStr.replace(/\s*\(\d+\s*RR\)/i, '').trim();
        }
      } catch {}

      return {
        success: true,
        skins,
        approxTotalVp,
        vpBalance,
        radianiteBalance,
        rank: rankStr,
        peakRank: peakStr,
        region: activeShard,
      };
    } catch (err: any) {
      console.error('[RiotEngine] Error scanning inventory:', err);
      return { success: false, message: err?.message || 'Unknown error scanning inventory' };
    }
  }
}
