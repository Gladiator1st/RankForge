import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { sound } from '../../services/soundEffects';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  accountName?: string;
  accountCount?: number;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  accountName,
  accountCount = 1,
}) => {
  if (!isOpen) return null;

  const isBatch = accountCount > 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-[#0D121D] border border-rose-500/40 rounded-2xl p-6 shadow-2xl shadow-rose-950/40">
        <button
          onClick={() => { sound.playTacticalClick(); onCancel(); }}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shadow-md">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-display font-black text-white uppercase tracking-wider">
              {isBatch ? `Delete ${accountCount} Accounts?` : `Delete Account?`}
            </h3>
            <p className="text-xs text-slate-400">
              {isBatch
                ? `Are you sure you want to delete ${accountCount} accounts from your roster?`
                : `Are you sure you want to delete "${accountName || 'this account'}" from your roster?`}
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 mb-5 flex items-start gap-2.5 text-xs text-rose-200 leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>
            Deleted accounts are protected by the local 30-day Trash Bin. You can restore them anytime or permanently delete them from the Trash Bin.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { sound.playTacticalClick(); onCancel(); }}
            className="py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTacticalClick();
              onConfirm();
            }}
            className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-val-red to-rose-600 hover:brightness-110 text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-val-red/30 active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isBatch ? `Delete (${accountCount})` : 'Delete Account'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
