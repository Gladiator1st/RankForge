import React, { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import { Account } from '../../types';
import { sound } from '../../services/soundEffects';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAccount: (account: Partial<Account>) => void;
  accounts?: Account[];
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onSaveAccount,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [level, setLevel] = useState('1');
  const [notes, setNotes] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);

  if (!isOpen) return null;

  const handleUsernameChange = (val: string) => {
    // Detect combo paste: user:pass or user:pass:region or user,pass
    if (val.includes(':') || val.includes(',')) {
      const sep = val.includes(':') ? ':' : ',';
      const parts = val.split(sep).map((s) => s.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        setUsername(parts[0]);
        setPassword(parts[1]);
        sound.playSuccessDing();
        setAutoDetected(true);
        setTimeout(() => setAutoDetected(false), 4000);
        return;
      }
    }
    setUsername(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    sound.playSuccessDing();
    const lvlNum = Math.max(1, Math.min(100, parseInt(level) || 1));
    const remXp = Math.max(0, (20 - lvlNum) * 5000);

    onSaveAccount({
      username: username.trim(),
      password: password.trim(),
      region: '', // Auto-detected when account logs in
      level: lvlNum,
      decimal_level: lvlNum,
      current_xp: 0,
      remaining_xp: remXp,
      first_win_ready: true,
      notes: notes.trim(),
      archived: false,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-val-card border border-val-border rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-val-border bg-val-bg/80">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-val-red" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider">
              Add Grinding Account
            </h3>
          </div>
          <button
            onClick={() => { sound.playTacticalClick(); onClose(); }}
            className="w-7 h-7 rounded flex items-center justify-center text-val-muted hover:text-white hover:bg-val-border transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {autoDetected && (
            <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <span>✨ Smart-detected username and password from clipboard paste!</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-val-muted uppercase">
              Riot Username / Login ID <span className="text-val-red">*</span>
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="e.g. ShadowGrinder or paste user:pass"
              className="w-full px-3 py-2 bg-val-bg border border-val-border focus:border-val-red rounded-lg text-xs text-white focus:outline-none"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-val-muted uppercase">
              Password <span className="text-val-dim text-[11px] normal-case">(Stored locally in encrypted vault)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Account password for 1-click auto-login"
              className="w-full px-3 py-2 bg-val-bg border border-val-border focus:border-val-red rounded-lg text-xs text-white font-mono focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-val-muted uppercase">
                Starting Level
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-3 py-2 bg-val-bg border border-val-border focus:border-val-red rounded-lg text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-val-muted uppercase">
                Notes / Tags <span className="text-val-dim text-[11px] normal-case">(Optional)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. smurf, alt"
                className="w-full px-3 py-2 bg-val-bg border border-val-border focus:border-val-red rounded-lg text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { sound.playTacticalClick(); onClose(); }}
              className="px-4 py-2 rounded-lg text-xs text-val-muted hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-val-red hover:bg-val-redHover text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-val-red/30 active:scale-95 cursor-pointer"
            >
              Add to Roster
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
