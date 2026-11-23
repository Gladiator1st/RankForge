import { exec, execFile, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { clipboard, globalShortcut } from 'electron';
import { AutoLoginStatusEvent } from '../types';

interface AutoLoginSession {
  accountId: string;
  username: string;
  password: string;
  riotPath: string;
  attempt: number;
  maxAttempts: number;
  childProcess: ChildProcess | null;
  verifyTimer: NodeJS.Timeout | null;
  retryTimer: NodeJS.Timeout | null;
  aborted: boolean;
}

export class GameLauncher {
  /**
   * Kills any running Valorant or Riot Client processes cleanly.
   * Closes any running game so account switch can occur cleanly.
   */
  public static async killRunningGame(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('taskkill /f /im VALORANT.exe /im VALORANT-Win64-Shipping.exe /im RiotClientServices.exe /im "Riot Client.exe"', () => {
        setTimeout(() => resolve(true), 1200);
      });
    });
  }

  /**
   * Checks whether RiotClientServices.exe or Riot Client.exe is currently active
   */
  public static async isRiotClientRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('tasklist /fo csv /nh', (err, stdout) => {
        if (err || !stdout) {
          resolve(false);
          return;
        }
        const lower = stdout.toLowerCase();
        resolve(lower.includes('riotclientservices.exe') || lower.includes('riot client.exe'));
      });
    });
  }

  /**
   * Discovers the RiotClientServices.exe executable path on the machine.
   * Checks official RiotClientInstalls.json in ProgramData first, then candidate paths across drives.
   */
  public static detectRiotClient(): { found: boolean; path: string; source: 'registry' | 'known_path' | 'none' } {
    // 1. Check official RiotClientInstalls.json in ProgramData (most accurate)
    const programData = process.env.ALLUSERSPROFILE || 'C:\\ProgramData';
    const installsPath = path.join(programData, 'Riot Games', 'RiotClientInstalls.json');
    if (fs.existsSync(installsPath)) {
      try {
        const raw = fs.readFileSync(installsPath, 'utf8');
        const json = JSON.parse(raw);
        if (json.rc_default && fs.existsSync(path.normalize(json.rc_default))) {
          return { found: true, path: path.normalize(json.rc_default), source: 'registry' };
        }
        if (json.rc_live && fs.existsSync(path.normalize(json.rc_live))) {
          return { found: true, path: path.normalize(json.rc_live), source: 'registry' };
        }
        if (json.associated_client) {
          for (const key of Object.keys(json.associated_client)) {
            const val = json.associated_client[key];
            if (val && fs.existsSync(path.normalize(val))) {
              return { found: true, path: path.normalize(val), source: 'registry' };
            }
          }
        }
      } catch {}
    }

    // 2. Check known install paths across common drives (C, D, E, F, G)
    const candidatePaths = [
      'C:\\root\\Games\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'D:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'D:\\Games\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'E:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'E:\\Games\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'F:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'G:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'C:\\Program Files\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'C:\\Program Files (x86)\\Riot Games\\Riot Client\\RiotClientServices.exe',
    ];

    for (const cand of candidatePaths) {
      if (fs.existsSync(cand)) {
        return { found: true, path: cand, source: 'known_path' };
      }
    }

    return { found: false, path: '', source: 'none' };
  }

  /**
   * Validates if a given path points to an existing Riot Client executable
   */
  public static validateRiotPath(testPath?: string): { valid: boolean; message: string } {
    if (!testPath || !testPath.trim()) {
      return { valid: false, message: 'No executable path provided.' };
    }
    const cleanPath = path.normalize(testPath.trim());
    if (!fs.existsSync(cleanPath)) {
      return { valid: false, message: 'Executable file not found at this path.' };
    }
    const lower = cleanPath.toLowerCase();
    if (!lower.endsWith('.exe')) {
      return { valid: false, message: 'Selected file is not an executable (.exe).' };
    }
    if (!lower.includes('riot') && !lower.includes('valorant')) {
      return { valid: true, message: 'File exists, but does not appear to be a Riot executable.' };
    }
    return { valid: true, message: 'Verified Riot Client executable!' };
  }

  /**
   * Discovers the RiotClientServices.exe executable path on the machine
   */
  public static findRiotClientPath(customPath?: string): string {
    if (customPath && fs.existsSync(customPath)) {
      return customPath;
    }

    const detected = this.detectRiotClient();
    if (detected.found) {
      return detected.path;
    }

    return 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
  }

  private static activeAutoLogin: AutoLoginSession | null = null;
  private static statusListeners: Set<(event: AutoLoginStatusEvent) => void> = new Set();

  /**
   * Subscribe to live autologin state events (starting, typing, retrying, success, failed, aborted)
   */
  public static onStatus(listener: (event: AutoLoginStatusEvent) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private static emitStatus(event: AutoLoginStatusEvent) {
    for (const listener of this.statusListeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('[GameLauncher] Status listener callback error:', err);
      }
    }
  }

  /**
   * Spawns or brings the Riot Client / Valorant window to the foreground
   */
  public static spawnOrFocusRiotClient(riotPath: string, username?: string) {
    try {
      console.log(`[GameLauncher] Spawning / focusing Riot Client for ${username || 'account'}...`);
      const child = spawn(riotPath, ['--launch-product=valorant', '--launch-patchline=live'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } catch (err: any) {
      console.warn('[GameLauncher] Failed to spawn/focus Riot Client:', err.message || err);
    }
  }

  /**
   * Launches Riot Client for the specified account, auto-typing credentials if a password is saved.
   * Features Focus-Guarded Win32 fast-fill, automatic single retry on failure/inactivity,
   * and instant system-wide Escape key abort.
   */
  public static async launchAccount(
    accountId: string,
    username: string,
    password = '',
    customRiotPath?: string,
    autoCopyPassword = true
  ): Promise<{ success: boolean; message: string }> {
    // If an existing autologin session is active, cancel it cleanly first
    if (this.activeAutoLogin) {
      this.abortAutoLogin('New account launch started');
    }

    const riotPath = this.findRiotClientPath(customRiotPath);

    if (!fs.existsSync(riotPath)) {
      return {
        success: false,
        message: `RiotClientServices.exe not found at ${riotPath}. Check your Riot installation.`,
      };
    }

    // Copy password to clipboard only if auto_copy_password is true
    if (password && autoCopyPassword !== false) {
      try {
        clipboard.writeText(password);
      } catch {}
    }

    // Check if Riot Client is already active
    const isAlreadyRunning = await this.isRiotClientRunning();
    this.spawnOrFocusRiotClient(riotPath, username);

    // If password provided, start auto-fill worker with retry and escape abort guards
    if (password) {
      this.activeAutoLogin = {
        accountId,
        username,
        password,
        riotPath,
        attempt: 1,
        maxAttempts: 2,
        childProcess: null,
        verifyTimer: null,
        retryTimer: null,
        aborted: false,
      };

      // Register system-wide ESCAPE shortcut to abort immediately from ANY focused window
      try {
        if (!globalShortcut.isRegistered('Escape')) {
          globalShortcut.register('Escape', () => {
            console.log('[GameLauncher] Global ESCAPE key detected. Aborting autologin process immediately.');
            GameLauncher.abortAutoLogin('Escape pressed');
          });
        }
      } catch (err) {
        console.warn('[GameLauncher] Failed to register global Escape shortcut:', err);
      }

      this.emitStatus({
        accountId,
        username,
        status: 'starting',
        attempt: 1,
        maxAttempts: 2,
        message: `Launching Riot Client for ${username}... (Press Esc to cancel)`,
      });

      const initialDelay = isAlreadyRunning ? 400 : 1000;
      this.activeAutoLogin.retryTimer = setTimeout(() => {
        if (!this.activeAutoLogin || this.activeAutoLogin.aborted) return;
        this.runAutoFillAttempt();
      }, initialDelay);

      return {
        success: true,
        message: `Launching Riot Client for ${username}... (Autologin with single retry active)`,
      };
    }

    return { success: true, message: `Launching Valorant for ${username}...` };
  }

  /**
   * Runs a single attempt of Focus-Guarded fast-fill.
   * If focus is interrupted or Riot Client is not active after submit, triggers retry once.
   */
  private static runAutoFillAttempt() {
    if (!this.activeAutoLogin || this.activeAutoLogin.aborted) return;

    const { accountId, username, password, attempt, maxAttempts } = this.activeAutoLogin;
    console.log(`[GameLauncher] Starting Fast-Fill attempt ${attempt}/${maxAttempts} for ${username}...`);

    this.emitStatus({
      accountId,
      username,
      status: 'focusing',
      attempt,
      maxAttempts,
      message: `Attempt ${attempt}/${maxAttempts}: Focusing Riot Client & filling credentials... (Press Esc to cancel)`,
    });

    const userB64 = Buffer.from(username, 'utf8').toString('base64');
    const passB64 = Buffer.from(password, 'utf8').toString('base64');

    const tempDir = process.env.TEMP || os.tmpdir();
    const scriptPath = path.join(tempDir, 'rfr_fast_fill.ps1');

    const psScript = `
$UserB64 = $env:RFR_USER_B64
$PassB64 = $env:RFR_PASS_B64
if (-not $UserB64 -or -not $PassB64) {
    Write-Warning "[FocusGuard] Missing credentials in environment. Aborting."
    exit 1
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class FocusGuard {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);

    // Checks whether the physical Escape key (VK_ESCAPE = 0x1B) is down
    public static bool IsEscapePressed() {
        return (GetAsyncKeyState(0x1B) & 0x8000) != 0;
    }

    public static bool IsRiotClientFocused() {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return false;

        StringBuilder sb = new StringBuilder(256);
        GetWindowText(hwnd, sb, 256);
        string title = sb.ToString();
        if (title.IndexOf("Riot Client", StringComparison.OrdinalIgnoreCase) >= 0) return true;

        try {
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            if (pid != 0) {
                using (var proc = Process.GetProcessById((int)pid)) {
                    string pName = proc.ProcessName;
                    if (pName.IndexOf("Riot", StringComparison.OrdinalIgnoreCase) >= 0) {
                        return true;
                    }
                }
            }
        } catch { }

        return false;
    }
}
"@

$wshell = New-Object -ComObject WScript.Shell
$username = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($UserB64))
$password = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($PassB64))

# 1. Dynamic Window Activation Loop (Poll every 150ms, up to 10 seconds)
$focused = $false
for ($i = 0; $i -lt 65; $i++) {
    if ([FocusGuard]::IsEscapePressed()) {
        Write-Warning "[FocusGuard] Aborted by Escape key."
        exit 2
    }
    $wshell.AppActivate("Riot Client") | Out-Null
    if ([FocusGuard]::IsRiotClientFocused()) {
        $focused = $true
        break
    }
    Start-Sleep -Milliseconds 150
}

if (-not $focused) {
    Write-Warning "[FocusGuard] Riot Client window was not focused within timeout. Aborting attempt."
    exit 1
}

# Brief pause to let Riot Client login UI inputs mount and stabilize
for ($k = 0; $k -lt 4; $k++) {
    if ([FocusGuard]::IsEscapePressed()) {
        Write-Warning "[FocusGuard] Aborted by Escape key."
        exit 2
    }
    Start-Sleep -Milliseconds 100
}

# 2. Strict Focus Guard Check #1 (Before Username)
if (-not [FocusGuard]::IsRiotClientFocused()) {
    Write-Warning "[FocusGuard] User clicked away before typing username. Aborting attempt."
    exit 1
}

# 3. Fast-Fill Username (Ctrl+A -> Ctrl+V)
[System.Windows.Forms.Clipboard]::SetText($username)
[System.Windows.Forms.SendKeys]::SendWait("^a^v")

for ($k = 0; $k -lt 2; $k++) {
    if ([FocusGuard]::IsEscapePressed()) { exit 2 }
    Start-Sleep -Milliseconds 40
}

# 4. Tab to Password field
[System.Windows.Forms.SendKeys]::SendWait("{TAB}")

for ($k = 0; $k -lt 2; $k++) {
    if ([FocusGuard]::IsEscapePressed()) { exit 2 }
    Start-Sleep -Milliseconds 40
}

# 5. Strict Focus Guard Check #2 (Before Password)
if (-not [FocusGuard]::IsRiotClientFocused()) {
    Write-Warning "[FocusGuard] User clicked away before password. Aborting attempt!"
    exit 1
}

# 6. Fast-Fill Password (Ctrl+A -> Ctrl+V)
[System.Windows.Forms.Clipboard]::SetText($password)
[System.Windows.Forms.SendKeys]::SendWait("^a^v")

for ($k = 0; $k -lt 3; $k++) {
    if ([FocusGuard]::IsEscapePressed()) { exit 2 }
    Start-Sleep -Milliseconds 40
}

# 7. Strict Focus Guard Check #3 (Before Submit)
if (-not [FocusGuard]::IsRiotClientFocused()) {
    Write-Warning "[FocusGuard] User clicked away before submit. Aborting attempt."
    exit 1
}

# 8. Submit login
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Write-Output "[FocusGuard] Fast-fill login successfully completed!"
exit 0
`;

    try {
      fs.writeFileSync(scriptPath, psScript, 'utf8');
    } catch (err: any) {
      console.error('[GameLauncher] Failed to write fast-fill script:', err.message || err);
      this.failAutoLogin('Failed to write autologin script');
      return;
    }

    const child = execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
      ],
      {
        env: {
          ...process.env,
          RFR_USER_B64: userB64,
          RFR_PASS_B64: passB64,
        },
      },
      (err, stdout, stderr) => {
        if (!this.activeAutoLogin) return;
        this.activeAutoLogin.childProcess = null;

        if (this.activeAutoLogin.aborted) {
          return;
        }

        const combinedOutput = `${stdout || ''} ${stderr || ''}`;

        // Case 1: Aborted via physical Escape key in PowerShell (Exit code 2)
        if ((err && (err as any).code === 2) || combinedOutput.includes('Aborted by Escape key')) {
          console.log('[GameLauncher] Physical Escape key detected in PowerShell. Aborting immediately.');
          this.abortAutoLogin('Escape pressed');
          return;
        }

        // Case 2: Focus lost, user clicked away, or window activation error (Exit code 1)
        if (err) {
          console.warn(`[GameLauncher] Fast-fill attempt ${this.activeAutoLogin.attempt} interrupted: ${err.message || combinedOutput}`);
          this.handleAttemptFailure('Focus or click interrupted login attempt');
          return;
        }

        // Case 3: Script executed and hit Enter successfully!
        console.log(`[GameLauncher] Fast-fill attempt ${this.activeAutoLogin.attempt} submitted. Waiting for Riot Client confirmation...`);
        this.emitStatus({
          accountId: this.activeAutoLogin.accountId,
          username: this.activeAutoLogin.username,
          status: 'waiting-login',
          attempt: this.activeAutoLogin.attempt,
          maxAttempts: this.activeAutoLogin.maxAttempts,
          message: `Submitted credentials... Waiting for Riot Client confirmation (Press Esc to cancel)`,
        });

        // Start 9-second verification timer: if the account does not become active within 9s, retry once
        this.activeAutoLogin.verifyTimer = setTimeout(() => {
          if (!this.activeAutoLogin || this.activeAutoLogin.aborted) return;
          console.log(`[GameLauncher] Verification timeout (9s) expired for ${this.activeAutoLogin.username}. Account was not active.`);
          this.handleAttemptFailure('Account was not logged in');
        }, 9000);
      }
    );

    this.activeAutoLogin.childProcess = child;
  }

  /**
   * Handles attempt failure: retries once if on attempt 1, otherwise marks failed
   */
  private static handleAttemptFailure(reason: string) {
    if (!this.activeAutoLogin || this.activeAutoLogin.aborted) return;

    if (this.activeAutoLogin.verifyTimer) {
      clearTimeout(this.activeAutoLogin.verifyTimer);
      this.activeAutoLogin.verifyTimer = null;
    }

    // "if sometimes the autologin fails due to some click or the tracker should know that the account i tried to login wasnt logged in and should try again... but only 1 more time"
    if (this.activeAutoLogin.attempt < this.activeAutoLogin.maxAttempts) {
      this.activeAutoLogin.attempt += 1;
      const nextAttempt = this.activeAutoLogin.attempt;
      console.log(`[GameLauncher] Retrying autologin for ${this.activeAutoLogin.username} (Attempt ${nextAttempt}/${this.activeAutoLogin.maxAttempts})...`);

      this.emitStatus({
        accountId: this.activeAutoLogin.accountId,
        username: this.activeAutoLogin.username,
        status: 'retrying',
        attempt: nextAttempt,
        maxAttempts: this.activeAutoLogin.maxAttempts,
        message: `${reason} — Retrying login once (${nextAttempt}/${this.activeAutoLogin.maxAttempts})... (Press Esc to cancel)`,
      });

      // Brief delay to let transient window clicks settle before Attempt 2
      this.activeAutoLogin.retryTimer = setTimeout(() => {
        if (!this.activeAutoLogin || this.activeAutoLogin.aborted) return;
        this.spawnOrFocusRiotClient(this.activeAutoLogin.riotPath, this.activeAutoLogin.username);
        this.runAutoFillAttempt();
      }, 1000);
    } else {
      console.warn(`[GameLauncher] Autologin failed for ${this.activeAutoLogin.username} after ${this.activeAutoLogin.maxAttempts} attempts.`);
      this.failAutoLogin(`${reason} after retry.`);
    }
  }

  /**
   * Invoked by main process when Riot Client status confirms the account has logged in
   */
  public static notifyLoginSuccess(accountId: string, username?: string) {
    if (!this.activeAutoLogin || this.activeAutoLogin.aborted) return;

    const matchesId = this.activeAutoLogin.accountId === accountId;
    const matchesUser = username && this.activeAutoLogin.username.toLowerCase().trim() === username.toLowerCase().trim();

    if (matchesId || matchesUser) {
      console.log(`[GameLauncher] Confirmed active login for ${this.activeAutoLogin.username}! Autologin succeeded.`);
      const accId = this.activeAutoLogin.accountId;
      const uName = this.activeAutoLogin.username;
      this.cleanup();
      this.emitStatus({
        accountId: accId,
        username: uName,
        status: 'success',
        attempt: 1,
        maxAttempts: 2,
        message: `Logged in as ${uName}!`,
      });
    }
  }

  /**
   * Aborts autologin process immediately (e.g., when user presses Escape or switches account)
   */
  public static abortAutoLogin(reason = 'Cancelled by user'): boolean {
    if (!this.activeAutoLogin) return false;

    console.log(`[GameLauncher] Aborting autologin process for ${this.activeAutoLogin.username}: ${reason}`);
    this.activeAutoLogin.aborted = true;

    if (this.activeAutoLogin.childProcess) {
      try {
        this.activeAutoLogin.childProcess.kill();
      } catch {}
      this.activeAutoLogin.childProcess = null;
    }

    if (this.activeAutoLogin.verifyTimer) {
      clearTimeout(this.activeAutoLogin.verifyTimer);
      this.activeAutoLogin.verifyTimer = null;
    }

    if (this.activeAutoLogin.retryTimer) {
      clearTimeout(this.activeAutoLogin.retryTimer);
      this.activeAutoLogin.retryTimer = null;
    }

    const accId = this.activeAutoLogin.accountId;
    const uName = this.activeAutoLogin.username;
    this.cleanup();

    this.emitStatus({
      accountId: accId,
      username: uName,
      status: 'aborted',
      attempt: 1,
      maxAttempts: 2,
      message: 'Autologin aborted (Escape pressed)',
    });

    return true;
  }

  /**
   * Marks autologin failed after all retries are exhausted
   */
  private static failAutoLogin(reason: string) {
    if (!this.activeAutoLogin) return;

    const accId = this.activeAutoLogin.accountId;
    const uName = this.activeAutoLogin.username;
    this.cleanup();

    this.emitStatus({
      accountId: accId,
      username: uName,
      status: 'failed',
      attempt: 2,
      maxAttempts: 2,
      message: reason || 'Autologin failed after retry.',
    });
  }

  /**
   * Cleans up timers, child processes, clipboard, and global shortcuts
   */
  private static cleanup() {
    if (this.activeAutoLogin) {
      if (this.activeAutoLogin.verifyTimer) clearTimeout(this.activeAutoLogin.verifyTimer);
      if (this.activeAutoLogin.retryTimer) clearTimeout(this.activeAutoLogin.retryTimer);
      if (this.activeAutoLogin.childProcess) {
        try {
          this.activeAutoLogin.childProcess.kill();
        } catch {}
      }
      this.activeAutoLogin = null;
    }

    // Auto-clear clipboard to prevent credential leakage
    try {
      clipboard.writeText('');
    } catch {}

    // Unregister system-wide Escape key
    try {
      if (globalShortcut.isRegistered('Escape')) {
        globalShortcut.unregister('Escape');
      }
    } catch {}
  }
}
