import React, { useState } from 'react';
import { AlertTriangle, Power, ArrowDownToLine, X } from 'lucide-react';
import { sound } from '../../services/soundEffects';

interface ConfirmExitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (doNotShowAgain: boolean) => void;
  onConfirmExit?: (doNotShowAgain: boolean) => void;
  onMinimizeToTray?: (doNotShowAgain: boolean) => void;
}

export const ConfirmExitModal: React.FC<ConfirmExitModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onConfirmExit,
  onMinimizeToTray,
}) => {
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleExit = () => {
    sound.playTacticalClick();
    if (onConfirmExit) {
      onConfirmExit(doNotShowAgain);
    } else if (onConfirm) {
      onConfirm(doNotShowAgain);
    }
  };

  const handleTray = () => {
    sound.playTacticalClick();
    if (onMinimizeToTray) {
      onMinimizeToTray(doNotShowAgain);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#121824] border-2 border-val-red/60 rounded-2xl w-full max-w-[480px] overflow-hidden shadow-2xl p-6 relative">
        {/* Close Button Top Right */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded flex items-center justify-center text-val-muted hover:text-white hover:bg-val-border transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with Red Warning Icon */}
        <div className="flex items-center gap-2 text-val-red font-bold text-xs uppercase tracking-wider mb-2.5">
          <AlertTriangle className="w-4 h-4" />
          <span>CLOSE TRACKER</span>
        </div>

        {/* Question Title */}
        <h3 className="font-bold text-base text-white mb-2 leading-snug">
          Close or Minimize to System Tray?
        </h3>

        {/* Explanatory Subtitle */}
        <p className="text-xs text-val-muted leading-relaxed mb-5">
          You can keep background match detection, level progress, and Discord alerts active in the system tray, or shut down the application completely.
        </p>

        {/* Action Options Grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {/* Minimize to Tray */}
          <button
            onClick={handleTray}
            className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-val-card hover:bg-val-cardHover border border-val-mint/40 hover:border-val-mint text-center transition-all group active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-val-mint/15 text-val-mint flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <ArrowDownToLine className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-white mb-0.5">Minimize to Tray</span>
            <span className="text-[10px] text-val-mint font-medium">Keep tracking active</span>
          </button>

          {/* Exit Completely */}
          <button
            onClick={handleExit}
            className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-val-card hover:bg-val-cardHover border border-val-red/40 hover:border-val-red text-center transition-all group active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-val-red/15 text-val-red flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Power className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-white mb-0.5">Exit Completely</span>
            <span className="text-[10px] text-val-red font-medium">Stop all processes</span>
          </button>
        </div>

        {/* "Do not show again" Checkbox & Cancel */}
        <div className="flex items-center justify-between pt-2 border-t border-val-border">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={doNotShowAgain}
              onChange={(e) => setDoNotShowAgain(e.target.checked)}
              className="w-3.5 h-3.5 rounded bg-[#0d131d] border border-[#3a4b66] text-val-red focus:ring-0 focus:outline-none accent-val-red cursor-pointer"
            />
            <span className="text-xs text-val-muted font-medium hover:text-val-light transition-colors">
              Remember choice
            </span>
          </label>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1d2638] hover:bg-[#2b3952] text-val-light text-xs font-bold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
