import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { safeStorage } from 'electron';
import { Account, AppSettings } from '../types';

const APPDATA_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'RankForge');
const ROSTER_FILE = path.join(APPDATA_DIR, 'roster.json');
const SETTINGS_FILE = path.join(APPDATA_DIR, 'settings.json');
const MAPPINGS_FILE = path.join(APPDATA_DIR, 'mappings.json');
const TOMBSTONES_FILE = path.join(APPDATA_DIR, 'deleted_tombstones.json');
const BACKUPS_DIR = path.join(APPDATA_DIR, 'backups');

// Legacy directories for automatic migration if migrating from Valorant RFR Tracker
const LEGACY_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ValorantRFRTracker');
const LEGACY_SOLO_FILE = path.join(LEGACY_DIR, 'roster_solo.json');
const LEGACY_ROSTER_FILE = path.join(LEGACY_DIR, 'roster_v2.json');
const LEGACY_SETTINGS_FILE = path.join(LEGACY_DIR, 'settings_v2.json');

let cachedHardwareKey: Buffer | null = null;
function getHardwareKey(): Buffer {
  if (cachedHardwareKey) return cachedHardwareKey;
  let machineSig = '';
  try {
    machineSig = `${os.hostname()}-${os.userInfo().username}-${os.platform()}-RankForge-2026`;
  } catch {
    machineSig = 'RankForge-Offline-Fallback-Key';
  }
  cachedHardwareKey = crypto.scryptSync(machineSig, 'rankforge_hardware_salt_v1', 32);
  return cachedHardwareKey;
}

const decryptedSecretCache = new Map<string, string>();

export function encryptHardwareSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (
    typeof plaintext === 'string' &&
    (plaintext.startsWith('enc_dpapi:') || plaintext.startsWith('enc_hw:') || plaintext.startsWith('enc:'))
  ) {
    return plaintext;
  }
  if (typeof plaintext !== 'string' || plaintext.length > 1024) {
    return '';
  }

  // 1. Primary: Windows DPAPI via Electron safeStorage
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const enc = 'enc_dpapi:' + safeStorage.encryptString(plaintext).toString('base64');
      decryptedSecretCache.set(enc, plaintext);
      return enc;
    }
  } catch {}

  // 2. Machine AES-256-GCM fallback
  try {
    const key = getHardwareKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    const enc = `enc_hw:${iv.toString('hex')}:${authTag}:${encrypted}`;
    decryptedSecretCache.set(enc, plaintext);
    return enc;
  } catch (err) {
    console.error('[VaultStorage] Failed to encrypt secret:', err);
    return '';
  }
}

export function decryptHardwareSecret(encryptedStr: string): string {
  if (!encryptedStr || typeof encryptedStr !== 'string') return '';
  if (!encryptedStr.startsWith('enc_dpapi:') && !encryptedStr.startsWith('enc_hw:') && !encryptedStr.startsWith('enc:')) {
    return encryptedStr;
  }
  const cached = decryptedSecretCache.get(encryptedStr);
  if (cached !== undefined) return cached;

  // 1. Decrypt DPAPI secrets
  if (encryptedStr.startsWith('enc_dpapi:')) {
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const raw = encryptedStr.slice('enc_dpapi:'.length);
        const dec = safeStorage.decryptString(Buffer.from(raw, 'base64'));
        decryptedSecretCache.set(encryptedStr, dec);
        return dec;
      }
    } catch {
      return '';
    }
  }

  // 2. Decrypt AES-256-GCM
  try {
    const parts = encryptedStr.split(':');
    if (parts.length !== 4) return encryptedStr;
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const ciphertext = parts[3];
    if (!ciphertext || ciphertext.length > 4096) return '';

    const key = getHardwareKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    if (decrypted) {
      decryptedSecretCache.set(encryptedStr, decrypted);
      return decrypted;
    }
    return '';
  } catch {
    return '';
  }
}

const DEFAULT_SETTINGS: AppSettings = {
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
  license_tier: 'solo_pro', // Always unlocked in RankForge FOSS
};

export class VaultStorage {
  private accounts: Account[] = [];
  private settings: AppSettings;
  private deletedUsernames: Set<string> = new Set();

  constructor() {
    this.ensureDirectory();
    this.settings = this.loadSettings();
    this.deletedUsernames = this.loadDeletedTombstones();
    this.accounts = this.loadAccounts();
    this.migrateLegacyTrackerIfPresent();
    this.pruneExpiredTrash();
    this.rotateDailyBackup();
  }

