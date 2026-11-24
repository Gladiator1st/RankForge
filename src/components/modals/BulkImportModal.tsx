import React, { useState, useMemo } from 'react';
import { X, ClipboardList, Trash2 } from 'lucide-react';
import { sound } from '../../services/soundEffects';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (text: string) => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [inputText, setInputText] = useState('');
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  // Live parsing preview
  const parsedPreview = useMemo(() => {
    if (!inputText.trim()) return [];
    const lines = inputText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    return lines.map((line) => {
      let parts: string[] = [];
      if (line.includes(':')) {
        parts = line.split(':');
      } else if (line.includes('|')) {
        parts = line.split('|');
      } else if (line.includes('\t')) {
        parts = line.split('\t');
      }

      if (parts.length >= 2) {
        return {
          username: parts[0].trim(),
          password: parts[1].trim(),
          region: parts[2] ? parts[2].trim().toLowerCase() : '',
          valid: true,
        };
      } else if (parts.length === 1 && parts[0].trim()) {
        return {
          username: parts[0].trim(),
          password: '',
          region: '',
          valid: true,
        };
      }
      return { username: line, password: '', region: '', valid: false };
    });
  }, [inputText]);

  const validCount = parsedPreview.filter((p) => p.valid).length;

  const handleClear = () => {
    sound.playTacticalClick();
    setInputText('');
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    sound.playSuccessDing();
    onImport(inputText);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in select-none">
      <div className="bg-val-card border border-val-border rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-val-border bg-val-bg/95">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-val-gold" />
            <h3 className="font-display font-bold text-sm tracking-wider uppercase text-white">
              Bulk Import Roster Accounts
            </h3>
          </div>
          <button
            onClick={() => { sound.playTacticalClick(); onClose(); }}
            className="text-val-muted hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="bulk-import-form" onSubmit={handleImportSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-val-muted uppercase">
                Account Credentials List
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { sound.playTacticalClick(); setShowFormatGuide(!showFormatGuide); }}
                  className="text-[11px] text-val-gold hover:text-amber-300 underline transition-colors cursor-pointer"
                >
                  {showFormatGuide ? 'Hide Format Guide' : 'Format Guide'}
                </button>
                {inputText.trim() && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-[11px] text-val-muted hover:text-val-red flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Format Guide */}
            {showFormatGuide && (
              <div className="p-3 rounded-lg bg-val-bg border border-val-border text-xs text-val-light space-y-2 animate-fade-in">
                <p className="font-semibold text-val-gold">Paste multiple accounts (one per line):</p>
                <div className="font-mono text-[11px] text-val-muted space-y-1 bg-val-surface p-2 rounded">
                  <p>username:password</p>
                  <p>username:password:region <span className="text-val-dim">(optional)</span></p>
                  <p>username | password</p>
                  <p>username<span className="text-val-dim"> (password optional)</span></p>
                </div>
                <p className="text-[10px] text-val-dim">Region is automatically detected when an account logs into Riot Client.</p>
              </div>
            )}

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`myuser1:P@ssword123\nmyuser2:P@ssword123\nmyuser3:P@ssword123`}
              rows={8}
              className="w-full px-3 py-2.5 bg-val-bg border border-val-border focus:border-val-red rounded-lg text-xs text-white font-mono focus:outline-none resize-none leading-relaxed placeholder:text-val-dim/50"
              autoFocus
            />

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-val-muted font-mono">
                {parsedPreview.length > 0 ? (
                  <>
                    Detected <strong className="text-val-mint">{validCount}</strong> valid accounts
                    {parsedPreview.length - validCount > 0 && (
                      <span className="text-val-red ml-1">
                        ({parsedPreview.length - validCount} invalid)
                      </span>
                    )}
                  </>
                ) : (
                  'Paste accounts in user:pass format (one per line)'
                )}
              </span>
            </div>
          </div>

          {/* Preview list */}
          {parsedPreview.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-val-border">
              <span className="text-[11px] font-semibold text-val-muted uppercase">
                Preview First {Math.min(5, parsedPreview.length)} Accounts
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {parsedPreview.slice(0, 5).map((acc, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-1.5 rounded text-xs font-mono border ${
                      acc.valid
                        ? 'bg-val-bg/80 border-val-border text-white'
                        : 'bg-val-red/10 border-val-red/30 text-val-red'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-val-dim">#{i + 1}</span>
                      <span className="font-semibold truncate">{acc.username}</span>
                      {acc.password ? (
                        <span className="text-val-dim">••••••••</span>
                      ) : (
                        <span className="text-val-dim text-[10px]">(No password)</span>
                      )}
                    </div>
                    {acc.region && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase bg-val-border text-val-muted shrink-0">
                        {acc.region}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-t border-val-border bg-val-bg/95">
          <span className="text-xs text-val-muted">
            {validCount > 0 ? `${validCount} ready to import` : 'No accounts detected'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { sound.playTacticalClick(); onClose(); }}
              className="px-4 py-1.5 rounded-lg text-xs text-val-muted hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="bulk-import-form"
              disabled={validCount === 0}
              className="px-5 py-1.5 rounded-lg bg-val-red hover:bg-val-redHover text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-val-red/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95"
            >
              Import {validCount > 0 ? `(${validCount})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
