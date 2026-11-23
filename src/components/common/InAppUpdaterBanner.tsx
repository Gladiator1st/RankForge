import React, { useEffect, useState } from 'react';

interface UpdateState {
  status: 'idle' | 'available' | 'downloading' | 'ready';
  version?: string;
  percent?: number;
  transferredMb?: number;
  totalMb?: number;
}

export const InAppUpdaterBanner: React.FC = () => {
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const [isRestarting, setIsRestarting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.rfrApi) return;

    const unregAvail = window.rfrApi.onUpdateAvailable?.((info) => {
      setUpdateState({ status: 'available', version: info.version, percent: 0 });
      setDismissed(false);
    });

    const unregProgress = window.rfrApi.onUpdateProgress?.((progress) => {
      setUpdateState((prev) => ({
        ...prev,
        status: 'downloading',
        percent: progress.percent,
        transferredMb: Math.round(progress.transferred / 1024 / 1024),
        totalMb: Math.round(progress.total / 1024 / 1024),
      }));
    });

    const unregDownloaded = window.rfrApi.onUpdateDownloaded?.((info) => {
      setUpdateState({ status: 'ready', version: info.version, percent: 100 });
      setDismissed(false);
    });

    return () => {
      unregAvail?.();
      unregProgress?.();
      unregDownloaded?.();
    };
  }, []);

  if (dismissed || updateState.status === 'idle') return null;

  const handleRestart = () => {
    setIsRestarting(true);
    window.rfrApi?.restartAndInstall?.();
  };

  return (
    <div className="bg-gradient-to-r from-emerald-950/90 via-neutral-900 to-emerald-950/90 border-b border-emerald-500/40 px-4 py-2 flex items-center justify-between text-xs text-neutral-100 shadow-md select-none shrink-0 z-40 transition-all">
      <div className="flex items-center gap-3">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>

        {updateState.status === 'downloading' && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-emerald-400">
              Downloading Update {updateState.version ? `v${updateState.version}` : ''} in Background:
            </span>
            <span className="font-mono text-xs text-neutral-300">
              {updateState.percent || 0}% ({updateState.transferredMb || 0}/{updateState.totalMb || 0} MB)
            </span>
            <div className="w-28 bg-neutral-800 rounded-full h-1.5 overflow-hidden ml-1">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${updateState.percent || 0}%` }}
              />
            </div>
          </div>
        )}

        {updateState.status === 'available' && (
          <span className="text-emerald-300">
            A new version <span className="font-bold">v{updateState.version}</span> is available. Downloading automatically...
          </span>
        )}

        {updateState.status === 'ready' && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-400">
              🎉 Version {updateState.version ? `v${updateState.version}` : ''} Ready!
            </span>
            <span className="text-neutral-300 hidden md:inline">
              Update is downloaded and will apply seamlessly in-place.
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {updateState.status === 'ready' && (
          <button
            type="button"
            disabled={isRestarting}
            onClick={handleRestart}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-bold rounded text-xs transition-transform active:scale-95 shadow-sm shadow-emerald-500/20"
          >
            {isRestarting ? 'Restarting...' : 'Restart Now & Apply'}
          </button>
        )}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-neutral-500 hover:text-neutral-300 px-1.5 py-0.5 text-xs"
          title="Dismiss (update will still apply when you close the app)"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
