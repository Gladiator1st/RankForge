import React from 'react';
import { SoloViewProps } from '../types';
import { KpiBanner } from '../../components/layout/KpiBanner';
import { VirtualCardGrid } from '../../components/roster/VirtualCardGrid';
import { ProTableView } from '../../components/roster/ProTableView';

export const SoloView: React.FC<SoloViewProps> = ({
  displayedAccounts,
  cooldownMap,
  settings,
  kpiStats,
  viewMode,
  showArchive,
  activeRosterAccount,
  riotStatus,
  onLaunchAccount,
  onDeleteRequest,
  onBatchDeleteRequest,
  onOpenHandover,
  onOpenStats,
  onRenameAccount,
  onUpdateAccount,
  onRestoreAccount,
  onOpenAddAccount,
}) => {
  return (
    <>
      {/* 1. Solo Grinder KPI Banner */}
      <KpiBanner stats={kpiStats} />

      {/* 2. Solo Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 px-4 overflow-hidden">
        {/* View Mode: Virtual Cards Grid */}
        {viewMode === 'cards' && (
          displayedAccounts.length === 0 ? (
            <div className="flex-1 overflow-y-auto pr-1 pb-4">
              <div className="h-72 flex flex-col items-center justify-center text-center p-8 border border-dashed border-[#1E2C3D] bg-[#0A0E17]/60 rounded-2xl backdrop-blur-sm">
                <div className="w-14 h-14 rounded-2xl bg-val-red/10 border border-val-red/30 flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(255,70,85,0.2)]">
                  <span className="text-2xl">🎯</span>
                </div>
                <h3 className="font-display font-bold text-base text-white uppercase tracking-wider mb-1.5">
                  {showArchive ? 'Archive Vault is Empty' : 'Your Grinding Roster is Empty'}
                </h3>
                <p className="text-xs text-val-dim max-w-sm mb-5 leading-relaxed font-sans">
                  {showArchive
                    ? 'Accounts marked as finished Level 20 will appear here for customer delivery.'
                    : 'Add your first account or import your list from Discord to start tracking Level 20 progression.'}
                </p>
                {!showArchive && (
                  <button
                    onClick={onOpenAddAccount}
                    className="px-5 py-2.5 bg-gradient-to-r from-val-red to-[#FF2E40] hover:brightness-110 text-white text-xs font-display font-black uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(255,70,85,0.35)] active:scale-95 cursor-pointer"
                  >
                    + Add Account
                  </button>
                )}
              </div>
            </div>
          ) : (
            <VirtualCardGrid
              role="solo"
              accounts={displayedAccounts}
              cooldownMap={cooldownMap}
              activeRosterAccount={activeRosterAccount}
              riotStatus={riotStatus}
              onLaunch={onLaunchAccount}
              onDelete={onDeleteRequest}
              onOpenHandover={onOpenHandover}
              onRestore={onRestoreAccount || (() => {})}
              onRenameAccount={onRenameAccount}
              onUpdateAccount={onUpdateAccount}
              isArchived={showArchive}
            />
          )
        )}

        {/* View Mode: Tactical Pro Table */}
        {viewMode === 'table' && (
          <ProTableView
            role="solo"
            accounts={displayedAccounts}
            cooldownMap={cooldownMap}
            settings={settings}
            activeRosterAccount={activeRosterAccount}
            riotStatus={riotStatus}
            onLaunch={onLaunchAccount}
            onDelete={onDeleteRequest}
            onBatchDelete={onBatchDeleteRequest}
            onOpenHandover={onOpenHandover}
            onOpenStats={onOpenStats}
            onRenameAccount={onRenameAccount}
            onUpdateAccount={onUpdateAccount}
          />
        )}
      </main>
    </>
  );
};
