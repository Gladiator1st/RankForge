import React, { useState, useEffect } from 'react';
import { Play, KeyRound, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Account } from '../../types';
import { sound } from '../../services/soundEffects';

interface AccountPasswordLaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  onSavePasswordAndLaunch: (accountId: string, password: string) => Promise<void>;
}

export const AccountPasswordLaunchModal: React.FC<AccountPasswordLaunchModalProps> = ({
  isOpen,
  onClose,
  account,
  onSavePasswordAndLaunch,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !account) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = password.trim();
    if (!trimmed) {
      setError('Password cannot be empty');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSavePasswordAndLaunch(account.id, trimmed);
    } catch (err: any) {
      setError(err?.message || 'Failed to save password and launch');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-[#0D121D] border border-cyan-500/40 rounded-2xl p-6 shadow-2xl shadow-cyan-950/40">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-md">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-display font-black text-white uppercase tracking-wider">
              Set Password & Launch
            </h3>
            <p className="text-xs text-slate-400">
              Enter password for <strong>{account.username}</strong>
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          This account does not have a saved password in your local encrypted vault. Enter it once to enable 1-click automatic login and password auto-copy.
        </p>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter Riot account password"
              className="w-full px-3.5 py-2.5 pr-10 bg-[#070A10] border border-[#1E2C3D] focus:border-cyan-500 rounded-xl text-xs text-white font-mono focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => { sound.playTacticalClick(); onClose(); }}
              className="py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-val-red to-[#FF2E40] hover:brightness-110 text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-val-red/30 flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isSubmitting ? 'Launching...' : 'Save & Launch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
