import React, { useState } from 'react';
import { UserPlus, UserX, X, Sparkles } from 'lucide-react';
import { sound } from '../../services/soundEffects';

interface DetectedAccountModalProps {
  isOpen: boolean;
  data: {
    username: string;
    riotId?: string;
    level?: number;
    decimalLevel?: number;
    isArchived?: boolean;
  } | null;
  onClose: () => void;
  onAddToRoster: () => void;
  onIgnore: (remember: boolean) => void;
}

export const DetectedAccountModal: React.FC<DetectedAccountModalProps> = ({
  isOpen,
  data,
  onClose,
  onAddToRoster,
  onIgnore,
}) => {
  const [remember, setRemember] = useState(true);

  if (!isOpen || !data) return null;

  const isLevel20 = (data.level || 0) >= 20;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-[#0D121D] border border-cyan-500/40 rounded-2xl p-6 shadow-2xl shadow-cyan-950/40">
        <button
          onClick={() => { sound.playTacticalClick(); onClose(); }}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-display font-black text-white uppercase tracking-wider">
              New Account Detected
            </h3>
            <p className="text-xs text-slate-400">
              Valorant Client is logged into an account not in your roster.
            </p>
          </div>
        </div>

        {/* Account Info Box */}
        <div className="p-3.5 rounded-xl bg-[#070A10] border border-[#1E2C3D] flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center font-display font-black border text-xs ${
              isLevel20
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-val-card border-val-border text-white'
            }`}>
              <span className="text-[9px] text-slate-400 uppercase">LVL</span>
              <span className="leading-none">{data.decimalLevel ? data.decimalLevel.toFixed(1) : data.level || 1}</span>
            </div>
            <div>
              <span className="font-bold text-white text-sm block">
                {data.username}
              </span>
              {data.riotId && (
                <span className="text-[11px] font-mono text-cyan-400">
                  {data.riotId}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Remember Checkbox */}
        <label className="flex items-center gap-2 mb-5 cursor-pointer text-xs text-slate-300 select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
          />
          <span>Remember my choice for this account</span>
        </label>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onIgnore(remember)}
            className="py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
          >
            <UserX className="w-4 h-4 text-slate-400" />
            <span>Ignore Account</span>
          </button>

          <button
            type="button"
            onClick={onAddToRoster}
            className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-val-red to-[#FF2E40] hover:brightness-110 text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-val-red/30 flex items-center justify-center gap-1.5 active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add to Roster</span>
          </button>
        </div>
      </div>
    </div>
  );
};
