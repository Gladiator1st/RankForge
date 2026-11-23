import React, { useState, useMemo } from 'react';
import { X, ClipboardList, Info, Trash2 } from 'lucide-react';
import { sound } from '../../services/soundEffects';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (text: string, defaultRegion: string) => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [inputText, setInputText] = useState('');
  const [defaultRegion, setDefaultRegion] = useState('na');
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
          region: parts[2] ? parts[2].trim().toLowerCase() : defaultRegion,
          valid: true,
        };
      } else if (parts.length === 1 && parts[0].trim()) {
        return {
          username: parts[0].trim(),
          password: '',
          region: defaultRegion,
          valid: true,
        };
      }
      return { username: line, password: '', region: defaultRegion, valid: false };
    });
  }, [inputText, defaultRegion]);

  const validCount = parsedPreview.filter((p) => p.valid).length;

  const handleClear = () => {
    sound.playTacticalClick();
    setInputText('');
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    sound.playSuccessDing();
    onImport(inputText, defaultRegion);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
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
            className="text-val-muted hover:text-white transition-colors"
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
                  className="text-[11px] text-val-gold hover:underline flex items-center gap-1"
                >
                  <Info className="w-3 h-3" />
                  <span>Supported Formats</span>
                </button>
                {inputText && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-[11px] text-val-muted hover:text-val-red flex items-center gap-1 transition-colors"
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
                  <p>username:password:region <span className="text-val-dim">(e.g. user:pass:na)</span></p>
                  <p>username | password</p>
                  <p>username<span className="text-val-dim"> (password optional)</span></p>
                </div>
              </div>
            )}

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`myuser1:P@ssword123\nmyuser2:P@ssword123:na\nmyuser3:P@ssword123:eu`}
              rows={7}
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
                  'Paste your accounts from Discord, text, or spreadsheets'
                )}
              </span>
            </div>
          </div>

          {/* Region and Settings */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-val-muted uppercase">
                Default Region (if not specified per line)
              </label>
              <select
                value={defaultRegion}
                onChange={(e) => setDefaultRegion(e.target.value)}
                className="w-full px-3 py-2 bg-val-bg border border-val-border focus:border-val-red rounded-lg text-xs text-white focus:outline-none"
              >
                <option value="na">NA (North America)</option>
                <option value="eu">EU (Europe)</option>
                <option value="ap">AP (Asia-Pacific)</option>
                <option value="kr">KR (Korea)</option>
                <option value="latam">LATAM (Latin America)</option>
                <option value="br">BR (Brazil)</option>
              </select>
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
                        <span className="text-amber-400 text-[10px]">No pass</span>
                      )}
                    </div>
                    <span className="text-[10px] uppercase font-bold text-val-gold px-1.5 py-0.5 rounded bg-val-surface border border-val-border shrink-0">
                      {acc.region}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-val-border bg-val-bg/95 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { sound.playTacticalClick(); onClose(); }}
            className="px-3 py-2 text-xs text-val-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            form="bulk-import-form"
            type="submit"
            disabled={validCount === 0}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-val-red hover:bg-val-redHover text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-val-red/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Import {validCount > 0 ? `${validCount} Accounts` : 'Accounts'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
