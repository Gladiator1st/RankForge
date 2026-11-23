import { Account, AppSettings, KpiStats, ViewMode, RiotStatus } from '../types';

export type CooldownMap = Map<string, { ready: boolean; seconds: number; countdown: string }>;

export interface SoloViewProps {
  accounts: Account[];
  displayedAccounts: Account[];
  cooldownMap: CooldownMap;
  settings: AppSettings;
  kpiStats: KpiStats;
  viewMode: ViewMode;
  showArchive: boolean;
  activeRosterAccount: Account | null;
  riotStatus?: RiotStatus;
  grindEtaAccount: Account | null;
  onLaunchAccount: (id: string) => void;
  onOpenHandover: (account: Account) => void;
  onOpenStats: (account: Account) => void;
  onUpdateAccount: (id: string, updates: Partial<Account>) => void;
  onRenameAccount: (id: string, newUsername: string) => void;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
  onOpenAddAccount: () => void;
  onRestoreAccount?: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onBatchDeleteRequest?: (ids: string[]) => void;
}