  private ensureDirectory() {
    if (!fs.existsSync(APPDATA_DIR)) {
      fs.mkdirSync(APPDATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
  }

  private safeWriteFileSync(filePath: string, data: string) {
    const tempFile = `${filePath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tempFile, data, 'utf8');
      fs.renameSync(tempFile, filePath);
    } catch (err) {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch (_) {}
      fs.writeFileSync(filePath, data, 'utf8');
    }
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          user_role: 'solo',
          license_tier: 'solo_pro', // Always unrestricted
        };
      }
    } catch (err) {
      console.warn('[VaultStorage] Failed to read settings, using defaults:', err);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private loadDeletedTombstones(): Set<string> {
    try {
      if (fs.existsSync(TOMBSTONES_FILE)) {
        const raw = fs.readFileSync(TOMBSTONES_FILE, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return new Set(list.map((s) => String(s).toLowerCase().trim()));
      }
    } catch {}
    return new Set();
  }

  private persistDeletedTombstones() {
    try {
      const list = Array.from(this.deletedUsernames);
      this.safeWriteFileSync(TOMBSTONES_FILE, JSON.stringify(list, null, 2));
    } catch (err) {
      console.error('[VaultStorage] Failed to persist deleted tombstones:', err);
    }
  }

  private loadAccounts(): Account[] {
    try {
      if (fs.existsSync(ROSTER_FILE)) {
        const raw = fs.readFileSync(ROSTER_FILE, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          return list.map((acc: any) => ({
            ...acc,
            password: acc.encrypted_password ? decryptHardwareSecret(acc.encrypted_password) : (acc.password || ''),
          }));
        }
      }
    } catch (err) {
      console.error('[VaultStorage] Error loading accounts:', err);
    }
    return [];
  }

  private persistAccounts() {
    try {
      const toSave = this.accounts.map((acc) => {
        const copy: any = { ...acc };
        if (copy.password) {
          copy.encrypted_password = encryptHardwareSecret(copy.password);
          delete copy.password;
        }
        return copy;
      });
      this.safeWriteFileSync(ROSTER_FILE, JSON.stringify(toSave, null, 2));
    } catch (err) {
      console.error('[VaultStorage] Failed to persist accounts:', err);
    }
  }

  private migrateLegacyTrackerIfPresent() {
    if (this.accounts.length > 0) return; // Already initialized

    try {
      let legacySource = '';
      if (fs.existsSync(LEGACY_SOLO_FILE)) {
        legacySource = LEGACY_SOLO_FILE;
      } else if (fs.existsSync(LEGACY_ROSTER_FILE)) {
        legacySource = LEGACY_ROSTER_FILE;
      }

      if (legacySource) {
        console.log(`[VaultStorage] Migrating legacy accounts from: ${legacySource}`);
        const raw = fs.readFileSync(legacySource, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          this.accounts = list.map((acc: any) => ({
            ...acc,
            password: acc.encrypted_password ? decryptHardwareSecret(acc.encrypted_password) : (acc.password || ''),
          }));
          this.persistAccounts();
          console.log(`[VaultStorage] Successfully migrated ${this.accounts.length} accounts to RankForge!`);
        }
      }
    } catch (err) {
      console.warn('[VaultStorage] Legacy migration skipped/failed:', err);
    }
  }

  private pruneExpiredTrash() {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const initialCount = this.accounts.length;
    this.accounts = this.accounts.filter((acc) => {
      if (!acc.is_deleted) return true;
      if (!acc.deleted_at) return true;
      const deletedTime = new Date(acc.deleted_at).getTime();
      return now - deletedTime < thirtyDaysMs;
    });
    if (this.accounts.length !== initialCount) {
      this.persistAccounts();
    }
  }

  private rotateDailyBackup() {
    try {
      if (this.accounts.length === 0) return;
      const today = new Date().toISOString().split('T')[0];
      const backupPath = path.join(BACKUPS_DIR, `rankforge_backup_${today}.json`);
      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, JSON.stringify(this.accounts, null, 2), 'utf8');
      }
    } catch {}
  }

  // ── Public Account Management API ──────────────────────────────────────────

  public getAccounts(): Account[] {
    return this.accounts
      .filter((a) => !a.is_deleted)
      .map((acc) => ({
        ...acc,
        password: acc.password ? decryptHardwareSecret(acc.password) : '',
      }));
  }

  public getAllRawAccounts(): Account[] {
    return this.accounts;
  }

  public saveAccount(acc: Partial<Account>): Account {
    const existingIndex = this.accounts.findIndex((a) => a.id === acc.id);
    let updated: Account;

    if (existingIndex >= 0) {
      const current = this.accounts[existingIndex];
      updated = {
        ...current,
        ...acc,
        password: acc.password !== undefined ? acc.password : current.password,
      };
      this.accounts[existingIndex] = updated;
    } else {
      updated = {
        id: acc.id || crypto.randomUUID(),
        username: acc.username || 'unnamed',
        password: acc.password || '',
        region: acc.region || 'na',
        level: acc.level || 1,
        current_xp: acc.current_xp || 0,
        decimal_level: acc.decimal_level || 1.0,
        remaining_xp: acc.remaining_xp || 0,
        archived: acc.archived || false,
        is_deleted: false,
        deleted_at: null,
        ...acc,
      };
      this.accounts.unshift(updated);
    }

    // Prune from tombstones
    if (updated.username) {
      this.deletedUsernames.delete(updated.username.toLowerCase().trim());
      this.persistDeletedTombstones();
    }

    this.persistAccounts();
    return updated;
  }

  public deleteAccount(id: string): boolean {
    const acc = this.accounts.find((a) => a.id === id);
    if (!acc) return false;

    // Soft-delete: move to 30-day trash bin
    acc.is_deleted = true;
    acc.deleted_at = new Date().toISOString();

    if (acc.username) {
      this.deletedUsernames.add(acc.username.toLowerCase().trim());
      this.persistDeletedTombstones();
    }

    this.persistAccounts();
    return true;
  }

  public deleteBatchAccounts(ids: string[]): boolean {
    const idSet = new Set(ids);
    const nowIso = new Date().toISOString();

    for (const acc of this.accounts) {
      if (idSet.has(acc.id)) {
        acc.is_deleted = true;
        acc.deleted_at = nowIso;
        if (acc.username) {
          this.deletedUsernames.add(acc.username.toLowerCase().trim());
        }
      }
    }

    this.persistDeletedTombstones();
    this.persistAccounts();
    return true;
  }

  public archiveAccount(id: string): boolean {
    const acc = this.accounts.find((a) => a.id === id);
    if (!acc) return false;
    acc.archived = true;
    this.persistAccounts();
    return true;
  }

  public restoreAccount(id: string): boolean {
    const acc = this.accounts.find((a) => a.id === id);
    if (!acc) return false;
    acc.archived = false;
    this.persistAccounts();
    return true;
  }

  public reorderAccounts(ids: string[]): boolean {
    const map = new Map(this.accounts.map((a) => [a.id, a]));
    const reordered: Account[] = [];

    for (let i = 0; i < ids.length; i++) {
      const acc = map.get(ids[i]);
      if (acc) {
        acc.order_index = i;
        reordered.push(acc);
        map.delete(ids[i]);
      }
    }

    // Push any unmentioned accounts at the end
    for (const remaining of map.values()) {
      reordered.push(remaining);
    }

    this.accounts = reordered;
    this.persistAccounts();
    return true;
  }

  public bulkImportAccounts(text: string, defaultRegion = 'na'): Account[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const imported: Account[] = [];

    for (const line of lines) {
      // Formats: username:password, username:password:region, username | password
      let parts: string[] = [];
      if (line.includes(':')) {
        parts = line.split(':');
      } else if (line.includes('|')) {
        parts = line.split('|');
      } else if (line.includes('\t')) {
        parts = line.split('\t');
      }

      if (parts.length >= 1) {
        const username = parts[0].trim();
        const password = parts[1] ? parts[1].trim() : '';
        const region = parts[2] ? parts[2].trim().toLowerCase() : defaultRegion;

        if (!username) continue;

        // Check if exists
        const existing = this.accounts.find((a) => a.username.toLowerCase() === username.toLowerCase() && !a.is_deleted);
        if (existing) {
          if (password) existing.password = password;
          if (region) existing.region = region;
          imported.push(existing);
        } else {
          const newAcc: Account = {
            id: crypto.randomUUID(),
            username,
            password,
            region: region || defaultRegion,
            level: 1,
            current_xp: 0,
            decimal_level: 1.0,
            remaining_xp: 0,
            archived: false,
            is_deleted: false,
            deleted_at: null,
          };
          this.accounts.unshift(newAcc);
          this.deletedUsernames.delete(username.toLowerCase().trim());
          imported.push(newAcc);
        }
      }
    }

    this.persistDeletedTombstones();
    this.persistAccounts();
    return imported;
  }

  public bulkUpdateAccounts(updates: { id: string; changes: Partial<Account> }[]): { count: number; updated: Account[] } {
    let count = 0;
    const result: Account[] = [];

    for (const item of updates) {
      const acc = this.accounts.find((a) => a.id === item.id);
      if (acc) {
        Object.assign(acc, item.changes);
        result.push(acc);
        count++;
      }
    }

    if (count > 0) {
      this.persistAccounts();
    }
    return { count, updated: result };
  }

  // ── Trash Bin ──────────────────────────────────────────────────────────────

  public getTrashAccounts(): Account[] {
    return this.accounts.filter((a) => a.is_deleted);
  }

  public restoreTrashAccount(id: string): boolean {
    const acc = this.accounts.find((a) => a.id === id);
    if (!acc || !acc.is_deleted) return false;
    acc.is_deleted = false;
    acc.deleted_at = null;
    if (acc.username) {
      this.deletedUsernames.delete(acc.username.toLowerCase().trim());
      this.persistDeletedTombstones();
    }
    this.persistAccounts();
    return true;
  }

  public permanentDeleteAccount(id: string): boolean {
    const idx = this.accounts.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this.accounts.splice(idx, 1);
    this.persistAccounts();
    return true;
  }

  public emptyTrash(): boolean {
    this.accounts = this.accounts.filter((a) => !a.is_deleted);
    this.persistAccounts();
    return true;
  }

  // ── PUUID Mappings ─────────────────────────────────────────────────────────

  public getMapping(puuid: string): string | undefined {
    try {
      if (fs.existsSync(MAPPINGS_FILE)) {
        const raw = fs.readFileSync(MAPPINGS_FILE, 'utf8');
        const mappings = JSON.parse(raw);
        return mappings[puuid];
      }
    } catch {}
    return undefined;
  }

  public saveMapping(puuid: string, username: string) {
    try {
      let mappings: Record<string, string> = {};
      if (fs.existsSync(MAPPINGS_FILE)) {
        mappings = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8'));
      }
      mappings[puuid] = username;
      this.safeWriteFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
    } catch (err) {
      console.warn('[VaultStorage] Failed to save mapping:', err);
    }
  }

  // ── Sessions & Telemetry ───────────────────────────────────────────────────

  public sanitizeActiveSessions(excludeAccountId?: string) {
    let changed = false;
    for (const acc of this.accounts) {
      if (excludeAccountId && acc.id === excludeAccountId) continue;
      if (acc.last_session_started_at) {
        acc.last_session_started_at = null;
        changed = true;
      }
    }
    if (changed) {
      this.persistAccounts();
    }
  }

  public getAnonymousMachineId(): string {
    return crypto.createHash('sha256').update(os.hostname() + os.userInfo().username).digest('hex').substring(0, 16);
  }

  // ── Settings API ───────────────────────────────────────────────────────────

  public getSettings(): AppSettings {
    return { ...this.settings, user_role: 'solo', license_tier: 'solo_pro' };
  }

  public saveSettings(newSettings: Partial<AppSettings>): AppSettings {
    this.settings = {
      ...this.settings,
      ...newSettings,
      user_role: 'solo',
      license_tier: 'solo_pro', // Never allow locks
    };
    try {
      this.safeWriteFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
    } catch (err) {
      console.error('[VaultStorage] Failed to save settings:', err);
    }
    return this.getSettings();
  }

  // ── Backup / Export / Import ───────────────────────────────────────────────

  public exportEncryptedBackup(pass: string): { success: boolean; filePath?: string; error?: string } {
    try {
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
      const exportFile = path.join(BACKUPS_DIR, `RankForge_Backup_${dateStr}.rfb`);
      const salt = crypto.randomBytes(16);
      const key = crypto.scryptSync(pass, salt, 32);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

      const plaintext = JSON.stringify({
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        accounts: this.accounts,
        settings: this.settings,
      });

      let encrypted = cipher.update(plaintext, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const authTag = cipher.getAuthTag();

      // Bundle: Salt(16) + IV(12) + AuthTag(16) + Encrypted Payload
      const output = Buffer.concat([salt, iv, authTag, encrypted]);
      fs.writeFileSync(exportFile, output);

      return { success: true, filePath: exportFile };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Export failed' };
    }
  }

  public importEncryptedBackup(pass: string, filePath?: string): { success: boolean; importedCount?: number; error?: string } {
    try {
      let targetFile = filePath;
      if (!targetFile) {
        // Pick most recent backup file in BACKUPS_DIR
        const files = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.rfb')).sort().reverse();
        if (files.length === 0) return { success: false, error: 'No backup file found' };
        targetFile = path.join(BACKUPS_DIR, files[0]);
      }

      const fileBuffer = fs.readFileSync(targetFile);
      if (fileBuffer.length < 44) return { success: false, error: 'Corrupt backup file' };

      const salt = fileBuffer.subarray(0, 16);
      const iv = fileBuffer.subarray(16, 28);
      const authTag = fileBuffer.subarray(28, 44);
      const encrypted = fileBuffer.subarray(44);

      const key = crypto.scryptSync(pass, salt, 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const payload = JSON.parse(decrypted.toString('utf8'));
      if (Array.isArray(payload.accounts)) {
        let imported = 0;
        for (const item of payload.accounts) {
          if (!this.accounts.some((a) => a.id === item.id || (a.username && a.username.toLowerCase() === item.username.toLowerCase()))) {
            this.accounts.push(item);
            imported++;
          }
        }
        this.persistAccounts();
        return { success: true, importedCount: imported };
      }
      return { success: false, error: 'Invalid backup structure' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Decryption failed. Check password.' };
    }
  }
}
