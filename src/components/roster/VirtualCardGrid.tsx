import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AccountCard } from './AccountCard';
import { Account, RiotStatus } from '../../types';

interface CooldownEntry {
  ready: boolean;
  seconds: number;
  countdown: string;
}

interface VirtualCardGridProps {
  accounts: Account[];
  cooldownMap: Map<string, CooldownEntry>;
  activeRosterAccount?: Account | null;
  riotStatus?: RiotStatus;
  onLaunch: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpenHandover: (account: Account) => void;
  onRestore?: (id: string) => void;
  onRenameAccount?: (id: string, newUsername: string) => void;
  onUpdateAccount?: (id: string, updates: Partial<Account>) => void;
  isArchived?: boolean;
  role?: 'supplier' | 'worker' | 'solo';
}

function getColumnCount(containerWidth: number): number {
  if (containerWidth >= 1280) return 4;
  if (containerWidth >= 1024) return 3;
  if (containerWidth >= 768) return 2;
  return 1;
}

const CARD_HEIGHT = 256;
const GAP = 12;

export const VirtualCardGrid: React.FC<VirtualCardGridProps> = ({
  accounts,
  cooldownMap,
  activeRosterAccount,
  riotStatus,
  onLaunch,
  onDelete,
  onOpenHandover,
  onRestore,
  onRenameAccount,
  onUpdateAccount,
  isArchived = false,
  role,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(800);

  React.useEffect(() => {
    if (!parentRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(parentRef.current);
    setContainerWidth(parentRef.current.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const colCount = getColumnCount(containerWidth);
  const rowCount = Math.ceil(accounts.length / colCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT + GAP,
    overscan: 2,
  });

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto pr-1 pb-4"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * colCount;
          const rowAccounts = accounts.slice(startIndex, startIndex + colCount);

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${CARD_HEIGHT}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid h-full"
                style={{
                  gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                  gap: `${GAP}px`,
                }}
              >
                {rowAccounts.map((account, colIndex) => {
                  const cd = cooldownMap.get(account.id);
                  const globalIndex = startIndex + colIndex;
                  const isAccountActive = Boolean(
                    (activeRosterAccount && activeRosterAccount.id === account.id) ||
                    (riotStatus?.is_connected && (
                      (riotStatus.login_username && account.username?.toLowerCase().trim() === riotStatus.login_username.toLowerCase().trim()) ||
                      (riotStatus.game_name && account.username?.toLowerCase().trim() === riotStatus.game_name.toLowerCase().trim())
                    ))
                  );
                  const isGamePlaying = Boolean(isAccountActive && riotStatus?.is_game_running);
                  return (
                    <AccountCard
                      key={account.id}
                      account={account}
                      countdown={cd?.countdown ?? (account.first_win_ready ? '🎯 READY (+1,000 AP)' : '⏳ In Cooldown')}
                      firstWinReady={cd?.ready ?? account.first_win_ready ?? true}
                      isActive={isAccountActive}
                      isGamePlaying={isGamePlaying}
                      onLaunch={onLaunch}
                      onDelete={onDelete}
                      onOpenHandover={onOpenHandover}
                      onRestore={onRestore}
                      onRenameAccount={onRenameAccount}
                      onUpdateAccount={onUpdateAccount}
                      isArchived={isArchived}
                      slotNumber={globalIndex + 1}
                      role={role}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
